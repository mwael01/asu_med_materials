# Practical image folders and viewer

Each Practical Revision lesson owns its ordered `practicalImageFolders: { id, title }[]` in Firestore. Folder layouts vary by subject and module; the website has no global subject-to-folder mapping. Admin → Lessons edits these folders as `stable-id: Folder title`, one per line. Keep IDs stable when renaming a folder. Move assigned images before removing a folder.

The Respiratory module currently uses:

| Subject | Folders |
| --- | --- |
| Histology | Real Lab Slides; Computer Lab Slides |
| Anatomy | Computer Lab |
| Pathology | Jars; Slides |

A folder opens one flat image viewer. It never adds nested specimen, source-bundle or question collections. Questions appear alongside other images in the same folder. Original material/document IDs, attributions and source credits remain available for bookmarks and import audits; students navigate the combined folder rather than those source records.

## Configure and import

Set up the Telegram inbox using [TELEGRAM_INBOX.md](./TELEGRAM_INBOX.md). Inspect the actual images and captions, then read the destination lesson's live folder configuration. Do not infer lab type from a filename or apply another module's folder layout.

```bash
# Preview; add --apply to save these lesson-specific definitions.
pnpm materials:telegram inbox image-folders --lesson PRACTICAL_LESSON_ID \
  --folder 'real-lab:Real Lab Slides' --folder 'computer-lab:Computer Lab Slides'

pnpm materials:telegram inbox decide --batch BATCH_ID \
  --item FIRST_IMAGE_ID --item SECOND_IMAGE_ID \
  --action create --module MODULE_ID --lesson PRACTICAL_LESSON_ID \
  --title 'Respiratory practical images' --category practical --image-folder computer-lab \
  --reason 'Reviewed images and confirmed the lesson folder'

# Repeat for each image. --image-folder may override the plan default for a mixed album.
pnpm materials:telegram inbox annotate --batch BATCH_ID --plan PLAN_ID \
  --item FIRST_IMAGE_ID --title 'Nasal septum model' \
  --description 'Identify the labelled septal cartilage, vomer and perpendicular plate of the ethmoid.' \
  --alt-text 'Photograph of a labelled nasal septum model' \
  --source 'https://t.me/asumedmaterials/POST_ID'

pnpm materials:telegram inbox publish --batch BATCH_ID
pnpm materials:telegram inbox approve --batch BATCH_ID
pnpm materials:telegram inbox publish --batch BATCH_ID --apply
```

`image-folders` upserts definitions on the selected lesson; it does not change other modules or subjects. Admin can remove an empty folder. Source grouping may remain in import records for provenance, but creates no extra student-facing collection level.

Descriptions should explain verified visible features in English. Do not invent diagnoses, magnification, stains or numbered labels. Retain authoritative references for added medical explanations. When explicitly requested, unanswered questions may omit descriptions using `--allow-unlabelled-images`; still provide neutral titles, alternative text and source URLs. Never move them into a separate question folder unless specifically requested. Faculty resources retain `author: ASU Faculty Staff`.

Approval requires directly hosted images, a Practical Revision destination and a configured folder in every selected lesson. Folder selections and notes are bound into approval and revalidated on publication. The old `--image-collection slides|gross` option is retained only for historical compatibility; new imports use `--image-folder`.

## Data and viewer

Materials retain ordered `documents`, `type: other`, and `category: practical`. Folder assignment uses `practicalImageFolderId` on each document, with an optional material-level default. Documents may include `thumbnailUrl`, `description`, `altText`, and `sourceUrls`. All metadata lives directly in Firestore. Downloads and thumbnail files under `tmp/telegram-inbox/` are disposable media only.

The uploader creates bounded 240×180 JPEG thumbnails, publishes them through the existing checksum-verified R2 uploader, and preserves original full-resolution images. The viewer loads one full-size image and small lazy thumbnails; only adjacent images are prefetched after selection, and Save-Data disables prefetch. Rapid navigation discards stale decode results. Errors can be retried by selecting the image again.

Routes are `/module/MODULE/SUBJECT/lesson/LESSON/images/FOLDER`, with `?image=` selecting the stable material/document key. Existing `/viewer/MATERIAL?document=DOCUMENT` bookmarks redirect to the correct image in its flat folder. Old generic folder links redirect to the lesson or its sole configured folder. No material/document IDs or original image bytes need to change.

`PracticalImageViewer.astro` and its TypeScript controller provide previous/next, keyboard arrows/Home/End, touch swipes at fit zoom, thumbnails, zoom/fit, fullscreen and image download. Descriptions sit beside the image on desktop and immediately below its bounded-height viewport on mobile. Generic document players no longer contain the practical-image controls; ordinary document-image captions use the small shared `ImageCaption` component.

Checks: `pnpm test:lessons`, `pnpm test:telegram-materials`, `pnpm test`, `pnpm astro check`, and `pnpm build`. Verify folder isolation across subjects/modules, question-image mixing, deep links, mobile captions, rapid navigation, failed-image retry, and old bookmarked links after deployment.
