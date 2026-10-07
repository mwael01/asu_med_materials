from __future__ import annotations

import hashlib
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import typer

from .anki_adapter import read_source_cards
from .archive import validate_archive
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

            card_payload = {
                "id": card_id,
                "deckId": deck_id,
                "revisionId": revision_id,
                "ordinal": ordinal,
                "kind": card.rendered.kind,
                "questionHtml": card.rendered.question_html,
                "answerHtml": card.rendered.answer_html,
                "media": [],
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


if __name__ == "__main__":
    app()
