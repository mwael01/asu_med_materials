from __future__ import annotations

import hashlib
import os
import re
import subprocess
import time
import urllib.request
from urllib.parse import urlsplit
from datetime import datetime, timezone
from pathlib import Path

from .core import MODULE_ID, Stage, identity, link_id, resource_key
from .files import verify_entry, publication_blocker

ROOT = Path(__file__).resolve().parents[3]


def get_db():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        path = Path(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", str(ROOT / "firebaseadmin.json")))
        credential = credentials.Certificate(str(path)) if path.is_file() else credentials.ApplicationDefault()
        firebase_admin.initialize_app(credential)
    return firestore.client()


def catalogue(db) -> tuple[dict, list[dict], list[dict]]:
    from google.cloud.firestore_v1.base_query import FieldFilter
    module = db.collection("modules").document(MODULE_ID).get()
    if not module.exists or int(module.to_dict().get("year", 0)) != 2:
        raise ValueError("Existing Year 2 respiratory module was not found")
    def fetch(collection):
        return [{**doc.to_dict(), "id": doc.id} for doc in db.collection(collection).where(filter=FieldFilter("moduleId", "==", MODULE_ID)).stream()]
    return {**module.to_dict(), "id": MODULE_ID}, fetch("lessons"), fetch("materials")


def validate_lessons(entry: dict, lessons: list[dict]) -> None:
    ids = entry.get("lessonIds", [])
    if not ids:
        raise ValueError(f"{entry['id']}: approve at least one existing lesson")
    valid = {lesson["id"] for lesson in lessons if lesson.get("active") is not False and lesson.get("moduleId") == MODULE_ID}
    if not set(ids).issubset(valid):
        raise ValueError(f"{entry['id']}: lesson is missing, inactive, or outside respiratory")


def existing_matches(entry: dict, materials: list[dict], stage: Stage) -> list[str]:
    urls = {resource_key(url) for url in [entry.get("url", ""), *entry.get("sourceUrls", [])] if url.startswith("http")}
    hashes = {entry["sha256"]} if entry.get("sha256") else set()
    for occurrence in stage.occurrences(entry["id"]):
        if occurrence.get("url", "").startswith("http"):
            urls.add(resource_key(occurrence["url"]))
    for member_id in entry.get("members", []):
        member = stage.get(member_id)
        if member:
            if member.get("sha256"):
                hashes.add(member["sha256"])
            for url in [member.get("url", ""), *member.get("sourceUrls", [])]:
                if url.startswith("http"):
                    urls.add(resource_key(url))
    matches = []
    for material in materials:
        candidates = [material.get("url", ""), *(material.get("importSources") or [])]
        candidates += [item.get("url", "") for item in (material.get("documents") or [])]
        candidates += [item.get("url", "") for item in (material.get("videos") or [])]
        matched_hash = material.get("contentSha256") in hashes
        # Bundled documents retain their full checksum in the immutable R2 key.
        for url in candidates:
            match = re.search(r"/materials/sha256/([0-9a-f]{64})\.[a-z]+$", urlsplit(url).path) if isinstance(url, str) else None
            if match and match.group(1) in hashes:
                matched_hash = True
        if matched_hash or any(isinstance(url, str) and url.startswith("http") and resource_key(url) in urls for url in candidates):
            matches.append(material["id"])
    return matches


def verify_r2(url: str, entry: dict) -> bool:
    try:
        # Missing-object responses can be cached by custom-domain rules. Never
        # populate the student URL's cache with a pre-upload 404.
        verification_url = url + ("&" if "?" in url else "?") + "verify=" + str(time.time_ns())
        req = urllib.request.Request(verification_url, headers={"User-Agent": "ASUMedMaterials-Importer/1.0"})
        digest, total = hashlib.sha256(), 0
        with urllib.request.urlopen(req, timeout=60) as response:
            mime = response.headers.get_content_type()
            if mime != entry["mime"]:
                return False
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                total += len(chunk)
                if total > entry["bytes"]:
                    return False
        return total == entry["bytes"] and digest.hexdigest() == entry["sha256"]
    except Exception:
        return False


def upload(stage: Stage, entry: dict) -> str:
    if blocker := publication_blocker(entry, stage):
        raise ValueError(blocker)
    verify_entry(stage, entry)
    extension = Path(entry["file"]).suffix
    key = f"materials/sha256/{entry['sha256']}{extension}"
    domain = os.environ.get("R2_PUBLIC_DOMAIN", "https://asumed.eduvour.com").rstrip("/")
    bucket = os.environ.get("R2_BUCKET_NAME", "asumed")
    url = f"{domain}/{key}?v={entry['sha256']}"
    if verify_r2(url, entry):
        entry["uploadedUrl"] = url
        stage.save(entry)
        return url
    command = [str(ROOT / "node_modules/.bin/wrangler"), "r2", "object", "put", f"{bucket}/{key}",
               "--file", str(stage.directory / entry["file"]), "--content-type", entry["mime"],
               "--cache-control", "public, max-age=31536000, immutable", "--content-disposition", "inline", "--remote"]
    environment = {**os.environ, "CI": "1", "WRANGLER_SEND_METRICS": "false", "NO_UPDATE_NOTIFIER": "1"}
    for attempt in range(3):
        result = subprocess.run(command, cwd=ROOT, env=environment, capture_output=True, text=True, timeout=600)
        if result.returncode == 0 and verify_r2(url, entry):
            entry["uploadedUrl"] = url
            stage.save(entry)
            return url
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise RuntimeError("R2 upload or public integrity verification failed; check Wrangler login and bucket configuration")


def build_material(stage: Stage, entry: dict, lessons: list[dict], uploads: dict[str, str]) -> dict:
    material_id = entry.get("existingMaterialId") or "telegram-resp-" + entry["id"][:32]
    material = {"id": material_id, "title": entry["title"], "year": 2, "semester": 1,
                "moduleId": MODULE_ID, "tags": [], "type": "other", "category": "summaries"}
    subjects = {lesson["subject"] for lesson in lessons if lesson["id"] in entry["lessonIds"]}
    if len(subjects) == 1:
        material["subject"] = next(iter(subjects))
        # Keep single-subject imports visible on the previous website release.
        material["lessonId"] = entry["lessonIds"][0]
    if entry.get("author"):
        material["author"] = entry["author"]
    if entry.get("category"):
        material["category"] = entry["category"]
    members = [stage.get(member) for member in entry.get("members", [])] or [entry]
    documents, videos, sources = [], [], []
    for member in members:
        if not member:
            raise ValueError("Bundle member no longer exists")
        url = uploads.get(member["id"]) or member.get("url")
        if not url:
            raise ValueError("A material is missing its public URL")
        if member["kind"] == "video":
            videos.append({"id": member["id"][:32], "title": member["title"], "url": url,
                           "sourceType": member.get("sourceType", "external")})
        elif member["kind"] == "playlist":
            videos.extend(member["videos"])
        elif member["kind"] == "file":
            documents.append({"id": member["id"][:32], "title": member["title"], "url": url})
        sources += member.get("sourceUrls", [])
        if member.get("url"):
            sources.append(member["url"])
    material["url"] = (videos or documents or [{"url": entry.get("url", "")}])[0]["url"]
    if videos:
        material.update(type="playlist", category=entry.get("category", "lectures"), videos=videos)
    if documents:
        material["documents"] = documents
    if entry.get("sha256"):
        material["contentSha256"] = entry["sha256"]
    material["importSources"] = sorted(set(sources))
    material["importRunId"] = stage.setting("run_id")
    material["importReviewStatus"] = "pending"
    if not videos and not documents:
        host = urlsplit(material["url"]).hostname or ""
        material["type"] = "drive" if "google.com" in host else "telegram" if host in {"t.me", "telegram.me"} else "whatsapp" if "whatsapp" in host else "website"
    return material


def merge_existing(current: dict, incoming: dict, members: list[dict], uploads: dict[str, str]) -> dict:
    """Extend only reviewed content; preserve title, attribution, bookmarks and legacy IDs."""
    replacements = {}
    for member in members:
        if member["id"] in uploads:
            for url in [member.get("url", ""), *member.get("sourceUrls", [])]:
                if url.startswith("http"):
                    replacements[resource_key(url)] = uploads[member["id"]]
    def replaced(url):
        return replacements.get(resource_key(url), url) if url and url.startswith("http") else url
    def item_key(item):
        return "youtube:" + item["youtubeId"] if item.get("youtubeId") else resource_key(item["url"])
    patch = {}
    if current.get("url"):
        patch["url"] = replaced(current["url"])
    for field in ("documents", "videos"):
        old = [{**item, **({"url": replaced(item["url"])} if item.get("url") else {})} for item in (current.get(field) or [])]
        new = incoming.get(field, [])
        if new and not old and current.get("url"):
            # Retain the primary item when turning an existing single source into a bundle.
            if field == "videos" and (current.get("type") in {"youtube", "playlist"} or current.get("videos")):
                old.append({"id": current["id"], "title": current["title"], "url": patch["url"]})
            elif field == "documents" and current.get("type") not in {"youtube", "playlist"}:
                old.append({"id": current["id"], "title": current["title"], "url": patch["url"]})
        keys = {item_key(item) for item in old}
        for item in new:
            key = item_key(item)
            if key not in keys:
                old.append(item); keys.add(key)
        if old:
            patch[field] = old
    if patch.get("videos"):
        patch["type"] = "playlist"
    patch["importSources"] = sorted(set([*(current.get("importSources") or []), *(incoming.get("importSources") or [])]))
    if incoming.get("importRunId"):
        patch["importRunId"] = incoming["importRunId"]
        patch["importReviewStatus"] = "pending"
    return patch


def publish(stage: Stage, db, apply: bool = False) -> list[dict]:
    """Validate the complete approved set before any upload or database mutation."""
    from firebase_admin import firestore
    module, lessons, materials = catalogue(db)
    if module.get("active") is False or int(module.get("semester", 1)) != 1:
        raise ValueError("Respiratory module must be visible before publication")
    entries = [entry for entry in stage.entries() if entry.get("status") in {"approved", "published"} and not entry.get("bundledInto") and not entry.get("resolvedTo")]
    if not entries:
        raise ValueError("There are no approved entries")
    plans = []
    for entry in entries:
        validate_lessons(entry, lessons)
        members = [stage.get(member) for member in entry.get("members", [])] or [entry]
        for member in members:
            if not member:
                raise ValueError("Missing bundle member")
            if member["kind"] == "file":
                if blocker := publication_blocker(member, stage):
                    raise ValueError(f"{member['id']}: {blocker}")
                verify_entry(stage, member)
        matches = existing_matches(entry, materials, stage)
        existing_id = entry.get("existingMaterialId")
        if existing_id and existing_id not in {material["id"] for material in materials}:
            raise ValueError("Selected existing material is outside this module or no longer exists")
        own_id = "telegram-resp-" + entry["id"][:32]
        own_record = next((material for material in materials if material["id"] == own_id and material.get("importRunId") == stage.setting("run_id")), None)
        unresolved_matches = [match for match in matches if not (own_record and match == own_id)]
        if unresolved_matches and existing_id not in unresolved_matches:
            raise ValueError(f"{entry['id']}: review existing matches {', '.join(matches)} before publishing")
        plans.append({"entryId": entry["id"], "title": entry["title"], "existingMaterialId": existing_id,
                      "lessonIds": entry["lessonIds"], "fileCount": sum(member["kind"] == "file" for member in members)})
    if not apply:
        return plans
    run_id = stage.setting("run_id")
    run_ref = db.collection("material_imports").document(run_id)
    for entry in entries:
        print(f"Publishing {entry['title']}", flush=True)
        members = [stage.get(member) for member in entry.get("members", [])] or [entry]
        uploads = {member["id"]: upload(stage, member) for member in members if member["kind"] == "file"}
        payload = build_material(stage, entry, lessons, uploads)
        ref = db.collection("materials").document(payload["id"])
        checkpoint = run_ref.collection("entries").document(entry["id"])
        transaction = db.transaction()

        @firestore.transactional
        def commit(tx):
            current = ref.get(transaction=tx)
            recorded = checkpoint.get(transaction=tx)
            # Re-read lesson ownership/visibility inside the commit, not from a stale scrape.
            assigned = [db.collection("lessons").document(lesson_id).get(transaction=tx) for lesson_id in entry["lessonIds"]]
            if any(not lesson.exists or lesson.to_dict().get("moduleId") != MODULE_ID or lesson.to_dict().get("active") is False for lesson in assigned):
                raise ValueError("Lesson changed during publication; review this entry again")
            if current.exists and current.to_dict().get("moduleId") != MODULE_ID:
                raise ValueError("Material changed modules during publication")
            if recorded.exists:
                if not current.exists or recorded.to_dict().get("materialId") != ref.id:
                    raise ValueError("Previously published material was removed or its import checkpoint changed; review before retrying")
                return
            if current.exists:
                if not entry.get("existingMaterialId") and current.to_dict().get("importRunId") != run_id:
                    raise ValueError("Material ID collision; select the existing record explicitly")
                tx.update(ref, merge_existing({**current.to_dict(), "id": ref.id}, payload, members, uploads))
            else:
                if entry.get("existingMaterialId"):
                    raise ValueError("Existing material was deleted during publication")
                tx.create(ref, {**payload, "createdAt": datetime.now(timezone.utc).isoformat()})
            for lesson_id in entry["lessonIds"]:
                tx.set(db.collection("material_lesson_links").document(link_id(payload["id"], lesson_id)),
                       {"materialId": payload["id"], "lessonId": lesson_id, "moduleId": MODULE_ID})
            tx.set(checkpoint, {"materialId": payload["id"], "lessonIds": entry["lessonIds"], "status": "published", "reviewStatus": "pending",
                                "files": [{"entryId": member["id"], "sha256": member["sha256"], "url": uploads[member["id"]]} for member in members if member["kind"] == "file"],
                                "publishedAt": firestore.SERVER_TIMESTAMP})
            tx.set(run_ref, {"moduleId": MODULE_ID, "status": "publishing", "publishedCount": firestore.Increment(1), "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
            tx.set(db.collection("materials_version").document("current"), {"version": firestore.Increment(1), "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)

        commit(transaction)
        entry.update(status="published", materialId=payload["id"])
        stage.save(entry)
        from .curation import publication_report
        publication_report(stage)
    run_ref.set({"status": "complete", "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    return plans
