# Admin material preparation

The admin assistant prepares editable drafts from pasted messages and public link previews. It never publishes automatically. Published materials, curriculum, and contributor profiles remain in Firestore; drafts and review evidence exist only in page memory.

## Extraction

`src/firebase/ai.ts` uses the existing Firebase AI Logic Gemini 3.8 Flash model with a JSON response schema. Requests include the complete active curriculum, original message, original URLs, and public preview metadata. Prompts require expressive Arabic and English titles, paired factual descriptions, bilingual search tags, and explicit creator attribution. A sender/uploader is not automatically an author.

Unknown years and modules stay unresolved. A year is required at publication; general resources may have no module. A selected module must match its year. Normalization checks types and reconciles output against the original URL list: invented URLs are discarded and omitted URLs remain flagged drafts. Platform classification uses parsed hostnames rather than substring matching. URL comparison preserves case-sensitive paths and invite tokens.

Messages are limited to 80,000 characters and 100 URLs. Preview requests run in batches of 20. Failed previews do not prevent AI extraction from the message. Failed AI requests produce link-only drafts with an explicit manual-completion notice, never a misleading success message. Messages with no links produce no publishable draft.

## Public previews

`POST /api/material-metadata` accepts `{ urls: string[] }` and returns `{ metadata: LinkMetadata[] }`. Send a Firebase ID token in the Authorization bearer header. The server verifies the token through Firebase Auth and checks the current `users/{uid}.role` in Firestore. It uses the existing `PUBLIC_FIREBASE_API_KEY` and `PUBLIC_FIREBASE_PROJECT_ID`; there is no new AI key or service-account requirement.

Cheerio reads Open Graph, Twitter, standard title/description, and explicit author metadata from public HTML, including YouTube, Drive, Telegram, WhatsApp invite pages, and general websites. Login pages and failed previews return an unavailable status. The application does not sign in to links, join groups, expand Drive folders, download documents, execute page scripts, or perform OCR. JavaScript-only or protected pages may have no useful preview.

Requests allow public HTTP/HTTPS URLs on standard ports only. Each destination and redirect is validated, DNS results must be public, and socket connections are pinned to validated addresses. Limits: four concurrent requests, eight seconds per URL, three redirects, 1 MB HTML, and 90 KB request body. Neither private network resources nor URL credentials are accepted. Tokens are used only for Firebase verification, never forwarded to linked websites. Response caching is disabled.

## Review and publication

`MaterialReviewFields.astro` and `materialEditor.ts` provide the same editor for individual and staged drafts. Both show titles, descriptions, tags, authors, contributor credit, classification, and playlist videos. `materialDrafts.ts` validates and serializes both paths identically. Arabic and English titles are required; descriptions are optional, but must be paired when present.

Each draft captures its contributor and submission ID when created. Direct additions credit the current admin. Student submissions retain student credit, including guest submissions without a UID. Authors are separate and support multiple names. The publishing admin is recorded in the activity log. Metadata and transient issues never create local material files.

Drafts have stable publication IDs. Publishing checks live duplicates and requests explicit confirmation for duplicates. Saved drafts are removed while failed drafts remain. A source submission is approved only when its saved drafts leave no remaining drafts from that submission. Changing or cancelling the input invalidates outstanding AI requests; editing an existing individual draft prevents incoming AI results from overwriting it.

## Validation

Run `pnpm test:admin-ai`, `pnpm astro check`, and `pnpm build`. Tests use synthetic in-memory fixtures and mocked transports, not real study materials or Firestore writes. The test-only TypeScript loader uses the existing TypeScript compiler and substitutes environment access for endpoint tests.

For a live smoke check, sign in as an admin and paste Arabic, English, and mixed messages with public/private links. Inspect translations, author versus contributor, unknown curriculum, duplicate notices, and playlist videos in both single and bulk editors. Verify mobile/desktop layouts and language switching. Publishing a live test material is a separate explicit action, not part of automated validation.
