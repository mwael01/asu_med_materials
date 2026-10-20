import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from core import stable_url, normalize_activity, exact_lessons, build_material, MODULE
from client import Client, COURSE
from sync import collect


class Policies(unittest.TestCase):
    def test_no_authenticated_download_or_session_urls(self):
        for url in ['https://asu2learn.asu.edu.eg/medicine/pluginfile.php/33/lecture.pdf',
                    'https://asu2learn.asu.edu.eg/medicine/mod/quiz/attempt.php?id=1',
                    'https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=1&sesskey=private',
                    'https://drive.google.com.evil.test/file/d/test/view',
                    'https://example.org/movie.mp4?token=private']:
            self.assertIsNone(stable_url(url))
        self.assertEqual(stable_url('https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=12&forceview=1'),
                         'https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=12')
        self.assertEqual(stable_url('https://youtu.be/abcdefghijk?si=tracking'), 'https://www.youtube.com/watch?v=abcdefghijk')

    def test_duplicate_occurrences_stable_identity_and_revision(self):
        activity = {'id': '12', 'title': 'Lung anatomy', 'type': 'resource', 'section': 'Anatomy',
                    'url': 'https://asu2learn.asu.edu.eg/medicine/mod/resource/view.php?id=12', 'links': []}
        first = normalize_activity(activity)[0]
        second = normalize_activity({**activity, 'title': 'Lung anatomy revised'})[0]
        self.assertEqual(first['id'], second['id'])
        self.assertNotEqual(first['fingerprint'], second['fingerprint'])
        self.assertEqual(normalize_activity({**activity, 'hidden': True}), [])
        lesson = {'id': 'lung', 'title': 'Lung anatomy', 'subject': 'Anatomy', 'moduleId': MODULE}
        self.assertEqual(exact_lessons(first, [lesson]), ['lung'])
        self.assertEqual(exact_lessons(first, [lesson, {**lesson, 'id': 'ambiguous'}]), [])

    def test_related_recordings_form_playlist_with_all_lesson_links(self):
        lessons = [{'id': ident, 'moduleId': MODULE, 'title': ident, 'subject': 'Anatomy'} for ident in ['lung', 'pleura']]
        entries = [{'id': str(i), 'title': f'Part {i}', 'url': url,
                    'review': {'lessonIds': [lesson], 'kind': 'video', 'category': 'lectures'}}
                   for i, lesson, url in [(1, 'lung', 'https://www.youtube.com/watch?v=abcdefghijk'),
                                         (2, 'pleura', 'https://asu2learn.asu.edu.eg/medicine/mod/page/view.php?id=2')]]
        material, links = build_material(entries, lessons, 'anatomy-recordings', 'Respiratory anatomy — ASU2Learn')
        self.assertEqual(material['type'], 'playlist')
        self.assertEqual(len(material['videos']), 2)
        self.assertEqual(material['videos'][1]['sourceType'], 'external')
        self.assertEqual(links, ['lung', 'pleura'])
        self.assertEqual(material['id'], build_material(entries, lessons, 'anatomy-recordings', 'Renamed')[0]['id'])
        with self.assertRaises(ValueError):
            build_material(entries, [{**l, 'active': False} for l in lessons], 'x', 'x')

    def test_binary_redirect_is_never_requested(self):
        class Response:
            is_redirect = True
            headers = {'Location': 'https://asu2learn.asu.edu.eg/medicine/pluginfile.php/1/movie.mp4'}
            def __enter__(self): return self
            def __exit__(self, *args): pass
        class Session:
            def __init__(self): self.calls = []
            def request(self, method, url, **kwargs):
                self.calls.append(url)
                self.assert_stream = kwargs['stream'] and not kwargs['allow_redirects']
                return Response()
        client = Client()
        client.session = Session()
        url, html = client.html('https://asu2learn.asu.edu.eg/medicine/mod/url/view.php?id=1')
        self.assertIsNone(html)
        self.assertEqual(len(client.session.calls), 1)
        self.assertTrue(client.session.assert_stream)

    def test_incomplete_or_logged_out_scan_is_rejected(self):
        class FakeClient:
            def html(self, url): return url, '<html></html>'
        with self.assertRaises(ValueError):
            collect(FakeClient(), lambda *args: {'authenticated': False, 'loginForm': True})
        with self.assertRaises(ValueError):
            collect(FakeClient(), lambda *args: {'authenticated': True, 'title': 'Respiratory', 'activities': [], 'sectionLinks': []})

    def test_crawler_expands_sections_but_never_resource_files(self):
        activity = {'id': '1', 'title': 'Lung', 'type': 'resource', 'url': COURSE.replace('course/view', 'mod/resource/view'), 'links': []}
        class FakeClient:
            def __init__(self): self.calls = []
            def html(self, url): self.calls.append(url); return url, url
        def parse(mode, html, url):
            return {'authenticated': True, 'title': 'Respiratory', 'activities': [activity],
                    'sectionLinks': [COURSE + '&section=2', 'https://example.com/course/section.php?id=1']}
        client = FakeClient()
        entries, pages, activities = collect(client, parse)
        self.assertEqual(len(entries), 1)
        self.assertEqual(pages, 2)
        self.assertEqual(activities, 1)
        self.assertTrue(all('/course/' in url for url in client.calls))


if __name__ == '__main__':
    unittest.main()
