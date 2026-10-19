"""Bounded PDF text evidence for human curation; never infers lesson approvals."""
from __future__ import annotations

import csv
import logging
import signal
from pathlib import Path

from .core import Stage


def extract_evidence(stage: Stage) -> None:
    from pypdf import PdfReader
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    directory = stage.directory / "pdf-evidence"
    directory.mkdir(exist_ok=True)

    def timeout(*_):
        raise TimeoutError("PDF text extraction exceeded 20 seconds")

    previous = signal.signal(signal.SIGALRM, timeout)
    try:
        with (stage.directory / "pdf-evidence.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["entryId", "title", "pages", "evidenceFile", "error"])
            for entry in stage.entries():
                if entry["kind"] != "file" or entry.get("mime") != "application/pdf" or entry.get("status") in {"rejected", "deferred"}:
                    continue
                target = directory / (entry["id"] + ".txt")
                pages, error = "", ""
                if not target.exists():
                    try:
                        signal.alarm(20)
                        reader = PdfReader(stage.directory / entry["file"])
                        pages = len(reader.pages)
                        text = "\n\n".join(f"[Page {i + 1}]\n" + reader.pages[i].extract_text()[:16000] for i in range(min(6, pages)))
                        target.write_text(text[:64000], encoding="utf8")
                    except Exception as exc:
                        error = str(exc)[:250]
                    finally:
                        signal.alarm(0)
                writer.writerow([entry["id"], entry["title"], pages, str(target.relative_to(stage.directory)) if target.exists() else "", error])
                handle.flush()
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)
