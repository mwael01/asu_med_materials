"""Read-volume regression tests exercise the real repository with a counting backend."""
import asyncio
import copy
import re
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from google.api_core.exceptions import ResourceExhausted
from telegram_materials.inbox_analysis import analyze, matches
from telegram_materials.inbox_catalogue import INDEX_ID, index_catalogue, index_state
from telegram_materials.inbox_core import SOURCE_ID, asset_key, message_key
from telegram_materials.inbox_repository import InboxRepository
from telegram_materials.inbox_sync import sync
from test_inbox import FakeTelegram, MemoryRepo, payload


class Snapshot:
    def __init__(self, key, value):
        self.id, self.exists, self.value = key, value is not None, value

    def to_dict(self):
        return copy.deepcopy(self.value)


class Reference:
    def __init__(self, db, collection, key):
        if re.fullmatch(r'__.*__', key):
            raise ValueError('Firestore reserves double-underscore document IDs')
        self.db, self.collection, self.key = db, collection, key

    def get(self, transaction=None):
        self.db.reads += 1
        return Snapshot(self.key, self.db.rows.get((self.collection, self.key)))

    def set(self, value, merge=True):
        previous = self.db.rows.get((self.collection, self.key), {}) if merge else {}
        self.db.rows[self.collection, self.key] = {**previous, **copy.deepcopy(value)}


class Query:
    def __init__(self, db, collection):
        self.db, self.collection = db, collection
        self.filters, self.maximum, self.cursor, self.order, self.descending = [], None, None, '__name__', False

    def document(self, key):
        return Reference(self.db, self.collection, key)

    def where(self, *, filter):
        self.filters.append(filter)
        return self

    def order_by(self, order, direction='ASCENDING'):
        self.order, self.descending = order, direction == 'DESCENDING'
        return self

    def limit(self, maximum):
        self.maximum = maximum
        return self

    def start_after(self, cursor):
        self.cursor = cursor[self.order]
        if isinstance(self.cursor, Reference):
            self.cursor = self.cursor.key
        return self

    def values(self):
        rows = [(key, value) for (collection, key), value in self.db.rows.items() if collection == self.collection]
        for f in self.filters:
            rows = [(key, value) for key, value in rows if (value.get(f.field_path) in f.value if f.op_string == 'in' else value.get(f.field_path) == f.value)]
        order = lambda row: row[0] if self.order == '__name__' else row[1].get(self.order, '')
        rows.sort(key=order, reverse=self.descending)
        if self.cursor is not None:
            rows = [row for row in rows if (order(row) < self.cursor if self.descending else order(row) > self.cursor)]
        return rows[:self.maximum] if self.maximum is not None else rows

    def stream(self, transaction=None):
        rows = self.values()
        self.db.queries.append((self.collection, self.maximum, self.order))
        self.db.reads += max(1, len(rows))
        return iter(Snapshot(key, value) for key, value in rows)

    def count(self):
        self.db.aggregations += 1
        return SimpleNamespace(get=lambda: [[SimpleNamespace(value=len(self.values()))]])


class CountingFirestore:
    def __init__(self):
        self.rows, self.queries = {}, []
        self.reads, self.aggregations = 0, 0

    def collection(self, collection):
        return Query(self, collection)

    def transaction(self):
        return SimpleNamespace(set=lambda ref, value, merge=True: ref.set(value, merge))


class ReadEfficiencyTests(unittest.TestCase):
    def setUp(self):
        self.db = CountingFirestore()
        self.repo = InboxRepository(self.db)
        self.repo.owner = 'worker'
        self.repo._lease_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

    def test_index_checkpoint_can_be_read_using_a_valid_firestore_document_id(self):
        self.assertIsNone(index_state(self.repo))
        self.assertEqual(self.db.reads, 1)

    def test_selected_lessons_cost_three_reads_even_with_ten_thousand_other_lessons(self):
        self.db.rows['modules', 'resp'] = {'year': 2}
        for n in range(10000):
            self.db.rows['lessons', str(n)] = {'moduleId': 'resp'}
        for _ in range(5):
            modules, lessons = self.repo.destinations(['resp'], ['10', '20', '10'])
            self.assertEqual(len(lessons), 2)
        self.assertEqual(self.db.reads, 3)
        self.assertEqual(self.db.queries, [])

    def test_module_material_query_does_not_read_other_modules(self):
        for n in range(10000):
            self.db.rows['materials', str(n)] = {'moduleId': 'other'}
        self.db.rows['materials', 'resp-1'] = {'moduleId': 'resp'}
        self.assertEqual(len(self.repo.list('materials', module_id='resp', limit=50)), 1)
        self.assertEqual(self.db.reads, 1)

    def test_cache_copies_values_invalidates_writes_and_transactions_stay_live(self):
        self.db.rows['modules', 'resp'] = {'year': 2}
        value = self.repo.read('modules', 'resp'); value['year'] = 5
        self.assertEqual(self.repo.read('modules', 'resp')['year'], 2)
        self.repo.write('modules', 'resp', {'year': 3})
        self.assertEqual(self.repo.read('modules', 'resp')['year'], 3)
        self.db.rows['modules', 'resp'] = {'year': 4}
        with patch('telegram_materials.inbox_repository.firestore.transactional', side_effect=lambda fn: fn):
            def transaction(tx):
                self.assertEqual(self.repo.read('modules', 'resp', tx)['year'], 4)
                self.repo.read('modules', 'resp', tx)
            self.repo.atomic(transaction)
        self.assertEqual(self.db.reads, 3)

    def test_transaction_retry_has_fresh_reads(self):
        self.db.rows['modules', 'resp'] = {'year': 2}
        observed = []
        def retry(fn):
            def run(tx):
                fn(tx)
                self.db.rows['modules', 'resp'] = {'year': 3}
                return fn(tx)
            return run
        with patch('telegram_materials.inbox_repository.firestore.transactional', side_effect=retry):
            self.repo.atomic(lambda tx: observed.append(self.repo.read('modules', 'resp', tx)['year']))
        self.assertEqual(observed, [2, 3])
        self.assertEqual(self.db.reads, 2)

    def test_unchanged_sync_reads_only_two_hundred_history_documents(self):
        bodies = [payload(n) for n in range(1, 10001)]
        for body in bodies:
            self.db.rows['material_inbox', message_key(body['messageId'])] = {**body, 'status': 'needs_review'}
        self.db.rows['material_inbox_sources', SOURCE_ID] = {'lastMessageId': 10000}
        with patch('telegram_materials.inbox_sync.message_payload', side_effect=lambda m, _: m.payload), \
             patch('telegram_materials.inbox_sync.extract_links', return_value=[]):
            result = asyncio.run(sync(self.repo, FakeTelegram(bodies)))
        self.assertEqual(result['newOrChanged'], 0)
        self.assertEqual(self.db.reads, 201)
        self.assertEqual(self.db.queries, [('material_inbox', 200, 'messageId')])

    def test_status_counts_use_aggregations_without_loading_queue_documents(self):
        for n in range(10000):
            state = 'published' if n < 9900 else 'held'
            self.db.rows['material_inbox', str(n)] = {'sourceId': SOURCE_ID, 'status': state, 'sourceStatus': SOURCE_ID + ':' + state}
        self.assertEqual(self.repo.message_counts(), {'published': 9900, 'held': 100})
        self.assertEqual(self.db.reads, 0)
        self.assertEqual(self.db.aggregations, 11)

    def test_legacy_statuses_are_unclassified_until_sync_backfills_them(self):
        body = payload()
        self.db.rows['material_inbox', message_key(2)] = {**body, 'status': 'held'}
        self.db.rows['material_inbox_sources', SOURCE_ID] = {'lastMessageId': 2}
        self.assertEqual(self.repo.message_counts(), {'unclassified': 1})
        with patch('telegram_materials.inbox_sync.message_payload', side_effect=lambda m, _: m.payload), \
             patch('telegram_materials.inbox_sync.extract_links', return_value=[]):
            asyncio.run(sync(self.repo, FakeTelegram([body])))
        self.assertEqual(self.repo.message_counts(), {'held': 1})

    def test_analysis_never_scans_materials_or_all_lessons(self):
        body = payload()
        key = 'item'
        self.db.rows['material_inbox', message_key(2)] = {**body, 'status': 'queued'}
        self.db.rows['material_inbox_items', key] = {**body['parts'][0], 'sourceId': SOURCE_ID, 'messageId': 2,
            'sourceUrl': body['sourceUrl'], 'revision': body['fingerprint'], 'status': 'queued', 'date': body['date']}
        for n in range(10000):
            self.db.rows['materials', str(n)] = {'title': 'Existing title'}
            self.db.rows['lessons', str(n)] = {'moduleId': 'resp'}
        with patch('telegram_materials.inbox_analysis.verify_source', new=AsyncMock(return_value=object())):
            result = asyncio.run(analyze(self.repo, object(), limit=1))
        self.assertEqual(result['selected'], 1)
        self.assertFalse(any(c in {'materials', 'lessons'} for c, _, _ in self.db.queries))
        self.assertLess(self.db.reads, 15)

    def test_quota_error_is_not_retried_as_a_full_catalogue_scan(self):
        with patch.object(self.repo, 'read', side_effect=ResourceExhausted('Quota exceeded')):
            with self.assertRaises(ResourceExhausted):
                index_state(self.repo, required=True)
        self.assertEqual(self.db.queries, [])


class CatalogueIndexTests(unittest.TestCase):
    def setUp(self):
        self.repo = MemoryRepo()
        self.lease = self.repo.lease(); self.lease.__enter__()
        for n in range(5):
            self.repo.write('materials', str(n), {'moduleId': 'resp', 'title': 'Notes', 'contentSha256': str(n) * 64,
                'url': 'https://example.org/' + str(n)})

    def tearDown(self):
        self.lease.__exit__(None, None, None)

    def test_index_resumes_bounded_pages_and_unchanged_version_costs_no_material_reads(self):
        self.assertFalse(index_catalogue(self.repo, 2)['complete'])
        self.assertFalse(index_catalogue(self.repo, 2)['complete'])
        self.assertTrue(index_catalogue(self.repo, 2)['complete'])
        with patch.object(self.repo, 'list', side_effect=AssertionError('No collection scan expected')):
            self.assertEqual(index_catalogue(self.repo, 2)['materialsRead'], 0)
        self.assertEqual(matches(self.repo, {'url': 'https://other.org/file', 'sha256': '3' * 64}), {'3': 'resp'})

    def test_scoped_indexes_are_independent_and_leave_the_global_index_untouched(self):
        self.repo.write('modules', 'resp', {'year': 2})
        self.repo.write('modules', 'other', {'year': 3})
        self.repo.write('materials', 'other-notes', {'moduleId': 'other', 'url': 'https://example.org/3'})
        for module_id in ['resp', 'other']:
            result = index_catalogue(self.repo, 10, module_id=module_id)
            self.assertTrue(result['complete'])
            self.assertEqual(result['materialsRead'], 5 if module_id == 'resp' else 1)
        self.assertIsNone(self.repo.read('material_asset_index', INDEX_ID))
        self.assertEqual(matches(self.repo, {'url': 'https://example.org/3'}, 'resp'), {'3': 'resp'})
        self.assertEqual(matches(self.repo, {'url': 'https://example.org/3'}, 'other'), {'other-notes': 'other'})
        self.assertEqual(index_catalogue(self.repo, 10, module_id='resp')['materialsRead'], 0)

    def test_catalogue_edit_invalidates_index_and_rebuild_drops_deleted_associations(self):
        index_catalogue(self.repo, 10)
        old_generation = index_state(self.repo)['generation']
        self.repo.records.pop(('materials', '3'))
        self.repo.write('materials_version', 'current', {'version': 1})
        with self.assertRaisesRegex(ValueError, 'index is missing or outdated'):
            index_state(self.repo, required=True)
        index_catalogue(self.repo, 10)
        self.assertNotEqual(index_state(self.repo)['generation'], old_generation)
        self.assertEqual(matches(self.repo, {'url': 'https://other.org/file', 'sha256': '3' * 64}), {})

    def test_interrupted_asset_transaction_never_advances_index_cursor(self):
        index_catalogue(self.repo, 2)
        cursor = self.repo.read('material_asset_index', INDEX_ID)['cursor']
        self.repo.fail_commit = True
        with self.assertRaises(ConnectionError):
            index_catalogue(self.repo, 2)
        self.assertEqual(self.repo.read('material_asset_index', INDEX_ID)['cursor'], cursor)
        self.assertFalse(index_catalogue(self.repo, 2)['complete'])
        self.assertTrue(index_catalogue(self.repo, 2)['complete'])


if __name__ == '__main__':
    unittest.main()
