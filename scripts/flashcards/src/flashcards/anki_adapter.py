from __future__ import annotations

import json
import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .archive import extract_collection
from .render import RenderedCard, render_card


@dataclass
class SourceCard:
    note_guid: str
    deck_path: str
    template_ordinal: int
    cloze_ordinal: int | None
    fields: list[str]
    field_names: list[str]
    model: dict
    rendered: RenderedCard


def _load_database(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(path)


def _official_renders(archive: Path) -> dict[tuple[str, int], tuple[str, str]]:
    """Render through Anki's supported Collection API before sanitizing output."""
    try:
        from anki.collection import Collection, ImportAnkiPackageOptions, ImportAnkiPackageRequest
    except ImportError:
        return {}
    renders: dict[tuple[str, int], tuple[str, str]] = {}
    with tempfile.TemporaryDirectory(prefix="asu-anki-render-") as directory:
        collection_path = Path(directory) / "collection.anki2"
        package_path = Path(directory) / "source.apkg"
        package_path.write_bytes(archive.read_bytes())
        collection = Collection(str(collection_path))
        try:
            collection.import_anki_package(
                ImportAnkiPackageRequest(
                    package_path=str(package_path),
                    options=ImportAnkiPackageOptions(
                        merge_notetypes=True,
                        with_scheduling=False,
                        with_deck_configs=False,
                    ),
                )
            )
            for card_id in collection.find_cards(""):
                card = collection.get_card(card_id)
                note = card.note()
                renders[(str(note.guid), int(card.ord))] = (card.question(), card.answer())
        finally:
            collection.close()
    return renders


def read_source_cards(archive: Path) -> tuple[dict[str, dict], list[SourceCard]]:
    official_renders = _official_renders(archive)
    temp = extract_collection(archive)
    try:
        db = _load_database(Path(temp.name) / "collection.anki2")
        collection = db.execute("select decks,models from col").fetchone()
        decks = json.loads(collection[0])
        models = json.loads(collection[1])
        deck_names = {int(key): value.get("name", "Untitled") for key, value in decks.items()}
        model_map = {int(key): value for key, value in models.items()}
        cards = db.execute("select n.id,n.guid,n.mid,n.flds,c.did,c.ord from notes n join cards c on c.nid=n.id order by c.id").fetchall()
        field_names = {mid: [item.get("name", "Field") for item in model.get("flds", [])] for mid, model in model_map.items()}
        result: list[SourceCard] = []
        for nid, guid, mid, flds, did, ord_ in cards:
            model = model_map[mid]
            values = str(flds or "").split("\x1f")
            templates = model.get("tmpls", [])
            template_index = min(int(ord_), max(0, len(templates) - 1))
            official = official_renders.get((str(guid), int(ord_)))
            if official:
                from .render import safe_html
                question, answer = official
                model_name = str(model.get("name", "")).lower()
                kind = "cloze" if "cloze" in model_name or "{{c" in question else "basic"
                if "<img" in question.lower() or "<img" in answer.lower():
                    kind = "image"
                rendered = RenderedCard(safe_html(question), safe_html(answer), kind)
            else:
                rendered = render_card(model, field_names[mid], values, template_index)
            result.append(SourceCard(str(guid), deck_names.get(did, "Untitled"), template_index, None, values, field_names[mid], model, rendered))
        return decks, result
    finally:
        temp.cleanup()
