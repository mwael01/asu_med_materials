import copy
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).parent))
from firebase_admin import firestore
from core import MODULE, SOURCE, fingerprint
from sync import Repository


class Doc:
    def __init__(self, db, path): self.db, self.path = db, path
    @property
    def id(self): return self.path.rsplit('/', 1)[-1]
    def collection(self, name): return Query(self.db, self.path + '/' + name)
    def get(self, transaction=None):
        if transaction: transaction.read()
        self.db.reads += 1
        value = copy.deepcopy(self.db.rows.get(self.path))
        return SimpleNamespace(id=self.id, exists=value is not None, to_dict=lambda: copy.deepcopy(value), reference=self)


class Query:
    def __init__(self, db, path): self.db, self.path, self.filters = db, path, []
    def document(self, key): return Doc(self.db, self.path + '/' + key)
    def where(self, *, filter): self.filters.append(filter); return self
    def stream(self, transaction=None):
        if transaction: transaction.read()
        self.db.queries.append((self.path, [(f.field_path, f.value) for f in self.filters]))
        for path, value in list(self.db.rows.items()):
            if path.rsplit('/', 1)[0] == self.path and all(value.get(f.field_path) == f.value for f in self.filters):
                yield Doc(self.db, path).get(transaction)


class Tx:
    def __init__(self, db): self.db, self.writes = db, []
    def read(self):
        if self.writes: raise AssertionError('Firestore reads must precede writes')
    def set(self, ref, value, merge=False): self.writes.append((ref.path, value, merge))
    def delete(self, ref): self.writes.append((ref.path, None, False))
    def commit(self):
        for path, value, merge in self.writes:
            if value is None:
                self.db.rows.pop(path, None)
                continue
            old = copy.deepcopy(self.db.rows.get(path, {})) if merge else {}
            for key, val in value.items():
                if val is firestore.DELETE_FIELD: old.pop(key, None)
                else: old[key] = copy.deepcopy(val)
            self.db.rows[path] = old


class DB:
    def __init__(self): self.rows, self.queries, self.reads = {}, [], 0
    def collection(self, path): return Query(self, path)


class Publication(unittest.TestCase):
    def setUp(self):
        self.db = DB()
        self.repo = Repository(self.db)
        self.repo.owner = 'worker'
        self.repo.atomic = self.atomic
        self.source = 'material_imports/' + SOURCE
        self.db.rows[self.source] = {'scanStatus': 'complete', 'leaseOwner': 'worker', 'leaseUntil': time.time() + 1000}
        self.db.rows['modules/' + MODULE] = {'year': 2, 'active': True}
        self.db.rows['lessons/lung'] = {'moduleId': MODULE, 'title': 'Lung', 'subject': 'Anatomy', 'active': True}
        self.db.rows['materials_version/current'] = {'version': 1}
        self.db.rows['material_asset_index/catalogue-state'] = {'version': 1, 'complete': True, 'generation': 'gen'}
        self.metadata = {'id': 'activity-1', 'title': 'Lung', 'url': 'https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=1',
                         'sourceUrl': 'https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=1', 'kind': 'link', 'fingerprint': 'revision1'}

    def atomic(self, callback):
        tx = Tx(self.db)
        result = callback(tx)
        tx.commit()
        return result

    def prepare(self):
        self.repo.stage({'activity-1': self.metadata}, 1, 1)
        self.repo.review(['activity-1'], ['lung'], 'lung-slides', 'Lung — ASU2Learn', 'link', 'lectures', 'Exact subject/topic')

    def test_publish_is_idempotent_scoped_and_updates_identity_index(self):
        self.prepare()
        self.db.rows['materials/unrelated'] = {'moduleId': 'another-module', 'url': self.metadata['url']}
        self.assertEqual(self.repo.publish()[0]['status'], 'ready')
        self.assertEqual(self.db.rows['materials_version/current']['version'], 1)
        result = self.repo.publish(True)
        mid = result[0]['materialId']
        self.assertEqual(self.db.rows['materials_version/current']['version'], 2)
        self.assertEqual(self.db.rows['material_asset_index/catalogue-state']['version'], 2)
        self.assertEqual(self.repo.publish(True)[0]['status'], 'unchanged')
        self.assertEqual(self.db.rows['materials_version/current']['version'], 2)
        self.assertTrue(any(path.startswith('material_lesson_links/') for path in self.db.rows))
        for collection, filters in self.db.queries:
            if collection in {'materials', 'lessons'}: self.assertEqual(filters, [('moduleId', MODULE)])
        self.assertEqual(self.db.rows['materials/' + mid]['type'], 'website')

    def test_changed_missing_and_restored_sources_do_not_duplicate_materials(self):
        self.prepare()
        self.repo.publish(True)
        changed = {**self.metadata, 'fingerprint': 'revision2', 'title': 'Lung revised'}
        self.repo.stage({'activity-1': changed}, 1, 1)
        self.assertEqual(self.repo.publish(True)[0]['status'], 'held')
        self.repo.stage({}, 1, 1)
        self.assertEqual(self.repo.publish(True)[0]['status'], 'held')
        self.assertEqual(sum(key.startswith('materials/') for key in self.db.rows), 1)

    def test_duplicates_held_and_concurrent_or_manual_changes_abort(self):
        self.prepare()
        self.db.rows['materials/duplicate'] = {'id': 'duplicate', 'moduleId': MODULE, 'url': self.metadata['url']}
        self.assertEqual(self.repo.publish(True)[0]['status'], 'held')
        del self.db.rows['materials/duplicate']
        mid = self.repo.publish(True)[0]['materialId']
        self.db.rows['materials/' + mid]['bookmarksCount'] = 8
        self.db.rows['materials/' + mid]['title'] = 'Manual correction'
        self.repo.review(['activity-1'], ['lung'], 'lung-slides', 'Updated group title', 'link', 'lectures', 'Reviewed')
        with self.assertRaisesRegex(ValueError, 'edited manually'):
            self.repo.publish(True)
        self.assertEqual(self.db.rows['materials/' + mid]['title'], 'Manual correction')
        self.assertEqual(self.db.rows['materials_version/current']['version'], 2)

    def test_expired_lease_and_incomplete_scan_block_publication(self):
        self.prepare()
        self.db.rows[self.source]['leaseUntil'] = 0
        with self.assertRaisesRegex(ValueError, 'lease expired'): self.repo.publish(True)
        self.assertEqual(self.db.rows['materials_version/current']['version'], 1)
        self.db.rows[self.source]['scanStatus'] = 'scanning'
        with self.assertRaisesRegex(ValueError, 'complete successful scan'): self.repo.publish(True)

    def test_module_wide_orientation_has_no_invented_lesson(self):
        self.repo.stage({'activity-1': self.metadata}, 1, 1)
        self.repo.review(['activity-1'], [], 'orientation', 'Orientation — ASU2Learn', 'link', 'central', 'Module-wide orientation', True)
        result = self.repo.publish(True)
        self.assertEqual(result[0]['lessonIds'], [])
        self.assertNotIn('subject', self.db.rows['materials/' + result[0]['materialId']])

    def test_new_part_extends_existing_group_and_preserves_bookmarks(self):
        self.prepare()
        mid = self.repo.publish(True)[0]['materialId']
        self.db.rows['materials/' + mid]['bookmarksCount'] = 12
        self.db.rows['materials/' + mid]['contributorUsername'] = 'editor'
        new = {**self.metadata, 'id': 'activity-0', 'title': 'Lung part 2', 'fingerprint': 'new',
               'url': 'https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=2'}
        self.repo.stage({'activity-1': self.metadata, 'activity-0': new}, 1, 2)
        self.repo.review(['activity-0'], ['lung'], 'lung-slides', 'Lung — ASU2Learn', 'link', 'lectures', 'New part reviewed')
        result = self.repo.publish(True)
        self.assertEqual(result[0]['materialId'], mid)
        material = self.db.rows['materials/' + mid]
        self.assertEqual(len(material['documents']), 2)
        self.assertEqual(material['bookmarksCount'], 12)
        self.assertEqual(material['contributorUsername'], 'editor')
        self.assertEqual(self.repo.publish(True)[0]['status'], 'unchanged')

    def test_department_ownership_updates_legacy_payload_and_checkpoints_together(self):
        self.prepare()
        mid = self.repo.publish(True)[0]['materialId']
        material = self.db.rows['materials/' + mid]
        material.update(author='Dr. Previous Speaker', bookmarksCount=9)
        entry = self.db.rows[self.source + '/entries/activity-1']
        entry['publishedMaterial']['author'] = 'Dr. Previous Speaker'
        entry['publishedFingerprint'] = 'legacy-attribution'
        self.assertEqual(self.repo.publish(True)[0]['materialId'], mid)
        self.assertEqual(self.db.rows['materials/' + mid]['author'], 'ASU Faculty Staff')
        self.assertEqual(self.db.rows['materials/' + mid]['bookmarksCount'], 9)
        self.assertEqual(self.db.rows[self.source + '/entries/activity-1']['publishedMaterial']['author'], 'ASU Faculty Staff')
        self.assertEqual(self.repo.publish(True)[0]['status'], 'unchanged')


if __name__ == '__main__': unittest.main()
