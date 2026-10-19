import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from telegram_materials.core import MODULE_ID, Stage
from telegram_materials.curation import curate, publication_report


class CurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.stage = Stage(Path(self.temp.name))
        self.decisions = self.stage.directory / 'decisions.csv'
        for entry_id in ['one', 'two', 'uncertain']:
            self.stage.put({'id': entry_id, 'kind': 'file', 'title': entry_id, 'sha256': entry_id,
                            'mime': 'application/pdf', 'bytes': 10, 'status': 'unreviewed'})
        self.catalogue = patch('telegram_materials.curation.catalogue', return_value=({}, [
            {'id': 'lesson', 'moduleId': MODULE_ID, 'subject': 'Anatomy', 'active': True}], []))
        self.verify = patch('telegram_materials.curation.verify_entry')
        self.catalogue.start(); self.verify.start()

    def tearDown(self):
        self.catalogue.stop(); self.verify.stop()
        self.stage.db.close(); self.temp.cleanup()

    def write(self, rows):
        with self.decisions.open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=['entryIds', 'lessonIds', 'title', 'category', 'reason'])
            writer.writeheader(); writer.writerows(rows)

    def row(self, entry_ids, lesson='lesson'):
        return {'entryIds': entry_ids, 'lessonIds': lesson, 'title': 'Reviewed notes',
                'category': 'summaries', 'reason': 'Explicit topic and source reviewed'}

    def test_invalid_later_decision_leaves_all_staging_unchanged(self):
        self.write([self.row('one'), self.row('two', 'other-module-lesson')])
        with self.assertRaises(ValueError):
            curate(self.stage, None, self.decisions)
        self.assertTrue(all(entry['status'] == 'unreviewed' for entry in self.stage.entries()))

    def test_repeated_file_cannot_be_approved_twice(self):
        self.write([self.row('one'), self.row('one|two')])
        with self.assertRaisesRegex(ValueError, 'more than one decision'):
            curate(self.stage, None, self.decisions)

    def test_bundle_order_and_hold_reasons_survive_publication_report(self):
        self.write([self.row('two|one')])
        self.assertEqual(curate(self.stage, None, self.decisions), 1)
        parent = next(entry for entry in self.stage.entries() if entry['kind'] == 'bundle')
        self.assertEqual(parent['members'], ['two', 'one'])
        self.assertEqual(self.stage.get('uncertain')['status'], 'held')
        parent.update(status='published', materialId='live-material')
        self.stage.save(parent)
        member = self.stage.get('one'); member['uploadedUrl'] = 'https://example.test/one.pdf'; self.stage.save(member)
        publication_report(self.stage)
        with (self.stage.directory / 'publication.csv').open(encoding='utf-8-sig') as handle:
            rows = {row['entryId']: row for row in csv.DictReader(handle)}
        self.assertEqual(rows['one']['status'], 'published')
        self.assertEqual(rows['one']['reviewStatus'], 'pending')
        self.assertEqual(rows['one']['materialId'], 'live-material')
        self.assertEqual(rows['uncertain']['status'], 'held')


if __name__ == '__main__':
    unittest.main()
