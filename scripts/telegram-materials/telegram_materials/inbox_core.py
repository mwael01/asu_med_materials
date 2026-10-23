"""Stable identities and policies for the persistent, curriculum-wide inbox."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

from .core import identity, resource_key

CHANNEL = "asumedmaterials"
SOURCE_ID = "telegram-3977555264"
PEER_ID = -1003977555264
MAX_R2_BYTES = 25_000_000
TERMINAL = {"published", "duplicate", "ignored"}
COLLECTIONS = ("material_inbox_sources", "material_inbox", "material_inbox_items", "material_inbox_batches", "material_asset_index")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fingerprint(value: dict) -> str:
    return identity(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def message_key(message_id: int) -> str:
    return f"{SOURCE_ID}-{message_id}"


def asset_key(value: str) -> str:
    return identity(value)


def storage_for(size: int | None) -> str:
    return "r2" if size is not None and 0 < size <= MAX_R2_BYTES else "telegram"


def file_hash(path) -> str:
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def url_identity(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or '').lower().removeprefix('www.')
    playlist = parse_qs(parts.query).get('list', [])
    if host in {'youtube.com', 'm.youtube.com', 'music.youtube.com'} and parts.path.rstrip('/') == '/playlist' and playlist:
        return 'youtube-playlist:' + playlist[0]
    return resource_key(url)


def resource_keys(material: dict) -> set[str]:
    keys = set()
    if material.get('contentSha256'):
        keys.add('sha256:' + material['contentSha256'])
    for item in [material, *(material.get('documents') or []), *(material.get('videos') or [])]:
        url = item.get('url')
        if not isinstance(url, str) or not url.startswith(('https://', 'http://')):
            continue
        keys.add('url:' + url_identity(url))
        match = re.search(r'/materials/sha256/([a-f0-9]{64})\.', url)
        if match:
            keys.add('sha256:' + match[1])
    for url in material.get('importSources') or []:
        if isinstance(url, str) and url.startswith(('https://', 'http://')):
            keys.add('url:' + url_identity(url))
    return keys


def message_payload(message, links: list[tuple[str, str]]) -> dict:
    file = message.file
    mime = (file.mime_type or '') if file else ''
    filename = (file.name or '') if file else ''
    kind = 'audio' if mime.startswith('audio/') else 'video' if mime.startswith('video/') else 'file'
    if filename.lower().endswith(('.zip', '.rar', '.7z')):
        kind = 'archive'
    media = message.document or message.photo
    if getattr(message, 'voice', False):
        kind = 'audio'
    url = f'https://t.me/{CHANNEL}/{message.id}'
    caption = message.raw_text or ''
    parts = []
    if file:
        parts.append({'key': 'attachment', 'kind': kind, 'title': filename or caption[:200] or f'Material {message.id}',
                      'filename': filename, 'mime': mime, 'bytes': file.size, 'mediaId': str(media.id),
                      'telegramIdentity': f'{type(media).__name__}:{media.id}', 'url': url,
                      'storage': storage_for(file.size), 'voice': bool(getattr(message, 'voice', False))})
    seen = set()
    for link, title in links:
        key = resource_key(link)
        if key not in seen:
            seen.add(key)
            parts.append({'key': 'url:' + key, 'kind': 'link', 'title': title or caption[:200] or link,
                          'url': link, 'storage': 'external'})
    forward = message.fwd_from
    provenance = {'date': str(forward.date), 'channelPost': getattr(forward, 'channel_post', None),
                  'fromName': getattr(forward, 'from_name', None), 'peer': str(getattr(forward, 'from_id', ''))} if forward else None
    body = {'caption': caption, 'parts': parts, 'albumId': str(message.grouped_id) if message.grouped_id else None,
            'replyTo': getattr(message, 'reply_to_msg_id', None), 'forward': provenance,
            'service': bool(getattr(message, 'action', None))}
    return {**body, 'fingerprint': fingerprint(body), 'messageId': message.id, 'peerId': PEER_ID,
            'sourceId': SOURCE_ID, 'sourceUrl': url, 'date': message.date.isoformat(),
            'editedAt': message.edit_date.isoformat() if message.edit_date else None}


def item_keys(item: dict) -> set[str]:
    # Provenance is not identity: edits and archive siblings share post URLs.
    # Once bytes are known, a different checksum is a separate edition.
    if item.get('sha256'):
        return {'sha256:' + item['sha256']}
    if item.get('archiveItemId'):
        return {'archive:' + fingerprint({'parent': item['archiveItemId'], 'member': item['memberPath']})}
    if item.get('telegramIdentity'):
        return {'telegram:' + item['telegramIdentity']}
    return {'url:' + url_identity(item['url'])}


def validate_decision(decision: dict, modules: list[dict], lessons: list[dict]) -> None:
    if decision.get('replaceLessonAssignments') and decision['action'] != 'reuse':
        raise ValueError('Replacing lesson assignments requires reuse of an existing material')
    if decision['action'] not in {'create', 'reuse', 'hold', 'ignore', 'duplicate'}:
        raise ValueError('Action must be create, reuse, hold, ignore or duplicate')
    if not decision.get('reason', '').strip():
        raise ValueError('A review reason is required')
    if decision['action'] in {'hold', 'ignore', 'duplicate'}:
        return
    module = next((m for m in modules if m['id'] == decision.get('moduleId')), None)
    if not module or module.get('active') is False or module.get('year') not in range(1, 6) or module.get('semester') == 2:
        raise ValueError('Choose an existing visible curriculum module')
    ids = decision.get('lessonIds', [])
    valid = {l['id'] for l in lessons if l.get('moduleId') == module['id'] and l.get('active') is not False}
    if not ids or not set(ids).issubset(valid):
        raise ValueError('Choose existing active lessons in the selected module')
    if not decision.get('title', '').strip():
        raise ValueError('A reviewed title is required')
    if decision.get('category') not in {'central', 'lectures', 'practical', 'summaries', 'exams', 'references'}:
        raise ValueError('Choose a supported material category')
    if decision['action'] == 'reuse' and not decision.get('existingMaterialId'):
        raise ValueError('Reuse requires an existing material ID')


def validate_image_plan(plan, items, lessons):
    kind = plan.get('practicalImageCollection')
    if not kind:
        return
    if kind not in {'slides', 'gross'} or plan.get('category') != 'practical':
        raise ValueError('Image collections require slides/gross and category practical')
    if plan.get('action') != 'create':
        raise ValueError('Use create for a new image set; existing sets retain their metadata on reuse')
    selected = [lesson for lesson in lessons if lesson['id'] in plan['lessonIds']]
    if not selected or any(lesson.get('revisionType') != 'practical' for lesson in selected):
        raise ValueError('Image collections must belong to Practical Revision lessons')
    notes = plan.get('imageAnnotations', {})
    for item in items:
        if not item.get('mime', '').startswith('image/') or item.get('storage') != 'r2':
            raise ValueError('Image collections require verified, directly hosted image files')
        note = notes.get(item['id'], {})
        required = ['title', 'altText'] if plan.get('allowUnlabelledImages') else ['title', 'description', 'altText']
        if any(not isinstance(note.get(key), str) or not note[key].strip() for key in required):
            raise ValueError('Every practical image requires a reviewed title, description and alternative text')
        if any(not isinstance(url, str) or urlsplit(url).scheme not in {'http', 'https'} or not urlsplit(url).netloc for url in note.get('sourceUrls', [])):
            raise ValueError('Image sources must be HTTP(S) URLs')
