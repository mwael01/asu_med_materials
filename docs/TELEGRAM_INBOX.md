# Telegram materials inbox

Forward or upload new materials to https://t.me/asumedmaterials, then ask the assistant to **process the materials inbox**. Processing is on demand. It reads existing and new posts using the authenticated Telegram account, analyzes evidence, and prepares review decisions. It does not automatically publish or run in the background.

The workflow covers existing visible modules and active lessons across the website. The older respiratory bot importer remains available separately; see [TELEGRAM_MATERIALS.md](./TELEGRAM_MATERIALS.md).

## Setup

Reuse the Telegram importer virtual environment, authenticated account and Firebase service account described in that guide. Install the system `ffmpeg` package for `ffprobe` recording validation (Ubuntu: `sudo apt-get install ffmpeg`). PDF inspection uses pypdf; image validation uses Pillow; ZIP/RAR/7z use libarchive. These are existing approved dependencies. Nothing calls a paid AI service or performs automatic transcription.

Queue state, source revisions, evidence, decisions and publication checkpoints live in Firestore. `tmp/telegram-inbox/` holds disposable downloads and previews only. Deleting that directory loses no decisions; publication downloads the reviewed revision again and verifies its checksum. Never commit this cache, `.telegram-materials/`, authentication sessions or Firebase credentials.

## Collect and analyze

```bash
pnpm materials:telegram inbox sync
pnpm materials:telegram inbox analyze --limit 50
# Optional: fetch lesson suggestions only for a known module:
pnpm materials:telegram inbox analyze --limit 50 --module year2-respiratory
pnpm materials:telegram inbox status
pnpm materials:telegram inbox show --batch BATCH_ID
pnpm materials:telegram inbox show ITEM_ID --full
```

`sync` verifies the channel's numeric identity, durably queues messages before advancing the cursor, and rechecks the latest 200 known posts for edits/deletions. Repeating it preserves review and publication states. Each run scans at most 500 new posts by default; repeat until `complete: true`, or use `--limit N`. `sync --full` reconciles all known history, resuming a partially scanned snapshot across invocations. A deleted post flags its unpublished resources for review; it never removes a published website material.

`analyze` creates a persistent review batch with bounded PDF text/scan previews, image previews, recording container/codec checks and exact duplicate matches. It never scans the materials collection. It reads the small module list; lesson suggestions load only for explicit `--module` hints. Without a hint, inspect the evidence first, then fetch lessons for the identified module. Global fuzzy title comparisons are not scanned automatically. Suggestions are evidence, never approval. New albums wait at least 60 seconds before analysis; include all parts when grouping. Archives are expanded into independently tracked members; run analysis again for queued children. Nested/unsupported members remain held. Expansion is limited to 1,000 entries and 100 MB total, uses hashed cache paths, and never extracts supplied paths. YouTube playlist links are enumerated into ordered tracks (up to 1,000); unresolved enumeration errors stay failed.

## Read-efficient duplicate indexing

```bash
pnpm materials:telegram inbox index --limit 50
# For a known destination, minimize reads by indexing only that module:
pnpm materials:telegram inbox index --module year2-respiratory --limit 200
# Repeat until complete: true. The cursor is durable in Firestore.
```

This is the only inbox command that enumerates all catalogue materials. Each invocation reads at most the selected page (default 50, maximum 200) and the identity records needed for that page; it does not download files. `material_asset_index/catalogue-state` records the catalogue version, generation, last material ID and completion state. An unchanged version is a no-op without any material enumeration. Interrupted pages resume safely. Use `--rebuild` only on the first invocation when deliberately starting over.

Prefer `--module` when the destination is known: it queries only that module's materials and maintains independent `catalogue-module-MODULE_ID` checkpoints and prefixed asset identities. Approval/publication accepts a current module-scoped index or a current global index; scoped refresh never marks a stale global index complete. Repeat the bounded command until `complete: true`. Analysis may still report a stale global index; module-scoped checks run against the reviewed destination during approval. Publication advances only the indexes it used, once per batch.

Routine analysis looks up each resource's identity directly. An incomplete/stale index sets `duplicateCheck: index_required`; evidence analysis can continue, but approval/publication needs a current global or destination-module index. External catalogue edits that increment `materials_version/current` invalidate indexes. Refresh the needed index in bounded pages. Inbox publication updates identities with each material, then advances the catalogue and used index versions together after the batch completes; its own publications need no rebuild. Old index generations are ignored, including associations for deleted materials. External Admin scripts must increment the catalogue version when changing materials; after an unversioned edit, use `inbox index --rebuild` (plus `--module` for a scoped index).

Within one command, repeated document/query reads reuse memory, including missing identities. Writes invalidate affected entries. Nothing is saved as a local catalogue. Every publication transaction reads fresh curriculum, approval, identity and source records; transaction retries discard their previous read cache. Decision validation reads only the chosen module and lesson IDs, rather than all lessons in the module.

Regular sync queries at most 200 recent history documents and skips transactions for unchanged posts. Only explicit `sync --full` enumerates all known history. Analysis pages pending work and examines at most four pages per invocation, marking obsolete queued revisions `superseded` so they cannot starve new work. Empty analysis reads no curriculum/materials. `status` uses server-side count aggregations over current source **messages**, including service posts; these counts are not file counts. It returns only the latest 20 batches. Status counts use a single indexed `sourceStatus` field, maintained alongside message state. Sync backfills old messages as it visits them; counts show remaining legacy records as `unclassified` and outstanding rather than silently declaring them done. Latest-batch and recent-message queries use a single ordered field. No new composite indexes are required.

Read-volume regression tests cover a 10,000-message unchanged sync (201 document reads in the sync body, plus command lease acquisition/release), two selected lessons among 10,000 (three reads: module plus lessons), transaction retry freshness, bounded index resumption and invalidation, and analysis without material/lesson collection scans. Firestore aggregation queries still incur index-read charges; fewer document reads cannot reset an already exhausted quota or control other website traffic. A quota error stops the command; it never triggers a fallback scan or an unbounded retry loop.

Files of **25,000,000 bytes or less** are eligible for R2 bucket `asumed` after review. Larger/unknown-size attachments retain their public Telegram post link and are not downloaded or uploaded. This is a per-file rule, including audio, voice notes and video, with no aggregate storage cap. Oversized archive members point to their containing archive post. Unsupported small recording codecs remain unresolved; no transcoding is attempted. Existing website uploads are not migrated.

Other shared links remain independently reviewable URLs. The inbox does not recursively crawl arbitrary linked sites, Drive folders or external Telegram histories. Use the existing collection helpers or inspect them explicitly when needed; a broad folder/channel link is not evidence for assigning every lesson.

## Assistant review

When asked to process the inbox:

1. Sync, inspect status and analyze queued resources. If duplicate checks require indexing, run bounded index pages until complete before approving; then identity lookups use the refreshed index without downloading/reanalyzing resources. Resume failed work only after investigating its reason.
2. Read each item's source caption/provenance, extracted text and image previews. Inspect more pages when the bounded evidence does not establish coverage. For audio/video without descriptive context, hold it until its content can be identified; do not invent a topic or author.
3. Match the content against live Firestore modules/lessons, covering all applicable lessons. Group related recordings into one ordered playlist and related document/image pages into one ordered document bundle. Keep documents and recordings in separate materials. For Moodle/ASU2Learn materials, always use `author: 'ASU Faculty Staff'` and the lesson's Faculty & Department Staff folder, including mirrored files and named-speaker recordings. Other materials with unidentified authors stay unset.
4. Use checksums for file identity, Telegram media IDs for oversized attachments and canonical URLs for links. Different checksums are separate editions even when the filename or source post is the same. Reuse an exact existing material to add lesson associations. Never merge title-only similarities. An asset can have separate reviewed destinations in different modules, while R2 stores one hash-addressed object.
5. Save a reason for every decision. Report proposed titles, authors, module/lesson coverage, grouping, held items and duplicate actions. Stop for the user's review before approving or applying publication.

```bash
pnpm materials:telegram inbox decide --batch BATCH_ID --item ITEM_ID \
  --action create --module MODULE_ID --lesson LESSON_ID --lesson OTHER_LESSON_ID \
  --title 'Reviewed title' --author 'Dr Example' --category summaries \
  --reason 'Verified content and attribution; covers these lessons'

# Repeat --item in playback/document order to create a bundle.
# Reuse a verified existing identity without changing its editorial fields/bookmarks:
pnpm materials:telegram inbox decide --batch BATCH_ID --item ITEM_ID \
  --action reuse --existing-material MATERIAL_ID --module MODULE_ID \
  --lesson LESSON_ID --title 'Existing title' --category summaries \
  --reason 'Exact existing file; add this lesson association'

pnpm materials:telegram inbox decide --batch BATCH_ID --item ITEM_ID \
  --action hold --reason 'Lesson coverage is uncertain'
```

Other actions are `ignore` (deliberate exclusion) and `duplicate` (verified exact match requiring no added coverage). Amend an unpublished decision with `--plan PLAN_ID` and the same items. Amend every pending destination to hold before retrying analysis. Approved batches are immutable; source edits create new revision-specific items and require a new review.

Use repeated `--item-title 'ITEM_ID=Reviewed title'` for readable playlist/document member titles; these titles are bound to approval. For many reviewed decisions, `inbox decide-batch --batch BATCH_ID --file REVIEW_FILE` shares curriculum/identity reads and reads the plan list once. The disposable review JSON contains `batchId` and `plans`, each with `itemIds`, `decision` (the same fields as an individual decision, including optional `itemTitles`), and optional `planId` for amendments. Every decision still validates live source revisions transactionally. A later failure leaves earlier decisions saved for review; approval/publication are separate. Never commit the review JSON or use it as a website catalogue.

For an explicitly requested classification correction, add `--replace-lessons` to a `reuse` decision. Its review preview includes the old and proposed lesson IDs. Publication replaces the existing assignments and updates the subject/legacy lesson field atomically, preserving the material ID, title, author and bookmarks. It binds the original assignment snapshot and refuses concurrent assignment changes. Ordinary reuse only adds associations. Shared YouTube playlists use their playlist ID for identity, ignoring sharing parameters such as `si`, while original source posts remain in the queue audit.

## Publish after explicit approval

```bash
# Read-only preview; no approval, uploads or catalogue changes:
pnpm materials:telegram inbox publish --batch BATCH_ID

# Only after user approval of the concrete review:
pnpm materials:telegram inbox approve --batch BATCH_ID
pnpm materials:telegram inbox publish --batch BATCH_ID --apply
pnpm materials:telegram inbox status
```

Approval binds exact decisions and source revisions. Publication refetches source posts, validates curriculum and identities, and verifies actual file size, checksum and format before any upload. R2 objects have immutable hash paths, correct MIME, inline disposition and verified public bytes. Existing verified objects are reused. A transaction commits each destination's material, lesson links, asset identities and checkpoint together. After every destination commits, one final transaction increments the catalogue and duplicate-index version once for the whole batch. A durable pending marker lets interrupted batches resume and invalidate the cache once, without republishing completed destinations or changing material IDs/bookmarks. Completed retries skip unchanged batch writes. A failure can leave an unreferenced verified R2 object; retry reuses it.

Each uploaded material/plan has `importReviewStatus: pending` / `reviewStatus: pending` for later audit. This does not add student-facing badges. Multiple lesson assignments use `material_lesson_links`. PDFs use the existing PDF.js viewer; images use the image viewer. Audio and video use ordered playlist tracks (`mediaKind: audio | video`) in both lesson and standalone players, with native playback and download actions for hosted files. Oversized Telegram recordings/files offer an external source action.

## Recovery and access

```bash
# Failed items only:
pnpm materials:telegram inbox retry
# Explicit held/review item, after resolving pending decisions:
pnpm materials:telegram inbox retry --item ITEM_ID
pnpm materials:telegram inbox analyze
```

`held`, `failed`, `queued`, `analyzing`, `needs_review`, `approved` and `publishing` are outstanding. Only `published`, `duplicate` and `ignored` count as done. A source is not done while any current archive child or destination remains unresolved. Historical revisions remain available for audit; `superseded` applies only to obsolete pending revisions and does not count toward current source progress.

A Firestore lease and the existing account lock prevent concurrent workers; leases renew every minute and expire after 10 minutes. Lost leases stop publication. Telegram flood waits persist a cooldown across restarts. Firestore quota/access errors stop work without a local fallback; restore access or wait for the quota to reset, then retry. A lease that could not be released expires naturally. No script changes billing or quotas.

Five private collections hold the queue: `material_inbox_sources`, `material_inbox`, `material_inbox_items`, `material_inbox_batches` (with `plans`), and `material_asset_index`. Source messages have `revisions` subcollections. Repository rules restrict them to admins; Firebase Admin scripts use service account authorization. Deploy rules before using a new environment. `firebase/firestore.indexes.json` excludes large evidence/maps from indexing; all routine queue queries use built-in single-field indexes. Use the repository's Firebase deployment commands for rules/indexes. Website deployment follows the normal Git push workflow.

Verification: `pnpm test:telegram-materials`, `pnpm test`, `pnpm astro check`, `pnpm build`. Tests use synthetic Telegram sources, real local archive/PDF/audio validation and transactional in-memory Firestore; they never publish live materials.

Practical image collections, English study descriptions, annotation commands and viewer behavior: [Practical image uploads](./PRACTICAL_IMAGES.md).

Standalone HTML embeds and Clinical PDF lessons: [Interactive materials](./INTERACTIVE_MATERIALS.md).
