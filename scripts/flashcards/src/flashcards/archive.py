from __future__ import annotations

import hashlib
import io
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from zipfile import BadZipFile, ZipFile

MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024
MAX_ENTRIES = 50_000


@dataclass(frozen=True)
class ArchiveInfo:
    path: Path
    sha256: str
    entries: int
    compressed_bytes: int
    expanded_bytes: int
    media: list[str]
    media_map: dict[str, str]
    has_modern_collection: bool
    has_legacy_collection: bool


def validate_archive(path: Path) -> ArchiveInfo:
    if not path.is_file():
        raise ValueError(f"Archive does not exist: {path}")
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("Archive exceeds the 512 MiB input limit")
    try:
        with ZipFile(path) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ENTRIES:
                raise ValueError("Archive contains too many entries")
            expanded = sum(item.file_size for item in infos)
            if expanded > MAX_EXPANDED_BYTES:
                raise ValueError("Archive expands beyond the 2 GiB limit")
            for item in infos:
                name = Path(item.filename)
                if name.is_absolute() or ".." in name.parts:
                    raise ValueError(f"Unsafe archive path: {item.filename}")
            names = {item.filename for item in infos}
    except BadZipFile as exc:
        raise ValueError("Invalid APKG/ZIP archive") from exc

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    media_names: list[str] = []
    media_map: dict[str, str] = {}
    if "media" in names:
        with ZipFile(path) as archive:
            try:
                raw_media = json.loads(archive.read("media"))
                media_map = {str(k): str(v) for k, v in raw_media.items()}
                media_names = sorted(set(media_map.values()))
            except (UnicodeDecodeError, json.JSONDecodeError):
                media_map = {}
                media_names = []

    return ArchiveInfo(
        path=path,
        sha256=digest,
        entries=len(infos),
        compressed_bytes=path.stat().st_size,
        expanded_bytes=expanded,
        media=media_names,
        media_map=media_map,
        has_modern_collection="collection.anki21" in names,
        has_legacy_collection="collection.anki2" in names,
    )


def extract_collection(path: Path) -> tempfile.TemporaryDirectory[str]:
    info = validate_archive(path)
    if not info.has_modern_collection and not info.has_legacy_collection:
        raise ValueError("Archive has no Anki collection database")
    temp = tempfile.TemporaryDirectory(prefix="asu-flashcards-")
    with ZipFile(path) as archive:
        source = "collection.anki21" if info.has_modern_collection else "collection.anki2"
        target = Path(temp.name) / "collection.anki2"
        target.write_bytes(archive.read(source))
        if "media" in archive.namelist():
            (Path(temp.name) / "media.json").write_bytes(archive.read("media"))
        if info.media_map:
            media_dir = Path(temp.name) / "media"
            media_dir.mkdir(exist_ok=True)
            for zip_key, orig_name in info.media_map.items():
                if zip_key in archive.namelist():
                    safe = Path(orig_name).name
                    content = archive.read(zip_key)
                    (Path(temp.name) / safe).write_bytes(content)
                    (media_dir / safe).write_bytes(content)
    return temp
