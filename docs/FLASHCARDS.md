# Flashcards System Documentation

## Overview

The ASU Med Materials Flashcards system allows medicine students at Ain Shams University to study curriculum-aligned flashcards (imported from official ASU Anki decks) directly in the browser with full offline capability, responsive mobile experience, and private sync.

Decks are authored by the **ASU Anki Flashcards** team and organized hierarchically:
`Medical Subject > Unit > Chapter` (e.g., *Biochemistry > Unit 2 > Chapter 1*).

---

## 1. Architecture & Single Source of Truth

As per project guidelines, Cloud Firestore is the single source of truth for all decks, cards, manifests, and materials. No local JSON material stores are used.

### Firestore Collections

| Collection Path | Purpose | Security Rules |
|---|---|---|
| `flashcard_decks/{deckId}` | Deck metadata: title, subject, unit, chapter, author, card count, publication status, active revision | Public read if `published`; admin write |
| `flashcard_decks/{deckId}/revisions/{revId}` | Immutable revision manifest | Public read if `published`; admin write |
| `flashcard_decks/{deckId}/revisions/{revId}/cards/{cardId}` | Individual card content (questionHtml, answerHtml, kind, hash) | Public read if parent revision is published; admin write |
| `flashcard_imports/{importId}` | Import job state, findings, deck IDs, audit trail | Admin only |
| `users/{uid}/flashcard_progress/{deckId}` | Private student study progress (ratings, queue state, checkpoint) | Owner only read/write |
| `materials/{materialId}` | Linked material record (category: `flashcards`, author: `ASU Anki Flashcards`) | Public read; admin write |

---

## 2. Python CLI Importer (`scripts/flashcards/`)

The importer is managed using `uv` and uses Anki's official `Collection` API, PyMuPDF/nh3 HTML sanitizers, and the Firebase Admin SDK.

### Commands

Run commands with:
```bash
uv run --project scripts/flashcards flashcards <command> [args]
```

- **`inspect <archive.apkg>`**: Inspects an Anki archive without writing anything to Firestore. Outputs card counts, note types, and proposed subject/unit/chapter classifications.
- **`stage <archive.apkg>`**: Imports cards, sanitizes HTML, classifies hierarchy (`Subject > Unit > Chapter`), and writes drafts to Firestore in bounded batches (400 docs per commit).
- **`review [import_id]`**: Lists imports and any unresolved classifications or quarantine findings.
- **`classify <deck_id> --module <mod> --subject <subj> --year <y>`**: Manually assigns or overrides classification for a deck.
- **`validate <import_id>`**: Validates that all decks have assigned subjects, modules, and error-free renders before publication.
- **`publish <import_id>`**: Atomically marks decks and revisions as `published`, and generates linked entries in `materials` with `author: "ASU Anki Flashcards"`.
- **`cleanup <import_id>`**: Deletes draft cards and revisions for abandoned imports.

---

## 3. Study Player & Offline Caching

### Study Player (`/flashcards/[id]`)
- **Loop:** Simple **Reveal → Again / Known** flow without complex SRS algorithms.
- **Queue:** Cards are studied in source ordinal order. Cards marked "Again" return to the queue for a second pass until all cards are known.
- **Keyboard Shortcuts:**
  - `Space`: Reveal answer
  - `1`: Again (repeat card)
  - `2`: Known (mark card as memorized)
- **Transitions:** 150ms opacity/slide transition, zero layout jumps, accessible contrast, and text direction detection (RTL/LTR) based on card content.

### Client-Side Persistence (`IndexedDB`)
- **Database:** `asumed_flashcards_db` (version 1)
- **Stores:** `progress`, `decks`, `cards`, `manifests`.
- **Guest / Auth Sync:** Guests save progress locally; upon login, guest progress is safely merged into the user's private Firestore checkpoint (`users/{uid}/flashcard_progress/{deckId}`).

### Background Prefetching (`src/utils/flashcards/caching.ts`)
- Automatically caches published decks and card revisions for the student's selected academic year in IndexedDB.
- Bounded concurrency limit: **4 parallel requests**.
- Automatically cancels prefetching when the student switches their academic year.
- Service Worker (`public/sw.js`) caches the `/flashcards` app shell and media for offline study.

---

## 4. Admin Management (`/admin`)

The admin dashboard includes a dedicated **Flashcards** tab (`FlashcardsManager.astro`):
- Filter by Publication Status (All, Published, Draft) and Academic Year.
- Search decks by title, module, or subject.
- One-click Publish and Unpublish actions.
- Displays live card counts and metadata.
