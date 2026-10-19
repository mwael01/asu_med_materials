#!/usr/bin/env python3
"""
Cleanup Script: Delete verified rogue duplicate documents from Firestore.

Target duplicates in year1-introduction:
  1. yr1-intro-genetics-practical-biochemistry-makes-sense (duplicate of yr1-intro-genetics-essawy-playlist)
  2. yr1-intro-immunology-m-ashraf-practical (duplicate of yr1-intro-immunology-ashraf-practical)

Also atomically increments materials_version/current to invalidate client snapshots.
"""

import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root / "scripts" / "flashcards" / "src"))

from flashcards.firebase_store import get_db
from google.cloud import firestore

SERVICE_ACCOUNT = project_root / "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json"

DUPLICATES_TO_REMOVE = [
    "yr1-intro-genetics-practical-biochemistry-makes-sense",
    "yr1-intro-immunology-m-ashraf-practical"
]

def cleanup_duplicates():
    db = get_db(SERVICE_ACCOUNT)
    materials_ref = db.collection("materials")

    print(f"Checking {len(DUPLICATES_TO_REMOVE)} duplicate documents for removal...")
    deleted_count = 0
    for doc_id in DUPLICATES_TO_REMOVE:
        doc_ref = materials_ref.document(doc_id)
        snap = doc_ref.get()
        if snap.exists:
            data = snap.to_dict()
            print(f"Deleting duplicate document: {doc_id} ('{data.get('title')}')")
            doc_ref.delete()
            deleted_count += 1
        else:
            print(f"Document {doc_id} already does not exist.")

    print(f"Deleted {deleted_count} duplicate documents.")

    # Increment materials_version
    ver_ref = db.collection("materials_version").document("current")
    ver_ref.set({
        "version": firestore.Increment(1),
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)

    new_ver = ver_ref.get().to_dict().get("version")
    print(f"Cloud Firestore materials_version incremented to version {new_ver}.")

if __name__ == "__main__":
    cleanup_duplicates()
