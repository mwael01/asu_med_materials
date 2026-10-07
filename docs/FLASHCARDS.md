# Flashcards System Documentation

## Overview

The ASU Med Materials Flashcards system allows medicine students at Ain Shams University to study curriculum-aligned flashcards (imported from official ASU Anki decks) directly in the browser with full offline capability, responsive mobile experience, and private sync.

Decks are authored by the **ASU Anki Flashcards** team and organized hierarchically:
`Medical Subject > Unit > Chapter` (e.g., *Biochemistry > Unit 2 > Chapter 1*).

Students discover, filter, bookmark, and study flashcards directly from the curriculum module pages (`/module/[id]`) using the **Flashcards** filter chip in the resource toolbar, opening the interactive player (`/flashcards/[id]`) directly in the same tab.

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
- **`set-cors`**: Applies CORS rules to the Cloudflare R2 bucket `asumed` via `pnpm wrangler`.
- **`upload-media <archive_or_dir>`**: Extracts and uploads image assets directly to Cloudflare R2 (`asumed.eduvour.com`).
- **`link-images`**: Scans all cards in Firestore, rewrites relative image paths to Cloudflare R2, populates `media` metadata, and commits updates.
- **`cleanup <import_id>`**: Deletes draft cards and revisions for abandoned imports.

---

## 3. Media & Image Hosting (Cloudflare R2 & eduvour.com)

Flashcard image and diagram hosting is powered by **Cloudflare R2** and generously covered by **eduvour.com**.

- **R2 Bucket**: `asumed`
- **Public Domain**: `https://asumed.eduvour.com/`
- **Provider & Attribution**: Image hosting is sponsored and covered by **[eduvour.com](https://eduvour.com)** using Cloudflare R2 object storage.
- **CORS Configuration**: Stored in `cloudflare/r2-cors.json`. Configured using `pnpm exec wrangler r2 bucket cors set asumed --file cloudflare/r2-cors.json --force` (or `uv run --project scripts/flashcards flashcards set-cors`). Permitted origins include `https://asumedmaterials.vercel.app`, `https://asumed.eduvour.com`, and local development environments.

---

## 4. Study Player & On-Demand Image Caching

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

### On-Demand Image Caching Policy (`src/utils/flashcards/caching.ts`)
- **No Upfront Network Burden:** Background prefetching for the student's selected academic year (`prefetchYearFlashcards`) downloads only deck metadata, manifests, and card JSON into IndexedDB. **Image binary files are intentionally excluded from upfront prefetching** so they never slow down initial website loading or waste student bandwidth.
- **On-Demand Deck Open Caching:** When a student explicitly opens a deck in the study player (`/flashcards/[id]`), `cacheDeckImagesOnOpen(cards)` extracts all image URLs (from card `media` and HTML `<img>` tags) and asynchronously caches them into the `asumed-flashcard-media` Cache Storage.
- **Service Worker Interception:** The Service Worker (`public/sw.js`) intercepts all image requests directed to `https://asumed.eduvour.com` (and `.eduvour.com`), serving them offline from `asumed-flashcard-media` with network fallback and cache-put.

---

## 5. Admin Management (`/admin`)

The admin dashboard includes a dedicated **Flashcards** tab (`FlashcardsManager.astro`):
- Filter by Publication Status (All, Published, Draft) and Academic Year.
- Search decks by title, module, or subject.
- One-click Publish and Unpublish actions.
- Displays live card counts and metadata.
