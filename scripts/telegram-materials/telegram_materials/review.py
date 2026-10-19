from __future__ import annotations

import json
import csv
from collections import Counter

from .core import MODULE_ID, Stage, identity, propose_lessons
from .files import verify_entry, publication_blocker
from .store import catalogue, existing_matches, validate_lessons


def context_aliases(stage: Stage) -> dict:
    groups = {}
    for source in stage.sources():
        if source["status"] == "excluded":
            continue
        if source["kind"] == "bot":
            fingerprint = source["payload"].get("fingerprint")
            if fingerprint:
                groups.setdefault(("bot", fingerprint), []).append(source["context"])
        else:
            groups.setdefault((source["kind"], source["locator"]), []).append(source["context"])
    return {tuple(context): contexts for contexts in groups.values() for context in contexts}


def context_variants(stage: Stage, context: list[str], aliases: dict | None = None) -> list[list[str]]:
    """A shared archive keeps every lesson breadcrumb even when fetched just once."""
    aliases = aliases if aliases is not None else context_aliases(stage)
    variants = [context]
    for length in range(1, len(context) + 1):
        for alias in aliases.get(tuple(context[:length]), []):
            candidate = alias + context[length:]
            if candidate not in variants:
                variants.append(candidate)
    return variants


def refresh_review(stage: Stage, db) -> list[dict]:
    _, lessons, materials = catalogue(db)
    aliases = context_aliases(stage)
    for entry in stage.entries():
        proposals = {}
        for occurrence in stage.occurrences(entry["id"]):
            for context in context_variants(stage, occurrence["context"], aliases):
                for proposal in propose_lessons(entry["title"], context + [occurrence.get("caption", "")], lessons):
                    old = proposals.get(proposal["lessonId"])
                    if old is None or old["score"] < proposal["score"]:
                        proposals[proposal["lessonId"]] = proposal
        for member_id in entry.get("members", []):
            member = stage.get(member_id) or {}
            for proposal in member.get("proposedLessons", []):
                proposals[proposal["lessonId"]] = proposal
        entry["proposedLessons"] = sorted(proposals.values(), key=lambda item: (-item["score"], item["lessonId"]))
        entry["existingMatches"] = existing_matches(entry, materials, stage)
        entry["validationErrors"] = []
        entry["publicationBlocked"] = publication_blocker(entry, stage)
        if entry["publicationBlocked"] and entry.get("status") == "unreviewed":
            entry["status"] = "deferred"
        try:
            if entry["kind"] == "file":
                verify_entry(stage, entry)
            if entry.get("status") in {"approved", "published"}:
                validate_lessons(entry, lessons)
        except Exception as exc:
            entry["validationErrors"].append(str(exc))
        stage.save(entry)
    write_report(stage)
    return stage.entries()


def write_summary(stage: Stage, entries: list[dict], sources: list[dict]) -> None:
    files = [entry for entry in entries if entry["kind"] == "file"]
    kept = sum(entry.get("status") not in {"rejected", "deferred"} for entry in files)
    pending = sum(source["status"] in {"pending", "running"} for source in sources)
    gaps = sum(source["status"] in {"failed", "blocked", "incomplete"} for source in sources)
    errors = sum(bool(entry.get("validationErrors")) for entry in entries)
    uploaded = sum(bool(entry.get("uploadedUrl")) for entry in files)
    published = sum(entry.get("status") == "published" for entry in entries)
    held = sum(entry.get("status") == "held" for entry in files)
    lines = ["# Respiratory import review", "", "Review commands update temporary staging only. R2 upload and Firestore publication require the separate `publish --apply` command.", "",
             f"- {len(files):,} verified PDF/image files; {kept:,} retained for review after exclusions.",
             f"- {len(entries):,} total file, link, video, and playlist entries.",
             f"- {uploaded:,} unique files uploaded; {published:,} materials published with pending-review markers; {held:,} files held without upload.",
             f"- {pending:,} pending collection jobs; {errors:,} file-validation failures.",
             f"- {gaps:,} source records need access or scope review; several can reference the same target.", "",
             "PDF books over the saved size cutoff and clear other-module entries are excluded from publication. Lesson suggestions require review; existing lessons only.", "",
             "- [Files, links, and proposed lessons](materials.csv): filter status to `unreviewed`.",
             "- [Upload outcomes and held files](publication.csv): includes public URLs, website paths, lesson IDs and review reasons.",
             "- [Playlist video URLs](playlist-videos.csv): includes mixed-subject candidates for scope review.",
             "- [Source coverage and access gaps](sources.csv): filter failed, blocked, or incomplete sources.",
             "- [Full evidence report](REVIEW.md).", ""]
    (stage.directory / "SUMMARY.md").write_text("\n".join(lines), encoding="utf8")


def write_report(stage: Stage) -> None:
    entries, sources = stage.entries(), stage.sources()
    write_summary(stage, entries, sources)
    aliases = context_aliases(stage)
    counts = Counter(source["status"] for source in sources)
    kinds = Counter(entry["kind"] for entry in entries)
    with (stage.directory / "sources.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["key", "kind", "status", "locator", "context", "error"])
        writer.writeheader()
        for source in sources:
            writer.writerow({key: " / ".join(source["context"]).replace("\n", " ") if key == "context" else source.get(key, "")
                             for key in writer.fieldnames})
    # Keep every accessible playlist URL available for scope review, including
    # videos omitted from a mixed-subject playlist's proposed publication.
    with (stage.directory / "playlist-videos.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["playlistUrl", "playlistTitle", "videoId", "title", "url", "sourceContext"])
        writer.writeheader()
        for source in sources:
            for video in source["payload"].get("availableVideos", []):
                writer.writerow({"playlistUrl": source["locator"], "playlistTitle": source["payload"].get("playlistTitle", ""),
                                 "videoId": video["id"], "title": video["title"], "url": video["url"],
                                 "sourceContext": " / ".join(source["context"]).replace("\n", " ")})
    with (stage.directory / "materials.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        columns = ["id", "title", "kind", "status", "file", "url", "bytes", "mime", "sha256", "sourceUrls", "sourceContexts", "proposedLessonIds", "approvedLessonIds", "existingMatches", "publicationBlocked", "resolvedTo", "bundledInto"]
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for entry in entries:
            row = {column: entry.get(column, "") for column in columns}
            row["proposedLessonIds"] = " | ".join(proposal["lessonId"] for proposal in entry.get("proposedLessons", []))
            row["approvedLessonIds"] = " | ".join(entry.get("lessonIds", []))
            row["existingMatches"] = " | ".join(entry.get("existingMatches", []))
            row["sourceUrls"] = " | ".join(entry.get("sourceUrls", []))
            contexts = dict.fromkeys(" / ".join(context).replace("\n", " ")
                                     for occurrence in stage.occurrences(entry["id"])
                                     for context in context_variants(stage, occurrence["context"], aliases))
            row["sourceContexts"] = " | ".join(contexts)
            writer.writerow(row)
    lines = ["# Respiratory collection review", "", f"Run: `{stage.setting('run_id')}`", "",
             "Collection is staged only. No upload or database publication is performed by collect/review.", "",
             "[Spreadsheet inventory](materials.csv) — review export only; approvals are saved through the CLI, not by editing the CSV.", "",
             "[Playlist video inventory](playlist-videos.csv) includes accessible video URLs from mixed-subject playlists for scope review.", "",
             "[Source coverage inventory](sources.csv) can be filtered by failed, blocked, incomplete, or excluded status.", "",
             "## Coverage", "", f"Sources: {dict(counts)}", f"Resources: {dict(kinds)}",
             f"Verified file bytes: {sum(entry.get('bytes', 0) for entry in entries if entry['kind'] == 'file'):,}", "",
             "A run with pending, blocked, failed, or incomplete sources is not an exhaustive scrape.", ""]
    for source in sources:
        context = " / ".join(source["context"]).replace("\n", " ")
        lines += [f"- **{source['status']}** `{source['key']}` {source['kind']}: {context}"]
        if source.get("error"):
            lines += [f"  {source['error']}"]
        if source["payload"].get("filename"):
            lines += ["  File: " + source["payload"]["filename"].replace("\n", " ")]
    lines += ["", "## Resources", ""]
    albums = {}
    for entry in entries:
        for occurrence in stage.occurrences(entry["id"]):
            if occurrence.get("albumId"):
                key = (occurrence.get("chatId"), occurrence["albumId"])
                albums.setdefault(key, {})[entry["id"]] = occurrence.get("messageId", 0)
    if albums:
        lines += ["### Image albums to group before approval", ""]
        for (chat, album), members in albums.items():
            lines += [f"- Chat {chat}, album {album}: " + ", ".join(f"`{entry_id}`" for entry_id in sorted(members, key=members.get))]
        lines += [""]
    for entry in entries:
        lines += [f"### {entry['title'].replace(chr(10), ' ')}", "", f"ID: `{entry['id']}` — {entry['kind']} — {entry.get('status', 'unreviewed')}", ""]
        if entry.get("bundledInto"):
            lines += [f"Grouped into `{entry['bundledInto']}`", ""]
        if entry.get("resolvedTo"):
            lines += [f"Downloaded as `{entry['resolvedTo']}`; review the file entry instead of publishing this link.", ""]
        if entry.get("publicationBlocked"):
            lines += [entry["publicationBlocked"], ""]
        if entry.get("exclusionReason"):
            lines += [entry["exclusionReason"], ""]
        if entry.get("file"):
            lines += [f"File: [{entry['file']}]({entry['file']}) ({entry['bytes']} bytes)", ""]
        if entry.get("url"):
            lines += [f"Source: {entry['url']}", ""]
        if entry.get("existingMatches"):
            lines += ["Existing catalogue matches: " + ", ".join(f"`{value}`" for value in entry["existingMatches"]), ""]
        lines += ["Proposed lessons (require review):"]
        lines += [f"- `{proposal['lessonId']}` — {proposal['subject']}: {proposal['title']} ({proposal['score']:.0%} title overlap)" for proposal in entry.get("proposedLessons", [])] or ["- Unmatched"]
        if entry.get("lessonIds"):
            lines += ["", "Approved lessons: " + ", ".join(entry["lessonIds"])]
        for error in entry.get("validationErrors", []):
            lines += [f"Validation error: {error}"]
        lines += ["", "Evidence:"]
        for occurrence in stage.occurrences(entry["id"]):
            for context in context_variants(stage, occurrence["context"], aliases):
                lines += ["- " + " / ".join(context).replace("\n", " ") + (f" (message {occurrence['messageId']})" if occurrence.get("messageId") else "")]
        lines += [""]
    (stage.directory / "REVIEW.md").write_text("\n".join(lines), encoding="utf8")


def approve(stage: Stage, db, entry_id: str, lesson_ids: list[str], author: str | None = None,
            title: str | None = None, existing_id: str | None = None, category: str | None = None) -> None:
    entry = stage.get(entry_id)
    if not entry:
        raise ValueError("Entry was not found")
    if entry.get("status") == "published":
        raise ValueError("Published entries are immutable; edit their live assignments in Admin → Lessons")
    if entry.get("bundledInto"):
        raise ValueError("Approve the containing bundle instead")
    if entry.get("resolvedTo"):
        raise ValueError("This link was downloaded; approve its file entry instead: " + entry["resolvedTo"])
    for member in [stage.get(member) for member in entry.get("members", [])] or [entry]:
        if member and (blocker := publication_blocker(member, stage)):
            raise ValueError(blocker)
    _, lessons, materials = catalogue(db)
    entry["lessonIds"] = list(dict.fromkeys(lesson_ids))
    validate_lessons(entry, lessons)
    if title:
        entry["title"] = title.strip()
    if not entry["title"].strip():
        raise ValueError("A material needs a title")
    if author:
        entry["author"] = author.strip()
    if category:
        entry["category"] = category
    if existing_id:
        if existing_id not in {material["id"] for material in materials}:
            raise ValueError("Existing material must belong to respiratory")
        entry["existingMaterialId"] = existing_id
    matches = existing_matches(entry, materials, stage)
    if matches and entry.get("existingMaterialId") not in matches:
        raise ValueError("Choose an existing material from these matches: " + ", ".join(matches))
    if entry["kind"] == "file":
        verify_entry(stage, entry)
    entry["status"] = "approved"
    stage.save(entry)
    write_report(stage)


def bundle(stage: Stage, ids: list[str], title: str) -> str:
    if len(ids) < 2 or len(set(ids)) != len(ids):
        raise ValueError("Choose at least two different entries in the desired playback order")
    entries = [stage.get(entry_id) for entry_id in ids]
    if any(entry is None or entry.get("status") == "published" or entry.get("bundledInto") or entry["kind"] == "bundle" for entry in entries):
        raise ValueError("Bundle members must exist and cannot already be grouped or published")
    if any(entry["kind"] not in {"file", "video"} for entry in entries):
        raise ValueError("Bundle only related documents/images or videos")
    entry_id = identity(json.dumps(["bundle", ids]))
    stage.put({"id": entry_id, "kind": "bundle", "title": title, "members": ids, "status": "unreviewed"})
    for entry in entries:
        entry["bundledInto"] = entry_id
        stage.save(entry)
    write_report(stage)
    return entry_id
