import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePage } from '../scripts/asu2learn/parse.mjs';

test('Moodle section parsing retains lesson context without navigation/user metadata', () => {
  const page = parsePage({ mode: 'course', url: 'https://asu2learn.asu.edu.eg/medicine/course/view.php?id=620', html: `
    <body class="loggedin"><h1>Respiratory System</h1><a href="/user/profile.php?id=99">Private user</a>
    <main id="region-main"><ul><li class="section" data-sectionid="10"><h2 class="sectionname">Anatomy</h2>
    <ul><li class="activity" data-id="1"><div class="activityname"><a href="../mod/resource/view.php?id=1"><span class="instancename">Lung anatomy <span class="accesshide">File</span></span></a></div></li>
    <li class="activity" data-id="2"><a class="aalink" href="../mod/url/view.php?id=2"><span class="instancename">Pleura recording</span></a></li></ul>
    </li></ul></main></body>` });
  assert.equal(page.authenticated, true);
  assert.equal(page.activities.length, 2);
  assert.equal(page.activities[0].title, 'Lung anatomy');
  assert.equal(page.activities[0].section, 'Anatomy');
  assert.equal(page.activities[1].type, 'url');
  assert.ok(!JSON.stringify(page).includes('Private user'));
});

test('activity metadata ignores pluginfile payloads and captures iframe URLs without fetching', () => {
  const page = parsePage({ mode: 'activity', url: 'https://asu2learn.asu.edu.eg/medicine/mod/page/view.php?id=1', html: `
    <body class="loggedin"><main id="region-main"><div class="generalbox"><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>
    <a href="../../pluginfile.php/1/lecture.pdf">Lecture</a></div></main></body>` });
  assert.equal(page.links.length, 2);
  assert.equal(page.links[0].url, 'https://www.youtube.com/embed/abcdefghijk');
});
