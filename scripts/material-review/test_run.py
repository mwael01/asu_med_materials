"""Synthetic checks for publication guards; no live network or Firestore calls."""
import argparse
import copy
import unittest
from unittest.mock import patch

import run


class Snapshot:
    def __init__(self, reference, value):
        self.reference, self.id = reference, reference.id
        self.value, self.exists = copy.deepcopy(value), value is not None

    def to_dict(self):
        return copy.deepcopy(self.value)


class Reference:
    def __init__(self, db, path):
        self.db, self.path, self.id = db, path, path.rsplit('/', 1)[-1]

    def get(self, **kwargs):
        self.db.reads.append(self.path)
        return Snapshot(self, self.db.values.get(self.path))

    def collection(self, name):
        return Collection(self.db, self.path + '/' + name)

    def set(self, value, merge=False):
        self.db.values[self.path] = {**self.db.values.get(self.path, {}), **value} if merge else copy.deepcopy(value)


class Collection:
    def __init__(self, db, path, field_filter=None):
        self.db, self.path, self.field_filter = db, path, field_filter

    def document(self, key):
        return Reference(self.db, self.path + '/' + key)

    def where(self, *, filter):
        return Collection(self.db, self.path, filter)

    def stream(self, **kwargs):
        for path, value in list(self.db.values.items()):
            if path.rsplit('/', 1)[0] == self.path and (self.field_filter is None or value.get(self.field_filter.field_path) == self.field_filter.value):
                yield Reference(self.db, path).get()


class Database:
    def __init__(self):
        self.values, self.reads = {}, []

    def collection(self, name):
        return Collection(self, name)

    def transaction(self):
        return self

    def set(self, ref, value, merge=False):
        ref.set(value, merge)

    def update(self, ref, value):
        ref.set(value, merge=True)

    def delete(self, ref):
        self.values.pop(ref.path, None)

    def get_all(self, refs, **kwargs):
        return [ref.get() for ref in refs]


def staged(db, key, before, after):
    if before is not None:
        db.values['materials/' + key] = before
    ref = db.collection('material_audits').document('test').collection('changes').document(key)
    value = {'materialId': key, 'before': before, 'after': after,
             'beforeLinks': {}, 'lessonIds': [], 'status': 'planned', 'reason': 'Synthetic review'}
    ref.set(value)
    return ref.get()


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.db.values['modules/module'] = {'year': 2, 'subjects': ['Anatomy']}
        self.item = {'id': 'a', 'moduleId': 'module', 'year': 2, 'subject': 'Anatomy', 'title': 'Example'}

    def publish(self, records):
        with patch.object(run.firestore, 'transactional', lambda fn: fn), patch.object(run, 'emit'):
            run.apply(self.db, argparse.Namespace(run='test', apply=True), records=records)

    def test_group_reuses_curriculum_and_verifies_only_affected_materials(self):
        changed = {**self.item, 'title': 'Reviewed'}
        created = {**self.item, 'id': 'b'}
        records = [staged(self.db, 'a', self.item, changed), staged(self.db, 'b', None, created)]
        self.publish(records)
        self.assertEqual(self.db.values['materials/a'], changed)
        self.assertEqual(self.db.values['materials/b'], created)
        self.assertEqual(self.db.reads.count('modules/module'), 1)
        self.assertEqual(self.db.values[records[0].reference.path]['status'], 'applied')

    def test_concurrent_plan_edit_prevents_entire_group_from_writing(self):
        records = [staged(self.db, 'a', self.item, {**self.item, 'title': 'Reviewed'}),
                   staged(self.db, 'b', None, {**self.item, 'id': 'b'})]
        self.db.values[records[1].reference.path]['reason'] = 'Changed by another reviewer'
        with self.assertRaisesRegex(ValueError, 'Review changed'):
            self.publish(records)
        self.assertEqual(self.db.values['materials/a'], self.item)
        self.assertNotIn('materials/b', self.db.values)

    def test_concurrent_content_or_assignment_edit_is_preserved(self):
        record = staged(self.db, 'a', self.item, {**self.item, 'title': 'Reviewed'})
        self.db.values['material_lesson_links/new'] = {'materialId': 'a', 'lessonId': 'new', 'moduleId': 'module'}
        with self.assertRaisesRegex(ValueError, 'Assignments changed'):
            self.publish([record])
        self.assertEqual(self.db.values['materials/a'], self.item)
        self.db.values['materials/a']['title'] = 'Another editor'
        with self.assertRaisesRegex(ValueError, 'Material changed'):
            self.publish([record])

    def test_source_failure_is_unverified_and_never_suggests_deletion(self):
        with patch.object(run, 'request', side_effect=TimeoutError('temporary')):
            result = run.metadata('abcdefghijk')
        self.assertEqual(result['status'], 'unverified')
        self.assertNotIn('delete', result)


if __name__ == '__main__':
    unittest.main()
