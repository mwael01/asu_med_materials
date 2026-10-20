"""Firestore-backed discovery, review and idempotent publication."""
from __future__ import annotations

import sys
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'telegram-materials'))
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from telegram_materials.store import get_db
from telegram_materials.core import link_id
from telegram_materials.inbox_core import asset_key, resource_keys

from client import COURSE, internal
from core import SOURCE, MODULE, normalize_activity, exact_lessons, build_material, fingerprint, stable_url


def now():
    return datetime.now(timezone.utc).isoformat()


def collect(client, parse):
    pending, visited, activities = [COURSE], set(), {}
    while pending:
        url = pending.pop(0)
        if url in visited:
            continue
        if len(visited) >= 100:
            raise ValueError('Course navigation limit reached; no scan will be committed')
        visited.add(url)
        final, html = client.html(url)
        page = parse('course', html, final)
        if not html or page.get('loginForm') or not page.get('authenticated') or page.get('errors'):
            raise ValueError('Session expired or course unavailable. Run materials:asu2learn login')
        if url == COURSE and 'respiratory' not in page.get('title', '').lower():
            raise ValueError('Unexpected course; refusing to import outside respiratory')
        for activity in page['activities']:
            if activity.get('hidden'):
                continue
            previous = activities.get(activity['id'])
            if previous:
                activity['links'] = previous.get('links', []) + activity.get('links', [])
                activity['section'] = activity.get('section') or previous.get('section', '')
            activities[activity['id']] = activity
        for candidate in page['sectionLinks']:
            parsed = urlsplit(candidate)
            query = parse_qs(parsed.query)
            if not internal(candidate):
                continue
            if parsed.path.endswith('/course/section.php') and query.get('id', [''])[0].isdigit():
                canonical = candidate.split('#', 1)[0]
            elif parsed.path.endswith('/course/view.php') and query.get('id') == ['620'] and query.get('section', [''])[0].isdigit():
                canonical = COURSE + '&section=' + query['section'][0]
            else:
                continue
            if canonical not in visited and canonical not in pending:
                pending.append(canonical)
    if not activities:
        raise ValueError('No readable activities found; refusing an empty/incomplete scan')
    # Only view HTML activities, never resource/file endpoints, quiz attempts or completion controls.
    for activity in activities.values():
        url = stable_url(activity.get('url', ''))
        if url and activity['type'] in {'url', 'page', 'folder'}:
            final, html = client.html(url)
            if html:
                detail = parse('activity', html, final)
                if detail.get('loginForm') or not detail.get('authenticated') or detail.get('errors'):
                    raise ValueError('An activity became inaccessible; scan aborted')
                activity['links'].extend(detail['links'])
                destinations = [link['url'] for link in detail['links'] if not internal(link['url'])]
            elif target := stable_url(final):
                activity['links'].append({'title': activity['title'], 'url': target})
                destinations = [final]
            else:
                destinations = [final] if not internal(final) else []
            if destinations:
                # Keep private SharePoint/Teams URLs out of public records while detecting replacements.
                activity['targetFingerprint'] = fingerprint(sorted(set(destinations)))
                targets = [urlsplit(target) for target in destinations]
                if any((t.hostname or '').endswith('.sharepoint.com') and '/:v:/' in t.path or t.hostname == 'teams.microsoft.com' and 'meetingrecap' in t.path for t in targets):
                    activity['targetKind'] = 'video'
                elif any(t.hostname == 'teams.microsoft.com' and ('/meet/' in t.path or '/meetup-join/' in t.path) for t in targets):
                    activity['targetKind'] = 'meeting'
    entries = {e['id']: e for a in activities.values() for e in normalize_activity(a)}
    if not entries:
        raise ValueError('No supported stable material links found; scan aborted')
    return entries, len(visited), len(activities)


class Repository:
    def __init__(self, db=None):
        self.db = db or get_db()
        self.source = self.db.collection('material_imports').document(SOURCE)
        self.entries = self.source.collection('entries')
        self.owner = None
        self._lessons = None

    def lessons(self):
        if self._lessons is None:
            self._lessons = [{**d.to_dict(), 'id': d.id} for d in self.db.collection('lessons').where(filter=FieldFilter('moduleId', '==', MODULE)).stream()]
        return [dict(lesson) for lesson in self._lessons]

    def read_entries(self):
        return {d.id: {**d.to_dict(), 'id': d.id} for d in self.entries.stream()}

    def atomic(self, callback):
        return firestore.transactional(callback)(self.db.transaction())

    def guard(self, tx):
        state = self.source.get(transaction=tx).to_dict() or {}
        if state.get('leaseOwner') != self.owner or state.get('leaseUntil', 0) < time.time():
            raise ValueError('ASU2Learn command lease expired; retry')
        return state

    @contextmanager
    def lease(self):
        self.owner = uuid.uuid4().hex
        def acquire(tx):
            old = self.source.get(transaction=tx).to_dict() or {}
            if old.get('leaseUntil', 0) > time.time():
                raise ValueError('Another ASU2Learn command is running')
            tx.set(self.source, {'leaseOwner': self.owner, 'leaseUntil': time.time() + 1800}, merge=True)
        self.atomic(acquire)
        try:
            yield
        finally:
            def release(tx):
                state = self.source.get(transaction=tx).to_dict() or {}
                if state.get('leaseOwner') == self.owner:
                    tx.set(self.source, {'leaseOwner': None, 'leaseUntil': 0}, merge=True)
            self.atomic(release)
            self.owner = None

    def stage(self, discovered, pages, activities):
        previous, lessons, scan = self.read_entries(), self.lessons(), uuid.uuid4().hex
        values = []
        for key, metadata in discovered.items():
            old = previous.get(key, {})
            changed = metadata['fingerprint'] != old.get('fingerprint')
            value = {**old, **metadata, 'sourceMissing': False, 'lastSeenAt': now(), 'scanId': scan,
                     'firstSeenAt': old.get('firstSeenAt', now())}
            if changed:
                value.update(status='needs_review', suggestedLessonIds=exact_lessons(metadata, lessons), changedAt=now())
            elif old.get('sourceMissing'):
                value['status'] = 'published' if old.get('publishedFingerprint') else 'reviewed' if old.get('review', {}).get('fingerprint') == metadata['fingerprint'] else 'needs_review'
            values.append(value)
        for key, old in previous.items():
            if key not in discovered:
                values.append({**old, 'sourceMissing': True, 'status': 'missing'})
        def begin(tx):
            self.guard(tx)
            tx.set(self.source, {'scanStatus': 'scanning'}, merge=True)
        self.atomic(begin)
        for start in range(0, len(values), 350):
            chunk = values[start:start + 350]
            def save(tx):
                self.guard(tx)
                for value in chunk:
                    tx.set(self.entries.document(value['id']), value)
            self.atomic(save)
        def complete(tx):
            self.guard(tx)
            tx.set(self.source, {'source': 'ASU2Learn', 'courseUrl': COURSE, 'moduleId': MODULE,
                'lastSuccessfulScanAt': now(), 'scanId': scan, 'scanStatus': 'complete', 'pagesRead': pages,
                'activitiesSeen': activities, 'linksSeen': len(discovered), 'rescanIntervalHours': 24}, merge=True)
        self.atomic(complete)
        return {'links': len(discovered), 'new': sum(k not in previous for k in discovered),
                'changed': sum(k in previous and previous[k]['fingerprint'] != v['fingerprint'] for k, v in discovered.items()),
                'missing': sum(k not in discovered for k in previous)}

    def review(self, ids, lesson_ids, group, title, kind, category, reason, module_wide=False, authors=None):
        valid = {l['id'] for l in self.lessons() if l.get('active') is not False}
        if (not lesson_ids and not module_wide) or not set(lesson_ids).issubset(valid):
            raise ValueError('Choose existing active respiratory lessons')
        def save(tx):
            self.guard(tx)
            entries = [self.entries.document(key).get(transaction=tx) for key in ids]
            if any(not d.exists or d.to_dict().get('sourceMissing') for d in entries):
                raise ValueError('Entry is missing; rescan before reviewing')
            for doc in entries:
                data = doc.to_dict()
                if data.get('publishedFingerprint') and data.get('review', {}).get('group') != group:
                    raise ValueError('Published entries cannot move to another group automatically')
                review = {'fingerprint': data['fingerprint'], 'lessonIds': sorted(set(lesson_ids)),
                          'group': group, 'title': title, 'kind': kind, 'category': category, 'reason': reason, 'moduleWide': module_wide,
                          'authors': authors or [], 'reviewedAt': now()}
                tx.set(doc.reference, {'review': review, 'status': 'reviewed'}, merge=True)
        self.atomic(save)

    def ignore(self, ids, reason):
        def save(tx):
            self.guard(tx)
            docs = [self.entries.document(key).get(transaction=tx) for key in ids]
            if any(not doc.exists or doc.to_dict().get('review') or doc.to_dict().get('publishedFingerprint') for doc in docs):
                raise ValueError('Ignore only existing, unreviewed and unpublished entries')
            for doc in docs:
                tx.set(doc.reference, {'status': 'ignored', 'ignoreReason': reason, 'ignoredRevision': doc.to_dict()['fingerprint']}, merge=True)
        self.atomic(save)

    def publish(self, apply=False):
        state = self.source.get().to_dict() or {}
        if state.get('scanStatus') != 'complete':
            raise ValueError('A complete successful scan is required before publication')
        entries, lessons = self.read_entries(), self.lessons()
        lesson_subjects = {lesson['id']: lesson['subject'] for lesson in lessons}
        module = self.db.collection('modules').document(MODULE).get().to_dict() or {}
        if module.get('year') != 2 or module.get('active') is False:
            raise ValueError('Respiratory module is unavailable')
        version_ref = self.db.collection('materials_version').document('current')
        base_version = (version_ref.get().to_dict() or {}).get('version', 0)
        # One module-scoped read per command, never a full catalogue scan.
        materials = {d.id: {**d.to_dict(), 'id': d.id} for d in self.db.collection('materials').where(filter=FieldFilter('moduleId', '==', MODULE)).stream()}
        existing = {}
        for mid, material in materials.items():
            for key in resource_keys(material):
                existing.setdefault(key, set()).add(mid)
        groups, result = {}, []
        for entry in entries.values():
            review = entry.get('review')
            if review:
                groups.setdefault(review['group'], []).append(entry)
        for group, members in sorted(groups.items()):
            if any(e.get('sourceMissing') or e['review']['fingerprint'] != e['fingerprint'] for e in members):
                result.append({'group': group, 'status': 'held', 'reason': 'A group member changed or is missing'})
                continue
            members.sort(key=lambda e: e['id'])
            if len({(e['review']['title'], e['review']['category'], e['review']['kind']) for e in members}) != 1:
                raise ValueError('All group members must use the same title, category and kind')
            material, lesson_ids = build_material(members, lessons, group, members[0]['review']['title'])
            mid = material['id']
            desired = fingerprint({'material': material, 'lessonIds': lesson_ids})
            old = materials.get(mid)
            if old and all(e.get('publishedFingerprint') == desired for e in members):
                result.append({'group': group, 'status': 'unchanged', 'materialId': mid})
                continue
            conflicts = set().union(*(existing.get(key, set()) for key in resource_keys(material))) - {mid}
            if conflicts:
                result.append({'group': group, 'status': 'held', 'reason': 'Already present in this module', 'matches': sorted(conflicts)})
                continue
            result.append({'group': group, 'status': 'published' if apply else 'ready', 'materialId': mid, 'lessonIds': lesson_ids})
            if not apply:
                continue
            target = self.db.collection('materials').document(mid)
            index_ref = self.db.collection('material_asset_index').document('catalogue-state')
            def save(tx):
                source_state = self.guard(tx)
                if source_state.get('scanStatus') != 'complete' or source_state.get('scanId') != state.get('scanId'):
                    raise ValueError('Scan changed during publication; retry')
                live_version = (version_ref.get(transaction=tx).to_dict() or {}).get('version', 0)
                if live_version != base_version:
                    raise ValueError('Catalogue changed concurrently; retry publication')
                live_entries = [self.entries.document(e['id']).get(transaction=tx).to_dict() for e in members]
                if any(not live or live.get('fingerprint') != e['fingerprint'] or live.get('review') != e['review'] or live.get('sourceMissing') for live, e in zip(live_entries, members)):
                    raise ValueError('Source changed during publication')
                live = target.get(transaction=tx).to_dict()
                live_module = self.db.collection('modules').document(MODULE).get(transaction=tx).to_dict() or {}
                if live_module.get('year') != 2 or live_module.get('active') is False:
                    raise ValueError('Respiratory module changed or is inactive')
                if live and live.get('importRunId') != SOURCE:
                    raise ValueError('Material ID belongs to another source')
                # Only importer-owned fields may change. Manual editorial changes require review.
                if live:
                    published_entry = next((entry for entry in live_entries if entry.get('publishedMaterial')), {})
                    previous_payload = published_entry.get('publishedMaterial', {})
                    if not previous_payload or any(live.get(key) != value for key, value in previous_payload.items()):
                        raise ValueError('Published material was edited manually; reconcile before updating')
                old_links = list(self.db.collection('material_lesson_links').where(filter=FieldFilter('materialId', '==', mid)).stream(transaction=tx))
                if live and sorted(doc.to_dict()['lessonId'] for doc in old_links) != published_entry.get('publishedLessonIds', []):
                    raise ValueError('Lesson links were edited manually; reconcile before updating')
                for lid in lesson_ids:
                    lesson = self.db.collection('lessons').document(lid).get(transaction=tx).to_dict() or {}
                    if lesson.get('moduleId') != MODULE or lesson.get('active') is False or lesson.get('subject') != lesson_subjects[lid]:
                        raise ValueError('Lesson changed or is inactive')
                index = index_ref.get(transaction=tx).to_dict() or {}
                keys = sorted(resource_keys(material) | resource_keys(live or {}))
                index_records = {key: self.db.collection('material_asset_index').document(asset_key(key)).get(transaction=tx).to_dict() or {} for key in keys}
                if len(members) + len(keys) + len(old_links) + len(lesson_ids) > 440:
                    raise ValueError('Publication group too large; split the group')
                patch = {**material, 'createdAt': (live or {}).get('createdAt', now())}
                # Preserve bookmark/contributor fields; remove obsolete importer-owned payload fields.
                for field in ('subject', 'lessonId', 'videos', 'documents'):
                    if live and field in live and field not in patch:
                        patch[field] = firestore.DELETE_FIELD
                tx.set(target, patch, merge=True)
                desired_links = {link_id(mid, lid): lid for lid in lesson_ids}
                for doc in old_links:
                    if doc.id not in desired_links:
                        tx.delete(doc.reference)
                for ident, lid in desired_links.items():
                    tx.set(self.db.collection('material_lesson_links').document(ident), {'materialId': mid, 'lessonId': lid, 'moduleId': MODULE})
                for e in members:
                    tx.set(self.entries.document(e['id']), {'status': 'published', 'materialId': mid,
                        'publishedFingerprint': desired, 'publishedMaterial': material, 'publishedLessonIds': lesson_ids, 'publishedAt': now()}, merge=True)
                tx.set(version_ref, {'version': live_version + 1, 'updatedAt': now()}, merge=True)
                if index.get('complete') and index.get('version') == live_version:
                    for key, record in index_records.items():
                        associations = record.get('materials', {}) if record.get('generation') == index['generation'] else {}
                        associations = {key: value for key, value in associations.items() if key != mid}
                        if key in resource_keys(material):
                            associations[mid] = MODULE
                        tx.set(self.db.collection('material_asset_index').document(asset_key(key)), {'key': key, 'generation': index['generation'],
                            'materials': associations, 'updatedAt': now()})
                    tx.set(index_ref, {'version': live_version + 1, 'updatedAt': now()}, merge=True)
            self.atomic(save)
            base_version += 1
            for key in resource_keys(material):
                existing.setdefault(key, set()).add(mid)
        return result
