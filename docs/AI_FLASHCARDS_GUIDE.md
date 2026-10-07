# AI Agent Guide: Direct Flashcards Upload & Management

> **Target Audience:** Autonomous AI coding agents working on `asu_med_materials`.  
> **Purpose:** Step-by-step instructions, architectural invariants, code recipes, and CLI commands for processing, sanitizing, hosting media for, and uploading Anki flashcards directly to Cloud Firestore.

---

## 1. Core Invariants & Rules

1. **Single Source of Truth (Cloud Firestore):**
   - All flashcard decks, card documents, revisions, and curriculum material entries live directly in **Cloud Firestore**.
   - **NEVER** save, create, or read local JSON files or local mock data for materials.
2. **Media Hosting (Cloudflare R2 via eduvour.com):**
   - Media binaries (images, diagrams, audio) must **NEVER** be committed to git or stored locally in `public/`.
   - Media assets must be uploaded to Cloudflare R2 bucket `asumed` served via custom domain `https://asumed.eduvour.com/`.
   - Image hosting is covered and sponsored by **[eduvour.com](https://eduvour.com)**. Maintain this attribution in docs.
   - Images are cached **on-demand** when a student opens a deck in the study player. Do not prefetch media binaries upfront to save student bandwidth.
3. **Firestore Batch Limits:**
   - Firestore batches strictly enforce a maximum of 500 operations per commit.
   - Always commit in batches of **400 documents or fewer**.
4. **Linux / Container gRPC Network Caveat:**
   - Linux environments and containerized runners often fail or hang indefinitely on gRPC/OAuth IPv6 lookups.
   - In all Python scripts interacting with Firestore, apply this monkeypatch before initializing clients:
     ```python
     import socket
     _orig_gai = socket.getaddrinfo
     def _ipv4_gai(host, port, family=0, *args, **kwargs):
         return _orig_gai(host, port, socket.AF_INET, *args, **kwargs)
     socket.getaddrinfo = _ipv4_gai
     ```
5. **No Collection Group Queries Without Indexes:**
   - `db.collection_group('cards').where(...)` will fail with `FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index`.
   - Instead, iterate over `db.collection('flashcard_decks').stream()` and fetch subcollections `flashcard_decks/{deckId}/revisions/{revId}/cards`.
6. **Card Quality & Sanitization Standards:**
   - **No Question Duplication in Answers:** Anki templates place `{{FrontSide}}\n<hr id=answer>\n{{Back}}`. The sanitizer must strip the front question and `<hr>` from the answer so the question is not rendered twice.
   - **No Empty Boilerplate Sections:** Anki templates often declare `<h3>Images</h3><div></div>` or `Extra Section`, `Etymology`, `Mnemonics`. If these sections have no content, strip them completely. If they contain an `<img>`, keep only the image tag and drop the heading.
   - **No Cloze Multi-Span Duplication:** Preserve only the active cloze span; do not keep hidden template spans.
   - **Centered & Responsive:** All question and answer content renders centered (`text-center`) in the player.

---

## 2. Firestore Data Model & Paths

| Firestore Path | Role | Key Fields |
|---|---|---|
| `flashcard_decks/{deckId}` | Deck metadata | `id`, `title`, `titleEn`, `academicYear` (1-6), `moduleId`, `subject`, `unit`, `chapter`, `cardCount`, `publicationStatus` (`'draft'` \| `'published'`), `activeRevisionId`, `author: 'ASU Anki Flashcards'`, `createdAt`, `updatedAt` |
| `flashcard_decks/{deckId}/revisions/{revId}` | Revision snapshot | `id`, `deckId`, `status` (`'published'`), `cardCount`, `sourceSha256`, `complete: true`, `publishedAt` |
| `flashcard_decks/{deckId}/revisions/{revId}/cards/{cardId}` | Individual card | `id`, `deckId`, `revisionId`, `questionHtml`, `answerHtml`, `kind` (`'basic'` \| `'cloze'` \| `'image'`), `media` (`[{ storagePath, contentType }]`), `sourceNoteGuid`, `sourceTemplateOrdinal`, `clozeOrdinal` |
| `flashcard_imports/{importId}` | Audit log | `id`, `sourceSha256`, `deckIds`, `cardCount`, `status`, `findings` |
| `materials/{materialId}` | Curriculum resource | `id: "flashcards-{deckId}"`, `category: "flashcards"`, `type: "flashcards"`, `url: "/flashcards/{deckId}"`, `moduleId`, `subject`, `unit`, `chapter`, `author: "ASU Anki Flashcards"` |

> **Note on Curriculum Integration:** The document in `materials/{materialId}` is required so the flashcard deck appears in the curriculum module resource list (`/module/[id]`), allowing students to filter by the **Flashcards** chip.

---

## 3. Tooling & Prerequisites

- **Python Virtualenv:** `scripts/flashcards/.venv` or `uv run --project scripts/flashcards`
- **Firebase Service Account:** `medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json` in root.
- **Cloudflare Wrangler CLI:** `pnpm wrangler` (pre-authenticated).
- **CORS Config:** `cloudflare/r2-cors.json`.

---

## 4. End-to-End Upload Workflow for AI Agents

Follow these steps in order when an Anki deck (`.apkg`) needs to be uploaded or updated:

### Step 1: Inspect the Anki Archive
Before writing any data to the database, inspect the archive to analyze deck structure, card counts, note models, and suggested curriculum mapping:
```bash
uv run --project scripts/flashcards flashcards inspect "path/to/archive.apkg"
```

### Step 2: Configure R2 CORS & Upload Media to Cloudflare R2
Ensure images are publicly accessible and CORS allows cross-origin requests from the web app:
```bash
# 1. Apply CORS configuration to Cloudflare R2 bucket:
uv run --project scripts/flashcards flashcards set-cors

# 2. Extract media from the APKG and upload to Cloudflare R2 (https://asumed.eduvour.com):
uv run --project scripts/flashcards flashcards upload-media "path/to/archive.apkg"
```

### Step 3: Stage Decks and Cards into Cloud Firestore Drafts
Stage all decks, revisions, and individual card documents into Cloud Firestore in bounded batches (400 documents per batch):
```bash
uv run --project scripts/flashcards flashcards stage "path/to/archive.apkg"
```
The command outputs an `import_id` (e.g., `imp_3a2df81c4e91280f`).

### Step 4: Review and Verify Classifications
Check if any decks have unassigned modules or subjects:
```bash
uv run --project scripts/flashcards flashcards review <import_id>
```
If a deck has an unresolved module or subject, classify it explicitly:
```bash
uv run --project scripts/flashcards flashcards classify <deck_id> --module year2-blood --subject "Histology" --year 2
```

### Step 5: Validate the Import
Ensure all decks have assigned modules, subjects, valid card counts, and zero blocking errors:
```bash
uv run --project scripts/flashcards flashcards validate <import_id>
```

### Step 6: Publish Decks and Generate Linked Materials
Publishing performs atomic multi-document writes:
1. Marks `flashcard_decks/{deckId}` as `publicationStatus: "published"` and sets `activeRevisionId`.
2. Marks `revisions/{revId}` as `status: "published"`.
3. Creates corresponding `materials/flashcards-{deckId}` entries linking directly into module pages.
```bash
uv run --project scripts/flashcards flashcards publish <import_id>
```

### Step 7: Link Cloudflare R2 Media References
Scan cards to rewrite any relative image references to `https://asumed.eduvour.com/` and populate `media` metadata:
```bash
uv run --project scripts/flashcards flashcards link-images
```

---

## 5. Direct Python Scripting Recipe (Custom Batches & In-Database Fixes)

If you need to perform direct batch updates or canonicalize existing card documents in Cloud Firestore, use this Python script pattern:

```python
import socket
import re
from pathlib import Path
from google.cloud import firestore

# 1. Force IPv4 to avoid gRPC connection hanging
_orig_gai = socket.getaddrinfo
def _ipv4_gai(host, port, family=0, *args, **kwargs):
    return _orig_gai(host, port, socket.AF_INET, *args, **kwargs)
socket.getaddrinfo = _ipv4_gai

# 2. Initialize Firestore Client
CREDENTIALS_PATH = "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json"
db = firestore.Client.from_service_account_json(CREDENTIALS_PATH)

def clean_card_html(q: str, a: str) -> tuple[str, str]:
    # Strip FrontSide / repeated question from answer
    if "<hr" in a:
        before_hr, _, after_hr = a.partition("<hr")
        q_text = re.sub(r"<[^>]+>", "", q).strip().lower()
        before_text = re.sub(r"<[^>]+>", "", before_hr).strip().lower()
        if before_text and (before_text == q_text or before_text.startswith(q_text) or q_text.startswith(before_text)):
            a = re.sub(r"^[^>]*>", "", after_hr) # strip closing tag of hr

    # Strip empty section titles
    for sec in ["Images", "Extra Section", "Etymology", "Mnemonics"]:
        pat = rf"(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*{sec}\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?"
        def repl(m):
            content = m.group(1) or ""
            if "<img" in content.lower():
                return content # preserve image without section title
            text = re.sub(r"<[^>]+>", "", content).strip()
            return f"<div>{content}</div>" if text else ""
        a = re.sub(pat, repl, a, flags=re.IGNORECASE | re.DOTALL)

    # Clean whitespace & empty tags
    a = re.sub(r"<div>\s*</div>", "", a)
    a = re.sub(r"(?:<br\s*/?>\s*){2,}", "<br>", a)
    return q.strip(), a.strip()

# 3. Stream decks and update subcollection cards in batches <= 400
decks = list(db.collection("flashcard_decks").stream())
for deck in decks:
    rev_id = deck.to_dict().get("activeRevisionId")
    if not rev_id:
        continue
    cards_ref = db.collection("flashcard_decks").document(deck.id).collection("revisions").document(rev_id).collection("cards")
    cards = list(cards_ref.stream())
    
    batch = db.batch()
    batch_count = 0
    for card_doc in cards:
        data = card_doc.to_dict()
        q = data.get("questionHtml", "")
        a = data.get("answerHtml", "")
        clean_q, clean_a = clean_card_html(q, a)
        if clean_q != q or clean_a != a:
            batch.update(card_doc.reference, {"questionHtml": clean_q, "answerHtml": clean_a})
            batch_count += 1
            if batch_count >= 400:
                batch.commit()
                batch = db.batch()
                batch_count = 0
    if batch_count > 0:
        batch.commit()
```

---

## 6. Post-Upload Verification Checklist

Whenever an import or update is completed, run these verification steps:

1. **Verify Card Content in Cloud Firestore:**
   - Query a sample card from the updated revision and ensure `questionHtml` has no duplicated text and `answerHtml` has no phantom section headers.
2. **Synchronize Firestore Schema:**
   ```bash
   pnpm run schema:sync
   ```
   Ensures `firebase/schema.json` reflects live document counts.
3. **Run Static Code Validation:**
   ```bash
   pnpm run astro check
   pnpm run build
   ```
   Both checks must pass with **0 errors**.
4. **Git Commit:**
   - Commit all changed scripts, updated docs, and lockfiles.
   - Do not commit source `.apkg` files or media binaries.
