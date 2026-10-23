import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
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


    def test_html_upload_prevents_cdn_rewriting_before_integrity_verification(self):
        from telegram_materials.store import put_r2
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'quiz.html'
            path.write_text('<!doctype html><html><head><title>Quiz</title></head><body>Question</body></html>')
            entry = inspect_file(path, 'file')
            with patch('telegram_materials.store.verify_r2', side_effect=[False, True]), patch('telegram_materials.store.subprocess.run', return_value=SimpleNamespace(returncode=0)) as upload:
                put_r2(path, entry)
                args = upload.call_args.args[0]
                self.assertIn('no-transform', args[args.index('--cache-control') + 1])
                self.assertEqual(args[args.index('--content-type') + 1], 'text/html')
