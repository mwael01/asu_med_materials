# Telegram respiratory import

For ongoing channel submissions and all curriculum modules, use the [Telegram inbox queue](./TELEGRAM_INBOX.md). The commands below remain the separate respiratory bot workflow.

The importer has two separate stages: local collection and reviewed publication. It is restricted to the existing Firestore module `year2-respiratory` and existing active lessons. It never creates lessons. Sources are `ASUMedZonebot`, `ASU_MedDataBot`, and `Medicine_way_bot`; explicit Year 2/respiratory bot delegations are followed with their original breadcrumbs.

## Setup and login

From the repository root, use Python 3.11 or newer and the system libarchive library (for RAR/7z; a recent 3.8+ reader is recommended):

```bash
python3 -m venv scripts/telegram-materials/.venv
scripts/telegram-materials/.venv/bin/python -m pip install -r scripts/telegram-materials/requirements.txt
pnpm materials:telegram login
```

If the default native archive reader fails on RAR checksums, select a newer installed library with `LIBARCHIVE=/absolute/path/to/libarchive.so` when running collection. macOS resource forks and archive metadata are ignored.

Enter your Telegram application ID/hash, phone number, login code, and any 2FA password in the terminal. Hashes, codes, and passwords are hidden. Application credentials and the authenticated session remain in the ignored `.telegram-materials/` directory, with a private directory and credentials file. Never include this directory in an import report, upload, or commit. The login command does not send bot messages. `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` can supply the application credentials through the local environment instead.

For a split login, `pnpm materials:telegram login --request-code` requests the Telegram code and exits after saving a private login challenge. Run `pnpm materials:telegram login` in your terminal to enter that code and any 2FA password. If the code expires, request a new one with `--request-code`.

Set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase service account file, or use the existing ignored `firebaseadmin.json` at the repository root. Collection/review only read Firestore. Drive enumeration uses the same account with Drive read scope, or an optional `GOOGLE_DRIVE_API_KEY`; Drive API access must be enabled for that credential's project. When API access is unavailable, gdown uses anonymous public sharing pages, without browser cookies. Files keep the same verification and size limits. Public folders are listed one level at a time so an inaccessible child does not block its siblings. Public folder listings remain marked incomplete because their pagination cannot be verified like API enumeration. An inaccessible Drive remains a reported blocked/failed source, never an empty successful folder.

Files larger than Wrangler's documented 315 MB upload limit are retained locally with `deferred` status. They cannot be approved or published individually or inside bundles. No multipart upload dependency is used.

Publication uses the installed Wrangler CLI and its existing Cloudflare login, or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`. Defaults are bucket `asumed` and domain `https://asumed.eduvour.com`; override them with `R2_BUCKET_NAME`/`R2_PUBLIC_DOMAIN`.

## Stage 1: collect and review

```bash
pnpm materials:telegram collect --run tmp/telegram-materials/respiratory
pnpm materials:telegram review --run tmp/telegram-materials/respiratory
pnpm materials:telegram validate --run tmp/telegram-materials/respiratory
```

The run directory contains `files/`, `stage.sqlite3`, a compact `SUMMARY.md`, the full `REVIEW.md`, and Arabic-compatible `materials.csv`, `playlist-videos.csv`, and `sources.csv` review inventories. Editing the CSV does not approve or publish anything; use the CLI to record decisions. This is disposable staging explicitly requested for this workflow; it is never a website catalogue or fallback source. All authoritative modules, lessons, and published materials are read directly from Firestore. Stop after this stage for the developer's review instruction. None of these commands uploads to R2 or writes Firestore.

The collector records message/caption/button links, bot menu paths, edited replies, album/message identities, and accessible files. It follows respiratory menus, paginated Drive folders, ZIP/RAR/7z contents, accessible Telegram histories, and complete YouTube playlist continuations, supporting both legacy renderers and current lockup view models. Accessible URLs from mixed-subject playlists are also retained in a separate video inventory for scope review. Videos and audio remain links rather than binary downloads. Related videos must be grouped into reviewed playlists before publication. Image albums are listed in message order in the report so they can be bundled coherently.

Up to three independent bots are collected concurrently, with shared request pacing and one sequential dialogue per bot identity. Back navigation is used only when its response matches a known ancestor menu. Both source semesters are checked when needed: older archives can place respiratory in a different semester from the current website curriculum. For example, the inspected `ASU_MedDataBot` respiratory route is under its second-semester menu; imported materials still use the existing website module's semester.

Bot responses enqueue durable file references rather than waiting for each binary transfer. Four download workers then fetch and validate the queued documents; repeated references to the same Telegram document reuse the completed download. Expiring references are refreshed from the original message, progress is reported for large files, and interrupted work resumes from its saved source state. An account-level lock prevents overlapping bot operations from different CLI processes.

Persistent teacher keyboards in the MedData bots are treated as sibling choices rather than nested lessons; pagination remains traversable. Telegram cooldowns are stored in the run and honored across restarts, with a reduced request rate after a flood wait. Source exclusions also suppress late descendants from an in-flight unrelated branch. General bot indexes found inside shared archives do not reopen unrelated bot menus. Mixed-module indexes use each link’s nearest module label; other modules and index artwork are excluded.

Each downloaded PDF/image is verified and stored once using its SHA-256 hash. Original filenames, URLs, and every lesson breadcrumb remain in SQLite. The CSV also includes source paths, original URLs, checksums, and any publication blocker. Downloaded links point to their staged file entry and cannot be approved again as duplicate link materials. A shared archive retains breadcrumbs from all originating lessons even when fetched only once. Completed scans with unresolved scope also reuse their results, preserving the incomplete status rather than repeatedly crawling cyclic channel references. `reuse-sources --run RUN_DIRECTORY` can clear already-captured references locally in bulk, including public recording posts whose caption links were saved in a full channel scan; it makes no network requests and preserves each source path.

Collection resumes with the same `--run`. Retry interrupted or failed sources with:

```bash
pnpm materials:telegram collect --run tmp/telegram-materials/respiratory --retry-failed
```

Use `collect --max-book-mib 100` to ignore PDF books over 100 MiB, including PDFs inside archives. This choice is saved for resumed collection; skipped sources remain listed with their reason.

Limits are 512 MiB per download, 2 GiB/10,000 archive members, 14 bot navigation steps, 10,000 sources per invocation, and 10,000 messages per Telegram archive. `--max-messages` can raise the history limit. Limits and unrecognized menus are reported as unfinished, not silently skipped. Nested archives need separate review; encrypted or unsupported archive formats and inaccessible membership gates cannot be claimed as collected. No Telegram invitation is automatically accepted. General discussion groups stay as links; their chat histories are excluded unless they are dedicated to respiratory or explicitly scope-reviewed. Directly linked study posts can still be collected.

Actual bot menus require authenticated inspection; no labels are assumed:

```bash
pnpm materials:telegram inspect --bot ASUMedZonebot
pnpm materials:telegram inspect --bot ASUMedZonebot --route 'Exact year button'
pnpm materials:telegram collect --run tmp/telegram-materials/respiratory --bot ASUMedZonebot --route 'Exact year button' --route 'Exact respiratory button'
```

Bot navigation sends `/start`, reply-keyboard selections, and inline callbacks to the selected source bot. Inspect first when labels are unclear. Unknown branches are retained with their exact route. To confirm an entire source is respiratory after inspecting it, use its report source ID:

To prepare several inspected routes before a single collection process, use `queue` (no Telegram connection), then collect with `--queued-only`:

```bash
pnpm materials:telegram queue --run tmp/telegram-materials/respiratory --bot ASUMedZonebot --route '2nd year' --route '1st semester' --route 'Resp 🫁'
pnpm materials:telegram queue --run tmp/telegram-materials/respiratory --bot ASU_MedDataBot
pnpm materials:telegram queue --run tmp/telegram-materials/respiratory --bot Medicine_way_bot --route 'Basic data' --route 'Respiratory module' --scope-respiratory
pnpm materials:telegram collect --run tmp/telegram-materials/respiratory --queued-only
```

`--scope-respiratory` explicitly confirms a manually inspected route when a general medical bot has no academic-year selector. It requires a nonempty route. These labels were inspected in October 2026 and may change; re-inspect rather than substituting guessed buttons.

Some private recording filenames contain their original YouTube IDs. `pnpm materials:telegram resolve-recordings --run tmp/telegram-materials/respiratory` verifies those IDs against public YouTube metadata and stages working video links. Clips without a verifiable public link stay blocked; binary video/audio uploads are outside this workflow.

To confirm a blocked/shared source after inspecting its contents:

```bash
pnpm materials:telegram scope-source --run tmp/telegram-materials/respiratory --source SOURCE_ID --reason 'Confirmed this archive contains Year 2 respiratory only'
pnpm materials:telegram collect --run tmp/telegram-materials/respiratory
```

Shared archives otherwise include only content with explicit respiratory or distinctive lesson-title evidence and remain marked incomplete because unlabeled content may have been omitted. `exclude-source --source SOURCE_ID --reason 'Outside respiratory'` records a deliberate exclusion. Membership, access, unsupported formats, uncertainty, and exhausted limits remain visible in coverage. `validate` exits with status 2 for integrity failures or unfinished sources; unreviewed entries are retained without being published.

## Curate the staged entries

Run `pnpm materials:telegram normalize-scope --run tmp/telegram-materials/respiratory` to reject unapproved entries explicitly named for another module (such as CVS, renal, or GIT), and skip matching pending file jobs. Titles that also mention respiratory remain for review; this is a conservative filename check, not medical content classification.

Lesson suggestions are title/context overlap candidates, not approvals. Arabic/English wording, subject ambiguity, generic filenames, attribution, mixed modules, and duplicate catalogue matches require review. Existing materials are matched by canonical source URL or stored content hash; title-only similarities never merge automatically. Moodle/ASU2Learn materials always use `author: 'ASU Faculty Staff'` and belong to Faculty & Department Staff in every assigned lesson, even when source titles identify lecturers; never assign those materials to individual doctor folders.

Group related videos or image/document pages in the intended order:

```bash
pnpm materials:telegram bundle --run tmp/telegram-materials/respiratory --entry FIRST_ID --entry SECOND_ID --title 'Respiratory lectures — Dr Example'
```

Approve each material or containing bundle against one or more existing lessons:

```bash
pnpm materials:telegram approve --run tmp/telegram-materials/respiratory --entry ENTRY_ID --lesson year2-resp-anat-larynx-trachea --lesson year2-resp-histo-larynx-trachea --author 'Dr Example'
```

Optional arguments are `--title`, `--category`, and `--existing-material MATERIAL_ID`. Existing catalogue matches must be resolved explicitly. When reusing an existing material, the publisher preserves its title, author, bookmarks, and original item IDs; it updates matching file destinations to R2 and appends reviewed new documents/videos. It never deletes existing materials. Use `reject --entry ENTRY_ID` to exclude a staged entry. Published entries must be edited through the website admin rather than rewriting a publication checkpoint.

For text evidence, run `pnpm materials:telegram pdf-evidence --run RUN`. The approved pypdf dependency extracts up to six pages per eligible PDF with a 20-second timeout into disposable `pdf-evidence/` and `pdf-evidence.csv`. Scans may have no searchable text; extraction never approves a material.

Explicit batch decisions can be applied with `pnpm materials:telegram curate --run RUN --decisions DECISIONS.csv`. Columns are `entryIds` (ordered IDs separated by `|`), `lessonIds` (`|` separated), `title`, `author`, `category`, `existingMaterialId`, and `reason`. Each row is one material; multiple file IDs become an ordered document bundle. The complete sheet is validated before staging changes, and repeated file selections are rejected. All remaining unreviewed files receive `held` status and a review reason, with no upload. These sheets are temporary review instructions, never website data.

## Stage 2: preview, upload, and publish

Only proceed after the developer's review instruction. Deploy Firestore rules for `material_lesson_links` and `material_imports` **before** deploying the compatible website or publishing assignments. Collection itself does not require those new collection rules.

```bash
# Read-only publication preview:
pnpm materials:telegram publish --run tmp/telegram-materials/respiratory

# Upload and publish approved entries:
pnpm materials:telegram publish --run tmp/telegram-materials/respiratory --apply

# Refresh repository schema counts after Firestore changes:
pnpm schema:sync
```

The publisher rechecks the entire approved set against live lessons, duplicate records, and staged file checksums before uploading. Objects use `materials/sha256/<hash>.<extension>`, correct MIME types, inline content disposition, and immutable caching. Public URLs include `?v=<hash>`. Verification requests use a separate nonce so pre-upload 404 responses do not poison the student URL's cache. Every uploaded/public object is checked against its expected MIME type, byte count, and SHA-256 before any referencing material is committed.

Each Firestore transaction writes its material/content updates, independent lesson links, import checkpoint, and catalogue version increment together. An interrupted run may leave verified R2 objects; retry reuses them. Committed entries resume without duplicate records or extra version increments. `material_imports/{runId}/entries/{entryId}` records publication checkpoints. Keep the staging directory until reconciliation is finished.

Published materials have `importReviewStatus: 'pending'`; their admin-only checkpoints include `reviewStatus: 'pending'`, file hashes/public URLs and assigned lessons. `pnpm materials:telegram publication-report --run RUN` exports `publication.csv`, distinguishing published, uploaded, held and rejected files with website paths and reasons. This report is also refreshed after each successful material commit.

Run `pnpm materials:telegram audit-publication --run RUN` after publication to reconcile materials, lesson edges, review markers and file checkpoints with live Firestore. It checks every published public URL for MIME, length, inline disposition and byte-range responses and writes `VERIFICATION.md`. It performs no database writes. Upload already verifies full content hashes before committing.

When the Firebase CLI is unavailable, `scripts/telegram-materials/.venv/bin/python scripts/deploy-firestore-rules.py` previews the existing service-account deployment; `--apply` compiles and releases the repository rules. It preserves the original active ruleset and release in ignored `tmp/firestore-rules-before-import.json` for rollback.

## Website contract and checks

`material_lesson_links/{id}` stores only `materialId`, `lessonId`, and `moduleId`. The ID is the separately percent-encoded material/lesson IDs joined with `~` (literal tildes are encoded too). Links may cross subjects within a module. Legacy `lessonId` still resolves with its original module/subject validation; new single-subject imports include a primary assignment for compatibility with older deployments. Resolved `lessonLinks` are attached in memory by the versioned catalogue loader and never stored on the material itself. Optional provenance fields are `contentSha256`, `importSources`, `importRunId`, and `importReviewStatus`.

Hosted PDFs embed directly from R2 using browser PDF support; images use the image viewer. Both standalone and lesson viewers expose an explicit Download action. `/api/material-download` looks up the selected document in the public Firestore catalogue and streams only immutable files on the configured `asumed.eduvour.com` path, with an attachment filename. Arbitrary URLs and redirects are rejected. Browsers without inline PDF support can use Open original or Download. Deploy this website code to activate the full viewer and multi-lesson navigation.

Admin → Lessons provides a multiple-selection list across the selected module. It saves additions in batches of eight to respect Firestore security-rule read limits, then removes obsolete assignments and the legacy field; each committed batch updates the catalogue version. If interrupted, refresh and retry from authoritative state. Publication through the importer remains transactional per material. Search includes every assigned active lesson's title/subject. Shared lessons retain one material ID for bookmarks and study progress. Existing document viewers display PDF/image bundles in their saved order.

```bash
pnpm test:telegram-materials
pnpm test:lessons
pnpm test:document-viewer
pnpm astro check
pnpm build
```

Importer tests use synthetic messages, files, paginated archives, and an in-memory transactional Firestore adapter. They never contact live services or publish materials. Authenticated menu inspection, real access permissions, and embedded playback still require live verification.
