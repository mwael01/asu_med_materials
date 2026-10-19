# Student study flow and lesson curation

## Public navigation

Students choose their academic year once, stored as `asumed_user_year` in localStorage. Home lists that year's active curriculum modules. Each module opens its subject directory; each subject opens an ordered lesson list; each lesson opens doctor cards; each doctor opens a shared video/document/link workspace.

Subject cards have taller rows with subject-specific medical icons in soft-colored left panels; lesson cards carry the same subject treatment. Module pages contain only subject navigation. Materials without a matching subject remain available through discovery and search.

The topbar links to Home, Videos, PDFs, and Flashcards, with a Search shortcut. Mobile navigation offers the same destinations. Team and Contribute remain in secondary navigation. Home and profile allow year changes, including for signed-in users. No welcome quote or stored active-module selection interrupts this flow. First-visit selection preserves shared destinations. If storage is unavailable, the year survives in memory for the current page; a fresh page load may prompt again.

Routes:

| Route | Purpose |
| --- | --- |
| `/` | Saved year's modules |
| `/module/[id]` | Subject cards |
| `/module/[id]/[subject]` | Lessons, unassigned subject resources, and general links |
| `/module/[id]/[subject]/lesson/[lessonId]` | Doctors, flashcards, and resources without a doctor |
| `/module/[id]/[subject]/lesson/[lessonId]/doctor/[doctorKey]` | Doctor workspace; `?item=` selects an original source item |
| `/videos`, `/pdfs`, `/flashcards` | Saved-year discovery grouped by module and subject |
| `/search` | Saved-year search, with one All years control |
| `/year/[year]` | Compatibility module directory |

Standalone playlist, document viewer, collection, and flashcard URLs remain available. Standalone YouTube videos retain their external links. Resources linked to inactive, missing, or mismatched lessons remain reachable through their legacy destinations and subject resources.

Page content crossfades over 160ms using [native cross-document view transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition). The navigation shell stays steady, and document navigation retains existing player/form initialization. Browsers without the view-transition CSS property receive a simple content fade-in; reduced-motion preferences disable both effects. No routing or animation dependency is added.

## Firestore contract

Firestore is the only catalogue source. `lessons/{id}` stores `id`, `title`, `moduleId`, `subject`, numeric `order`, and boolean `active`. Lessons refer to an existing module and one of its subjects. Public pages use active lessons from visible modules; existing semester and module visibility rules still apply.

Materials optionally reference a lesson using legacy `lessonId`, or several lessons through `material_lesson_links` documents containing `materialId`, `lessonId`, and `moduleId`. Shared links may span subjects within the same module. The catalogue caches links with the material version and attaches them to materials in memory; they are never stored as embedded `lessonLinks` fields. Legacy assignments retain their module/subject checks. Assignment applies to the entire material, including its ordered `videos` and `documents`. No titles are interpreted as public lesson assignments and no existing bundles are split. Collections retain their separate curated-pack behavior.

Doctor groups derive from material `author` attribution. Joint authors appear in each matching doctor group; faculty attribution keeps a shared department group. General/batch attribution stays on the lesson resource list. Doctor keys encode normalized names without punctuation-stripping collisions. Renaming an author changes its doctor URL; material and lesson IDs remain stable.

`studyContent.ts` resolves videos, PDFs/documents, and external links consistently for discovery and players. Mixed bundles can appear in both Videos and PDFs. JPEG and other supported image documents render as ordered pages alongside PDFs. Drive folders remain links. Structured videos take precedence over ambiguous Drive file URLs. As before, an untyped Drive file can only be classified as a document; authors should use structured video items for recordings. Flashcards open their dedicated study player rather than a doctor tab.

## Admin workflow

1. Open **Admin → Lessons**, choose the module and subject.
2. Create a lesson with a title and order, or select an existing lesson to edit it. Uncheck Active to hide a lesson without deleting it.
3. Select all related lessons in each module material's multiple-selection list, then save that row. Clear the selection and save to unassign it. Assignments may cross subjects within the same module.
4. Set a material's author through the existing material review form to attribute its videos, PDFs, or links to a doctor. Leave general links unassigned to display them on the subject page.
5. The review form also accepts an optional lesson ID; publication validates its module and subject. Student submission types preserve an optional lesson reference through review.

Moving a lesson between subjects or modules requires unassigning its materials first. Refresh reloads authoritative Firestore state. There is no automatic bulk content migration or destructive lesson deletion. Existing module descriptions remain in Firestore for compatibility but are neither rendered publicly nor edited by the module UI.

## Player state and caching

Videos, PDFs, and Links tabs appear only when populated. Tab arrows, Home, and End work with keyboard focus. Selecting another type stops the previous video/embed. Mobile places the materials panel below the viewer. Non-embeddable materials offer Open original. Copy link includes the selected item key.

Hosted PDFs on `asumed.eduvour.com/materials/sha256/`, direct `.pdf` files, and local Study Folder blobs stream and render inline across desktop and mobile devices via an integrated PDF.js reader (`src/components/study/PdfViewer.astro` and `src/scripts/study/pdfViewerController.ts`). The reader uses local workers (`/vendor/pdfjs/pdf.worker.min.mjs`), cMaps, and standard fonts, with HTTP range-request chunk streaming, High-DPI canvas rendering, touch swipe slide-flipping, page jump, and zoom/fit-width controls. Google Drive files (`drive.google.com/file/d/...`, `docs.google.com/...`) and web views continue to embed cleanly via their native preview iframes. Both the standalone viewer and doctor workspace provide Download for hosted PDFs and images. `/api/material-download` resolves the selected document from the public Firestore catalogue and streams it with an attachment filename; arbitrary URLs and redirects are rejected. Students can also download files into their offline Study Folder (`showDirectoryPicker`) and read local copies with 0 MB quota usage.

Materials retain optional `contentSha256`, `importSources`, `importRunId`, and `importReviewStatus` provenance fields. Uploaded materials marked `pending` remain available for later editorial review without student-facing badges.

Bookmarks and whole-material completion use the original material ID. Video completion retains `asumed_playlist_<materialId>` and original video IDs. Other item completion uses `asumed_documents_<materialId>`. Whole-source completion is set only after every item in that source is complete. Per-item completion remains browser-local; existing account sync covers whole-material bookmarks and completion.

Lessons use the same versioned server catalogue cache as modules/materials. Lesson saves and assignments increment `materials_version/current`. The version reader caches for up to 60 seconds; public HTML has a separate CDN cache and can remain stale until it refreshes. Saved-year scoping happens in the browser so anonymous cached HTML is shared safely across students. No study content is written to local catalogue files.

## Rollout and verification

Deploy the updated Firestore rules **before** deploying the application: public routes read `lessons` and `material_lesson_links`; publication checkpoints in `material_imports` remain admin-only. Until those rules are deployed, a denied collection cannot be read. No new composite index is needed: assignment validation queries a single `lessonId` or `materialId` field. Do not delete existing materials or module-description fields.

An empty lessons collection is supported. Existing materials stay in Subject resources or Links until an admin curates them. After rollout, create one lesson and assign a video bundle, document bundle, and doctor link in the same subject; verify desktop/mobile tabs and shared item URLs. Check guest year changes, signed-in profile year updates, flashcard links, Arabic search, and existing bookmarked URLs. Monitor SSR errors and Firestore reads as usual.

Local checks: `pnpm astro check`, `pnpm test`, and `pnpm build`. `pnpm test:lessons` covers scoping, ordering, doctor identities, mixed content classification, serialization, and browser-controller behavior in a DOM harness. Embedded third-party playback and production Firestore permissions still need deployment verification in a real browser.
