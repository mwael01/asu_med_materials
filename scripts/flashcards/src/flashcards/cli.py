from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import socket
from collections import defaultdict
from pathlib import Path
from typing import Any

# Ensure IPv4 priority for socket getaddrinfo to prevent hanging on gRPC/OAuth network calls
_orig_gai = socket.getaddrinfo
def _ipv4_gai(host, port, family=0, *args, **kwargs):
    return _orig_gai(host, port, socket.AF_INET, *args, **kwargs)
socket.getaddrinfo = _ipv4_gai

import typer

from .anki_adapter import read_source_cards
from .archive import extract_collection, validate_archive
from .classify import classify_deck_path, slug
from .firebase_store import (
    delete_documents,
    fetch_all_imports,
    fetch_import,
    fetch_modules,
    get_db,
    now_iso,
    upload_source_archive,
    write_documents,
)
from .r2_storage import (
    DEFAULT_R2_BUCKET,
    DEFAULT_R2_PUBLIC_DOMAIN,
    apply_r2_cors,
    upload_files_to_r2,
)
from .render import rewrite_media_urls

app = typer.Typer(
    help="Inspect, stage, review, classify, validate, cleanup, and publish Anki flashcard imports."
)


def _load_env() -> None:
    for filename in (".env.local", ".env"):
        path = Path(__file__).resolve().parents[4] / filename
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _default_service_account() -> Path | None:
    candidates = [
        Path("medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json"),
        Path(__file__).resolve().parents[4] / "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def _source_id(sha256: str) -> str:
    return f"anki:{sha256[:24]}"


def _card_id(source_id: str, card) -> str:
    # Deterministic, stable card ID: source_id + note_guid + template_ord + cloze_ord
    cloze = card.cloze_ordinal if card.cloze_ordinal is not None else 0
    raw = f"{source_id}:{card.note_guid}:{card.template_ordinal}:{cloze}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _deck_records(archive: Path, known_modules: list[dict[str, Any]] | None = None):
    info = validate_archive(archive)
    _, source_cards = read_source_cards(archive)
    source_id = _source_id(info.sha256)
    grouped = defaultdict(list)
    for card in source_cards:
        grouped[card.deck_path].append(card)
    import_id = f"imp_{info.sha256[:16]}"
    revision_id = f"rev_{info.sha256[:16]}"
    return info, source_id, import_id, revision_id, grouped


@app.command()
def inspect(archive: Path = typer.Argument(..., exists=True, readable=True)) -> None:
    """Print archive and Anki deck inventory without remote writes."""
    info = validate_archive(archive)
    _, cards = read_source_cards(archive)
    grouped = defaultdict(int)
    for card in cards:
        grouped[card.deck_path] += 1

    note_types = sorted({card.model.get("name", "Unknown") for card in cards})
    deck_list = []
    for key, count in sorted(grouped.items()):
        cls = classify_deck_path(key, filename=archive.name)
        deck_list.append({
            "path": key,
            "cards": count,
            "proposedTitle": cls.title,
            "year": cls.year,
            "moduleId": cls.moduleId,
            "subject": cls.subject,
            "isResolved": cls.is_resolved,
            "evidence": cls.evidence,
        })

    report = {
        "sha256": info.sha256,
        "entries": info.entries,
        "compressedBytes": info.compressed_bytes,
        "expandedBytes": info.expanded_bytes,
        "media": info.media,
        "noteTypes": note_types,
        "totalCards": len(cards),
        "totalDecks": len(deck_list),
        "decks": deck_list,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


@app.command()
def stage(
    archive: Path = typer.Argument(..., exists=True, readable=True),
    service_account: Path = typer.Option(
        None, "--service-account", help="Path to service account JSON"
    ),
) -> None:
    """Import cards and metadata into unpublished Firestore drafts."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    known_modules = fetch_modules(db)

    info, source_id, import_id, revision_id, grouped = _deck_records(archive, known_modules)
    created = now_iso()
    source_archive_path = upload_source_archive(sa, archive, import_id)

    # Upload extracted media assets to Cloudflare R2 if present in archive
    uploaded_media: dict[str, str] = {}
    if info.media_map:
        print(f"Extracting and uploading {len(info.media_map)} media assets to Cloudflare R2 (asumed)...")
        temp_media = extract_collection(archive)
        try:
            media_dir = Path(temp_media.name) / "media"
            files_to_upload = [p for p in media_dir.iterdir() if p.is_file()] if media_dir.exists() else []
            if files_to_upload:
                uploaded_media = upload_files_to_r2(files_to_upload)
                print(f"Uploaded {len(uploaded_media)} media files to {DEFAULT_R2_PUBLIC_DOMAIN}.")
        finally:
            temp_media.cleanup()

    findings: list[dict[str, Any]] = []
    deck_rows: list[tuple[str, dict[str, Any]]] = []
    card_rows: list[tuple[str, dict[str, Any]]] = []

    for deck_path, cards in sorted(grouped.items()):
        classification = classify_deck_path(
            deck_path, known_modules=known_modules, filename=archive.name
        )
        deck_slug = slug(deck_path)
        deck_id = f"{source_id.replace(':', '-')}-{deck_slug}"
        deck_base = f"flashcard_decks/{deck_id}"
        revision_base = f"{deck_base}/revisions/{revision_id}"

        if not classification.is_resolved:
            findings.append({
                "code": "unresolved-classification",
                "severity": "warning",
                "deckId": deck_id,
                "deckPath": deck_path,
                "message": f"Subject could not be resolved automatically for deck '{deck_path}'",
            })

        deck_rows.append((deck_base, {
            "id": deck_id,
            "title": classification.title,
            "sourceTitle": archive.stem.replace("__", " · "),
            "year": classification.year,
            "semester": 1,
            "moduleId": classification.moduleId,
            "subject": classification.subject,
            "unit": classification.unit,
            "chapter": classification.chapter,
            "author": classification.author,
            "tags": ["anki", f"year-{classification.year}", classification.moduleId, *classification.evidence],
            "cardCount": len(cards),
            "publicationStatus": "draft",
            "activeRevisionId": None,
            "sourceId": source_id,
            "sourceSha256": info.sha256,
            "sourceDeckPath": deck_path,
            "classificationEvidence": classification.evidence,
            "createdAt": created,
            "updatedAt": created,
        }))

        deck_rows.append((revision_base, {
            "id": revision_id,
            "deckId": deck_id,
            "status": "draft",
            "cardCount": len(cards),
            "sourceSha256": info.sha256,
            "sourceId": source_id,
            "complete": False,
            "createdAt": created,
        }))

        for ordinal, card in enumerate(cards):
            card_id = _card_id(source_id, card)
            if not card.rendered.question_html.strip() or not card.rendered.answer_html.strip():
                findings.append({
                    "code": "empty-render",
                    "severity": "error",
                    "deckPath": deck_path,
                    "cardId": card_id,
                    "message": "Card front or back rendered empty HTML",
                })

            content_raw = card.rendered.question_html + "\n" + card.rendered.answer_html
            content_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()

            # Find media URLs in rendered card
            card_media: list[dict[str, Any]] = []
            img_src_regex = re.compile(r'(\bsrc\s*=\s*)["\']([^"\']+)["\']', re.IGNORECASE)
            seen_urls = set()
            for part in (card.rendered.question_html, card.rendered.answer_html):
                for match in img_src_regex.finditer(part):
                    src_val = match.group(2).strip()
                    if src_val and not src_val.startswith("data:") and src_val not in seen_urls:
                        seen_urls.add(src_val)
                        mime = mimetypes.guess_type(src_val)[0] or "image/jpeg"
                        card_media.append({
                            "storagePath": src_val,
                            "contentType": mime,
                        })

            kind = card.rendered.kind
            if card_media and kind == "basic":
                kind = "image"

            card_payload = {
                "id": card_id,
                "deckId": deck_id,
                "revisionId": revision_id,
                "ordinal": ordinal,
                "kind": kind,
                "questionHtml": card.rendered.question_html,
                "answerHtml": card.rendered.answer_html,
                "media": card_media,
                "sourceNoteGuid": card.note_guid,
                "sourceTemplateOrdinal": card.template_ordinal,
                "sourceDeckPath": deck_path,
                "contentHash": content_hash,
                "quarantined": card.rendered.quarantined,
                "quarantineReason": card.rendered.quarantine_reason,
            }
            card_rows.append((f"{revision_base}/cards/{card_id}", card_payload))

    import_doc = {
        "id": import_id,
        "sourceId": source_id,
        "sourceSha256": info.sha256,
        "status": "staged",
        "archiveName": archive.name,
        "sourceArchivePath": source_archive_path,
        "cardCount": len(card_rows),
        "deckCount": len(grouped),
        "deckIds": [d[1]["id"] for d in deck_rows if "revisions" not in d[0]],
        "findings": findings,
        "createdAt": created,
        "updatedAt": now_iso(),
    }

    # Bounded writes to Firestore
    all_writes = [(f"flashcard_imports/{import_id}", import_doc), *deck_rows, *card_rows]
    write_documents(db, all_writes)

    print(f"Staged import successfully: {import_id}")
    print(f"  - Decks: {len(grouped)}")
    print(f"  - Cards: {len(card_rows)}")
    print(f"  - Findings: {len(findings)} ({sum(1 for f in findings if f['severity'] == 'error')} errors, {sum(1 for f in findings if f['severity'] == 'warning')} warnings)")


@app.command()
def review(
    import_id: str = typer.Argument(None, help="Import ID to review (or omit to list recent)"),
    service_account: Path = typer.Option(None, "--service-account"),
) -> None:
    """List staged imports, findings, and unresolved classifications from Firestore."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    if not import_id:
        imports = fetch_all_imports(db)
        if not imports:
            print("No imports found in Firestore.")
            return
        print(f"Found {len(imports)} import(s):")
        for imp in imports:
            print(f"  ID: {imp.get('id')} | Status: {imp.get('status')} | Decks: {imp.get('deckCount')} | Cards: {imp.get('cardCount')} | Archive: {imp.get('archiveName')}")
        return

    imp = fetch_import(db, import_id)
    if not imp:
        typer.echo(f"Import '{import_id}' not found.", err=True)
        raise typer.Exit(code=1)

    print(f"=== Import Review: {import_id} ===")
    print(f"Status: {imp.get('status')}")
    print(f"Archive: {imp.get('archiveName')}")
    print(f"Decks: {imp.get('deckCount')}, Cards: {imp.get('cardCount')}")

    findings = imp.get("findings", [])
    print(f"\nFindings ({len(findings)}):")
    for f in findings:
        sev = f.get("severity", "info").upper()
        print(f"  [{sev}] {f.get('code')}: {f.get('message', '')} (Deck: {f.get('deckPath', '')})")

    deck_ids = imp.get("deckIds", [])
    unresolved: list[str] = []
    for did in deck_ids:
        doc = db.collection("flashcard_decks").document(did).get()
        if doc.exists:
            d = doc.to_dict()
            if not d.get("subject"):
                unresolved.append(f"{did} ({d.get('title')})")

    if unresolved:
        print(f"\nUnresolved Decks ({len(unresolved)}):")
        for u in unresolved:
            print(f"  - {u}")
    else:
        print("\nAll decks have assigned subjects ✓")


@app.command()
def classify(
    deck_id: str = typer.Argument(..., help="Deck ID to classify"),
    module: str = typer.Option(..., "--module", help="Curriculum module ID (e.g. year2-blood)"),
    subject: str = typer.Option(..., "--subject", help="Medical subject name (e.g. Anatomy)"),
    year: int = typer.Option(2, "--year", help="Academic year (1..5)"),
    service_account: Path = typer.Option(None, "--service-account"),
) -> None:
    """Apply curriculum module and subject classification to a staged deck."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    deck_ref = db.collection("flashcard_decks").document(deck_id)
    doc = deck_ref.get()
    if not doc.exists:
        typer.echo(f"Deck '{deck_id}' not found.", err=True)
        raise typer.Exit(code=1)

    deck_ref.update({
        "year": year,
        "moduleId": module,
        "subject": subject,
        "updatedAt": now_iso(),
    })
    print(f"Updated deck '{deck_id}': Year {year}, Module {module}, Subject {subject}.")


@app.command()
def validate(
    import_id: str = typer.Argument(..., help="Import ID to validate"),
    service_account: Path = typer.Option(None, "--service-account"),
) -> None:
    """Validate completeness and publication readiness of a staged import."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    imp = fetch_import(db, import_id)
    if not imp:
        typer.echo(f"Import '{import_id}' not found.", err=True)
        raise typer.Exit(code=1)

    deck_ids = imp.get("deckIds", [])
    errors: list[str] = []
    warnings: list[str] = []

    for did in deck_ids:
        doc = db.collection("flashcard_decks").document(did).get()
        if not doc.exists:
            errors.append(f"Deck document missing: {did}")
            continue
        data = doc.to_dict()
        if not data.get("moduleId"):
            errors.append(f"Deck {did} missing moduleId")
        if not data.get("subject"):
            errors.append(f"Deck {did} missing subject")
        if not data.get("cardCount"):
            warnings.append(f"Deck {did} has 0 cards")

    findings = imp.get("findings", [])
    for f in findings:
        if f.get("severity") == "error":
            errors.append(f"Import finding error: {f.get('message')}")

    print(f"Validation for import '{import_id}':")
    if errors:
        print(f"❌ Failed with {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        raise typer.Exit(code=1)
    else:
        print(f"✅ Ready for publication ({len(deck_ids)} decks, {imp.get('cardCount')} cards).")
        if warnings:
            print(f"Warnings ({len(warnings)}):")
            for w in warnings:
                print(f"  - {w}")


@app.command()
def publish(
    import_id: str = typer.Argument(..., help="Import ID to publish"),
    service_account: Path = typer.Option(None, "--service-account"),
) -> None:
    """Publish validated decks and cards into active website revisions and materials."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    imp = fetch_import(db, import_id)
    if not imp:
        typer.echo(f"Import '{import_id}' not found.", err=True)
        raise typer.Exit(code=1)

    deck_ids = imp.get("deckIds", [])
    source_sha = imp.get("sourceSha256", "")
    revision_id = f"rev_{source_sha[:16]}"
    now = now_iso()

    publish_writes: list[tuple[str, dict[str, Any]]] = []
    for did in deck_ids:
        deck_doc = db.collection("flashcard_decks").document(did).get()
        if not deck_doc.exists:
            continue
        d = deck_doc.to_dict()

        # 1. Update deck to published
        publish_writes.append((f"flashcard_decks/{did}", {
            "publicationStatus": "published",
            "activeRevisionId": revision_id,
            "updatedAt": now,
        }))

        # 2. Update revision to published
        publish_writes.append((f"flashcard_decks/{did}/revisions/{revision_id}", {
            "status": "published",
            "complete": True,
            "publishedAt": now,
        }))

        # 3. Create or update linked material in materials collection
        material_id = f"flashcards-{did}"
        publish_writes.append((f"materials/{material_id}", {
            "id": material_id,
            "title": d.get("title"),
            "titleEn": d.get("title"),
            "description": f"Flashcards for {d.get('title')} ({d.get('cardCount', 0)} cards)",
            "descriptionEn": f"Flashcards for {d.get('title')} ({d.get('cardCount', 0)} cards)",
            "url": f"/flashcards/{did}",
            "type": "flashcards",
            "category": "flashcards",
            "year": d.get("year", 2),
            "moduleId": d.get("moduleId", "year2-blood"),
            "subject": d.get("subject", "General"),
            "unit": d.get("unit", "General"),
            "chapter": d.get("chapter", "General"),
            "author": "ASU Anki Flashcards",
            "tags": ["flashcards", "anki", d.get("moduleId", ""), str(d.get("subject", ""))],
            "flashcardDeckId": did,
            "createdAt": d.get("createdAt", now),
        }))

    # 4. Update import status
    publish_writes.append((f"flashcard_imports/{import_id}", {
        "status": "published",
        "publishedAt": now,
        "updatedAt": now,
    }))

    write_documents(db, publish_writes)
    print(f"🎉 Successfully published {len(deck_ids)} decks and {imp.get('cardCount')} cards!")


@app.command()
def cleanup(
    import_id: str = typer.Argument(..., help="Import ID to delete (if unpublished)"),
    service_account: Path = typer.Option(None, "--service-account"),
) -> None:
    """Remove abandoned import draft data and cards from Firestore."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    imp = fetch_import(db, import_id)
    if not imp:
        typer.echo(f"Import '{import_id}' not found.", err=True)
        raise typer.Exit(code=1)

    if imp.get("status") == "published":
        typer.echo("Cannot cleanup an active published import.", err=True)
        raise typer.Exit(code=1)

    deck_ids = imp.get("deckIds", [])
    source_sha = imp.get("sourceSha256", "")
    revision_id = f"rev_{source_sha[:16]}"

    paths_to_delete: list[str] = [f"flashcard_imports/{import_id}"]
    for did in deck_ids:
        cards_ref = db.collection("flashcard_decks").document(did).collection("revisions").document(revision_id).collection("cards")
        for card_doc in cards_ref.stream():
            paths_to_delete.append(f"flashcard_decks/{did}/revisions/{revision_id}/cards/{card_doc.id}")
        paths_to_delete.append(f"flashcard_decks/{did}/revisions/{revision_id}")
        paths_to_delete.append(f"flashcard_decks/{did}")

    deleted = delete_documents(db, paths_to_delete)
    print(f"Cleaned up import '{import_id}': deleted {deleted} documents.")


@app.command("set-cors")
def set_cors_cmd(
    cors_file: Path = typer.Option(None, "--file", help="Path to CORS configuration JSON"),
    bucket: str = typer.Option(DEFAULT_R2_BUCKET, "--bucket", help="R2 bucket name"),
) -> None:
    """Apply CORS configuration to Cloudflare R2 bucket using pnpm wrangler."""
    _load_env()
    success = apply_r2_cors(cors_file=cors_file, bucket=bucket)
    if not success:
        raise typer.Exit(code=1)


@app.command("upload-media")
def upload_media_cmd(
    source: Path = typer.Argument(..., exists=True, readable=True, help="Path to APKG archive or folder of images"),
    bucket: str = typer.Option(DEFAULT_R2_BUCKET, "--bucket", help="R2 bucket name"),
) -> None:
    """Extract and upload media assets to Cloudflare R2 bucket (asumed.eduvour.com)."""
    _load_env()
    if source.is_dir():
        files = [p for p in source.iterdir() if p.is_file()]
        print(f"Uploading {len(files)} files from {source} to R2 bucket '{bucket}'...")
        res = upload_files_to_r2(files, bucket=bucket)
        print(f"Done! Uploaded {len(res)} files to {DEFAULT_R2_PUBLIC_DOMAIN}.")
    else:
        # APKG archive
        print(f"Extracting media from APKG {source.name}...")
        temp = extract_collection(source)
        try:
            media_dir = Path(temp.name) / "media"
            if not media_dir.exists():
                files = [p for p in Path(temp.name).iterdir() if p.is_file() and p.name not in ("collection.anki2", "media.json")]
            else:
                files = [p for p in media_dir.iterdir() if p.is_file()]
            print(f"Found {len(files)} media files. Uploading to R2 bucket '{bucket}'...")
            res = upload_files_to_r2(files, bucket=bucket)
            print(f"Done! Uploaded {len(res)} files to {DEFAULT_R2_PUBLIC_DOMAIN}.")
        finally:
            temp.cleanup()


@app.command("link-images")
def link_images_cmd(
    service_account: Path = typer.Option(None, "--service-account"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Scan and preview without writing to Firestore"),
) -> None:
    """Scan existing cards in Firestore, rewrite relative image paths to Cloudflare R2, and link media."""
    _load_env()
    sa = service_account or _default_service_account()
    if not sa or not sa.exists():
        typer.echo("Error: Service account JSON file not found.", err=True)
        raise typer.Exit(code=1)

    db = get_db(sa)
    decks = list(db.collection("flashcard_decks").stream())
    print(f"Inspecting {len(decks)} flashcard decks in Firestore...")

    total_cards_scanned = 0
    cards_updated = 0
    updates: list[tuple[str, dict[str, Any]]] = []

    img_src_regex = re.compile(r'(\bsrc\s*=\s*)["\']([^"\']+)["\']', re.IGNORECASE)

    for deck_doc in decks:
        deck_data = deck_doc.to_dict() or {}
        deck_id = deck_doc.id
        active_rev = deck_data.get("activeRevisionId")
        if not active_rev:
            rev_docs = list(db.collection("flashcard_decks").document(deck_id).collection("revisions").limit(1).stream())
            if rev_docs:
                active_rev = rev_docs[0].id
        if not active_rev:
            continue

        cards_ref = db.collection("flashcard_decks").document(deck_id).collection("revisions").document(active_rev).collection("cards")
        for card_doc in cards_ref.stream():
            total_cards_scanned += 1
            card_data = card_doc.to_dict() or {}
            q_html = card_data.get("questionHtml", "")
            a_html = card_data.get("answerHtml", "")
            needs_update = False

            # Check if relative img src exists
            new_q = rewrite_media_urls(q_html)
            new_a = rewrite_media_urls(a_html)

            if new_q != q_html or new_a != a_html:
                needs_update = True

            # Extract media URLs
            media_list = card_data.get("media") or []
            discovered_urls = set()
            for html_part in (new_q, new_a):
                for match in img_src_regex.finditer(html_part):
                    src_val = match.group(2).strip()
                    if src_val and not src_val.startswith("data:"):
                        discovered_urls.add(src_val)

            existing_storage_paths = {m.get("storagePath") for m in media_list if isinstance(m, dict)}
            for u in discovered_urls:
                if u not in existing_storage_paths:
                    mime = mimetypes.guess_type(u)[0] or "image/jpeg"
                    media_list.append({
                        "storagePath": u,
                        "contentType": mime,
                    })
                    needs_update = True

            if needs_update:
                card_path = f"flashcard_decks/{deck_id}/revisions/{active_rev}/cards/{card_doc.id}"
                card_patch = {
                    "questionHtml": new_q,
                    "answerHtml": new_a,
                    "media": media_list,
                }
                if "<img" in new_q.lower() or "<img" in new_a.lower():
                    card_patch["kind"] = "image"
                updates.append((card_path, card_patch))
                cards_updated += 1

    print(f"Total cards scanned: {total_cards_scanned}")
    print(f"Cards requiring image linkage updates: {cards_updated}")

    if dry_run:
        print("[Dry Run] No writes committed.")
        return

    if updates:
        print(f"Committing {len(updates)} card updates to Firestore...")
        write_documents(db, updates)
        print("Done! All image references linked to Cloudflare R2 (asumed.eduvour.com).")
    else:
        print("All cards in Firestore are verified and cleanly linked. No updates needed.")


if __name__ == "__main__":
    app()
