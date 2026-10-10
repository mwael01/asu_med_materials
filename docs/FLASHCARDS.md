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
- **Loop:** Clean **Reveal → Again / Known** study flow without complex SRS burden.
- **Queue & Deduplication:** Eligible cards start in canonical source ordinal order, deduplicated by card ID and `(sourceNoteGuid, sourceTemplateOrdinal)`, with quarantined cards excluded. The queue contains each pending card once. **Again** moves the current card to the end without duplicating it; **Known** removes it. Even a single remaining Again card stays pending and returns with its answer and hint hidden.
- **Completion & Progress:** The counter shows Known cards out of the eligible deck total, with percentage `known / total`. Again does not advance progress or change the total. An unfinished deck never rounds up to 100%; completion requires every eligible card to be Known. Empty decks show an empty state at 0%. **Reset** and **Review again** both start a fresh saved pass from zero, incrementing the reset generation and restoring source order.
- **Visual Design & Centering:** Modern, elevated 3D card presentation with subtle borders, dark/light theme adaptation, and centered card typography (`text-center`) for questions, answers, and medical diagrams.
- **Direct Image Rendering & Deduplication:** Card images hosted on Cloudflare R2 (`asumed.eduvour.com`) load eagerly with responsive containment, smooth shadow frames, and click-to-zoom modal lightbox (`ImageViewer.astro`). Duplicate images between Question and Answer are automatically stripped so diagrams are retained cleanly on the question side and never repeated in the answer section.
- **Image Occlusion Cards Support:**
  - **Pixel-Accurate CSS Overlay:** `#io-wrapper` aligns `#io-overlay` masks precisely over the base diagram (`#io-original`) across mobile, tablet, and desktop viewports.
  - **Automatic Answer Reveal:** When revealing the card, the occluding top mask (`#io-overlay`) is automatically hidden, uncovering what was under the box directly on the diagram without cluttering the answer section below.
  - **Interactive Mask Toggle:** Students can toggle the mask back on/off anytime by tapping the diagram directly or clicking the `إظهار القناع / Show Mask` control button.
  - **Anki Template Cleanliness:** Duplicate `#io-wrapper` structures in the answer are stripped while preserving extra clinical notes (`#io-extra`), and dead Anki buttons (`io-revl-btn`, `Toggle Masks`) are eliminated.
- **Interactive Hints:** Cards with hints feature a clean `💡 إظهار التلميح` pill button that reveals the hint with smooth fade/slide animation, while dead or empty Anki hint boilerplate is cleanly stripped.
- **Touch Screen Gestures:**
  - **Tap to Reveal:** Tapping the card stage when unrevealed triggers the answer reveal with smooth animation.
  - **Toss on Either Side:** When revealed, students can drag and toss cards horizontally:
    - **Toss Right (Known):** Reveals an emerald green side shade with an "أعرفها ✓" badge; releasing past the threshold marks the card as known and advances.
    - **Toss Left (Again):** Reveals a pale red side shade with an "أعد البطاقة ↺" badge; releasing past the threshold repeats the card.
    - **Spring Return:** Releasing before the threshold smoothly springs the card back to center without advancing.
- **Desktop Keyboard Accessibility:**
  - `Space` or `↑` (Up Arrow): Reveal answer
  - `→` (Right Arrow) or `2`: Known (answered correctly / memorized)
  - `←` (Left Arrow) or `1`: Again (answered incorrectly / repeat card)
- **Animated Progress Bar:** The existing header counter and gradient progress bar (`emerald → teal → cyan`) track Known-card completion, including after reopening, pausing, or switching languages.

### Client-Side Persistence (`IndexedDB`)
- **Database:** `asumed_flashcards_db` (version 2); Firestore remains the authoritative data source and IndexedDB provides the existing offline cache.
- **Stores:** `progress`, `decks`, `cards`, `manifests`, `checkpoints`.
- **Saved Queue:** Progress snapshots include per-card ratings and optional `pendingCardIds`, ordered with the next card first. Each accepted rating saves both together. Reopening retains the exact pending order, removes duplicate/ineligible/Known IDs, and appends missing pending cards in source order (unseen before Again). Changed content hashes or reset generations invalidate older ratings. Legacy `checkpointIndex` is ignored and written as zero, so old progress resumes without skipping pending cards or requiring a bulk migration.
- **Cloud Selection & Writes:** Authenticated online loads select the local/cloud snapshot by reset generation first, then timestamp, before starting the player. Cloud reads fall back to local progress on failure or after five seconds; late reads cannot overwrite the active session. Cache transactions complete before a save resolves. Local and cloud writes are serialized separately per user/deck, so cloud sync cannot block offline study. Cloud sync failures retain the local snapshot; this flow does not introduce a background retry service.
- **Guest Merge:** The guest-merge helper preserves user ratings on conflicts and the user's pending order, then adds guest-only pending IDs. The review engine reconciles the merged queue with the actual deck when opened.

### Regression checks

Run `npm run test:flashcards` for queue/progress, persistence, player integration, gesture, and animation regressions. The player integration suite runs the real player against a simulated DOM and storage, including button/keyboard/gesture ratings, one-card Again presentation, pause/language changes, and fresh saved passes. Run `npm run astro -- check` and `npm run build` after player changes.

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
