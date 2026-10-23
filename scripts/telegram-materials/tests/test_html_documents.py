import tempfile
import unittest
from pathlib import Path

from telegram_materials.inbox_media import inspect_file


class HtmlDocumentTests(unittest.TestCase):
    def test_html_is_verified_and_evidence_does_not_execute_scripts(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'attachment.part'
            path.write_text('''<!doctype html><html><head><title>Study quiz</title>
<style>.q {color:red}</style></head><body><div class="q"><input type="radio">Question</div>
<script src="https://example.org/quiz.js">throw new Error('must not execute')</script>
<button onclick="alert(1)">Answer</button></body></html>''')
            result = inspect_file(path, 'file')
            self.assertEqual(result['mime'], 'text/html')
            self.assertEqual(result['extension'], '.html')
            evidence = result['htmlEvidence']
            self.assertEqual(evidence['title'], 'Study quiz')
            self.assertEqual(evidence['scripts'], 1)
            self.assertEqual(evidence['questionCount'], 1)
            self.assertEqual(evidence['externalResources'], ['https://example.org/quiz.js'])
            self.assertEqual(evidence['eventHandlers'], ['onclick'])
            self.assertNotIn('must not execute', evidence['text'])
            self.assertNotIn('color:red', evidence['text'])

    def test_truncated_html_is_not_publishable(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'attachment.part'
            path.write_text('<!doctype html><html><head><title>Quiz</title></head><body>Truncated')
            with self.assertRaisesRegex(ValueError, 'complete'):
                inspect_file(path, 'file')
