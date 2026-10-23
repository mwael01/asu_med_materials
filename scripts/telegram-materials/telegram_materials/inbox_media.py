"""Verified disposable media cache; only approved small assets may reach R2."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .files import file_type
from .inbox_core import MAX_R2_BYTES, file_hash
from .store import ROOT

CACHE = ROOT / 'tmp/telegram-inbox'
MEDIA_TYPES = {'mp3': ('audio/mpeg', {'mp3'}), 'ogg': ('audio/ogg', {'ogg'}),
               'm4a': ('audio/mp4', {'mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'}),
               'wav': ('audio/wav', {'wav'}), 'flac': ('audio/flac', {'flac'}),
               'mp4': ('video/mp4', {'mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'}),
               'webm': ('video/webm', {'matroska', 'webm'})}


def inspect_file(path: Path, kind: str) -> dict:
    size = path.stat().st_size
    if not 0 < size <= MAX_R2_BYTES:
        raise ValueError('File exceeds the 25 MB R2 policy or is empty')
    if kind == 'archive':
        with path.open('rb') as handle:
            header = handle.read(8)
        extension = '.zip' if header.startswith(b'PK') else '.rar' if header.startswith(b'Rar!') else '.7z' if header.startswith(b'7z\xbc\xaf\x27\x1c') else None
        if not extension:
            raise ValueError('Archive signature does not match a supported format')
        result = {'extension': extension, 'mime': 'application/zip' if extension == '.zip' else 'application/x-rar-compressed' if extension == '.rar' else 'application/x-7z-compressed'}
    elif kind not in {'audio', 'video'}:
        from .html_documents import is_html, inspect_html
        if is_html(path):
            return {'extension': '.html', 'mime': 'text/html', 'sha256': file_hash(path), 'bytes': size, 'htmlEvidence': inspect_html(path)}
        extension, mime = file_type(path)
        result = {'extension': extension, 'mime': mime}
    else:
        if not shutil.which('ffprobe'):
            raise ValueError('ffprobe is required; install the ffmpeg package')
        completed = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                                   '-format_whitelist', 'mov,matroska,webm,ogg,mp3,wav,flac,aac',
                                   '-show_format', '-show_streams', '-of', 'json', str(path)],
                                   capture_output=True, text=True, timeout=30)
        if completed.returncode:
            raise ValueError('Media container could not be validated')
        metadata = json.loads(completed.stdout)
        streams = metadata.get('streams', [])
        video = [s for s in streams if s.get('codec_type') == 'video' and not s.get('disposition', {}).get('attached_pic')]
        audio = [s for s in streams if s.get('codec_type') == 'audio']
        if not audio and not video:
            raise ValueError('Recording has no playable streams')
        if any(s.get('codec_name') not in {'h264', 'vp8', 'vp9', 'av1'} for s in video) or any(
                s.get('codec_name') not in {'aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'} for s in audio):
            raise ValueError('Recording uses unsupported browser codecs; keep held for review')
        names = set(metadata.get('format', {}).get('format_name', '').split(','))
        extensions = ['webm', 'mp4'] if video else ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'webm']
        extension = next((e for e in extensions if names & MEDIA_TYPES[e][1]), None)
        if not extension:
            raise ValueError('Recording uses an unsupported container')
        mime = MEDIA_TYPES[extension][0]
        if not video and extension == 'webm':
            mime = 'audio/webm'
        result = {'extension': '.' + extension, 'mime': mime, 'kind': 'video' if video else 'audio',
                  'durationSeconds': float(metadata.get('format', {}).get('duration') or 0),
                  'codecs': sorted({s.get('codec_name', '') for s in audio + video})}
    return {**result, 'sha256': file_hash(path), 'bytes': size}


def cache_path(item: dict) -> Path:
    return CACHE / 'files' / (item['sha256'] + item['extension'])


async def download(client, message, item: dict) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    temporary = CACHE / (item['id'] + '.part')
    async def progress(received, total):
        if received > MAX_R2_BYTES or total and total > MAX_R2_BYTES:
            raise ValueError('Actual Telegram file exceeds 25 MB; use its source link')
    try:
        await client.download_media(message, file=str(temporary), progress_callback=progress)
        expected = message.file.size if message.file else None
        if message.document and expected and expected != temporary.stat().st_size:
            raise ValueError('Downloaded bytes disagree with Telegram metadata')
        metadata = inspect_file(temporary, item['kind'])
        destination = cache_path(metadata)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary.replace(destination)
        return metadata
    finally:
        temporary.unlink(missing_ok=True)


def pdf_evidence(item: dict) -> dict:
    if item.get('mime') != 'application/pdf':
        return {}
    import signal
    from pypdf import PdfReader
    def timeout(*_):
        raise TimeoutError('PDF evidence extraction exceeded 20 seconds')
    old = signal.signal(signal.SIGALRM, timeout)
    try:
        signal.alarm(20)
        reader = PdfReader(cache_path(item))
        texts = [reader.pages[index].extract_text()[:12000] for index in range(min(6, len(reader.pages)))]
        text = '\n'.join(texts)[:48000]
        preview_paths = []
        # Embedded scan images are evidence only, not separately published files.
        for index in range(min(3, len(reader.pages))):
            page = reader.pages[index]
            images = list(page.images)
            if images:
                image = max(images, key=lambda value: len(value.data))
                from PIL import Image
                import io
                preview = Image.open(io.BytesIO(image.data)); preview.thumbnail((1400, 1800))
                path = CACHE / 'previews' / f"{item['id']}-{index + 1}.jpg"
                path.parent.mkdir(parents=True, exist_ok=True)
                preview.convert('RGB').save(path)
                preview_paths.append(str(path.relative_to(ROOT)))
        return {'text': text, 'pages': len(reader.pages), 'scanned': len(text.strip()) < 120,
                'previewPaths': preview_paths}
    finally:
        signal.alarm(0); signal.signal(signal.SIGALRM, old)


def expand_archive(repo, item: dict):
    """Never extract supplied paths; cap total expansion independently of R2 size."""
    import libarchive
    import mimetypes
    from .files import is_archive_metadata
    from .inbox_core import fingerprint, now
    expanded, count = 0, 0
    with libarchive.file_reader(str(cache_path(item))) as archive:
        for info in archive:
            count += 1
            if count > 1000:
                raise ValueError('Archive exceeds 1,000 entries; remaining members need manual review')
            if not info.isfile or info.issym or info.islnk or is_archive_metadata(str(info.pathname)):
                continue
            expanded += max(info.size or 0, 0)
            if count > 1000 or expanded > 100_000_000:
                raise ValueError('Archive expansion exceeds 1,000 members or 100 MB; remaining members need manual review')
            name = str(info.pathname)
            mime = mimetypes.guess_type(name)[0] or ''
            kind = 'audio' if mime.startswith('audio/') else 'video' if mime.startswith('video/') else 'file'
            nested = name.lower().endswith(('.zip', '.rar', '.7z'))
            supported = mime == 'application/pdf' or mime.startswith(('image/', 'audio/', 'video/'))
            key = fingerprint({'parent': item['id'], 'member': name})
            child = {k: item[k] for k in ['sourceId', 'messageId', 'revision', 'sourceUrl', 'url', 'caption', 'albumId', 'date']}
            child.update(id=key, key='archive:' + name, title=Path(name).name, filename=Path(name).name,
                         memberPath=name, archiveItemId=item['id'], kind=kind, mime=mime, bytes=info.size,
                         storage='r2' if supported and 0 < (info.size or 0) <= MAX_R2_BYTES else 'telegram',
                         status='queued', createdAt=now())
            if nested or not supported:
                child.update(status='held', reason='Nested archive or unsupported member requires separate review')
            elif child['storage'] == 'r2':
                temporary = CACHE / (key + '.part')
                try:
                    total = 0
                    with temporary.open('wb') as output:
                        for chunk in info.get_blocks(1024 * 1024):
                            total += len(chunk)
                            if total > MAX_R2_BYTES or expanded - (info.size or 0) + total > 100_000_000:
                                raise ValueError('Archive member expanded beyond its allowed size')
                            output.write(chunk)
                    if info.size is not None and total != info.size:
                        raise ValueError('Archive member length disagrees with its header')
                    expanded += total - (info.size or 0)
                    child.update(inspect_file(temporary, kind))
                    cache_path(child).parent.mkdir(parents=True, exist_ok=True)
                    temporary.replace(cache_path(child))
                finally:
                    temporary.unlink(missing_ok=True)
            previous = repo.read('material_inbox_items', key)
            if not previous:
                repo.write('material_inbox_items', key, child, merge=False)
            yield child


async def ensure_cache(repo, client, fresh, item):
    if item.get('sha256') and cache_path(item).is_file():
        return item
    if item.get('archiveItemId'):
        parent = repo.read('material_inbox_items', item['archiveItemId'])
        parent.update(await download(client, fresh, parent))
        for child in expand_archive(repo, parent):
            if child['id'] == item['id']:
                if item.get('sha256') and child.get('sha256') != item['sha256']:
                    raise ValueError('Archive member changed after review')
                return {**item, **{k: child[k] for k in ['sha256', 'mime', 'bytes', 'extension'] if k in child}}
        raise ValueError('Archive member no longer exists')
    metadata = await download(client, fresh, item)
    if item.get('sha256') and metadata['sha256'] != item['sha256']:
        raise ValueError('Re-downloaded file differs from the reviewed content')
    return {**item, **metadata}
