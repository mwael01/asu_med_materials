"""Pure metadata policies for a links-only respiratory import."""
from __future__ import annotations

import hashlib
import json
import re
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from client import BASE, COURSE, internal

MODULE = 'year2-respiratory'
SOURCE = 'asu2learn-respiratory'
DEPARTMENT_AUTHOR = 'ASU Faculty Staff'
ALLOWED = {'resource', 'url', 'page', 'folder', 'book', 'h5pactivity'}
VIDEO = re.compile(r'\b(video|recording|recorded|lecture recording)\b|فيديو|تسجيل', re.I)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def stable_url(url):
    """Only stable Moodle activity routes or supported external share URLs."""
    try:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password:
            return None
        query = parse_qs(parsed.query)
        if any(key.lower() in {'sesskey', 'token', 'access_token', 'auth', 'password', 'signature', 'expires', 'key', 'wstoken'} for key in query):
            return None
        if internal(url):
            match = re.fullmatch(r'/medicine/mod/([a-z0-9]+)/view.php', parsed.path)
            ident = query.get('id', [''])[0]
            if match and match[1] in ALLOWED and ident.isdigit():
                return BASE + f'mod/{match[1]}/view.php?id={ident}'
            return None
        host = (parsed.hostname or '').lower()
        if host in {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'}:
            if host == 'youtu.be':
                ident = parsed.path.strip('/')
            else:
                ident = query.get('v', [''])[0] or (parsed.path.split('/')[-1] if parsed.path.startswith(('/embed/', '/shorts/')) else '')
            if re.fullmatch(r'[\w-]{11}', ident):
                return 'https://www.youtube.com/watch?v=' + ident
            # External playlists cannot be expanded without fetching their metadata.
            return None
        if host in {'drive.google.com', 'docs.google.com'}:
            if not re.match(r'^/(file/d/|drive/(?:u/\d+/)?folders/|document/d/|presentation/d/|spreadsheets/d/|open|uc)', parsed.path):
                return None
            keep = {key: values[0] for key, values in query.items() if key in {'id', 'resourcekey'}}
            return urlunsplit(('https', parsed.netloc, parsed.path, urlencode(keep), ''))
        if host in {'vimeo.com', 'www.vimeo.com', 'player.vimeo.com'} and re.fullmatch(r'/(?:video/)?\d+', parsed.path):
            return 'https://vimeo.com/' + parsed.path.split('/')[-1]
    except (ValueError, TypeError):
        pass
    return None


def video_type(url):
    host = urlsplit(url).hostname
    if host == 'www.youtube.com':
        return 'youtube'
    if host == 'vimeo.com':
        return 'vimeo'
    return 'external'


def normalize_activity(activity):
    if activity.get('hidden'):
        return []
    primary = stable_url(activity.get('url', ''))
    links = sorted({clean for link in activity.get('links', []) if (clean := stable_url(link['url']))})
    external = [link for link in links if not internal(link)]
    destination = external[0] if primary and len(external) == 1 else primary
    # Stable Moodle resource links take precedence over authenticated file URLs.
    if primary:
        links = [primary, *[link for link in links if link != primary]]
    results = []
    for url in links:
        ident = f"activity-{activity['id']}" if url == primary else f"activity-{activity['id']}-link-{fingerprint(url)[:12]}"
        title = activity.get('title') or activity.get('section') or 'ASU2Learn material'
        if url != primary and url == destination:
            continue
        kind = 'video' if video_type(url) != 'external' or VIDEO.search(title) or activity.get('targetKind') == 'video' else 'link'
        metadata = {'title': title, 'url': destination if url == primary else url, 'sourceUrl': primary or COURSE,
                    'activityId': activity['id'], 'activityType': activity.get('type', ''),
                    'section': activity.get('section', ''), 'sectionId': activity.get('sectionId', ''), 'kind': kind,
                    'targetKind': activity.get('targetKind', ''), 'targetFingerprint': activity.get('targetFingerprint', '')}
        results.append({'id': ident, **metadata, 'fingerprint': fingerprint(metadata)})
    return results


def exact_lessons(entry, lessons):
    """Suggest only exact, unique curriculum titles; all publication is reviewed."""
    def clean(value):
        return re.sub(r'[^\w]+', ' ', value.lower()).strip()
    title = clean(entry['title'])
    matches = [l['id'] for l in lessons if clean(l['title']) == title and l.get('active') is not False]
    return matches if len(matches) == 1 else []


def build_material(entries, lessons, group, title):
    reviewed = [entry['review'] for entry in entries]
    lesson_ids = sorted({lid for review in reviewed for lid in review['lessonIds']})
    module_wide = all(review.get('moduleWide') for review in reviewed)
    valid = {lesson['id']: lesson for lesson in lessons if lesson.get('active') is not False and lesson.get('moduleId') == MODULE}
    if (not lesson_ids and not module_wide) or not set(lesson_ids).issubset(valid):
        raise ValueError('Choose active respiratory lessons')
    kinds = {review['kind'] for review in reviewed}
    if len(kinds) != 1:
        raise ValueError('Group recordings separately from links')
    mid = 'asu2learn-' + fingerprint({'source': SOURCE, 'group': group})[:24]
    subjects = {valid[lid]['subject'] for lid in lesson_ids}
    material = {'id': mid, 'title': title, 'url': entries[0]['url'], 'type': 'website',
                'moduleId': MODULE, 'year': 2, 'semester': 1, 'tags': ['ASU2Learn'],
                'category': reviewed[0]['category'], 'importSources': sorted({url for e in entries for url in [e['url'], e.get('sourceUrl', e['url'])]}),
                'importRunId': SOURCE, 'importReviewStatus': 'reviewed', 'author': DEPARTMENT_AUTHOR}
    if len(subjects) == 1:
        material.update(subject=next(iter(subjects)), lessonId=lesson_ids[0])
    if kinds == {'video'}:
        material.update(type='playlist', videos=[{'id': e['id'], 'title': e['title'], 'url': e['url'],
            'sourceType': 'drive' if urlsplit(e['url']).hostname == 'drive.google.com' else video_type(e['url'])} for e in entries])
    elif len(entries) > 1:
        material['documents'] = [{'id': e['id'], 'title': e['title'], 'url': e['url'], 'type': 'website'} for e in entries]
    return material, lesson_ids
