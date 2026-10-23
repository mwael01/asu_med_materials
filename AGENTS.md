this is the asumedmaterials website, the all in one place for medicine students at ain shams university to share materials, pdfs, youtube videos, playlists, whatsapp groups, channels, telegerams groups, drives, website, and any other sort or materials used in stydying


## tech-stack

- astro
- html/css/typescript
- pwa libraries
- vercel
- github

# instructions

- run static validation after big edits and ensure no issues
- separate the ui code into usable components and reuse them, if no component matches the exact use case or needs a lot of edits to match it, create a new component for the new use case
- keep the ui simple and convenient, dont add useless pretitles or descriptions or useless text
- split js code into organized functions and file
- update the documentation after big edits to add new changes and details, avoid bloating the readme file
- use typescript types correctly and store the types into organized folders
- if there is a library that performs the same jop ask the developer if we should it or continue with our own code
- dont use icons in place of bigger images, you can use icons from the icon library for small buttons
- keep the ui unified and make sure it is responsive on any screen size
- you may create helper scripts (in `scripts/`) to automate tasks like fetching playlist details and data processing; document their usage and keep them reusable for future AI agent runs
- database is Cloud Firestore: all study materials, curriculum modules, and contributor profiles live in Cloud Firestore (single source of truth; never commit local JSON material files to the repo). However, **direct reads and updates to Firebase/Firestore must be strictly minimized** so we do not exhaust the Firebase free-tier quota:
  - in application code, always use the cached catalogue layers (Vercel Runtime Cache, cached `/api/*` routes, and client `localStorage`/in-memory snapshots) rather than direct Firestore reads, and batch or debounce user/admin writes
  - in agent scripts and maintenance tasks, avoid full-collection scans and redundant polling—fetch only targeted documents or narrow queries, skip writes when fields have not changed, use batched writes (`WriteBatch`), and bump `materials_version/current` at most once per batch run
- All Moodle and ASU2Learn materials belong to Faculty & Department Staff. Publish them with `author: 'ASU Faculty Staff'` and group them only in that lesson's department folder, even when a source names individual lecturers. Official College Staff Stream recordings follow the same rule. Speaker names are source context, not individual doctor-folder assignments.
- never add unnecesesary icons, countboxes, ui pills, or other unuseful text that only bloats the ui
- when adding or importing videos for any subject or module, always group related videos (e.g. practical parts/experiments, multi-part lectures, or revision & question-solving series by the same doctor) into a cohesive playlist (`type: 'playlist'`) with structured `videos: PlaylistItem[]` instead of leaving them lying alone as loose individual `type: 'youtube'` items; this keeps modules organized and activates the interactive in-app playlist player (/playlist/[id]) for students

