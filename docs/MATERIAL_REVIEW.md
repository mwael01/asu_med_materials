# Material source review

Run `scripts/material-review/run.py` with the existing Telegram importer Python environment and Firebase Admin credentials. Materials, evidence, plans and original records stay in Firestore. No local material-data files are created.

## Resume without rescanning

```bash
scripts/telegram-materials/.venv/bin/python scripts/material-review/run.py --run REVIEW_ID review-session
```

The session loads `material_audits/{runId}/changes` once. `summary`, `list`, `show MATERIAL_ID,MATERIAL_ID` and `validate` reuse process memory. `load MATERIAL_ID` fetches a newly staged change. `amend JSON_ARRAY` changes a pending plan with an update-time precondition and a required reason. `apply` publishes the loaded plans; `quit` closes the session.

For direct resumption, `apply --apply` queries only pending changes. Without `--apply`, it prints them without publication. Transactions handle at most twenty materials and compare current content, assignments and review checkpoints with their saved originals before writing. They validate curriculum destinations and commit materials, assignments, checkpoints and catalog versions together. Curriculum reads are shared within each transaction. Only affected materials are read back for verification. A concurrent edit stops the group before it writes; completed groups retain their checkpoints.

Original content and assignments remain in `before` and `beforeLinks` for recovery. Audit collections use service-account access and remain inaccessible to public clients under the default Firestore rules.

## Targeted work

Append one command to the runner above:

| Command | Behavior |
| --- | --- |
| `inspect --id MATERIAL_ID --compact` | Read one material and its destinations. |
| `inspect --module MODULE_ID --videos --compact` | Inspect one module. |
| `browse 'https://www.youtube.com/@CHANNEL/videos'` | Parse the channel and every continuation; retain evidence remotely. |
| `details VIDEO_ID` | Inspect source descriptions and availability. Bot challenges remain unverified. |
| `plan MATERIAL_ID --patch JSON --lessons LESSON_ID --reason REASON` | Stage a reviewed correction. |
| `plan-batch --changes JSON_ARRAY` | Stage reviewed changes with `id`, `patch`, `videoIds`, `lessons`, `removeFields`, `delete` and `reason`. |
| `plan-authors --ids MATERIAL_ID,MATERIAL_ID --mapping JSON` | Stage a reviewed alias-to-canonical-name mapping for exact materials. |

Supply JSON directly as an argument, never through a material-data file. `plan --video-ids ID,ID` builds an ordered structured playlist with verified source titles, preserves matching video-item IDs and removes the original `playlistId` so synchronization cannot restore excluded chapters. `--lessons ''` clears assignments while retaining subject resources. `--delete` stages removal with a remote original-record checkpoint.

An author mapping may be `{"Former name":"Canonical name"}` or specify `{"Former name":{"name":"Canonical name","subjects":["Subject"]}}`. Retain historical spellings in `authorAliases` only for the same verified teacher. Correct wrong attribution without saving the wrong person as an alias. Official Moodle, ASU2Learn and faculty Stream recordings use `author: 'ASU Faculty Staff'`; named speakers remain source context.

## Read budget and evidence

Use existing runs and sessions instead of repeating full catalog reads. `inspect` requires `--id`, `--module` or explicit `--all`; `plan-authors` requires `--ids` or explicit `--all`. `inspect --comparison` additionally reads saved source evidence. Ordinary compact inspection does not.

`preview` uses saved snapshots and only their curriculum destinations; it does not verify unaffected materials. `preview --full-catalog` and `scan` intentionally read the whole catalog and should be reserved for new reviews. Stop on quota errors and resume the same run later.

After publication, run `pnpm schema:sync --collections=materials,modules,lessons,material_lesson_links`. Schema sync uses count aggregations, without downloading materials or profiles, and retains previous metadata for unavailable counts.

Schema sync accepts `--admin` to reuse the importer environment and credential loader. It selects that mode automatically when the public Firebase API configuration is absent and the existing ignored Admin credential file is available.

Source titles and descriptions establish labeling evidence, not a complete audiovisual or medical-content review. Failed oEmbed requests do not establish that a source should be deleted. Keep generically titled whole-module series in subject resources until narrower coverage is established. Preserve related parts together; split broad playlists when assigning the complete bundle would expose unrelated chapters in each lesson.

## Teacher identity and verification

`teacherIdentity.ts` normalizes titles, case, spacing and `El-`/`Al-` surname separators. Reviewed Firestore `authorAliases` resolve known spelling and abbreviation variants; conflicting short-name mappings stay separate. Teacher lists and contributor statistics share the resolver. Joint credits count each material once per teacher. Historical doctor links resolve to canonical workspaces; official recordings stay in the department workspace.

Run `pnpm test:teacher-grouping`, `pnpm test:lessons`, `pnpm test:search`, `pnpm astro check`, `pnpm build`, and:

```bash
scripts/telegram-materials/.venv/bin/python -m unittest discover -s scripts/material-review -p 'test_*.py' -v
```

The Python tests use synthetic records and a memory adapter without network or Firestore access.
