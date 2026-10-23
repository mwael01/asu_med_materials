import asyncio
import copy
import tempfile
import unittest
import wave
import io
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from firebase_admin import firestore
from telegram_materials.inbox_core import SOURCE_ID, MAX_R2_BYTES, asset_key, fingerprint, item_keys, message_key, resource_keys, storage_for
from telegram_materials.inbox_repository import InboxRepository
from telegram_materials.inbox_sync import ingest, mark_missing, sync
from telegram_materials.inbox_analysis import analyze, seed_assets
from telegram_materials.inbox_media import cache_path, expand_archive, inspect_file
from telegram_materials.inbox_publication import approve, decide, publish, annotate, validate_plans, material_payload


class MemoryRepo(InboxRepository):
    def __init__(self):
        super().__init__(None)
        self.records = {}
        self.fail_commit = False

    def read(self, collection, key, tx=None):
        value = self.records.get((collection, key))
        return {**copy.deepcopy(value), 'id': key} if value is not None else None

    def write(self, collection, key, value, tx=None, merge=True):
        if collection == 'material_inbox' and 'status' in value:
            value = {**value, 'sourceStatus': SOURCE_ID + ':' + value['status']}
        old = self.records.get((collection, key), {})
        result = copy.deepcopy(old) if merge else {}
        for name, v in value.items():
            if v is firestore.DELETE_FIELD:
                result.pop(name, None)
            else:
                result[name] = old.get(name, 0) + v.value if isinstance(v, firestore.Increment) else copy.deepcopy(v)
        self.records[collection, key] = result

    def delete(self, collection, key, tx):
        self.records.pop((collection, key), None)

    def lesson_links(self, material_id, tx=None):
        return [link for link in self.list('material_lesson_links') if link['materialId'] == material_id]

    def list(self, collection, statuses=None, *, message_id=None, limit=None, after=None, order='__name__', descending=False):
        values = [{**copy.deepcopy(value), 'id': key} for (c, key), value in self.records.items()
                if c == collection and (not statuses or value.get('status') in statuses)
                and (message_id is None or value.get('messageId') == message_id)]
        key = 'id' if order == '__name__' else order
        values.sort(key=lambda v: v.get(key, ''), reverse=descending)
        if after is not None:
            values = [v for v in values if (v[key] < after if descending else v[key] > after)]
        return values[:limit] if limit is not None else values

    def catalogue(self):
        return self.list('modules'), self.list('lessons'), self.list('materials')

    def destinations(self, module_ids, lesson_ids):
        return ([m for m in self.list('modules') if m['id'] in module_ids],
                [l for l in self.list('lessons') if l['id'] in lesson_ids])

    def analysis_curriculum(self, module_ids=()):
        return self.list('modules'), [l for l in self.list('lessons') if l['moduleId'] in module_ids]

    def recent_messages(self, limit=200):
        return self.list('material_inbox', limit=limit, order='messageId', descending=True)

    def atomic(self, callback):
        snapshot = copy.deepcopy(self.records)
        try:
            result = callback('transaction')
            if self.fail_commit:
                self.fail_commit = False
                raise ConnectionError('Synthetic Firestore outage')
            return result
        except BaseException:
            self.records = snapshot
            raise


def payload(message_id=2, caption='Respiratory notes'):
    body = {'messageId': message_id, 'sourceId': SOURCE_ID, 'peerId': -1003977555264,
            'sourceUrl': f'https://t.me/asumedmaterials/{message_id}', 'date': '2026-10-19T00:00:00+00:00',
            'caption': caption, 'albumId': None, 'replyTo': None, 'forward': None,
            'parts': [{'key': 'attachment', 'kind': 'file', 'title': 'Notes.pdf', 'mime': 'application/pdf',
                       'url': f'https://t.me/asumedmaterials/{message_id}', 'storage': 'telegram',
                       'bytes': 25_000_001, 'telegramIdentity': 'Document:42'}]}
    return {**body, 'fingerprint': fingerprint(body)}


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.repo = MemoryRepo()
        self.lease = self.repo.lease(); self.lease.__enter__()
        self.repo.write('modules', 'resp', {'year': 2, 'semester': 1, 'active': True})
        self.repo.write('modules', 'other', {'year': 3, 'semester': 1, 'active': True})
        for module in ['resp', 'other']:
            self.repo.write('lessons', module + '-lesson', {'moduleId': module, 'subject': 'Anatomy', 'active': True})
        ingest(self.repo, payload())
        self.item = self.repo.list('material_inbox_items')[0]
        self.repo.write('material_inbox_items', self.item['id'], {'status': 'needs_review'})
        self.repo.write('material_inbox_batches', 'batch', {'sourceId': SOURCE_ID, 'status': 'needs_review', 'itemIds': [self.item['id']]})
        self.repo.write('material_asset_index', 'catalogue-state', {'complete': True, 'version': 0, 'generation': 'test'})

    def tearDown(self):
        self.lease.__exit__(None, None, None)

    def decision(self, module='resp', action='create', **extra):
        return {'action': action, 'moduleId': module, 'lessonIds': [module + '-lesson'],
                'title': 'Reviewed notes', 'category': 'summaries', 'reason': 'Content reviewed', **extra}

    def create_plan(self, **extra):
        return decide(self.repo, 'batch', [self.item['id']], self.decision(**extra))

    def test_image_notes_are_required_bound_to_approval_and_preserved_in_payload(self):
        self.repo.write('lessons', 'resp-lesson', {'revisionType': 'practical'})
        self.repo.write('material_inbox_items', self.item['id'], {'mime': 'image/jpeg', 'storage': 'r2', 'sha256': 'a' * 64, 'bytes': 100})
        plan_id = self.create_plan(category='practical', practicalImageCollection='slides')
        with self.assertRaisesRegex(ValueError, 'Every practical image'):
            approve(self.repo, 'batch')
        note = {'title': 'Bronchiole', 'description': 'Epithelium surrounds a small airway.', 'altText': 'Small airway section', 'sourceUrls': ['https://example.com/reference']}
        annotate(self.repo, 'batch', plan_id, self.item['id'], note)
        plan = self.repo.read('material_inbox_batches/batch/plans', plan_id)
        plan['batchId'] = 'batch'
        item = self.repo.read('material_inbox_items', self.item['id'])
        value = material_payload(plan, {'id': 'resp', 'year': 2}, self.repo.list('lessons'), [item], {item['id']: 'https://example.com/image.jpg'}, 'image-set')
        self.assertEqual(value['practicalImageCollection'], 'slides')
        self.assertEqual(value['documents'][0]['description'], note['description'])
        approved = approve(self.repo, 'batch')
        with self.assertRaisesRegex(ValueError, 'immutable'):
            annotate(self.repo, 'batch', plan_id, self.item['id'], {**note, 'description': 'Changed'})
        self.repo.write('material_inbox_batches/batch/plans', plan_id, {'imageAnnotations': {item['id']: {**note, 'description': 'Tampered'}}})
        self.assertNotEqual(validate_plans(self.repo, 'batch')[2], approved['digest'])

    def test_image_collections_reject_nonimages_and_nonpractical_lessons(self):
        self.create_plan(category='practical', practicalImageCollection='gross')
        with self.assertRaisesRegex(ValueError, 'Practical Revision'):
            approve(self.repo, 'batch')
        self.repo.write('lessons', 'resp-lesson', {'revisionType': 'practical'})
        with self.assertRaisesRegex(ValueError, 'image files'):
            approve(self.repo, 'batch')

    def test_selected_playlist_tracks_exclude_other_module_and_external_recordings_keep_fallback(self):
        base = {'title': 'Respiratory tracks', 'category': 'lectures', 'batchId': 'batch', 'lessonIds': ['resp-lesson']}
        source = {'id': 'source', 'kind': 'playlist', 'storage': 'external', 'sourceUrl': 'https://t.me/example/1', 'url': 'https://youtube.com/playlist?list=test',
                  'videos': [{'id': 'nose', 'youtubeId': 'nose', 'title': 'Nose'}, {'id': 'blood', 'youtubeId': 'blood', 'title': 'Spleen'}]}
        value = material_payload({**base, 'selectedVideoIds': ['nose']}, {'id': 'resp', 'year': 2}, self.repo.list('lessons'), [source], {'source': source['url']}, 'selected')
        self.assertEqual([v['id'] for v in value['videos']], ['nose'])
        source.update(kind='link', url='https://medasuedu.sharepoint.com/:v:/recording')
        value = material_payload({**base, 'forceRecording': True, 'author': 'ASU Faculty Staff'}, {'id': 'resp', 'year': 2}, self.repo.list('lessons'), [source], {'source': source['url']}, 'recording')
        self.assertEqual(value['type'], 'playlist')
        self.assertEqual(value['videos'][0]['sourceType'], 'external')
        self.assertEqual(value['author'], 'ASU Faculty Staff')

    def test_unlabelled_image_publication_requires_explicit_override_and_keeps_description_absent(self):
        self.repo.write('lessons', 'resp-lesson', {'revisionType': 'practical'})
        self.repo.write('material_inbox_items', self.item['id'], {'mime': 'image/jpeg', 'storage': 'r2', 'sha256': 'b' * 64, 'bytes': 100})
        pid = self.create_plan(category='practical', practicalImageCollection='slides', allowUnlabelledImages=True)
        annotate(self.repo, 'batch', pid, self.item['id'], {'title': 'Identification question', 'altText': 'Electron microscopy question sheet', 'sourceUrls': ['https://example.org/source']})
        approve(self.repo, 'batch')
        plan = self.repo.read('material_inbox_batches/batch/plans', pid)
        plan['batchId'] = 'batch'
        item = self.repo.read('material_inbox_items', self.item['id'])
        material = material_payload(plan, {'id': 'resp', 'year': 2}, self.repo.list('lessons'), [item], {item['id']: 'https://example.org/image.jpg'}, 'questions')
        self.assertNotIn('description', material['documents'][0])
        self.assertEqual(material['documents'][0]['title'], 'Identification question')

    def test_html_needs_explicit_source_review_before_approval(self):
        self.repo.write('material_inbox_items', self.item['id'], {'mime': 'text/html', 'storage': 'r2', 'sha256': 'c' * 64, 'bytes': 100})
        pid = self.create_plan()
        with self.assertRaisesRegex(ValueError, 'reviewed-html'):
            approve(self.repo, 'batch')
        self.repo.write('material_inbox_batches/batch/plans', pid, {'htmlReviewed': True})
        approve(self.repo, 'batch')

    def test_clinical_pdf_creates_one_lesson_and_preserves_current_asset_index(self):
        from telegram_materials.clinical import clinical_lesson
        self.repo.write('material_inbox_items', self.item['id'], {'mime': 'application/pdf', 'sha256': 'd' * 64})
        preview = clinical_lesson(self.repo, self.item['id'], 'resp', 'Clinical ENT')
        self.assertEqual(preview['author'], 'ASU Faculty Staff')
        self.assertEqual(len(self.repo.list('lessons')), 2)
        first = clinical_lesson(self.repo, self.item['id'], 'resp', 'Clinical ENT', True)
        second = clinical_lesson(self.repo, self.item['id'], 'resp', 'Clinical ENT', True)
        self.assertEqual(first['lesson']['id'], second['lesson']['id'])
        self.assertEqual(len(self.repo.list('lessons')), 3)
        self.assertEqual(self.repo.read('modules', 'resp')['subjects'], ['Clinical'])
        self.assertEqual(self.repo.read('materials_version', 'current')['version'], 1)
        self.assertEqual(self.repo.read('material_asset_index', 'catalogue-state')['version'], 1)

    def test_image_folder_configuration_is_lesson_scoped_and_imports_require_known_folder(self):
        from telegram_materials.image_folders import configure_folders
        self.repo.write('lessons', 'resp-lesson', {'revisionType': 'practical'})
        configure_folders(self.repo, 'resp-lesson', [{'id': 'computer-lab', 'title': 'Computer Lab Slides'}], True)
        self.assertNotIn('practicalImageFolders', self.repo.read('lessons', 'other-lesson'))
        self.repo.write('material_inbox_items', self.item['id'], {'mime': 'image/jpeg', 'storage': 'r2', 'sha256': 'e' * 64, 'bytes': 100})
        pid = self.create_plan(category='practical', practicalImageFolderId='unknown', allowUnlabelledImages=True)
        annotate(self.repo, 'batch', pid, self.item['id'], {'title': 'Question', 'altText': 'Question sheet'})
        with self.assertRaisesRegex(ValueError, 'configured image folder'):
            approve(self.repo, 'batch')
        self.repo.write('material_inbox_batches/batch/plans', pid, {'practicalImageFolderId': 'computer-lab'})
        approve(self.repo, 'batch')

    def apply(self):
        with patch('telegram_materials.inbox_publication.verify_source', new=AsyncMock(return_value=object())), \
             patch('telegram_materials.inbox_publication.put_r2') as upload:
            result = asyncio.run(publish(self.repo, object(), 'batch', True))
            upload.assert_not_called()  # Larger files stay on Telegram.
            return result

    def test_sync_idempotence_and_edits_preserve_previous_revision_items(self):
        self.assertFalse(ingest(self.repo, payload()))
        self.assertEqual(len(self.repo.list('material_inbox_items')), 1)
        self.assertTrue(ingest(self.repo, payload(caption='Updated caption')))
        self.assertEqual(len(self.repo.list('material_inbox_items')), 2)
        self.assertEqual(self.repo.read('material_inbox_sources', SOURCE_ID)['lastMessageId'], 2)
        self.assertEqual(len(self.repo.list(f'material_inbox/{message_key(2)}/revisions')), 2)

    def test_failed_message_commit_never_advances_cursor(self):
        self.repo.fail_commit = True
        with self.assertRaises(ConnectionError):
            ingest(self.repo, payload(3))
        self.assertEqual(self.repo.read('material_inbox_sources', SOURCE_ID)['lastMessageId'], 2)
        self.assertIsNone(self.repo.read('material_inbox', message_key(3)))

    def test_published_deleted_sources_remain_published(self):
        self.repo.write('material_inbox_items', self.item['id'], {'status': 'published'})
        mark_missing(self.repo, 2)
        self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['status'], 'published')
        self.assertTrue(self.repo.read('material_inbox', message_key(2))['sourceMissing'])

    def test_unresolved_child_prevents_message_done(self):
        self.repo.write('material_inbox_items', 'child', {**self.item, 'status': 'held'})
        self.repo.write('material_inbox_items', self.item['id'], {'status': 'published'})
        self.repo.refresh_message_status(2)
        self.assertEqual(self.repo.read('material_inbox', message_key(2))['status'], 'held')

    def test_size_policy_exact_boundary_and_real_media_validation(self):
        self.assertEqual(storage_for(MAX_R2_BYTES), 'r2')
        self.assertEqual(storage_for(MAX_R2_BYTES + 1), 'telegram')
        self.assertEqual(storage_for(None), 'telegram')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'voice.wav'
            with wave.open(str(path), 'wb') as audio:
                audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000); audio.writeframes(b'\0' * 16000)
            result = inspect_file(path, 'audio')
            self.assertEqual(result['kind'], 'audio')
            self.assertEqual(result['mime'], 'audio/wav')
            self.assertAlmostEqual(result['durationSeconds'], 1)
            path.write_bytes(b'not a recording')
            with self.assertRaises(ValueError):
                inspect_file(path, 'audio')

    def test_analysis_never_implies_approval_and_changed_revision_revokes_it(self):
        self.create_plan()
        with self.assertRaisesRegex(ValueError, 'not approved'):
            self.apply()
        approve(self.repo, 'batch')
        ingest(self.repo, payload(caption='A new edition'))
        with self.assertRaisesRegex(ValueError, 'revision changed'):
            self.apply()

    def test_publish_and_retry_have_one_material_one_edge_one_version_increment(self):
        self.create_plan(); approve(self.repo, 'batch')
        self.apply(); self.apply()
        self.assertEqual(len(self.repo.list('materials')), 1)
        self.assertEqual(len(self.repo.list('material_lesson_links')), 1)
        self.assertEqual(self.repo.read('materials_version', 'current')['version'], 1)
        material = self.repo.list('materials')[0]
        self.assertEqual(material['documents'][0]['mimeType'], 'application/pdf')
        self.assertEqual(material['documents'][0]['title'], material['title'])
        self.assertEqual(material['url'], 'https://t.me/asumedmaterials/2')
        self.assertEqual(material['importReviewStatus'], 'pending')

    def test_interruption_never_exposes_partial_database_publication(self):
        self.create_plan(); approve(self.repo, 'batch')
        self.repo.fail_commit = True
        with self.assertRaises(ConnectionError):
            self.apply()
        self.assertEqual(self.repo.list('materials'), [])
        self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['status'], 'approved')
        self.apply()
        self.assertEqual(len(self.repo.list('materials')), 1)

    def test_one_asset_can_have_reviewed_destinations_in_two_modules(self):
        self.create_plan()
        decide(self.repo, 'batch', [self.item['id']], self.decision(module='other'))
        approve(self.repo, 'batch'); self.apply()
        self.assertEqual(len(self.repo.list('materials')), 2)
        self.assertEqual(len(self.repo.list('material_lesson_links')), 2)
        self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['status'], 'published')

    def test_exact_duplicate_reuse_preserves_title_and_bookmarks(self):
        self.repo.write('materials', 'existing', {'moduleId': 'resp', 'title': 'Editorial title', 'url': self.item['url'], 'bookmarksCount': 7})
        seed_assets(self.repo, self.repo.list('materials'))
        self.repo.write('material_asset_index', asset_key(next(iter(item_keys(self.item)))), {'materials': {'existing': 'resp'}})
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.create_plan(); approve(self.repo, 'batch')
        self.repo.write('material_inbox_batches', 'reuse', {'sourceId': SOURCE_ID, 'status': 'needs_review', 'itemIds': [self.item['id']]})
        decide(self.repo, 'reuse', [self.item['id']], self.decision(action='reuse', existingMaterialId='existing'))
        approve(self.repo, 'reuse')
        with patch('telegram_materials.inbox_publication.verify_source', new=AsyncMock(return_value=object())):
            asyncio.run(publish(self.repo, object(), 'reuse', True))
        material = self.repo.read('materials', 'existing')
        self.assertEqual(material['title'], 'Editorial title'); self.assertEqual(material['bookmarksCount'], 7)
        self.assertEqual(len(self.repo.list('materials')), 1)

    def test_other_worker_cannot_take_an_active_lease(self):
        owner = self.repo.owner
        self.repo.owner = 'other-worker'
        with self.assertRaisesRegex(ValueError, 'Another inbox process'):
            self.repo._renew(initial=True)
        self.repo.owner = owner

    def prepare_assignment_correction(self):
        self.repo.write('lessons', 'resp-lesson', {'subject': 'Pathology'})
        self.repo.write('materials', 'existing', {'moduleId': 'resp', 'title': 'Keep editorial title', 'bookmarksCount': 7,
            'url': self.item['url'], 'subject': 'Microbiology', 'lessonId': 'previous-lesson'})
        self.repo.write('material_lesson_links', 'old-link', {'materialId': 'existing', 'lessonId': 'previous-lesson', 'moduleId': 'resp'})
        self.repo.write('material_lesson_links', 'unrelated', {'materialId': 'another', 'lessonId': 'previous-lesson', 'moduleId': 'resp'})
        self.repo.write('material_asset_index', asset_key(next(iter(item_keys(self.item)))), {'materials': {'existing': 'resp'}})
        return self.create_plan(action='reuse', existingMaterialId='existing', replaceLessonAssignments=True)

    def test_assignment_correction_is_explicit_atomic_and_idempotent(self):
        plan_id = self.prepare_assignment_correction()
        self.assertEqual(self.repo.read('materials', 'existing')['subject'], 'Microbiology')
        self.assertEqual(self.repo.read('material_inbox_batches/batch/plans', plan_id)['previousLessonIds'], ['previous-lesson'])
        approve(self.repo, 'batch'); self.apply(); self.apply()
        material = self.repo.read('materials', 'existing')
        self.assertEqual(material['subject'], 'Pathology')
        self.assertEqual(material['lessonId'], 'resp-lesson')
        self.assertEqual(material['title'], 'Keep editorial title')
        self.assertEqual(material['bookmarksCount'], 7)
        self.assertIsNone(self.repo.read('material_lesson_links', 'old-link'))
        self.assertIsNotNone(self.repo.read('material_lesson_links', 'unrelated'))
        self.assertEqual(len(self.repo.lesson_links('existing')), 1)
        self.assertEqual(self.repo.read('materials_version', 'current')['version'], 1)

    def test_assignment_correction_rejects_concurrent_edits(self):
        self.prepare_assignment_correction(); approve(self.repo, 'batch')
        self.repo.write('materials', 'existing', {'lessonId': 'newer-editorial-choice'})
        with self.assertRaisesRegex(ValueError, 'assignments changed'):
            self.apply()
        self.assertIsNotNone(self.repo.read('material_lesson_links', 'old-link'))

    def test_assignment_correction_rolls_back_deletions_on_failure(self):
        self.prepare_assignment_correction(); approve(self.repo, 'batch')
        self.repo.fail_commit = True
        with self.assertRaises(ConnectionError):
            self.apply()
        self.assertEqual(self.repo.read('materials', 'existing')['subject'], 'Microbiology')
        self.assertIsNotNone(self.repo.read('material_lesson_links', 'old-link'))

    def test_old_module_defaults_cannot_accept_foreign_lesson_ids(self):
        decision = self.decision(lessonIds=['other-lesson'])
        with self.assertRaisesRegex(ValueError, 'selected module'):
            decide(self.repo, 'batch', [self.item['id']], decision)

    def test_content_identity_distinguishes_editions_and_archive_siblings(self):
        first = {**self.item, 'sha256': 'a' * 64}
        second = {**self.item, 'sha256': 'b' * 64}
        self.assertFalse(item_keys(first) & item_keys(second))
        first = {**self.item, 'archiveItemId': 'parent', 'memberPath': 'first.pdf'}
        second = {**first, 'memberPath': 'second.pdf'}
        self.assertFalse(item_keys(first) & item_keys(second))

    def test_playlist_share_tracking_does_not_create_distinct_assets(self):
        first = {'kind': 'playlist', 'url': 'https://youtube.com/playlist?list=PLExample&si=first'}
        second = {'kind': 'playlist', 'url': 'https://www.youtube.com/playlist?si=second&list=PLExample'}
        self.assertEqual(item_keys(first), item_keys(second))
        self.assertTrue(item_keys(first).issubset(resource_keys({'type': 'playlist', **second})))
        self.assertFalse(item_keys(first) & item_keys({'url': 'https://youtube.com/playlist?list=PLOther'}))

    def test_repeated_file_inside_one_bundle_is_rejected(self):
        self.repo.write('material_inbox_items', 'repeated', {**self.item, 'status': 'needs_review'})
        self.repo.write('material_inbox_batches', 'batch', {'itemIds': [self.item['id'], 'repeated']})
        decide(self.repo, 'batch', [self.item['id'], 'repeated'], self.decision())
        with self.assertRaisesRegex(ValueError, 'repeat the same asset'):
            approve(self.repo, 'batch')

    def test_amending_to_hold_removes_pending_target_and_failure_rolls_back(self):
        plan_id = self.create_plan()
        decide(self.repo, 'batch', [self.item['id']], {'action': 'hold', 'reason': 'Attribution uncertain'}, plan_id)
        self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['targetPlans'], {})
        self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['status'], 'held')
        self.repo.fail_commit = True
        with self.assertRaises(ConnectionError):
            decide(self.repo, 'batch', [self.item['id']], self.decision(), plan_id)
        self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['status'], 'held')

    def test_empty_analysis_does_not_create_another_batch(self):
        before = len(self.repo.list('material_inbox_batches'))
        with patch.object(self.repo, 'catalogue', side_effect=AssertionError('Empty analysis must not read the full catalogue')):
            result = asyncio.run(analyze(self.repo, object()))
        self.assertIsNone(result['batchId'])
        self.assertEqual(len(self.repo.list('material_inbox_batches')), before)

    def test_full_sync_resumes_and_last_deleted_message_is_reconciled(self):
        bodies = [payload(i) for i in range(1, 6)]
        client = FakeTelegram(bodies)
        with patch('telegram_materials.inbox_sync.message_payload', side_effect=lambda m, _: m.payload), \
             patch('telegram_materials.inbox_sync.extract_links', return_value=[]):
            self.assertFalse(asyncio.run(sync(self.repo, client, full=True, limit=2))['complete'])
            self.assertFalse(asyncio.run(sync(self.repo, client, full=True, limit=2))['complete'])
            self.assertTrue(asyncio.run(sync(self.repo, client, full=True, limit=2))['complete'])
            self.assertEqual(len(self.repo.list('material_inbox')), 5)
            client.messages.pop(5)
            asyncio.run(sync(self.repo, client))
        self.assertTrue(self.repo.read('material_inbox', message_key(5))['sourceMissing'])

    def test_cache_loss_redownloads_verified_small_pdf_without_losing_approval(self):
        from pypdf import PdfWriter
        writer = PdfWriter(); writer.add_blank_page(width=200, height=200)
        buffer = io.BytesIO(); writer.write(buffer); content = buffer.getvalue()
        with tempfile.TemporaryDirectory() as directory, patch('telegram_materials.inbox_media.CACHE', Path(directory)):
            path = Path(directory) / 'original.pdf'; path.write_bytes(content)
            metadata = inspect_file(path, 'file')
            self.repo.write('material_inbox_items', self.item['id'], {**metadata, 'storage': 'r2'})
            self.create_plan(); approve(self.repo, 'batch')
            fresh = SimpleNamespace(file=SimpleNamespace(size=len(content)), document=True)
            class Client:
                async def download_media(self, message, *, file, progress_callback):
                    await progress_callback(len(content), len(content))
                    Path(file).write_bytes(content)
            url = 'https://asumed.eduvour.com/materials/sha256/' + metadata['sha256'] + '.pdf'
            with patch('telegram_materials.inbox_publication.verify_source', new=AsyncMock(return_value=fresh)), \
                 patch('telegram_materials.inbox_publication.put_r2', return_value=url) as upload:
                asyncio.run(publish(self.repo, Client(), 'batch', True))
                upload.assert_called_once()
            self.assertEqual(self.repo.list('materials')[0]['url'], url)
            self.assertEqual(self.repo.read('material_inbox_items', self.item['id'])['status'], 'published')

    def test_actual_oversized_file_never_reaches_r2_even_with_small_metadata(self):
        metadata = {'sha256': 'a' * 64, 'extension': '.pdf', 'bytes': MAX_R2_BYTES, 'mime': 'application/pdf', 'storage': 'r2'}
        self.repo.write('material_inbox_items', self.item['id'], metadata)
        self.create_plan(); approve(self.repo, 'batch')
        with tempfile.TemporaryDirectory() as directory, patch('telegram_materials.inbox_media.CACHE', Path(directory)):
            path = cache_path(metadata); path.parent.mkdir()
            with path.open('wb') as handle:
                handle.seek(MAX_R2_BYTES); handle.write(b'!')
            with patch('telegram_materials.inbox_publication.verify_source', new=AsyncMock(return_value=object())), \
                 patch('telegram_materials.inbox_publication.put_r2') as upload:
                with self.assertRaisesRegex(ValueError, '25 MB policy'):
                    asyncio.run(publish(self.repo, object(), 'batch', True))
                upload.assert_not_called()
        self.assertEqual(self.repo.list('materials'), [])

    def test_archive_paths_stay_inside_cache_and_members_have_independent_state(self):
        from pypdf import PdfWriter
        writer = PdfWriter(); writer.add_blank_page(width=200, height=200)
        buffer = io.BytesIO(); writer.write(buffer)
        with tempfile.TemporaryDirectory() as directory, patch('telegram_materials.inbox_media.CACHE', Path(directory)):
            archive_path = Path(directory) / 'source.zip'
            with zipfile.ZipFile(archive_path, 'w') as archive:
                archive.writestr('../../outside.pdf', buffer.getvalue())
                archive.writestr('nested.zip', b'nested archive')
            parent = {**self.item, **inspect_file(archive_path, 'archive'), 'kind': 'archive'}
            cache_path(parent).parent.mkdir(); archive_path.replace(cache_path(parent))
            children = list(expand_archive(self.repo, parent))
            self.assertEqual(len(children), 2)
            self.assertTrue(cache_path(children[0]).is_relative_to(Path(directory)))
            self.assertTrue(cache_path(children[0]).is_file())
            self.assertEqual(children[1]['status'], 'held')
            self.repo.write('material_inbox_items', children[0]['id'], {'status': 'published'})
            list(expand_archive(self.repo, parent))
            self.assertEqual(self.repo.read('material_inbox_items', children[0]['id'])['status'], 'published')


class FakeTelegram:
    def __init__(self, bodies):
        self.messages = {p['messageId']: SimpleNamespace(id=p['messageId'], payload=p) for p in bodies}

    async def get_entity(self, _):
        return SimpleNamespace(id=3977555264)

    async def get_messages(self, _, limit=None, ids=None):
        if ids is None:
            return [self.messages[max(self.messages)]] if self.messages else []
        return [self.messages.get(key) for key in ids]

    async def iter_messages(self, _, *, min_id, max_id, reverse):
        for key in sorted(self.messages):
            if min_id < key < max_id:
                yield self.messages[key]


if __name__ == '__main__':
    unittest.main()
