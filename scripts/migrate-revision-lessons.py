#!/usr/bin/env python3
"""
Migration Script: Separate Respiratory Module Revision Lessons into:
  1. Practical Revisions (practical)
  2. Assessments & Formatives (assessments)
  3. Final Revisions (finals)

Steps:
  - Create the 23 new specific revision lesson documents in Firestore.
  - Reassign all 34 existing revision materials to their respective new lesson IDs.
  - Reassign the 2 practical flashcard deck documents in `flashcard_decks`.
  - Delete the 8 old catch-all `year2-resp-*-revisions` lessons from `lessons`.
  - Atomically increment `materials_version/current`.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root / "scripts" / "flashcards" / "src"))

from flashcards.firebase_store import get_db, write_documents
from google.cloud import firestore

SERVICE_ACCOUNT = project_root / "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json"

SUBJECTS = [
    ("Anatomy", "anatomy", True),
    ("Biochemistry", "biochem", True),
    ("Histology", "histo", True),
    ("Microbiology", "micro", True),
    ("Pathology", "patho", True),
    ("Pharmacology", "pharma", True),
    ("Physiology", "physio", True),
    ("Parasitology", "para", False),  # Parasitology has no practical exam at ASU
]

# Material reassignments: material_id -> new_lesson_id
MATERIAL_REASSIGNMENTS = {
    # Anatomy
    "resp-all-practical-labs-pdf": "year2-resp-anatomy-practical",
    "resp-anat-practical-abdullah": "year2-resp-anatomy-practical",
    "resp-anat-practical-kareem": "year2-resp-anatomy-practical",
    "flashcards-resp-practical-anatomy": "year2-resp-anatomy-practical",
    "resp-anat-sharepoint-revision": "year2-resp-anatomy-finals",
    "resp-anat-dr-adel-notes-pdf": "year2-resp-anatomy-finals",

    # Biochemistry
    "resp-bio-practical-hamdy": "year2-resp-biochem-practical",

    # Histology
    "resp-histo-practical-video": "year2-resp-histo-practical",
    "resp-histo-practical-guide-pdf": "year2-resp-histo-practical",
    "resp-histo-sharepoint-revision": "year2-resp-histo-finals",

    # Microbiology
    "resp-micro-practical-playlist": "year2-resp-micro-practical",
    "flashcards-resp-practical-microbiology": "year2-resp-micro-practical",
    "resp-micro-sharepoint-revision": "year2-resp-micro-finals",

    # Parasitology
    "resp-para-simba-main-hub": "year2-resp-para-finals",

    # Pathology
    "resp-patho-practical-jars-slides": "year2-resp-patho-practical",
    "resp-formatives-essay-pdf": "year2-resp-patho-assessments",
    "resp-patho-revision-radad": "year2-resp-patho-finals",
    "resp-patho-dept-book-pdf": "year2-resp-patho-finals",
    "resp-patho-sharepoint-revision": "year2-resp-patho-finals",
    "resp-essay-compilation-pdf": "year2-resp-patho-finals",

    # Pharmacology
    "resp-pharma-moodle-81649": "year2-resp-pharma-practical",
    "resp-pharma-moodle-87923": "year2-resp-pharma-practical",
    "resp-pharma-moodle-87926": "year2-resp-pharma-practical",
    "resp-pharma-practical-series": "year2-resp-pharma-practical",
    "resp-pharma-sharepoint-rev1": "year2-resp-pharma-finals",
    "resp-pharma-sharepoint-rev2": "year2-resp-pharma-finals",

    # Physiology
    "resp-clinical-practical": "year2-resp-physio-practical",
    "resp-physio-practical-video": "year2-resp-physio-practical",
    "resp-formatives-integrated-case-pdf": "year2-resp-physio-assessments",
    "resp-physio-sgd1-pdf": "year2-resp-physio-assessments",
    "resp-physio-sgd2-pdf": "year2-resp-physio-assessments",
    "resp-physio-crash-course-nahhas": "year2-resp-physio-finals",
    "resp-physio-sharepoint-rev1": "year2-resp-physio-finals",
    "resp-physio-sharepoint-rev2": "year2-resp-physio-finals",
}

OLD_REVISION_LESSONS = [
    "year2-resp-anatomy-revisions",
    "year2-resp-biochem-revisions",
    "year2-resp-histo-revisions",
    "year2-resp-micro-revisions",
    "year2-resp-para-revisions",
    "year2-resp-patho-revisions",
    "year2-resp-pharma-revisions",
    "year2-resp-physio-revisions",
]


def main():
    db = get_db(SERVICE_ACCOUNT)

    writes: list[tuple[str, dict[str, Any]]] = []

    # 1. Create new revision lessons
    print("Step 1: Generating separated revision lessons...")
    for subj_name, subj_slug, has_practical in SUBJECTS:
        # Practical (order: 97)
        if has_practical:
            prac_id = f"year2-resp-{subj_slug}-practical"
            writes.append((f"lessons/{prac_id}", {
                "id": prac_id,
                "title": "Practical Revisions",
                "moduleId": "year2-respiratory",
                "subject": subj_name,
                "order": 97,
                "active": True,
                "isRevision": True,
                "revisionType": "practical",
            }))

        # Assessments & Formatives (order: 98)
        assess_id = f"year2-resp-{subj_slug}-assessments"
        writes.append((f"lessons/{assess_id}", {
            "id": assess_id,
            "title": "Assessments & Formatives",
            "moduleId": "year2-respiratory",
            "subject": subj_name,
            "order": 98,
            "active": True,
            "isRevision": True,
            "revisionType": "assessment",
        }))

        # Finals (order: 99)
        final_id = f"year2-resp-{subj_slug}-finals"
        writes.append((f"lessons/{final_id}", {
            "id": final_id,
            "title": "Final Revisions",
            "moduleId": "year2-respiratory",
            "subject": subj_name,
            "order": 99,
            "active": True,
            "isRevision": True,
            "revisionType": "final",
        }))

    print(f"Created {len(writes)} new revision lesson definitions.")

    # 2. Reassign materials
    print("\nStep 2: Preparing material reassignments...")
    for mat_id, new_lesson_id in MATERIAL_REASSIGNMENTS.items():
        writes.append((f"materials/{mat_id}", {
            "lessonId": new_lesson_id,
        }))

    # 3. Update practical flashcard decks
    print("\nStep 3: Preparing practical flashcard deck reassignments...")
    writes.append(("flashcard_decks/resp-practical-anatomy", {
        "lessonId": "year2-resp-anatomy-practical",
    }))
    writes.append(("flashcard_decks/resp-practical-microbiology", {
        "lessonId": "year2-resp-micro-practical",
    }))

    # 4. Commit batched writes
    print(f"\nStep 4: Committing {len(writes)} document updates to Firestore...")
    write_documents(db, writes, batch_size=200)

    # 5. Delete old revision lessons
    print("\nStep 5: Deleting old combined revision lessons...")
    del_batch = db.batch()
    for old_id in OLD_REVISION_LESSONS:
        del_batch.delete(db.collection("lessons").document(old_id))
    del_batch.commit()
    print(f"Deleted {len(OLD_REVISION_LESSONS)} old revision lessons.")

    # 6. Atomically increment materials_version/current
    print("\nStep 6: Incrementing materials_version/current in Firestore...")
    ver_ref = db.collection("materials_version").document("current")
    ver_ref.set({
        "version": firestore.Increment(1),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    print("\n🎉 Revision lesson migration completed successfully!")


if __name__ == "__main__":
    main()
