#!/usr/bin/env python3
"""
Import script for ASU Year 2 Respiratory Module Anki flashcards.

Extracts cards and media from:
  1. ASU__Year 2__Semester 1__Respiratory.apkg (3,006 cards, 43 decks)
  2. 1st Semester _ 2nd Year ASU__Respiratory Module (Practical).apkg (218 cards, 2 decks)

Uploads 854 media assets to Cloudflare R2 bucket `asumed` (https://asumed.eduvour.com/)
and publishes decks, revisions, cards, and materials directly into Cloud Firestore
with 100% verified lesson links (lessonId) for module `year2-respiratory`.
"""

from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import sys
from pathlib import Path
from typing import Any

# Ensure flashcards package is on Python module search path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root / "scripts" / "flashcards" / "src"))

from flashcards.anki_adapter import read_source_cards
from flashcards.archive import extract_collection, validate_archive
from flashcards.firebase_store import get_db, now_iso, write_documents
from flashcards.r2_storage import upload_files_to_r2
from flashcards.render import rewrite_media_urls
from google.cloud import firestore

# Verified mapping for all 45 Respiratory module decks
RESPIRATORY_DECK_MAPPINGS: dict[str, dict[str, str]] = {
    "Unit_1::Ch1::Anatomy": {
        "title": "Unit 1: Ch1 - Anatomy (Nose & Paranasal Sinuses)",
        "subject": "Anatomy",
        "lessonId": "year2-resp-anat-nose-paranasal-sinuses",
        "unit": "Unit 1",
        "chapter": "Ch1",
        "deckId": "resp-unit-1-ch1-anatomy",
    },
    "Unit_1::Ch1::Histology": {
        "title": "Unit 1: Ch1 - Histology (Nose & Paranasal Sinuses)",
        "subject": "Histology",
        "lessonId": "year2-resp-histo-nose-paranasal-sinuses",
        "unit": "Unit 1",
        "chapter": "Ch1",
        "deckId": "resp-unit-1-ch1-histology",
    },
    "Unit_1::Ch2": {
        "title": "Unit 1: Ch2 - Pathology (Upper Respiratory Tract Diseases)",
        "subject": "Pathology",
        "lessonId": "year2-resp-patho-urtd",
        "unit": "Unit 1",
        "chapter": "Ch2",
        "deckId": "resp-unit-1-ch2-pathology",
    },
    "Unit_2::Ch1::Anatomy": {
        "title": "Unit 2: Ch1 - Anatomy (Larynx & Trachea)",
        "subject": "Anatomy",
        "lessonId": "year2-resp-anat-larynx-trachea",
        "unit": "Unit 2",
        "chapter": "Ch1",
        "deckId": "resp-unit-2-ch1-anatomy",
    },
    "Unit_2::Ch1::Histology": {
        "title": "Unit 2: Ch1 - Histology (Larynx & Trachea)",
        "subject": "Histology",
        "lessonId": "year2-resp-histo-larynx-trachea",
        "unit": "Unit 2",
        "chapter": "Ch1",
        "deckId": "resp-unit-2-ch1-histology",
    },
    "Unit_2::Ch2::Anatomy": {
        "title": "Unit 2: Ch2 - Anatomy (Thoracic Wall & Cage)",
        "subject": "Anatomy",
        "lessonId": "year2-resp-anat-thoracic-wall",
        "unit": "Unit 2",
        "chapter": "Ch2",
        "deckId": "resp-unit-2-ch2-anatomy",
    },
    "Unit_2::Ch3::Anatomy": {
        "title": "Unit 2: Ch3 - Anatomy (Pleura)",
        "subject": "Anatomy",
        "lessonId": "year2-resp-anat-pleura",
        "unit": "Unit 2",
        "chapter": "Ch3",
        "deckId": "resp-unit-2-ch3-anatomy",
    },
    "Unit_2::Ch4::pathology": {
        "title": "Unit 2: Ch4 - Pathology (Pleural Diseases)",
        "subject": "Pathology",
        "lessonId": "year2-resp-patho-pleural-diseases",
        "unit": "Unit 2",
        "chapter": "Ch4",
        "deckId": "resp-unit-2-ch4-pathology",
    },
    "Unit_3": {
        "title": "Unit 3 - Anatomy (Respiratory Embryology & Development)",
        "subject": "Anatomy",
        "lessonId": "year2-resp-anat-respiratory-development",
        "unit": "Unit 3",
        "chapter": "Development",
        "deckId": "resp-unit-3-development",
    },
    "Unit_4::Physiology::Air_resistance": {
        "title": "Unit 4: Physiology - Airway Resistance",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-airway-resistance",
        "unit": "Unit 4",
        "chapter": "Airway Resistance",
        "deckId": "resp-unit-4-physio-air-resistance",
    },
    "Unit_4::Physiology::Elastic_behavior_of_lung": {
        "title": "Unit 4: Physiology - Elastic Behavior of Lung & Surfactant",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-elastic-behavior-surfactant",
        "unit": "Unit 4",
        "chapter": "Elastic Behavior",
        "deckId": "resp-unit-4-physio-elastic-behavior",
    },
    "Unit_4::Physiology::Function_of_respiratory_system": {
        "title": "Unit 4: Physiology - Mechanics of Breathing & Functions",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-mechanics-breathing",
        "unit": "Unit 4",
        "chapter": "Mechanics",
        "deckId": "resp-unit-4-physio-function",
    },
    "Unit_4::Physiology::Lung_volumes": {
        "title": "Unit 4: Physiology - Lung Volumes & Capacities",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-lung-volumes-capacities",
        "unit": "Unit 4",
        "chapter": "Lung Volumes",
        "deckId": "resp-unit-4-physio-lung-volumes",
    },
    "Unit_5::Pathology": {
        "title": "Unit 5: Pathology - Atelectasis, ARDS & Obstructive Lung Diseases",
        "subject": "Pathology",
        "lessonId": "year2-resp-patho-atelectasis-ards",
        "unit": "Unit 5",
        "chapter": "Pathology",
        "deckId": "resp-unit-5-pathology",
    },
    "Unit_5::Pharma": {
        "title": "Unit 5: Pharmacology - Drug Therapy for Bronchial Asthma",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-bronchial-asthma",
        "unit": "Unit 5",
        "chapter": "Asthma Therapy",
        "deckId": "resp-unit-5-pharma-asthma",
    },
    "Unit_6::Biochem::cellular_respiration": {
        "title": "Unit 6: Biochemistry - Glucose Oxidation & Shuttles",
        "subject": "Biochemistry",
        "lessonId": "year2-resp-biochem-glucose-oxidation",
        "unit": "Unit 6",
        "chapter": "Glucose Oxidation",
        "deckId": "resp-unit-6-biochem-cellular-respiration",
    },
    "Unit_6::Biochem::Krebs_cycle": {
        "title": "Unit 6: Biochemistry - Krebs Cycle",
        "subject": "Biochemistry",
        "lessonId": "year2-resp-biochem-krebs-cycle-1-2",
        "unit": "Unit 6",
        "chapter": "Krebs Cycle",
        "deckId": "resp-unit-6-biochem-krebs-cycle",
    },
    "Unit_6::Biochem::molecular_basis_for_lung_disease": {
        "title": "Unit 6: Biochemistry - Molecular Basis for Lung Disease",
        "subject": "Biochemistry",
        "lessonId": "year2-resp-biochem-krebs-molecular-basis",
        "unit": "Unit 6",
        "chapter": "Molecular Basis",
        "deckId": "resp-unit-6-biochem-molecular-basis",
    },
    "Unit_6::Biochem::Oxidative_phosphorylation": {
        "title": "Unit 6: Biochemistry - Biological Oxidation & ETC",
        "subject": "Biochemistry",
        "lessonId": "year2-resp-biochem-biological-oxidation",
        "unit": "Unit 6",
        "chapter": "Biological Oxidation",
        "deckId": "resp-unit-6-biochem-oxidative-phosphorylation",
    },
    "Unit_6::Biochem::Phospholipid_metabolism": {
        "title": "Unit 6: Biochemistry - Phospholipid Metabolism & Lung Surfactant",
        "subject": "Biochemistry",
        "lessonId": "year2-resp-biochem-phospholipid-metabolism",
        "unit": "Unit 6",
        "chapter": "Phospholipids",
        "deckId": "resp-unit-6-biochem-phospholipid-metabolism",
    },
    "Unit_8::Parasitic_lung_diseases::House_dust_mite": {
        "title": "Unit 8: Parasitology - House Dust Mite",
        "subject": "Parasitology",
        "lessonId": "year2-resp-para-mites-loefflers",
        "unit": "Unit 8",
        "chapter": "House Dust Mite",
        "deckId": "resp-unit-8-para-house-dust-mite",
    },
    "Unit_8::Parasitic_lung_diseases::Loeffler's_syndrome": {
        "title": "Unit 8: Parasitology - Loeffler's Syndrome",
        "subject": "Parasitology",
        "lessonId": "year2-resp-para-mites-loefflers",
        "unit": "Unit 8",
        "chapter": "Loeffler's Syndrome",
        "deckId": "resp-unit-8-para-loefflers-syndrome",
    },
    "Unit_8::Parasitic_lung_diseases::pragonimus_wesremani": {
        "title": "Unit 8: Parasitology - Paragonimus Westermani",
        "subject": "Parasitology",
        "lessonId": "year2-resp-para-paragonimus-westermani",
        "unit": "Unit 8",
        "chapter": "Paragonimus",
        "deckId": "resp-unit-8-para-paragonimus-westermani",
    },
    "Unit_8::TB_(micro&patho)": {
        "title": "Unit 8: Microbiology & Pathology - Tuberculosis (TB)",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-tb",
        "unit": "Unit 8",
        "chapter": "Tuberculosis",
        "deckId": "resp-unit-8-micro-tb",
    },
    "Unit_8::TB_(pharma)": {
        "title": "Unit 8: Pharmacology - Drugs for Tuberculosis (TB)",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-drugs-of-tb",
        "unit": "Unit 8",
        "chapter": "TB Drugs",
        "deckId": "resp-unit-8-pharma-tb",
    },
    "Unit_8::lung_fungal_infections_(micro)": {
        "title": "Unit 8: Microbiology - Lung Fungal Infections",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-fungal-infections",
        "unit": "Unit 8",
        "chapter": "Fungal Infections",
        "deckId": "resp-unit-8-micro-fungal-infections",
    },
    "Unit_8::mico::whooping_cough": {
        "title": "Unit 8: Microbiology - Whooping Cough (Pertussis)",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-whooping-cough-bronchitis",
        "unit": "Unit 8",
        "chapter": "Whooping Cough",
        "deckId": "resp-unit-8-micro-whooping-cough",
    },
    "Unit_8::pneumonia(micro)::Atypical_(bacterial)": {
        "title": "Unit 8: Microbiology - Atypical Bacterial Pneumonia",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-atypical-pneumonia",
        "unit": "Unit 8",
        "chapter": "Atypical Bacterial",
        "deckId": "resp-unit-8-micro-pneumonia-atypical-bacterial",
    },
    "Unit_8::pneumonia(micro)::Atypical_(viral)": {
        "title": "Unit 8: Microbiology - Atypical Viral Pneumonia",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-atypical-pneumonia",
        "unit": "Unit 8",
        "chapter": "Atypical Viral",
        "deckId": "resp-unit-8-micro-pneumonia-atypical-viral",
    },
    "Unit_8::pneumonia(micro)::Typical": {
        "title": "Unit 8: Microbiology - Typical Community-Acquired Pneumonia",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-pneumonia",
        "unit": "Unit 8",
        "chapter": "Typical Pneumonia",
        "deckId": "resp-unit-8-micro-pneumonia-typical",
    },
    "Unit_8::pneumonia(patho)": {
        "title": "Unit 8: Pathology - Pneumonia & Lung Infections",
        "subject": "Pathology",
        "lessonId": "year2-resp-patho-lung-infections",
        "unit": "Unit 8",
        "chapter": "Pneumonia Pathology",
        "deckId": "resp-unit-8-patho-pneumonia",
    },
    "Unit_9::Pharma::1_pharyngitis": {
        "title": "Unit 9: Pharmacology - Pharyngitis Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-1-2",
        "unit": "Unit 9",
        "chapter": "Pharyngitis",
        "deckId": "resp-unit-9-pharma-pharyngitis",
    },
    "Unit_9::Pharma::2_diphtheria": {
        "title": "Unit 9: Pharmacology - Diphtheria Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-1-2",
        "unit": "Unit 9",
        "chapter": "Diphtheria",
        "deckId": "resp-unit-9-pharma-diphtheria",
    },
    "Unit_9::Pharma::3_otitis_media": {
        "title": "Unit 9: Pharmacology - Otitis Media Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-1-2",
        "unit": "Unit 9",
        "chapter": "Otitis Media",
        "deckId": "resp-unit-9-pharma-otitis-media",
    },
    "Unit_9::Pharma::4_sinusitis": {
        "title": "Unit 9: Pharmacology - Sinusitis Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-1-2",
        "unit": "Unit 9",
        "chapter": "Sinusitis",
        "deckId": "resp-unit-9-pharma-sinusitis",
    },
    "Unit_9::Pharma::5_bronchitis": {
        "title": "Unit 9: Pharmacology - Bronchitis Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-3",
        "unit": "Unit 9",
        "chapter": "Bronchitis",
        "deckId": "resp-unit-9-pharma-bronchitis",
    },
    "Unit_9::Pharma::6_bronchiolitis": {
        "title": "Unit 9: Pharmacology - Bronchiolitis Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-3",
        "unit": "Unit 9",
        "chapter": "Bronchiolitis",
        "deckId": "resp-unit-9-pharma-bronchiolitis",
    },
    "Unit_9::Pharma::7_pneumonia": {
        "title": "Unit 9: Pharmacology - Pneumonia Treatment",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-treatment-infection-3",
        "unit": "Unit 9",
        "chapter": "Pneumonia",
        "deckId": "resp-unit-9-pharma-pneumonia",
    },
    "Unit_9::Pharma::8_Cough": {
        "title": "Unit 9: Pharmacology - Drug Therapy of Cough",
        "subject": "Pharmacology",
        "lessonId": "year2-resp-pharm-drug-therapy-cough",
        "unit": "Unit 9",
        "chapter": "Cough Therapy",
        "deckId": "resp-unit-9-pharma-cough",
    },
    "Unit_10::lung_tumors": {
        "title": "Unit 10: Pathology - Lung Tumors",
        "subject": "Pathology",
        "lessonId": "year2-resp-patho-lung-tumors-1",
        "unit": "Unit 10",
        "chapter": "Lung Tumors",
        "deckId": "resp-unit-10-patho-lung-tumors",
    },
    "Unit_11::Chemical/non-chemical_control_of_breathing": {
        "title": "Unit 11: Physiology - Chemical & Non-chemical Control of Breathing",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-regulation-respiration",
        "unit": "Unit 11",
        "chapter": "Chemical Control",
        "deckId": "resp-unit-11-physio-chemical-control",
    },
    "Unit_11::Effects_of_excercise&altitude_on_ventilation": {
        "title": "Unit 11: Physiology - Effects of Exercise & High Altitude on Respiration",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-exercise-altitude",
        "unit": "Unit 11",
        "chapter": "Exercise & Altitude",
        "deckId": "resp-unit-11-physio-exercise-altitude",
    },
    "Unit_11::Neural_control_of_breathing": {
        "title": "Unit 11: Physiology - Neural Control of Breathing",
        "subject": "Physiology",
        "lessonId": "year2-resp-physio-neural-control",
        "unit": "Unit 11",
        "chapter": "Neural Control",
        "deckId": "resp-unit-11-physio-neural-control",
    },
    "Respiratory Module (Practical)::Anatomy": {
        "title": "Respiratory Module (Practical) - Anatomy",
        "subject": "Anatomy",
        "lessonId": "year2-resp-anatomy-practical",
        "unit": "Practical",
        "chapter": "Anatomy Practical",
        "deckId": "resp-practical-anatomy",
    },
    "Respiratory Module (Practical)::Microbiology": {
        "title": "Respiratory Module (Practical) - Microbiology",
        "subject": "Microbiology",
        "lessonId": "year2-resp-micro-practical",
        "unit": "Practical",
        "chapter": "Microbiology Practical",
        "deckId": "resp-practical-microbiology",
    },
}


def resolve_mapping(deck_path: str) -> dict[str, str] | None:
    for key, val in RESPIRATORY_DECK_MAPPINGS.items():
        if deck_path.endswith(key) or key in deck_path:
            return val
    return None


def card_id(source_id: str, note_guid: str, template_ord: int, cloze_ord: int | None = 0) -> str:
    cloze = cloze_ord if cloze_ord is not None else 0
    raw = f"{source_id}:{note_guid}:{template_ord}:{cloze}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def main():
    service_account_path = project_root / "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json"
    if not service_account_path.exists():
        print(f"Error: Service account {service_account_path} not found.")
        sys.exit(1)

    theory_archive = project_root / "ASU__Year 2__Semester 1__Respiratory.apkg"
    practical_archive = project_root / "1st Semester _ 2nd Year ASU__Respiratory Module (Practical).apkg"

    if not theory_archive.exists() or not practical_archive.exists():
        print(f"Error: Missing input Anki archives.")
        sys.exit(1)

    print("Step 1: Extracting media assets for Cloudflare R2 upload...")
    all_media_files: list[Path] = []
    temp_dirs = []

    for archive in (theory_archive, practical_archive):
        td = extract_collection(archive)
        temp_dirs.append(td)
        media_dir = Path(td.name) / "media"
        if media_dir.exists():
            for p in media_dir.iterdir():
                if p.is_file():
                    all_media_files.append(p)

    print(f"Found {len(all_media_files)} media files across both packages.")

    print("\nStep 2: Uploading media files to Cloudflare R2 bucket 'asumed' (https://asumed.eduvour.com/)...")
    uploaded_media = upload_files_to_r2(
        all_media_files,
        bucket="asumed",
        public_domain="https://asumed.eduvour.com",
        max_workers=8,
    )
    print(f"Uploaded/Verified {len(uploaded_media)} media files on Cloudflare R2.")

    print("\nStep 3: Initializing Cloud Firestore connection...")
    db = get_db(service_account_path)
    now = now_iso()

    total_decks_processed = 0
    total_cards_processed = 0
    all_firestore_writes: list[tuple[str, dict[str, Any]]] = []

    archives_to_process = [
        (theory_archive, "theory"),
        (practical_archive, "practical"),
    ]

    for archive, mode in archives_to_process:
        print(f"\nProcessing {archive.name} ({mode})...")
        info = validate_archive(archive)
        source_id = f"anki:{info.sha256[:24]}"
        revision_id = f"rev_{info.sha256[:16]}"
        import_id = f"import_{info.sha256[:16]}"

        _, cards = read_source_cards(archive)

        # Group cards by deck path
        grouped: dict[str, list[Any]] = {}
        for c in cards:
            grouped.setdefault(c.deck_path, []).append(c)

        import_deck_ids: list[str] = []
        pkg_card_count = 0

        for deck_path, deck_cards in sorted(grouped.items()):
            mapping = resolve_mapping(deck_path)
            if not mapping:
                print(f"  [ERROR] Unmapped deck path: {deck_path}")
                sys.exit(1)

            deck_id = mapping["deckId"]
            import_deck_ids.append(deck_id)
            title = mapping["title"]
            subject = mapping["subject"]
            lesson_id = mapping["lessonId"]
            unit = mapping["unit"]
            chapter = mapping["chapter"]
            card_count = len(deck_cards)
            pkg_card_count += card_count
            total_cards_processed += card_count
            total_decks_processed += 1

            deck_ref = f"flashcard_decks/{deck_id}"
            revision_ref = f"{deck_ref}/revisions/{revision_id}"
            material_ref = f"materials/flashcards-{deck_id}"

            # 1. Deck document
            all_firestore_writes.append((deck_ref, {
                "id": deck_id,
                "title": title,
                "sourceTitle": archive.stem.replace("__", " · "),
                "year": 2,
                "semester": 1,
                "moduleId": "year2-respiratory",
                "subject": subject,
                "lessonId": lesson_id,
                "unit": unit,
                "chapter": chapter,
                "author": "ASU Anki Flashcards",
                "tags": ["anki", "year-2", "year2-respiratory", subject.lower(), unit.lower()],
                "cardCount": card_count,
                "publicationStatus": "published",
                "activeRevisionId": revision_id,
                "sourceId": source_id,
                "sourceSha256": info.sha256,
                "sourceDeckPath": deck_path,
                "createdAt": now,
                "updatedAt": now,
            }))

            # 2. Revision document
            all_firestore_writes.append((revision_ref, {
                "id": revision_id,
                "deckId": deck_id,
                "status": "published",
                "cardCount": card_count,
                "sourceSha256": info.sha256,
                "sourceId": source_id,
                "complete": True,
                "publishedAt": now,
                "createdAt": now,
            }))

            # 3. Linked Material document
            all_firestore_writes.append((material_ref, {
                "id": f"flashcards-{deck_id}",
                "title": title,
                "titleEn": title,
                "description": f"Interactive flashcard study deck for {title} ({card_count} cards).",
                "descriptionEn": f"Interactive flashcard study deck for {title} ({card_count} cards).",
                "url": f"/flashcards/{deck_id}",
                "type": "flashcards",
                "category": "flashcards",
                "year": 2,
                "semester": 1,
                "moduleId": "year2-respiratory",
                "subject": subject,
                "lessonId": lesson_id,
                "unit": unit,
                "chapter": chapter,
                "author": "ASU Anki Flashcards",
                "tags": ["flashcards", "anki", "year2-respiratory", subject.lower(), unit.lower()],
                "flashcardDeckId": deck_id,
                "createdAt": now,
                "updatedAt": now,
            }))

            # 4. Individual Card documents
            for ordinal, card in enumerate(deck_cards):
                cid = card_id(source_id, card.note_guid, card.template_ordinal, card.cloze_ordinal)

                # Rewrite media URLs to point to Cloudflare R2
                rewritten_q = rewrite_media_urls(card.rendered.question_html)
                rewritten_a = rewrite_media_urls(card.rendered.answer_html)

                content_raw = rewritten_q + "\n" + rewritten_a
                content_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()

                card_media = []
                img_src_regex = re.compile(r'(\bsrc\s*=\s*)["\']([^"\']+)["\']', re.IGNORECASE)
                seen_urls = set()
                for part in (rewritten_q, rewritten_a):
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
                    "id": cid,
                    "deckId": deck_id,
                    "revisionId": revision_id,
                    "ordinal": ordinal,
                    "kind": kind,
                    "questionHtml": rewritten_q,
                    "answerHtml": rewritten_a,
                    "media": card_media,
                    "sourceNoteGuid": card.note_guid,
                    "sourceTemplateOrdinal": card.template_ordinal,
                    "sourceDeckPath": deck_path,
                    "contentHash": content_hash,
                    "quarantined": card.rendered.quarantined,
                    "quarantineReason": card.rendered.quarantine_reason,
                    "createdAt": now,
                }
                all_firestore_writes.append((f"{revision_ref}/cards/{cid}", card_payload))

            print(f"  ✓ [{subject}] {title} ({card_count} cards) -> lessonId: {lesson_id}")

        # 5. Import document
        all_firestore_writes.append((f"flashcard_imports/{import_id}", {
            "id": import_id,
            "sourceId": source_id,
            "sourceSha256": info.sha256,
            "deckIds": import_deck_ids,
            "deckCount": len(import_deck_ids),
            "cardCount": pkg_card_count,
            "status": "published",
            "publishedAt": now,
            "createdAt": now,
            "updatedAt": now,
        }))

    print(f"\nStep 4: Committing {len(all_firestore_writes)} documents to Cloud Firestore in batches of 200...")
    write_documents(db, all_firestore_writes, batch_size=200)

    print("\nStep 5: Atomically incrementing materials_version/current in Firestore...")
    version_ref = db.collection("materials_version").document("current")
    version_ref.set({
        "version": firestore.Increment(1),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    # Cleanup temporary directories
    for td in temp_dirs:
        td.cleanup()

    print(f"\n🎉 Successfully imported {total_decks_processed} decks and {total_cards_processed} cards into Year 2 Respiratory module!")
    print(f"   Decks written to `flashcard_decks` and linked to `materials` with direct `lessonId` bindings.")


if __name__ == "__main__":
    main()
