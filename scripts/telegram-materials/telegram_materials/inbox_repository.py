"""Firestore is the authoritative queue; no local catalogue or decision database."""
from __future__ import annotations

import threading
import uuid
import sys
import warnings
from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .inbox_core import SOURCE_ID, now, TERMINAL, message_key


class InboxRepository:
    def __init__(self, db):
        self.db = db
        self.owner = None
        self.lease_error = None
        self._documents = {}
        self._queries = {}
        self._transaction = threading.local()
        self._lease_expires_at = ''

    def ref(self, collection, key):
        return self.db.collection(collection).document(key)

    def read(self, collection, key, tx=None):
        cache = getattr(self._transaction, 'reads', None) if tx is not None else self._documents
        # Lease/cursor state must stay live outside transactions.
        if tx is None and collection == 'material_inbox_sources':
            cache = None
        identity = (collection, key)
        if cache is not None and identity in cache:
            return deepcopy(cache[identity])
        doc = self.ref(collection, key).get(transaction=tx)
        value = {**doc.to_dict(), 'id': doc.id} if doc.exists else None
        if cache is not None:
            cache[identity] = value
        return deepcopy(value)

    def read_many(self, collection, keys, tx=None):
        # Repeated identities share one command/transaction read, including misses.
        return {key: self.read(collection, key, tx) for key in dict.fromkeys(keys)}

    def _invalidate(self, collection, key):
        if collection == 'material_inbox_sources':
            return  # The heartbeat never touches command caches; source reads are live.
        self._documents.pop((collection, key), None)
        self._queries = {k: v for k, v in self._queries.items() if k[0] != collection}

    def write(self, collection, key, value, tx=None, merge=True):
        if collection == 'material_inbox' and 'status' in value:
            value = {**value, 'sourceStatus': SOURCE_ID + ':' + value['status']}
        self._invalidate(collection, key)
        ref = self.ref(collection, key)
        if tx is None:
            ref.set(value, merge=merge)
        else:
            tx.set(ref, value, merge=merge)

    def delete(self, collection, key, tx):
        self._invalidate(collection, key)
        tx.delete(self.ref(collection, key))

    def lesson_links(self, material_id, tx=None):
        query = self.db.collection('material_lesson_links').where(filter=FieldFilter('materialId', '==', material_id))
        return [{**doc.to_dict(), 'id': doc.id} for doc in query.stream(transaction=tx)]

    def atomic(self, callback):
        def attempt(tx):
            # A Firestore retry gets a fresh snapshot; never reuse an earlier attempt.
            self._transaction.reads = {}
            try:
                return callback(tx)
            finally:
                self._transaction.reads = None
        return firestore.transactional(attempt)(self.db.transaction())

    def list(self, collection, statuses=None, *, message_id=None, limit=None, after=None, order='__name__', descending=False):
        identity = (collection, tuple(sorted(statuses or [])), message_id, limit, after, order, descending)
        if identity in self._queries:
            return deepcopy(self._queries[identity])
        query = self.db.collection(collection)
        if message_id is not None:
            query = query.where(filter=FieldFilter('messageId', '==', message_id))
        elif statuses:
            query = query.where(filter=FieldFilter('status', 'in', list(statuses)))
        elif collection in {'material_inbox', 'material_inbox_items', 'material_inbox_batches'}:
            if order == '__name__':
                query = query.where(filter=FieldFilter('sourceId', '==', SOURCE_ID))
        query = query.order_by(order, direction='DESCENDING' if descending else 'ASCENDING')
        if after is not None:
            query = query.start_after({order: self.ref(collection, after) if order == '__name__' else after})
        if limit is not None:
            query = query.limit(limit)
        values = [{**doc.to_dict(), 'id': doc.id} for doc in query.stream()]
        if collection in {'material_inbox', 'material_inbox_items', 'material_inbox_batches'}:
            values = [value for value in values if value.get('sourceId') == SOURCE_ID]
        for value in values:
            self._documents[collection, value['id']] = value
        self._queries[identity] = values
        return deepcopy(values)

    def recent_messages(self, limit=200):
        # This dedicated inbox has one approved source. A single-field ordered
        # query bounds reads before filtering, rather than sorting all history.
        query = self.db.collection('material_inbox').order_by('messageId', direction='DESCENDING').limit(limit)
        values = [{**doc.to_dict(), 'id': doc.id} for doc in query.stream()]
        values = [value for value in values if value.get('sourceId') == SOURCE_ID]
        for value in values:
            self._documents['material_inbox', value['id']] = value
        return values

    def message_counts(self):
        states = ['queued', 'analyzing', 'needs_review', 'approved', 'publishing', 'held', 'failed', 'published', 'duplicate', 'ignored']
        counts = {}
        for state in states:
            query = self.db.collection('material_inbox').where(filter=FieldFilter('sourceStatus', '==', SOURCE_ID + ':' + state))
            counts[state] = query.count().get()[0][0].value
        total = self.db.collection('material_inbox').where(filter=FieldFilter('sourceId', '==', SOURCE_ID)).count().get()[0][0].value
        # Old messages are backfilled as sync visits them. Never call them done
        # or scan history merely to produce a status summary.
        if total > sum(counts.values()):
            counts['unclassified'] = total - sum(counts.values())
        return {key: value for key, value in counts.items() if value}

    def catalogue(self):
        def fetch(name):
            return [{**doc.to_dict(), 'id': doc.id} for doc in self.db.collection(name).stream()]
        return fetch('modules'), fetch('lessons'), fetch('materials')

    def destinations(self, module_ids, lesson_ids):
        return ([m for m in self.read_many('modules', sorted(set(module_ids))).values() if m],
                [l for l in self.read_many('lessons', sorted(set(lesson_ids))).values() if l])

    def analysis_curriculum(self, module_ids=()):
        modules = self.list('modules')
        lessons = []
        for key in sorted(set(module_ids)):
            query = self.db.collection('lessons').where(filter=FieldFilter('moduleId', '==', key))
            lessons.extend({**doc.to_dict(), 'id': doc.id} for doc in query.stream())
        return modules, lessons

    def guard(self, tx=None):
        if self.lease_error:
            raise RuntimeError('Processing lease heartbeat failed; retry the command') from self.lease_error
        if tx is None:
            valid = self.owner and self._lease_expires_at > now()
        else:
            source = self.read('material_inbox_sources', SOURCE_ID, tx) or {}
            lease = source.get('lease') or {}
            valid = lease.get('owner') == self.owner and lease.get('expiresAt', '') > now()
        if not valid:
            raise RuntimeError('Processing lease expired or belongs to another worker')

    def _renew(self, initial=False):
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        def update(tx):
            source = self.read('material_inbox_sources', SOURCE_ID, tx) or {}
            old = source.get('lease') or {}
            if old.get('owner') != self.owner and old.get('expiresAt', '') > now():
                raise ValueError('Another inbox process is active; retry after it finishes')
            if not initial and old.get('owner') != self.owner:
                raise ValueError('Processing lease was lost')
            self.write('material_inbox_sources', SOURCE_ID, {'lease': {'owner': self.owner,
                'expiresAt': expires_at}}, tx)
        self.atomic(update)
        self._lease_expires_at = expires_at

    @contextmanager
    def lease(self):
        self._documents.clear()
        self._queries.clear()
        self.owner, self.lease_error = uuid.uuid4().hex, None
        self._renew(initial=True)
        stopped = threading.Event()
        def heartbeat():
            while not stopped.wait(60):
                try:
                    self._renew()
                except Exception as exc:
                    self.lease_error = exc
                    return
        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stopped.set(); thread.join(timeout=45)
            active_error = sys.exc_info()[1]
            def release(tx):
                source = self.read('material_inbox_sources', SOURCE_ID, tx) or {}
                if (source.get('lease') or {}).get('owner') == self.owner:
                    self.write('material_inbox_sources', SOURCE_ID, {'lease': None}, tx)
            try:
                self.atomic(release)
            except Exception:
                if active_error is None:
                    raise
                warnings.warn('Could not release the inbox lease after failure; it expires within 10 minutes', RuntimeWarning)
            finally:
                self.owner = None
                self._lease_expires_at = ''
                self._documents.clear()
                self._queries.clear()

    def refresh_message_status(self, message_id):
        message = self.read('material_inbox', message_key(message_id))
        if not message:
            return
        items = [i for i in self.list('material_inbox_items', message_id=message_id) if i['revision'] == message['fingerprint']]
        states = {i['status'] for i in items}
        if not states:
            status = 'ignored'
        elif states.issubset(TERMINAL):
            status = 'published' if 'published' in states else 'duplicate' if 'duplicate' in states else 'ignored'
        else:
            status = next((s for s in ['publishing', 'failed', 'held', 'needs_review', 'analyzing', 'approved', 'queued'] if s in states), 'queued')
        if message.get('status') != status:
            self.write('material_inbox', message['id'], {'status': status, 'updatedAt': now()})
