#!/usr/bin/env python3
"""Live source audit and reviewed corrections. All evidence/checkpoints stay in Firestore."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'telegram-materials'))
from telegram_materials.store import get_db
from firebase_admin import firestore


def now():
    return datetime.now(timezone.utc).isoformat()


def emit(value):
    print(json.dumps(value, ensure_ascii=False, default=str), flush=True)


def rows(db, name):
    return [dict(d.to_dict(), id=d.id) for d in db.collection(name).stream(timeout=60)]


def catalog(db, module_id=None, material_id=None):
    if module_id or material_id:
        from google.cloud.firestore_v1.base_query import FieldFilter
        if material_id:
            snapshot = db.collection('materials').document(material_id).get(retry=None, timeout=30)
            materials = [dict(snapshot.to_dict(), id=snapshot.id)] if snapshot.exists else []
            field, value = 'materialId', material_id
        else:
            materials = [dict(d.to_dict(), id=d.id) for d in db.collection('materials').where(filter=FieldFilter('moduleId', '==', module_id)).stream(retry=None, timeout=30)]
            field, value = 'moduleId', module_id
        links = [dict(d.to_dict(), id=d.id) for d in db.collection('material_lesson_links').where(filter=FieldFilter(field, '==', value)).stream(retry=None, timeout=30)]
        module_ids = {m['moduleId'] for m in materials if m.get('moduleId')} | ({module_id} if module_id else set())
        modules = [dict(d.to_dict(), id=d.id) for d in db.get_all([db.collection('modules').document(key) for key in module_ids], retry=None, timeout=30) if d.exists]
        if material_id:
            lesson_ids = {l['lessonId'] for l in links} | {m['lessonId'] for m in materials if m.get('lessonId')}
            lessons = [dict(d.to_dict(), id=d.id) for d in db.get_all([db.collection('lessons').document(key) for key in lesson_ids], retry=None, timeout=30) if d.exists] if lesson_ids else []
        else:
            lessons = [dict(d.to_dict(), id=d.id) for d in db.collection('lessons').where(filter=FieldFilter('moduleId', '==', module_id)).stream(retry=None, timeout=30)]
        return {'materials': materials, 'modules': modules, 'lessons': lessons, 'material_lesson_links': links}
    names = ['modules', 'lessons', 'materials', 'material_lesson_links']
    with ThreadPoolExecutor(max_workers=4) as pool:
        return dict(zip(names, pool.map(lambda n: rows(db, n), names)))


def video_id(item):
    if item.get('youtubeId'):
        return item['youtubeId']
    parsed = urlsplit(item.get('url', ''))
    if parsed.hostname in {'youtu.be', 'www.youtu.be'}:
        return parsed.path.strip('/').split('/')[0]
    if parsed.hostname in {'youtube.com', 'www.youtube.com', 'm.youtube.com'}:
        return parse_qs(parsed.query).get('v', [''])[0]
    return ''


def request(url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9'}
    if data:
        headers['Content-Type'] = 'application/json'
    with urlopen(Request(url, data=data, headers=headers), timeout=25) as response:
        return response.read(20 * 1024 * 1024).decode()


def metadata(vid):
    try:
        data = json.loads(request('https://www.youtube.com/oembed?format=json&url=' + quote('https://www.youtube.com/watch?v=' + vid, safe='')))
        return {'id': vid, 'title': data['title'], 'channel': data['author_name'],
                'channelUrl': data['author_url'], 'status': 'available', 'checkedAt': now()}
    except Exception as exc:
        return {'id': vid, 'status': 'unverified', 'error': str(exc), 'checkedAt': now()}


def normalize(text):
    return re.sub(r'[^\w]+', ' ', text.casefold()).strip()


def assignments(material, data):
    return sorted({l['lessonId'] for l in data['material_lesson_links'] if l.get('materialId') == material['id']} |
                  ({material['lessonId']} if material.get('lessonId') else set()))


def structural(data):
    modules = {m['id']: m for m in data['modules']}
    lessons = {l['id']: l for l in data['lessons']}
    materials = {m['id']: m for m in data['materials']}
    findings = []
    def add(kind, record, **details):
        findings.append({'kind': kind, 'id': record['id'], **details})
    for lesson in lessons.values():
        module = modules.get(lesson.get('moduleId'))
        if not module or lesson.get('subject') not in module.get('subjects', []):
            add('invalid-lesson-destination', lesson)
    for m in materials.values():
        module = modules.get(m.get('moduleId'))
        if not module:
            add('missing-module', m)
        elif m.get('subject') and m['subject'] not in module.get('subjects', []):
            add('invalid-subject', m, subject=m['subject'])
        if module and m.get('year') != module.get('year'):
            add('year-mismatch', m)
        if m.get('lessonId'):
            lesson = lessons.get(m['lessonId'])
            if not lesson or lesson.get('moduleId') != m.get('moduleId') or lesson.get('subject') != m.get('subject'):
                add('invalid-legacy-assignment', m, lessonId=m['lessonId'])
        seen = set()
        for v in m.get('videos', []):
            vid = video_id(v) or v.get('url')
            if vid in seen:
                add('duplicate-playlist-video', m, videoId=vid)
            seen.add(vid)
    for link in data['material_lesson_links']:
        m, l = materials.get(link.get('materialId')), lessons.get(link.get('lessonId'))
        if not m or not l or link.get('moduleId') != m.get('moduleId') or link.get('moduleId') != l.get('moduleId'):
            add('invalid-link', link, materialId=link.get('materialId'), lessonId=link.get('lessonId'))
    return findings


def scan(db, run_id, workers):
    data = catalog(db)
    run = db.collection('material_audits').document(run_id)
    run.set({'startedAt': now(), 'status': 'scanning', 'counts': {k: len(v) for k, v in data.items()}}, merge=True)
    ids = sorted({vid for m in data['materials'] for v in (m.get('videos') or [m]) if (vid := video_id(v))})
    evidence = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for index, result in enumerate(pool.map(metadata, ids), 1):
            evidence[result['id']] = result
            run.collection('sources').document(result['id']).set(result)
            if index % 50 == 0:
                emit({'progress': index, 'total': len(ids)})
    findings = structural(data)
    for m in data['materials']:
        for v in m.get('videos') or [m]:
            vid = video_id(v)
            if not vid:
                continue
            source = evidence[vid]
            if source['status'] != 'available':
                findings.append({'kind': 'unverified-video', 'id': m['id'], 'videoId': vid, 'storedTitle': v.get('title', '')})
            elif normalize(source['title']) != normalize(v.get('title', '')):
                findings.append({'kind': 'title-difference', 'id': m['id'], 'videoId': vid,
                                 'storedTitle': v.get('title', ''), 'sourceTitle': source['title'], 'channel': source['channel']})
    for index, finding in enumerate(findings):
        run.collection('findings').document(f'{index:05}').set(finding)
    summary = {'status': 'scanned', 'finishedAt': now(), 'videoCount': len(ids),
               'verifiedCount': sum(s['status'] == 'available' for s in evidence.values()),
               'findingCount': len(findings)}
    run.set(summary, merge=True)
    emit(summary)


def walk(value):
    if isinstance(value, list):
        for child in value:
            yield from walk(child)
    elif isinstance(value, dict):
        yield value
        for key, child in value.items():
            if key not in {'secondaryContents', 'frameworkUpdates'}:
                yield from walk(child)


def text_value(value):
    return value.get('content') or value.get('simpleText') or ''.join(v.get('text', '') for v in value.get('runs', []))


def browse(url):
    """Read every channel/playlist continuation, failing if pagination is incomplete."""
    if not re.fullmatch(r'https://www\.youtube\.com/(?:@[\w.%-]+|channel/[\w-]+)(?:/(?:videos|playlists))?|https://www\.youtube\.com/playlist\?list=[\w-]+', url):
        raise ValueError('Expected a YouTube channel videos/playlists URL or playlist URL')
    page = request(url)
    decoder = json.JSONDecoder()
    match = re.search(r'(?:var\s+)?ytInitialData\s*=\s*', page)
    if not match:
        raise ValueError('YouTube initial data unavailable')
    payload, _ = decoder.raw_decode(page[match.end():])
    config = {}
    for match in re.finditer(r'ytcfg\.set\(', page):
        try:
            value, _ = decoder.raw_decode(page[match.end():])
            config.update(value)
        except ValueError:
            pass
    heading = payload.get('metadata', {})
    # Only the selected tab; other tabs/recommendations do not belong to this listing.
    tabs = payload.get('contents', {}).get('twoColumnBrowseResultsRenderer', {}).get('tabs', [])
    if tabs:
        selected = next((t['tabRenderer'] for t in tabs if t.get('tabRenderer', {}).get('selected')), None)
        if not selected or 'content' not in selected:
            raise ValueError('Requested YouTube tab has no content')
        payload = selected['content']
    videos, playlists, seen, tokens = [], [], set(), set()
    while True:
        next_tokens = []
        for value in walk(payload):
            for key in ['videoRenderer', 'playlistVideoRenderer', 'gridVideoRenderer']:
                renderer = value.get(key, {})
                vid = renderer.get('videoId')
                if vid and vid not in seen:
                    seen.add(vid)
                    videos.append({'id': vid, 'youtubeId': vid, 'title': text_value(renderer.get('title', {})),
                                   'url': 'https://youtu.be/' + vid, 'sourceType': 'youtube',
                                   'published': text_value(renderer.get('publishedTimeText', {}))})
            model = value.get('lockupViewModel', {})
            content_id = model.get('contentId')
            if content_id and content_id not in seen:
                seen.add(content_id)
                title = model.get('metadata', {}).get('lockupMetadataViewModel', {}).get('title', {}).get('content', '')
                if model.get('contentType') == 'LOCKUP_CONTENT_TYPE_VIDEO':
                    videos.append({'id': content_id, 'youtubeId': content_id, 'title': title,
                                   'url': 'https://youtu.be/' + content_id, 'sourceType': 'youtube'})
                elif model.get('contentType') == 'LOCKUP_CONTENT_TYPE_PLAYLIST':
                    endpoint_ids = [endpoint['playlistId'] for node in walk(model)
                                    for key in ['watchPlaylistEndpoint', 'watchEndpoint']
                                    if (endpoint := node.get(key, {})).get('playlistId')]
                    playlists.append({'id': next(iter(endpoint_ids), content_id), 'title': title})
            renderer = value.get('gridPlaylistRenderer') or value.get('playlistRenderer') or {}
            if renderer.get('playlistId') and renderer['playlistId'] not in seen:
                seen.add(renderer['playlistId'])
                playlists.append({'id': renderer['playlistId'], 'title': text_value(renderer.get('title', {}))})
            continuation = value.get('continuationItemRenderer', {}).get('continuationEndpoint', {}).get('continuationCommand', {}).get('token')
            if continuation:
                next_tokens.append(continuation)
        if not next_tokens:
            break
        token = next_tokens[0]
        if token in tokens or len(tokens) >= 200:
            raise ValueError('Continuation loop or page limit; listing incomplete')
        tokens.add(token)
        if not config.get('INNERTUBE_CONTEXT') or not config.get('INNERTUBE_API_KEY'):
            raise ValueError('Missing continuation configuration; listing incomplete')
        payload = json.loads(request('https://www.youtube.com/youtubei/v1/browse?key=' + quote(config['INNERTUBE_API_KEY']),
                                     {'context': config['INNERTUBE_CONTEXT'], 'continuation': token}))
    return {'url': url, 'metadata': heading, 'videos': videos, 'playlists': playlists,
            'pages': len(tokens) + 1, 'checkedAt': now()}


def inspect(db, args):
    run = db.collection('material_audits').document(args.run)
    if args.findings:
        material_ids = None
        if args.module:
            from google.cloud.firestore_v1.base_query import FieldFilter
            material_ids = {d.id for d in db.collection('materials').where(filter=FieldFilter('moduleId', '==', args.module)).stream()}
        for d in run.collection('findings').stream():
            f = d.to_dict()
            if (not args.kind or f['kind'] == args.kind) and (material_ids is None or f['id'] in material_ids):
                emit(f)
        return
    if args.sources:
        for d in run.collection('sources').stream():
            value = d.to_dict()
            if not args.author or args.author.casefold() in json.dumps(value, ensure_ascii=False).casefold():
                emit(value)
        return
    if not (args.id or args.module or args.all):
        raise ValueError('Choose --id or --module; global inspection requires explicit --all')
    data = catalog(db, module_id=args.module, material_id=args.id)
    if args.authors:
        authors = {}
        for material in data['materials']:
            for author in material.get('author', []) if isinstance(material.get('author'), list) else [material.get('author')]:
                if author:
                    value = authors.setdefault(author, {'count': 0, 'subjects': set(), 'ids': []})
                    value['count'] += 1
                    value['subjects'].add(material.get('subject', 'General'))
                    value['ids'].append(material['id'])
        for author, value in sorted(authors.items()):
            emit({'author': author, **value, 'subjects': sorted(value['subjects']), 'ids': value['ids'] if value['count'] < 50 else []})
        return
    evidence = {d.id: d.to_dict() for d in run.collection('sources').stream()} if args.comparison else {}
    emit({'counts': {k: len(v) for k, v in data.items()}, 'structural': structural(data)})
    for m in data['materials']:
        if args.module and m.get('moduleId') != args.module:
            continue
        if args.author and not any(term.casefold() in str(m.get('author', '')).casefold() for term in args.author.split('|')):
            continue
        if args.id and m['id'] != args.id:
            continue
        if args.subject and m.get('subject') != args.subject:
            continue
        if args.videos and not (m.get('videos') or m.get('type') == 'youtube'):
            continue
        value = {**m, 'assignedLessons': assignments(m, data)}
        if args.compact:
            value = {k: v for k, v in value.items() if k in {'id', 'title', 'moduleId', 'subject', 'author', 'type', 'url', 'videos', 'assignedLessons'}}
            if 'videos' in value:
                value['videos'] = [{k: v for k, v in video.items() if k in {'title', 'youtubeId', 'url'}} for video in value['videos']]
        if args.comparison:
            value = {'id': m['id'], 'title': m['title'], 'subject': m.get('subject'), 'author': m.get('author'),
                     'lessons': assignments(m, data), 'sources': [{k: val for k, val in evidence.get(video_id(v), {'title': v.get('title'), 'url': v.get('url')}).items()
                                                               if k in {'id', 'title', 'channel', 'error'}} for v in m.get('videos') or [m]]}
        emit(value)


def plan(db, args):
    ref = db.collection('materials').document(args.id)
    snapshot = ref.get()
    before = snapshot.to_dict() if snapshot.exists else None
    change_ref = db.collection('material_audits').document(args.run).collection('changes').document(args.id)
    previous = change_ref.get().to_dict()
    base = previous['after'] if previous and previous['status'] == 'planned' else before
    patch = json.loads(args.patch) if args.patch else {}
    after = None if args.delete else {**(base or {}), **patch, 'id': args.id}
    if before is None and args.delete:
        raise ValueError('Material already absent')
    lessons = args.lessons.split(',') if args.lessons else []
    if args.lessons is None and previous and previous['status'] == 'planned':
        lessons = previous.get('lessonIds')
    if after:
        if args.video_ids is not None:
            source_ref = db.collection('material_audits').document(args.run).collection('sources')
            original = {video_id(v): v for v in (base or {}).get('videos', [])}
            videos = []
            for vid in args.video_ids.split(','):
                if not re.fullmatch(r'[\w-]{11}', vid):
                    raise ValueError('Malformed YouTube ID: ' + vid)
                evidence = source_ref.document(vid).get().to_dict()
                if not evidence or evidence['status'] != 'available' or evidence['checkedAt'][:10] != now()[:10]:
                    evidence = metadata(vid)
                    source_ref.document(vid).set(evidence)
                if evidence['status'] != 'available':
                    raise ValueError('Cannot publish an unverified YouTube video: ' + vid)
                videos.append({**original.get(vid, {}), 'id': original.get(vid, {}).get('id', vid),
                               'youtubeId': vid, 'title': evidence['title'], 'url': 'https://youtu.be/' + vid, 'sourceType': 'youtube'})
            after.update(videos=videos, type='playlist', url=videos[0]['url'])
            after.pop('playlistId', None)
        for field in args.remove_fields.split(',') if args.remove_fields else []:
            after.pop(field, None)
        if before is None:
            after.setdefault('createdAt', now())
        if not all(k in after for k in ['title', 'url', 'moduleId', 'year', 'type']):
            raise ValueError('Missing material fields')
        module = db.collection('modules').document(after['moduleId']).get().to_dict()
        if not module or after['year'] != module['year'] or after.get('subject') and after['subject'] not in module['subjects']:
            raise ValueError('Invalid module/year/subject')
        for lesson_id in lessons or []:
            lesson = db.collection('lessons').document(lesson_id).get().to_dict()
            if not lesson or lesson.get('active') is False or lesson['moduleId'] != after['moduleId']:
                raise ValueError('Invalid lesson destination')
        if lessons is not None and (args.lessons is not None or previous and previous['status'] == 'planned'):
            after.pop('lessonId', None)
        vids = [video_id(v) for v in after.get('videos', [])]
        if len(vids) != len(set(vids)):
            raise ValueError('Duplicate video in replacement playlist')
        for vid in vids if 'videos' in patch else []:
            if vid:
                evidence = metadata(vid)
                if evidence['status'] != 'available':
                    raise ValueError('Cannot publish an unverified YouTube video: ' + vid)
                db.collection('material_audits').document(args.run).collection('sources').document(vid).set(evidence)
    from google.cloud.firestore_v1.base_query import FieldFilter
    old_links = {d.id: d.to_dict() for d in db.collection('material_lesson_links').where(filter=FieldFilter('materialId', '==', args.id)).stream()}
    change = {'materialId': args.id, 'before': before, 'after': after, 'beforeLinks': old_links,
              'lessonIds': [] if args.delete else lessons if args.lessons is not None or previous and previous['status'] == 'planned' else None,
              'reason': ((previous['reason'] + '; ') if previous and previous['status'] == 'planned' else '') + args.reason,
              'status': 'planned', 'plannedAt': now()}
    change_ref.set(change)
    emit({'planned': args.id, 'title': after.get('title') if after else None, 'reason': change['reason'], 'lessonIds': change['lessonIds']})


def apply(db, args, records=None):
    from google.cloud.firestore_v1.base_query import FieldFilter
    run = db.collection('material_audits').document(args.run)
    pending = [d for d in (records if records is not None else run.collection('changes').where(filter=FieldFilter('status', '==', 'planned')).stream(retry=None, timeout=30))
               if d.to_dict()['status'] == 'planned']
    if not args.apply:
        for change in pending:
            emit(change.to_dict())
        return
    for offset in range(0, len(pending), 20):
        group = pending[offset:offset + 20]
        transaction = db.transaction()
        @firestore.transactional
        def commit(tx):
            # Reuse each curriculum read within this transaction. Never cache a
            # curriculum snapshot across transactions, where it could be stale.
            modules, lessons, ready = {}, {}, []
            for record in group:
                change = record.to_dict()
                ref = db.collection('materials').document(change['materialId'])
                current = ref.get(transaction=tx, retry=None, timeout=30)
                journal = record.reference.get(transaction=tx, retry=None, timeout=30)
                if journal.to_dict().get('status') == 'applied':
                    continue
                if journal.to_dict() != change:
                    raise ValueError('Review changed since loading: ' + ref.id)
                if (current.to_dict() if current.exists else None) != change['before']:
                    raise ValueError('Material changed since planning: ' + ref.id)
                links = list(db.collection('material_lesson_links').where(filter=FieldFilter('materialId', '==', ref.id)).stream(transaction=tx, retry=None, timeout=30))
                if {d.id: d.to_dict() for d in links} != change['beforeLinks']:
                    raise ValueError('Assignments changed since planning: ' + ref.id)
                after = change['after']
                if after:
                    module_id = after['moduleId']
                    if module_id not in modules:
                        modules[module_id] = db.collection('modules').document(module_id).get(transaction=tx, retry=None, timeout=30).to_dict()
                    module = modules[module_id]
                    if not module or after['year'] != module['year'] or after.get('subject') and after['subject'] not in module['subjects']:
                        raise ValueError('Module changed since planning')
                    for lesson_id in change.get('lessonIds') or []:
                        if lesson_id not in lessons:
                            lessons[lesson_id] = db.collection('lessons').document(lesson_id).get(transaction=tx, retry=None, timeout=30).to_dict()
                        lesson = lessons[lesson_id]
                        if not lesson or lesson.get('active') is False or lesson['moduleId'] != module_id:
                            raise ValueError('Lesson changed since planning')
                ready.append((record, change, ref, links))
            for record, change, ref, links in ready:
                after = change['after']
                if after:
                    tx.set(ref, after)
                else:
                    tx.delete(ref)
                if change.get('lessonIds') is not None:
                    for link in links:
                        tx.delete(link.reference)
                    for lesson_id in change['lessonIds']:
                        key = quote(ref.id, safe='').replace('~', '%7E') + '~' + quote(lesson_id, safe='').replace('~', '%7E')
                        tx.set(db.collection('material_lesson_links').document(key),
                               {'materialId': ref.id, 'lessonId': lesson_id, 'moduleId': after['moduleId']})
                tx.update(record.reference, {'status': 'applied', 'appliedAt': now()})
            if ready:
                tx.set(db.collection('materials_version').document('current'),
                       {'version': firestore.Increment(1), 'updatedAt': now()}, merge=True)
        commit(transaction)
        verified = {s.id: s.to_dict() for s in db.get_all([db.collection('materials').document(d.id) for d in group], retry=None, timeout=30)}
        for record in group:
            if verified.get(record.id) != record.to_dict()['after']:
                raise ValueError('Post-write verification failed: ' + record.id)
        emit({'appliedAndVerified': [d.id for d in group], 'completed': offset + len(group), 'total': len(pending)})
    run.set({'status': 'corrected', 'updatedAt': now()}, merge=True)


def review_session(db, run_id):
    """Keep saved plans in process memory so review never rescans the catalogue."""
    run = db.collection('material_audits').document(run_id)
    records = {d.id: d for d in run.collection('changes').stream(retry=None, timeout=30)}
    def summary():
        values = [d.to_dict() for d in records.values()]
        emit({'changes': len(values), 'pending': sum(c['status'] == 'planned' for c in values),
              'creates': sum(c['before'] is None for c in values), 'deletes': sum(c['after'] is None for c in values),
              'nameChanges': sum(c['before'] is not None and c['after'] is not None and c['before'].get('author') != c['after'].get('author') for c in values),
              'commands': ['show ID,ID', 'list', 'load ID,ID', 'amend JSON_ARRAY', 'validate', 'apply', 'quit']})
    summary()
    for line in sys.stdin:
        command, _, argument = line.strip().partition(' ')
        try:
            if command == 'quit':
                break
            if command == 'summary':
                summary()
            elif command == 'list':
                for d in records.values():
                    c = d.to_dict()
                    emit({'id': d.id, 'status': c['status'], 'beforeAuthor': (c['before'] or {}).get('author'),
                          'author': (c['after'] or {}).get('author'), 'lessons': c['lessonIds'],
                          'title': (c['after'] or {}).get('title'), 'reason': c['reason']})
            elif command == 'show':
                for key in argument.split(','):
                    emit(records[key].to_dict())
            elif command == 'load':
                for record in db.get_all([run.collection('changes').document(key) for key in argument.split(',')], retry=None, timeout=30):
                    if not record.exists:
                        raise ValueError('No saved plan: ' + record.id)
                    records[record.id] = record
                summary()
            elif command == 'validate':
                for record in records.values():
                    change = record.to_dict()
                    after = change['after']
                    if after is None:
                        continue
                    if after['id'] != record.id:
                        raise ValueError('Material identity mismatch: ' + record.id)
                    keys = [video_id(video) or video.get('url') for video in after.get('videos', [])]
                    if len(keys) != len(set(keys)):
                        raise ValueError('Repeated video: ' + record.id)
                    authors = after.get('author', []) if isinstance(after.get('author'), list) else [after.get('author')]
                    if any(name not in authors for name in (after.get('authorAliases') or {}).values()):
                        raise ValueError('Alias points to a different teacher: ' + record.id)
                emit({'validatedInMemory': len(records), 'additionalReads': 0})
            elif command == 'amend':
                for change in json.loads(argument):
                    record = records[change['id']]
                    value = record.to_dict()
                    if value['status'] != 'planned' or value['after'] is None:
                        raise ValueError('Only pending non-deletion plans can be amended')
                    value['after'].update(change.get('patch', {}))
                    for field in change.get('removeFields', []):
                        value['after'].pop(field, None)
                    if 'lessons' in change:
                        value['lessonIds'] = change['lessons']
                        value['after'].pop('lessonId', None)
                    value['reason'] += '; ' + change['reason']
                    record.reference.update(value, option=db.write_option(last_update_time=record.update_time))
                    records[record.id] = record.reference.get(retry=None, timeout=30)
                    emit({'amended': record.id})
            elif command == 'apply':
                apply(db, argparse.Namespace(run=run_id, apply=True), records=list(records.values()))
                break
            elif command:
                raise ValueError('Unknown command')
        except Exception as exc:
            emit({'error': str(exc), 'command': command})
            if command == 'apply':
                raise


def preview(db, run_id, full_catalog=False):
    run = db.collection('material_audits').document(run_id)
    changes = [d.to_dict() for d in run.collection('changes').stream(retry=None, timeout=30)]
    if full_catalog:
        data = catalog(db)
    else:
        # Reuse the saved snapshots. Only curriculum destinations need live reads;
        # current content/assignment concurrency is checked during publication.
        module_ids = {c['after']['moduleId'] for c in changes if c['after'] and c['after'].get('moduleId')}
        lesson_ids = {key for c in changes for key in c.get('lessonIds') or []}
        lesson_ids.update(c['after']['lessonId'] for c in changes if c['after'] and c['after'].get('lessonId'))
        lesson_ids.update(link['lessonId'] for c in changes for link in c['beforeLinks'].values())
        modules = [dict(d.to_dict(), id=d.id) for d in db.get_all([db.collection('modules').document(key) for key in module_ids], retry=None, timeout=30) if d.exists] if module_ids else []
        lessons = [dict(d.to_dict(), id=d.id) for d in db.get_all([db.collection('lessons').document(key) for key in lesson_ids], retry=None, timeout=30) if d.exists] if lesson_ids else []
        data = {'modules': modules, 'lessons': lessons, 'materials': [],
                'material_lesson_links': [dict(link, id=key) for c in changes for key, link in c['beforeLinks'].items()]}
    materials = {m['id']: m for m in data['materials']}
    links = {l['id']: l for l in data['material_lesson_links']}
    for change in changes:
        key = change['materialId']
        if change['after'] is None:
            materials.pop(key, None)
        else:
            materials[key] = change['after']
        if change['lessonIds'] is not None:
            links = {k: v for k, v in links.items() if v['materialId'] != key}
            for lesson_id in change['lessonIds']:
                identity = key + '~' + lesson_id
                links[identity] = {'id': identity, 'materialId': key, 'lessonId': lesson_id, 'moduleId': change['after']['moduleId']}
    data.update(materials=list(materials.values()), material_lesson_links=list(links.values()))
    duplicates = {}
    for m in data['materials']:
        authors = m.get('author', []) if isinstance(m.get('author'), list) else [m.get('author', '')]
        for v in m.get('videos') or [m]:
            vid = video_id(v)
            if vid:
                for author in authors:
                    duplicates.setdefault((m.get('moduleId'), author, vid), set()).add(m['id'])
    summary = {'scope': 'full-catalogue' if full_catalog else 'saved-review', 'changeCount': len(changes), 'creates': sum(c['before'] is None for c in changes),
               'deletes': sum(c['after'] is None for c in changes),
               'nameChanges': sum(c['before'] is not None and c['after'] is not None and c['before'].get('author') != c['after'].get('author') for c in changes),
               'pending': sum(c['status'] == 'planned' for c in changes), 'structural': structural(data)}
    emit(summary)
    for (module, author, vid), ids in duplicates.items():
        if len(ids) > 1:
            emit({'duplicateVideo': vid, 'moduleId': module, 'author': author, 'materialIds': sorted(ids)})
    run.set({'preview': summary, 'updatedAt': now()}, merge=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    sub = parser.add_subparsers(dest='command', required=True)
    scan_parser = sub.add_parser('scan')
    scan_parser.add_argument('--workers', type=int, default=6, choices=range(1, 9))
    show = sub.add_parser('inspect')
    for field in ['module', 'author', 'id', 'kind', 'subject']:
        show.add_argument('--' + field)
    show.add_argument('--compact', action='store_true')
    show.add_argument('--videos', action='store_true')
    show.add_argument('--comparison', action='store_true')
    show.add_argument('--authors', action='store_true')
    show.add_argument('--findings', action='store_true')
    show.add_argument('--sources', action='store_true')
    show.add_argument('--all', action='store_true', help='Explicitly allow a full catalogue inspection')
    channel = sub.add_parser('browse')
    channel.add_argument('url')
    details = sub.add_parser('details')
    details.add_argument('video_ids', nargs='+')
    edit = sub.add_parser('plan')
    edit.add_argument('id')
    edit.add_argument('--patch')
    edit.add_argument('--delete', action='store_true')
    edit.add_argument('--video-ids', help='Ordered verified YouTube IDs; builds a custom structured playlist')
    edit.add_argument('--remove-fields', help='Comma-separated obsolete fields to remove')
    edit.add_argument('--lessons', help='Comma-separated exact lesson IDs; empty clears assignments')
    edit.add_argument('--reason', required=True)
    batch = sub.add_parser('plan-batch')
    batch.add_argument('--changes', required=True, help='JSON array of reviewed changes, supplied directly, never a file')
    author_plan = sub.add_parser('plan-authors')
    author_plan.add_argument('--mapping', required=True, help='Reviewed alias to canonical name mapping, optionally scoped by subjects')
    author_plan.add_argument('--ids', help='Only these exact material IDs; avoids a catalogue scan')
    author_plan.add_argument('--all', action='store_true', help='Explicitly allow a full catalogue author migration')
    lesson_parser = sub.add_parser('create-lesson')
    for field in ['id', 'module', 'subject', 'title']:
        lesson_parser.add_argument('--' + field, required=True)
    lesson_parser.add_argument('--order', type=int, required=True)
    lesson_parser.add_argument('--apply', action='store_true')
    publish = sub.add_parser('apply')
    publish.add_argument('--apply', action='store_true')
    preview_parser = sub.add_parser('preview')
    preview_parser.add_argument('--full-catalog', action='store_true', help='Read the entire catalogue instead of using saved review snapshots')
    sub.add_parser('review-session')
    args = parser.parse_args()
    db = get_db()
    if args.command == 'scan':
        scan(db, args.run, args.workers)
    elif args.command == 'inspect':
        inspect(db, args)
    elif args.command == 'browse':
        result = browse(args.url)
        key = hashlib.sha256(args.url.encode()).hexdigest()[:24]
        db.collection('material_audits').document(args.run).collection('listings').document(key).set(result)
        emit(result)
    elif args.command == 'plan':
        plan(db, args)
    elif args.command == 'plan-batch':
        for change in json.loads(args.changes):
            plan(db, argparse.Namespace(run=args.run, id=change['id'], patch=json.dumps(change.get('patch', {})),
                 delete=change.get('delete', False), video_ids=','.join(change['videoIds']) if 'videoIds' in change else None,
                 remove_fields=','.join(change.get('removeFields', [])),
                 lessons=','.join(change['lessons']) if 'lessons' in change else None, reason=change['reason']))
    elif args.command == 'plan-authors':
        if not args.ids and not args.all:
            raise ValueError('Choose --ids; a catalogue-wide name migration requires explicit --all')
        mapping = json.loads(args.mapping)
        review_ref = db.collection('material_audits').document(args.run).collection('changes')
        selected_ids = args.ids.split(',') if args.ids else None
        staged = db.get_all([review_ref.document(key) for key in selected_ids], retry=None, timeout=30) if selected_ids else review_ref.stream(retry=None, timeout=30)
        pending = {d.id: d.to_dict()['after'] for d in staged if d.exists and d.to_dict()['status'] == 'planned'}
        selected = [dict(d.to_dict(), id=d.id) for d in db.get_all([db.collection('materials').document(key) for key in selected_ids], retry=None, timeout=30) if d.exists] if selected_ids else rows(db, 'materials')
        for material in selected:
            if material['id'] in pending:
                material = pending[material['id']]
                if material is None:
                    continue
            original = material.get('author')
            authors = original if isinstance(original, list) else [original] if original else []
            names = []
            aliases = dict(material.get('authorAliases') or {})
            for author in authors:
                replacement = mapping.get(author, author)
                if isinstance(replacement, dict):
                    replacement = replacement['name'] if material.get('subject') in replacement['subjects'] else author
                if replacement not in names:
                    names.append(replacement)
                if replacement != author:
                    aliases[author] = replacement
                    aliases = {alias: replacement if target == author else target for alias, target in aliases.items()}
            updated = names if isinstance(original, list) else names[0] if names else None
            if updated != original:
                plan(db, argparse.Namespace(run=args.run, id=material['id'], patch=json.dumps({'author': updated, 'authorAliases': aliases}),
                     delete=False, video_ids=None, remove_fields=None, lessons=None,
                     reason='Verified doctor-name aliases: ' + json.dumps(original, ensure_ascii=False) + ' → ' + json.dumps(updated, ensure_ascii=False)))
    elif args.command == 'create-lesson':
        value = {'id': args.id, 'moduleId': args.module, 'subject': args.subject, 'title': args.title,
                 'order': args.order, 'active': True}
        emit(value)
        if args.apply:
            @firestore.transactional
            def create(tx):
                ref = db.collection('lessons').document(args.id)
                current = ref.get(transaction=tx)
                module = db.collection('modules').document(args.module).get(transaction=tx).to_dict()
                if not module or args.subject not in module['subjects']:
                    raise ValueError('Invalid lesson module/subject')
                if current.exists:
                    if current.to_dict() != value:
                        raise ValueError('Lesson ID already belongs to a different lesson')
                    return
                tx.create(ref, value)
                tx.set(db.collection('material_audits').document(args.run).collection('lessonChanges').document(args.id),
                       {'before': None, 'after': value, 'appliedAt': now(), 'reason': 'Dedicated destination for verified clinical examination sources'})
                tx.set(db.collection('materials_version').document('current'), {'version': firestore.Increment(1), 'updatedAt': now()}, merge=True)
            create(db.transaction())
    elif args.command == 'details':
        for vid in args.video_ids:
            page = request('https://www.youtube.com/watch?v=' + quote(vid))
            match = re.search(r'(?:var\s+)?ytInitialPlayerResponse\s*=\s*', page)
            if not match:
                emit({'id': vid, 'error': 'Player metadata unavailable'})
                continue
            payload, _ = json.JSONDecoder().raw_decode(page[match.end():])
            details = payload.get('videoDetails', {})
            micro = payload.get('microformat', {}).get('playerMicroformatRenderer', {})
            result = {'id': vid, 'title': details.get('title'), 'description': details.get('shortDescription'),
                      'channelId': details.get('channelId'), 'author': details.get('author'),
                      'publishedAt': micro.get('publishDate'), 'lengthSeconds': details.get('lengthSeconds'),
                      'playability': payload.get('playabilityStatus'),
                      'captions': payload.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])}
            initial = re.search(r'(?:var\s+)?ytInitialData\s*=\s*', page)
            if initial:
                initial_data, _ = json.JSONDecoder().raw_decode(page[initial.end():])
                for node in walk(initial_data):
                    secondary = node.get('videoSecondaryInfoRenderer', {})
                    desc = text_value(secondary.get('attributedDescription', {})) or text_value(secondary.get('description', {}))
                    if desc and not result['description']:
                        result['description'] = desc
            for prop, field in [('og:title', 'title'), ('og:description', 'description')]:
                match = re.search(r'<meta[^>]+(?:name|property)="' + prop + r'"[^>]+content="([^"]*)"', page)
                if match and not result[field]:
                    result[field] = html.unescape(match.group(1))
            result['playability'] = {key: value for key, value in result['playability'].items() if key in {'status', 'reason', 'playableInEmbed'}}
            db.collection('material_audits').document(args.run).collection('details').document(vid).set(result)
            emit(result)
    elif args.command == 'apply':
        apply(db, args)
    elif args.command == 'preview':
        preview(db, args.run, full_catalog=args.full_catalog)
    elif args.command == 'review-session':
        review_session(db, args.run)


if __name__ == '__main__':
    main()
