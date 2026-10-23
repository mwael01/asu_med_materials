# Practical image uploads

Practical Revision contains **Slides Collection** (all microscopy, including computer-produced micrographs) and **Gross Collection** (models, organs, dissections, pathology jars and other non-microscopy practical images). Official and student images share these folders. Attribution stays on each image set; official faculty material uses `ASU Faculty Staff`.

Firestore remains the only catalogue and review store. Local `tmp/telegram-inbox/` files are disposable media/previews, never material manifests. Images use the existing verified, hash-addressed R2 uploader and 25 MB per-file limit.

## Review and upload

Start with the setup and sync/analyze commands in [TELEGRAM_INBOX.md](./TELEGRAM_INBOX.md). Inspect every image at readable resolution, its source caption and any numbered labels. Distinguish study images from advertisements and chat screenshots. Do not put theory summaries in practical collections merely because they are images.

Use English descriptions: identify the specimen or model and describe visible distinguishing features. Translate supplied labels accurately; do not invent magnification, stains, diagnoses or numbered structures. Use authoritative references for added medical explanations and save their URLs. Hold uncertain curriculum destinations. If the user explicitly requests unanswered identification images, publish them with neutral titles and alternative text, omit identification descriptions, and use `--allow-unlabelled-images` on the create decision. Never infer the answer.

Read live Firestore lessons for the identified module. Select the subject's active lesson with `revisionType: practical`. Create a missing Practical Revision lesson only after confirming the subject and curriculum. Group related images in source order, splitting mixed albums between slides/gross; do not combine unrelated sets or recordings with images.

```bash
pnpm materials:telegram inbox decide --batch BATCH_ID \
  --item FIRST_IMAGE_ID --item SECOND_IMAGE_ID \
  --action create --module MODULE_ID --lesson PRACTICAL_LESSON_ID \
  --title 'Nasal cavity models' --category practical --image-collection gross \
  --reason 'Reviewed model images and numbered source labels'

# Repeat for EVERY image in this plan. With --allow-unlabelled-images, omit --description. Source can be repeated.
pnpm materials:telegram inbox annotate --batch BATCH_ID --plan PLAN_ID \
  --item FIRST_IMAGE_ID --title 'Nasal septum model' \
  --description 'Medial wall: identify the septal cartilage, vomer and perpendicular plate of the ethmoid using the supplied labels.' \
  --alt-text 'Photograph of a labelled nasal septum model' \
  --source 'https://t.me/asumedmaterials/POST_ID'

pnpm materials:telegram inbox publish --batch BATCH_ID
pnpm materials:telegram inbox approve --batch BATCH_ID
pnpm materials:telegram inbox publish --batch BATCH_ID --apply
pnpm materials:telegram inbox status
```

Preview decisions before approval and apply only within the user's authorized publication scope. Approval requires every practical image to have a title and alternative text, plus a description unless the reviewed plan explicitly uses `--allow-unlabelled-images`; the plan must contain hosted images only and target Practical Revision. Descriptions and reference URLs are bound into the approval digest. Approved/published plans cannot be annotated; source edits require new review. Existing reuse decisions preserve editorial metadata and add lesson coverage; they do not silently rewrite existing image sets.

For a playlist mixing modules, repeat `--video-id YOUTUBE_ID` on its create decision to publish only verified tracks belonging to the selected module. Use `--recording` for a verified external recording link (such as an official SharePoint Stream recording) so it becomes a playlist track with an Open original fallback. Source order is retained, and selection is bound into approval.

## Website and data contract

Image sets retain material `type: other`, `category: practical`, ordered `documents`, and optional `practicalImageCollection: slides | gross`. Each document supports optional `description`, `altText`, and `sourceUrls`. Older documents remain supported.

Folders use the existing lesson route followed by `/images/slides` or `/images/gross`. Image sets open `/viewer/MATERIAL_ID`; `?document=DOCUMENT_ID` selects one image. The same description component serves the standalone reader and doctor workspace. Text is rendered as text, with safe HTTP(S) source links. Zoom/reset and fullscreen controls operate on the selected image. Bookmarks and completion retain existing material/document IDs.

Verify collection visibility, source credits, descriptions while switching images, shared item links, image downloads, mobile scrolling and existing PDF/video behavior. Run `pnpm test:telegram-materials`, `pnpm test`, `pnpm astro check`, and `pnpm build`. Deploy viewer support before publishing dependent image sets. Publication retries retain IDs/checkpoints and reuse verified assets; failures stay visible in inbox status.
