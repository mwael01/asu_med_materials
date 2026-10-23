# Interactive HTML and clinical PDFs

## Static interactive pages

Forward a standalone HTML file to the Telegram inbox and use the normal sync/analyze workflow. The importer recognizes complete UTF-8 HTML by content, verifies its checksum, and stores title, text, question count, scripts, frames, forms, event handlers and resource URLs as Firestore review evidence. Review the source itself, including CSS resource URLs and script behavior; metadata is evidence rather than an automatic safety decision. Local HTML downloads are disposable media, not a catalogue.

```bash
pnpm materials:telegram inbox show ITEM_ID --full
pnpm materials:telegram inbox decide --batch BATCH_ID --item ITEM_ID \
  --action create --module MODULE_ID --lesson LESSON_ID \
  --title 'Respiratory Pharmacology — Interactive MCQs' --category exams \
  --author 'Dr. Mohamed Elshorbgy' --reviewed-html \
  --reason 'Inspected standalone CSS quiz, no scripts or external dependencies'
pnpm materials:telegram inbox publish --batch BATCH_ID
pnpm materials:telegram inbox approve --batch BATCH_ID
pnpm materials:telegram inbox publish --batch BATCH_ID --apply
```

HTML publication requires explicit `--reviewed-html` confirmation bound into approval. Assets use the existing immutable R2 hash paths, correct `text/html` MIME, inline disposition and 25 MB limit. The original bytes remain unchanged. Materials contain ordered `documents` with `mimeType: text/html`; no new material type is required.

Only immutable HTML hosted on the existing materials domain is embedded. `InteractiveDocument.astro` supplies a separate sandboxed iframe with scripts allowed, an opaque origin, no parent navigation/form permissions and no referrer. The same component serves the standalone reader and the lesson workspace's Interactive tab. CSS radio-button quizzes work without scripts. External HTML links remain ordinary links. Download serves the original file as an attachment; switching resources releases the old frame.

## Clinical PDFs

Clinical is a module subject. Each verified PDF gets its own active lesson, with an ID derived from its content checksum. Reusing identical bytes in the same module reuses that lesson. Separate PDFs receive separate lessons, even when titles match. Existing module subjects and lessons are preserved.

```bash
pnpm materials:telegram inbox clinical-lesson --item PDF_ITEM_ID \
  --module MODULE_ID --title 'Clinical ENT'
# Apply the previewed curriculum addition:
pnpm materials:telegram inbox clinical-lesson --item PDF_ITEM_ID \
  --module MODULE_ID --title 'Clinical ENT' --apply
# Use the returned lesson ID:
pnpm materials:telegram inbox decide --batch BATCH_ID --item PDF_ITEM_ID \
  --action create --module MODULE_ID --lesson RETURNED_LESSON_ID \
  --title 'Clinical ENT' --author 'ASU Faculty Staff' --category lectures \
  --reason 'Department clinical PDF; one lesson for this PDF'
```

Publish with the usual preview/approval/apply workflow. Department PDFs always use `ASU Faculty Staff`, appearing in the Faculty & Department Staff folder. Curriculum writes update the catalogue version atomically; a current duplicate index advances with that version because the materials themselves have not changed. Inactive modules remain inactive; material uploads must not silently activate them.

Checks: `pnpm test:telegram-materials`, `pnpm test:document-viewer`, `pnpm test:lessons`, `pnpm astro check`, and `pnpm build`.
