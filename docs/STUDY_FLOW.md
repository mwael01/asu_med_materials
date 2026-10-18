# Student study flow and lesson curation

## Public navigation

Students choose their academic year once, stored as `asumed_user_year` in localStorage. Home lists that year's active curriculum modules. Each module opens its subject directory; each subject opens an ordered lesson list; each lesson opens doctor cards; each doctor opens a shared video/document/link workspace.

The topbar links to Home, Videos, PDFs, and Flashcards, with a Search shortcut. Mobile navigation offers the same destinations. Team and Contribute remain in secondary navigation. Home and profile allow year changes, including for signed-in users. No welcome quote or stored active-module selection interrupts this flow. First-visit selection preserves shared destinations. If storage is unavailable, the year survives in memory for the current page; a fresh page load may prompt again.

Routes:

| Route | Purpose |
| --- | --- |
| `/` | Saved year's modules |
| `/module/[id]` | Subject cards and resources with no matching subject |
| `/module/[id]/[subject]` | Lessons, unassigned subject resources, and general links |
| `/module/[id]/[subject]/lesson/[lessonId]` | Doctors, flashcards, and resources without a doctor |
| `/module/[id]/[subject]/lesson/[lessonId]/doctor/[doctorKey]` | Doctor workspace; `?item=` selects an original source item |
| `/videos`, `/pdfs`, `/flashcards` | Saved-year discovery grouped by module and subject |
| `/search` | Saved-year search, with one All years control |
| `/year/[year]` | Compatibility module directory |

Standalone playlist, document viewer, collection, and flashcard URLs remain available. Standalone YouTube videos retain their external links. Resources linked to inactive, missing, or mismatched lessons remain reachable through their legacy destinations and subject resources.

## Firestore contract

Firestore is the only catalogue source. `lessons/{id}` stores `id`, `title`, `moduleId`, `subject`, numeric `order`, and boolean `active`. Lessons refer to an existing module and one of its subjects. Public pages use active lessons from visible modules; existing semester and module visibility rules still apply.

Materials optionally reference a lesson using `lessonId`. Assignment applies to the entire material, including its ordered `videos` and `documents`. No titles are interpreted as lesson assignments and no existing bundles are split. Collections retain their separate curated-pack behavior.

Doctor groups derive from material `author` attribution. Joint authors appear in each matching doctor group; faculty attribution keeps a shared department group. General/batch attribution stays on the lesson resource list. Doctor keys encode normalized names without punctuation-stripping collisions. Renaming an author changes its doctor URL; material and lesson IDs remain stable.

`studyContent.ts` resolves videos, PDFs/documents, and external links consistently for discovery and players. Mixed bundles can appear in both Videos and PDFs. Drive folders remain links. Structured videos take precedence over ambiguous Drive file URLs. As before, an untyped Drive file can only be classified as a document; authors should use structured video items for recordings. Flashcards open their dedicated study player rather than a doctor tab.

## Admin workflow

1. Open **Admin → Lessons**, choose the module and subject.
2. Create a lesson with a title and order, or select an existing lesson to edit it. Uncheck Active to hide a lesson without deleting it.
3. Assign each subject material using its lesson dropdown. Each change saves independently. Choose Subject resources to unassign it.
4. Set a material's author through the existing material review form to attribute its videos, PDFs, or links to a doctor. Leave general links unassigned to display them on the subject page.
5. The review form also accepts an optional lesson ID; publication validates its module and subject. Student submission types preserve an optional lesson reference through review.

Moving a lesson between subjects or modules requires unassigning its materials first. Refresh reloads authoritative Firestore state. There is no automatic bulk content migration or destructive lesson deletion. Existing module descriptions remain in Firestore for compatibility but are neither rendered publicly nor edited by the module UI.

## Player state and caching

Videos, PDFs, and Links tabs appear only when populated. Tab arrows, Home, and End work with keyboard focus. Selecting another type stops the previous video/embed. Mobile places the materials panel below the viewer. Non-embeddable materials offer Open original. Copy link includes the selected item key.

Bookmarks and whole-material completion use the original material ID. Video completion retains `asumed_playlist_<materialId>` and original video IDs. Other item completion uses `asumed_documents_<materialId>`. Whole-source completion is set only after every item in that source is complete. Per-item completion remains browser-local; existing account sync covers whole-material bookmarks and completion.

Lessons use the same versioned server catalogue cache as modules/materials. Lesson saves and assignments increment `materials_version/current`. The version reader caches for up to 60 seconds; public HTML has a separate CDN cache and can remain stale until it refreshes. Saved-year scoping happens in the browser so anonymous cached HTML is shared safely across students. No study content is written to local catalogue files.

## Rollout and verification

Deploy the updated Firestore rules **before** deploying the application: new public subject, search, discovery, and lesson routes read `lessons`. Until those rules are deployed, the previously denied collection cannot be read. No new composite index is needed: lesson assignment validation queries a single `lessonId` field. Do not delete existing materials or module-description fields.

An empty lessons collection is supported. Existing materials stay in Subject resources or Links until an admin curates them. After rollout, create one lesson and assign a video bundle, document bundle, and doctor link in the same subject; verify desktop/mobile tabs and shared item URLs. Check guest year changes, signed-in profile year updates, flashcard links, Arabic search, and existing bookmarked URLs. Monitor SSR errors and Firestore reads as usual.

Local checks: `pnpm astro check`, `pnpm test`, and `pnpm build`. `pnpm test:lessons` covers scoping, ordering, doctor identities, mixed content classification, serialization, and browser-controller behavior in a DOM harness. Embedded third-party playback and production Firestore permissions still need deployment verification in a real browser.
