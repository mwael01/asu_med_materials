from __future__ import annotations

import difflib
import uuid
from urllib.parse import parse_qs, urlsplit
from datetime import datetime, timezone

from .inbox_core import SOURCE_ID, TERMINAL, asset_key, item_keys, now, resource_keys
from .inbox_media import cache_path, ensure_cache, expand_archive, pdf_evidence
from .inbox_sync import verify_source
from .inbox_catalogue import INDEX_ID, index_state


def seed_assets(repo, materials, keys=None):
    generation = (repo.read('material_asset_index', INDEX_ID) or {}).get('generation')
    grouped = {}
    if keys is not None:
        grouped = {key: {'key': key, 'materials': {}} for key in keys}
    live = {material['id']: material.get('moduleId') for material in materials}
    for material in materials:
        for key in resource_keys(material):
            if keys is not None and key not in keys:
                continue
            record = grouped.setdefault(key, {'key': key, 'materials': {}})
            record['materials'][material['id']] = material.get('moduleId')
            for doc in [material, *(material.get('documents') or []), *(material.get('videos') or [])]:
                if key.startswith('sha256:') and key[7:] in (doc.get('url') or ''):
                    record['uploadedUrl'] = doc['url']
    for key, record in grouped.items():
        old = repo.read('material_asset_index', asset_key(key)) or {}
        preserved = {mid: live[mid] for mid in old.get('materials', {}) if mid in live} if key.startswith('telegram:') else {}
        value = {**record, 'generation': generation, 'materials': {**preserved, **record['materials']}}
        if old.get('uploadedUrl') and not value.get('uploadedUrl'):
            value['uploadedUrl'] = old['uploadedUrl']
        if any(old.get(k) != v for k, v in value.items()):
            repo.write('material_asset_index', asset_key(key), {**value, 'updatedAt': now()}, merge=False)


def matches(repo, item):
    found = {}
    state = index_state(repo)
    for key in item_keys(item):
        asset = repo.read('material_asset_index', asset_key(key)) or {}
        if key.startswith('telegram:'):
            live = repo.read_many('materials', asset.get('materials', {}))
            found.update({mid: material.get('moduleId') for mid, material in live.items() if material})
        elif state and asset.get('generation') == state['generation']:
            found.update(asset.get('materials', {}))
    return found


def proposals(item, modules, lessons, materials):
    text = item.get('title', '') + ' ' + item.get('caption', '') + ' ' + item.get('evidence', {}).get('text', '')[:10000]
    targets = []
    # Reuse the evidence matcher with explicit module scoping; never approve its suggestions.
    from .core import words
    source_words = words(text)
    for module in modules:
        module_lessons = [lesson for lesson in lessons if lesson.get('moduleId') == module['id'] and lesson.get('active') is not False]
        for lesson in module_lessons:
            tokens = words(lesson['title'])
            overlap = len(tokens & source_words) / max(1, len(tokens))
            if overlap >= 0.7:
                targets.append({'moduleId': module['id'], 'lessonId': lesson['id'], 'subject': lesson['subject'],
                                'title': lesson['title'], 'overlap': round(overlap, 3)})
    similar = [{'materialId': m['id'], 'title': m['title'], 'moduleId': m.get('moduleId')}
               for m in materials if difflib.SequenceMatcher(None, item.get('title', '').lower(), m.get('title', '').lower()).ratio() >= 0.65]
    return {'lessonSuggestions': sorted(targets, key=lambda t: -t['overlap'])[:30], 'possibleDuplicates': similar[:20]}


async def analyze(repo, client, limit=50, module_ids=()):
    repo.guard()
    selected = []
    cursor = None
    scanned = 0
    # Page over pending work instead of loading every queued item/history revision.
    while len(selected) < limit and scanned < limit * 4:
        page = repo.list('material_inbox_items', {'queued', 'analyzing'}, limit=limit, after=cursor)
        if not page:
            break
        scanned += len(page)
        cursor = page[-1]['id']
        for item in page:
            if item['sourceId'] != SOURCE_ID:
                continue
            if item.get('albumId') and (datetime.now(timezone.utc) - datetime.fromisoformat(item['date'])).total_seconds() < 60:
                continue
            message = repo.read('material_inbox', f"{SOURCE_ID}-{item['messageId']}")
            if message and item['revision'] == message['fingerprint']:
                selected.append(item)
            else:
                repo.write('material_inbox_items', item['id'], {'status': 'superseded', 'previousStatus': item['status'],
                    'reason': 'Historical source revision; current revision is tracked separately'})
            if len(selected) >= limit:
                break
        if len(page) < limit:
            break
    selected.sort(key=lambda i: (i['messageId'], i['id']))
    batch_id = 'inbox-' + uuid.uuid4().hex
    if not selected:
        return {'batchId': None, 'selected': 0, 'published': 0}
    modules, lessons = repo.analysis_curriculum(module_ids)
    duplicate_index = index_state(repo)
    repo.write('material_inbox_batches', batch_id, {'sourceId': SOURCE_ID, 'itemIds': [i['id'] for i in selected],
        'status': 'analyzing', 'createdAt': now()})
    for item in selected:
        repo.guard()
        repo.write('material_inbox_items', item['id'], {'status': 'analyzing', 'batchId': batch_id})
        try:
            fresh = await verify_source(repo, client, item)
            parts = urlsplit(item['url'])
            if item['kind'] == 'link' and parts.hostname in {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'} and parse_qs(parts.query).get('list'):
                from .collector import Collector
                from .core import Stage
                from .inbox_media import CACHE
                from tempfile import TemporaryDirectory
                CACHE.mkdir(parents=True, exist_ok=True)
                with TemporaryDirectory(dir=CACHE) as directory:
                    from pathlib import Path
                    stage = Stage(Path(directory))
                    try:
                        source_key = stage.source('youtube_playlist', item['url'], ['Archive inbox'], {'trusted': True})
                        Collector(stage, None, []).youtube_playlist(stage.source_by_key(source_key))
                        captured = next(e for e in stage.entries() if e['kind'] == 'playlist')
                        if len(captured['videos']) > 1000:
                            raise ValueError('Playlist exceeds 1,000 videos; review and split it before publication')
                        item.update(kind='playlist', title=captured['title'], videos=captured['videos'])
                    finally:
                        stage.db.close()
            if item['storage'] == 'r2':
                item = await ensure_cache(repo, client, fresh, item)
                if item['kind'] == 'archive':
                    children = list(expand_archive(repo, item))
                    repo.write('material_inbox_items', item['id'], {**item, 'status': 'ignored', 'reason': 'Archive expanded into separately tracked members', 'memberIds': [c['id'] for c in children]})
                    repo.refresh_message_status(item['messageId'])
                    continue
                try:
                    item['evidence'] = item.get('htmlEvidence') or pdf_evidence(item)
                except Exception as exc:
                    item['evidence'] = {'error': str(exc)[:300]}
            duplicate_matches = matches(repo, item)
            item.update(proposals(item, modules, lessons, []), existingMatches=duplicate_matches,
                        duplicateCheck='complete' if duplicate_index else 'index_required',
                        status='needs_review', batchId=batch_id,
                        reason='Assistant review required: confirm curriculum, attribution, grouping and duplicate action')
            if item.get('mime', '').startswith('image/') and item.get('sha256'):
                item['previewPath'] = str(cache_path(item))
            # Exact matches remain reviewable: a new submission may add lesson coverage.
            if duplicate_matches:
                item['reason'] = 'Exact existing asset found; review whether to reuse it or add lesson associations'
            repo.write('material_inbox_items', item['id'], item)
        except Exception as exc:
            from telethon.errors import FloodWaitError
            if isinstance(exc, FloodWaitError):
                from .inbox_sync import cooldown
                cooldown(repo, exc.seconds)
                raise
            repo.write('material_inbox_items', item['id'], {'status': 'failed', 'reason': str(exc)[:500], 'failedPhase': 'analyze'})
        repo.refresh_message_status(item['messageId'])
    repo.write('material_inbox_batches', batch_id, {'status': 'needs_review', 'updatedAt': now()})
    return {'batchId': batch_id, 'selected': len(selected), 'published': 0, 'duplicateIndexReady': bool(duplicate_index)}
