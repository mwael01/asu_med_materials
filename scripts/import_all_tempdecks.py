#!/usr/bin/env python3
"""
Batch importer script for all flashcard packages in tempdecks/
Sequentially stages, validates, and publishes each deck into Cloud Firestore
and Cloudflare R2 media hosting (asumed.eduvour.com).
"""
import sys
import socket
from pathlib import Path

# Force IPv4 resolution to prevent gRPC/OAuth hangs on Linux
_orig_gai = socket.getaddrinfo
def _ipv4_gai(host, port, family=0, *args, **kwargs):
    return _orig_gai(host, port, socket.AF_INET, *args, **kwargs)
socket.getaddrinfo = _ipv4_gai

# Add flashcards module to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent / "flashcards" / "src"))

from flashcards.archive import validate_archive
from flashcards.cli import stage, validate, publish, _default_service_account
from flashcards.firebase_store import get_db

def main():
    sa = _default_service_account()
    if not sa or not sa.exists():
        print("❌ Error: Service account key not found.")
        sys.exit(1)

    print(f"Using Service Account: {sa.name}")
    db = get_db(sa)

    tempdecks_dir = Path(__file__).resolve().parent.parent / "tempdecks"
    if not tempdecks_dir.exists() or not tempdecks_dir.is_dir():
        print(f"❌ Error: {tempdecks_dir} not found.")
        sys.exit(1)

    archives = sorted(tempdecks_dir.glob("*.apkg"))
    if not archives:
        print("No .apkg archives found in tempdecks/")
        sys.exit(0)

    print(f"Found {len(archives)} flashcard archives to import:")
    for a in archives:
        print(f" - {a.name} ({a.stat().st_size / 1024 / 1024:.2f} MB)")

    total_decks = 0
    total_cards = 0
    success_count = 0
    failures = []

    for idx, archive in enumerate(archives, 1):
        print(f"\n========================================================")
        print(f"[{idx}/{len(archives)}] Processing: {archive.name}")
        print(f"========================================================")
        try:
            # Check if already published to avoid duplicate work
            arch_info = validate_archive(archive)
            import_id = f"imp_{arch_info.sha256[:16]}"
            existing_doc = db.collection("flashcard_imports").document(import_id).get()
            if existing_doc.exists and existing_doc.to_dict().get("status") == "published":
                data = existing_doc.to_dict()
                deck_cnt = data.get("deckCount", 0)
                card_cnt = data.get("cardCount", 0)
                total_decks += deck_cnt
                total_cards += card_cnt
                success_count += 1
                print(f"⏩ [Already Published] {archive.name} ({import_id}): {deck_cnt} decks, {card_cnt} cards. Skipping.")
                continue

            # 1. Stage archive (extracts & uploads media to R2, creates Firestore draft documents)
            import_id = stage(archive, service_account=sa)
            if not import_id:
                raise RuntimeError("Staging failed: no import_id returned.")

            # 2. Validate import
            valid = validate(import_id, service_account=sa)
            if not valid:
                raise RuntimeError(f"Validation failed for import {import_id}")

            # 3. Publish import (makes decks active and writes curriculum materials entries)
            publish(import_id, service_account=sa)

            imp_doc = db.collection("flashcard_imports").document(import_id).get().to_dict() or {}
            deck_cnt = imp_doc.get("deckCount", 0)
            card_cnt = imp_doc.get("cardCount", 0)
            total_decks += deck_cnt
            total_cards += card_cnt
            success_count += 1
            print(f"✅ Successfully processed {archive.name} ({deck_cnt} decks, {card_cnt} cards)")

        except Exception as exc:
            print(f"❌ Failed to process {archive.name}: {exc}")
            failures.append((archive.name, str(exc)))

    print("\n========================================================")
    print("IMPORT COMPLETE SUMMARY")
    print("========================================================")
    print(f"Total Archives: {len(archives)}")
    print(f"Successful:     {success_count}")
    print(f"Failed:         {len(failures)}")
    print(f"Total Decks:    {total_decks}")
    print(f"Total Cards:    {total_cards}")

    if failures:
        print("\nFailures:")
        for name, err in failures:
            print(f" - {name}: {err}")
        sys.exit(1)
    else:
        print("\n🎉 All 11 archives imported and published successfully!")

if __name__ == "__main__":
    main()
