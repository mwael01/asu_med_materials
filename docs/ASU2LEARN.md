# ASU2Learn respiratory links

The reusable importer in `scripts/asu2learn/` reads the current [Year 2 Respiratory System (MRS-2) course](https://asu2learn.asu.edu.eg/medicine/course/view.php?id=620), 2024 by-law. Its only destination is the existing Firestore module `year2-respiratory`. It never creates lessons.

All ASU2Learn and Moodle materials belong to **Faculty & Department Staff** within each assigned lesson. Publish them with `author: 'ASU Faculty Staff'`, including materials whose original titles name lecturers. They must not create or appear in individual doctor folders. The website recognizes official course provenance, titles, tags and import identities so this grouping also applies to legacy or unattributed records and externally hosted mirrors. Explicitly labeled College Staff Stream revisions follow the same ownership rule.

## Access and collection

Use the existing Python environment documented in [Telegram materials setup](./TELEGRAM_MATERIALS.md#setup-and-login), plus `pnpm install`. This workflow reuses installed requests, Firebase Admin and Cheerio; it adds no dependencies.

```bash
pnpm materials:asu2learn login
pnpm materials:asu2learn scan
pnpm materials:asu2learn status
pnpm materials:asu2learn lessons
```

Login prompts for the university username/password. For automation, environment variables `ASU2LEARN_USERNAME` and `ASU2LEARN_PASSWORD` are supported; do not put credentials in command arguments or committed files. Only session cookies are saved, in ignored `.asu2learn/session.cookies` (file mode 0600, directory 0700). Delete that file to remove the local login. Expired sessions require login again. Credentials and cookies never enter Firestore or student pages.

The scanner follows course sections and reads HTML activity descriptions and URL redirects. It never requests resource files, pluginfile/download routes, embedded players, external destinations, images, videos, assessments or completion controls. Responses are streamed, redirects are checked before following, and non-HTML bodies are rejected without consuming their contents. HTML size/navigation limits abort an incomplete scan.

Protected Moodle files and SharePoint/Teams recordings retain stable Moodle activity links. Students sign in with their own university account. Supported YouTube/Vimeo/Drive share URLs can use existing website players/viewers; no private session or signed file URL is exposed. Drive video classification is reviewed because a file ID alone cannot distinguish a recording from a PDF. Live meeting links stay separate from recording playlists.

## Review and publication

Discovery stores metadata, revision fingerprints, review decisions and publication state directly in the admin-only path `material_imports/asu2learn-respiratory/entries/{entryId}`. The parent document records the course, last successful scan, scan completion, recommended 24-hour interval and exclusive command lease. No local material catalogue, file staging or R2 uploads are used.

Review exact activity titles, department, language stream and destination metadata. Speaker names may help distinguish source versions, but do not determine the website folder or author. Exact unique curriculum-title matches are suggestions only. Ambiguous entries remain unpublished. Use one stable group for related recordings, repeat `--entry` and `--lesson` as needed, and reuse that group when adding later parts:

```bash
pnpm materials:asu2learn review \
  --entry activity-ACTIVITY_ID --entry activity-SECOND_ACTIVITY_ID \
  --lesson year2-resp-histo-conductive-portion \
  --lesson year2-resp-histo-respiratory-portion \
  --group histology-example-recordings \
  --title 'Conducting and respiratory portions — ASU2Learn' \
  --kind video --category lectures \
  --reason 'Reviewed department, topic and recording destination'

pnpm materials:asu2learn publish
pnpm materials:asu2learn publish --apply
```

`--kind video` always produces a structured `type: 'playlist'` with stable track IDs, even for a currently single recording. `--kind link` preserves ordinary links or grouped external document links. Multi-topic groups receive all reviewed `material_lesson_links`. Publication always sets `author: 'ASU Faculty Staff'`. The optional legacy `--author` argument records speaker context privately in the review only; it never assigns an individual doctor folder. Use `--module-wide` instead of `--lesson` for orientation and schedules, with `--category central`; these do not receive invented lesson assignments.

Exclude non-study activities explicitly:

```bash
pnpm materials:asu2learn ignore --entry activity-ACTIVITY_ID --reason 'Questionnaire, not study material'
```

Publication previews by default. `--apply` checks exact canonical URLs/provenance against existing respiratory materials, holds duplicates, and writes one group atomically with its lesson links, publication checkpoints and catalogue version. It preserves bookmarks and unrelated fields. An up-to-date shared duplicate index is updated in the same transaction. Manual changes to importer-owned material fields or lesson assignments block subsequent updates for reconciliation. Published entries cannot silently move to another group.

## Future rescans

Run `scan` daily during the module or whenever asked to process new ASU2Learn materials, then inspect `status`. There is **no unattended scheduled job**; the saved interval is a reminder for future agent runs, not a scheduler.

1. Reauthenticate if the session expired, then run `scan`.
2. Review new/changed entries. Reuse existing groups for new parts, preserving group title/category/kind. Record all applicable lessons and keep department staff ownership for every Moodle/ASU2Learn item. `status --all` includes published entries and their existing review decisions.
3. Preview with `publish`, resolve any holds, then use `publish --apply` when publication is authorized.
4. Repeating publication with unchanged revisions performs no catalogue writes. Changed revisions require a fresh review. Missing/hidden source entries are marked missing and hold their group; existing website materials are never automatically deleted.

A failed scan cannot advance the successful-scan checkpoint. A partially written metadata scan blocks publication until another complete scan succeeds. An exclusive 30-minute lease protects mutations; expired commands stop before committing publication. Routine Firestore queries stay within this source and respiratory module, and lesson reads are cached for each command; no full-site catalogue scan or new composite index is required.

## Validation

```bash
pnpm test:asu2learn
pnpm test:document-viewer
pnpm test:video-sources
pnpm exec astro check
pnpm build
```

Tests cover HTML parsing, URL/session filtering, refusal to request file/media redirects, incomplete scans, multi-lesson playlists, duplicate handling, publication idempotency, manual-edit protection, leases and Firestore transaction ordering. Authenticated pages are not saved as fixtures.
