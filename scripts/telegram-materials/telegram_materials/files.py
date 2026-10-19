from __future__ import annotations

import hashlib
import mimetypes
import os
import tempfile
import zipfile
import re
import html
from pathlib import Path
from typing import BinaryIO

from .core import Stage, identity, resource_key, URL_PATTERN

MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
# Cloudflare documents Wrangler's limit in decimal MB; retain larger downloads locally.
WRANGLER_MAX_BYTES = 315_000_000
IMAGE_TYPES = {"JPEG": (".jpg", "image/jpeg"), "PNG": (".png", "image/png"),
               "GIF": (".gif", "image/gif"), "WEBP": (".webp", "image/webp"),
               "AVIF": (".avif", "image/avif"), "BMP": (".bmp", "image/bmp")}


class IgnoredLargeBook(ValueError):
    pass


def check_book_size(stage: Stage, size: int, is_pdf: bool) -> None:
    limit = stage.setting("max_book_bytes")
    if is_pdf and limit and size > limit:
        raise IgnoredLargeBook(f"Ignored PDF over the selected {limit // 1048576} MiB book limit")


def ignore_archive_member(stage: Stage, source: str, context: list[str], member: str, size: int) -> bool:
    try:
        check_book_size(stage, size, member.lower().endswith(".pdf"))
    except IgnoredLargeBook as exc:
        key = stage.source("ignored_file", f"archive-member:{source}:{member}", [*context, member])
        stage.status(key, "excluded", str(exc))
        return True
    return False


def file_type(path: Path) -> tuple[str, str]:
    with path.open("rb") as handle:
        start = handle.read(1024)
        if b"%PDF-" in start:
            handle.seek(max(0, path.stat().st_size - 4096))
            if b"%%EOF" not in handle.read():
                raise ValueError("Truncated PDF: missing EOF marker")
            return ".pdf", "application/pdf"
    from PIL import Image
    with Image.open(path) as image:
        extension, mime = IMAGE_TYPES.get(image.format, (None, None))
        if not extension:
            raise ValueError("Unsupported image format")
        image.verify()
    return extension, mime


def stage_file(stage: Stage, path: Path, title: str, source: str, context: list[str],
               url: str = "", evidence: dict | None = None) -> str:
    if not 0 < path.stat().st_size <= MAX_FILE_BYTES:
        raise ValueError("File is empty or exceeds 512 MiB")
    extension, mime = file_type(path)
    check_book_size(stage, path.stat().st_size, mime == "application/pdf")
    with path.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    destination = stage.files / (digest + extension)
    if not destination.exists():
        # File is already in the run directory; atomic rename prevents partial objects.
        path.replace(destination)
    elif path != destination:
        path.unlink()
    entry = {"id": digest, "kind": "file", "title": title, "url": url,
             "sourceUrls": [url] if url else [], "sha256": digest, "mime": mime,
             "bytes": destination.stat().st_size, "file": str(destination.relative_to(stage.directory)), "status": "unreviewed"}
    entry_id = stage.put(entry, source, context, {"url": url, **(evidence or {})})
    if url:
        old_link = stage.get(identity(resource_key(url)))
        if old_link and old_link["id"] != entry_id and old_link["kind"] == "link":
            old_link["resolvedTo"] = entry_id
            stage.save(old_link)
            for occurrence in stage.occurrences(old_link["id"]):
                stage.put(stage.get(entry_id), occurrence["source"], occurrence["context"], occurrence)
    return entry_id


def copy_stream(stream: BinaryIO, destination: Path, limit: int = MAX_FILE_BYTES) -> None:
    total = 0
    with destination.open("wb") as target:
        while chunk := stream.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                raise ValueError("Download exceeds configured size limit")
            target.write(chunk)


def publication_blocker(entry: dict, stage: Stage | None = None) -> str:
    if stage and entry.get("kind") == "file":
        try:
            check_book_size(stage, entry.get("bytes", 0), entry.get("mime") == "application/pdf")
        except IgnoredLargeBook as exc:
            return str(exc)
    if entry.get("kind") == "file" and entry.get("bytes", 0) > WRANGLER_MAX_BYTES:
        return "Deferred: file exceeds Wrangler's 315 MB upload limit; retained locally for later publication"
    return ""


def is_archive_metadata(name: str) -> bool:
    parts = Path(name.replace("\\", "/")).parts
    return any(part == "__MACOSX" or part.startswith("._") or part == ".DS_Store" for part in parts)


def unpack_archive(stage: Stage, archive: Path, source: str, context: list[str], on_link=None) -> None:
    """Stream ZIP/RAR/7z members into hashed files, never their supplied paths."""
    import libarchive
    errors, claimed, consumed = [], 0, 0
    with libarchive.file_reader(str(archive)) as bundle:
        for index, info in enumerate(bundle, 1):
            claimed += max(0, info.size or 0)
            if index > 10000 or claimed > MAX_ARCHIVE_BYTES:
                raise ValueError("Archive exceeds 10,000 members or 2 GiB expanded size")
            if not info.isfile or info.islnk or info.issym:
                continue
            member_name = str(info.pathname)
            if is_archive_metadata(member_name):
                continue
            if ignore_archive_member(stage, source, context, member_name, info.size or 0):
                continue
            name = Path(member_name).name
            mime = mimetypes.guess_type(name)[0] or ""
            text_member = on_link and name.lower().endswith((".txt", ".md", ".html", ".htm", ".url"))
            if not text_member and mime != "application/pdf" and not mime.startswith("image/"):
                if name.lower().endswith((".zip", ".rar", ".7z")):
                    errors.append(f"Nested archive requires review: {member_name}")
                continue
            fd, filename = tempfile.mkstemp(dir=stage.directory, suffix=".part")
            os.close(fd)
            path = Path(filename)
            limit = 5 * 1024 * 1024 if text_member else MAX_FILE_BYTES
            try:
                total = 0
                with path.open("wb") as target:
                    for block in info.get_blocks(1024 * 1024):
                        total += len(block)
                        consumed += len(block)
                        if total > limit or consumed > MAX_ARCHIVE_BYTES:
                            raise ValueError("Archive member exceeds configured expanded size limit")
                        target.write(block)
                if text_member:
                    text = html.unescape(path.read_text(encoding="utf8", errors="replace"))
                    for url in dict.fromkeys(URL_PATTERN.findall(text)):
                        on_link(url.rstrip(".,،);]"), name, [*context, member_name])
                else:
                    stage_file(stage, path, name, source, [*context, member_name], evidence={"archiveMember": member_name})
            except IgnoredLargeBook:
                ignore_archive_member(stage, source, context, member_name, path.stat().st_size)
            except Exception as exc:
                errors.append(f"{member_name}: {type(exc).__name__}: {exc}")
            finally:
                path.unlink(missing_ok=True)
            if consumed > MAX_ARCHIVE_BYTES:
                raise ValueError("Archive exceeds 2 GiB expanded size")
    if errors:
        raise ValueError("; ".join(errors[:20]))


def unpack_zip(stage: Stage, archive: Path, source: str, context: list[str], on_link=None) -> None:
    with zipfile.ZipFile(archive) as bundle:
        infos = bundle.infolist()
        if len(infos) > 10000 or sum(info.file_size for info in infos) > MAX_ARCHIVE_BYTES:
            raise ValueError("Archive exceeds 10,000 members or 2 GiB expanded size")
        errors = []
        for info in infos:
            if info.is_dir() or is_archive_metadata(info.filename):
                continue
            name = Path(info.filename).name
            if ignore_archive_member(stage, source, context, info.filename, info.file_size):
                continue
            mime = mimetypes.guess_type(name)[0] or ""
            if on_link and name.lower().endswith((".txt", ".md", ".html", ".htm", ".url")):
                if info.file_size > 5 * 1024 * 1024:
                    errors.append(f"Text member exceeds 5 MiB: {info.filename}")
                else:
                    text = html.unescape(bundle.read(info).decode("utf8", errors="replace"))
                    for url in dict.fromkeys(URL_PATTERN.findall(text)):
                        on_link(url.rstrip(".,،);]"), name, [*context, info.filename])
                continue
            if mime != "application/pdf" and not mime.startswith("image/"):
                # Preserve unsupported archive members in coverage evidence.
                if name.lower().endswith((".zip", ".rar", ".7z")):
                    errors.append(f"Nested archive requires review: {info.filename}")
                continue
            fd, filename = tempfile.mkstemp(dir=stage.directory, suffix=".part")
            os.close(fd)
            path = Path(filename)
            try:
                with bundle.open(info) as member:
                    copy_stream(member, path)
                stage_file(stage, path, name, source, [*context, info.filename], evidence={"archiveMember": info.filename})
            except IgnoredLargeBook:
                ignore_archive_member(stage, source, context, info.filename, path.stat().st_size)
            except Exception as exc:
                errors.append(f"{info.filename}: {type(exc).__name__}: {exc}")
            finally:
                path.unlink(missing_ok=True)
        if errors:
            raise ValueError("; ".join(errors[:20]))


def verify_entry(stage: Stage, entry: dict) -> None:
    path = (stage.directory / entry["file"]).resolve()
    if not path.is_relative_to(stage.files.resolve()):
        raise ValueError("File is outside this run’s files directory")
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        raise ValueError("Staged file is missing or has changed size")
    with path.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    if digest != entry["sha256"] or file_type(path)[1] != entry["mime"]:
        raise ValueError("Staged file failed integrity validation")
