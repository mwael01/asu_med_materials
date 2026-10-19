"""Apply explicit, reviewed CSV decisions to temporary staging and export upload outcomes."""
from __future__ import annotations

import csv
import json
from pathlib import Path

from .core import Stage, identity
from .files import publication_blocker, verify_entry
from .store import catalogue, existing_matches, validate_lessons


def curate(stage: Stage, db, decisions: Path) -> int:
    _, lessons, materials = catalogue(db)
    plans, used, existing_used = [], set(), set()
    with decisions.open(encoding='utf-8-sig', newline='') as handle:
        for row in csv.DictReader(handle):
            ids = row['entryIds'].split('|')
            if any(entry_id in used for entry_id in ids) or len(set(ids)) != len(ids):
                raise ValueError('A file appears in more than one decision')
            members = [stage.get(entry_id) for entry_id in ids]
            if any(not member or member['kind'] != 'file' or member.get('status') in {'rejected', 'deferred', 'published'} or member.get('bundledInto') for member in members):
                raise ValueError('Decisions must select unpublished, ungrouped, eligible files')
            for member in members:
                if blocker := publication_blocker(member, stage):
                    raise ValueError(blocker)
                verify_entry(stage, member)
            entry_id = ids[0] if len(ids) == 1 else identity(json.dumps(['bundle', ids]))
            entry = dict(members[0]) if len(ids) == 1 else {'id': entry_id, 'kind': 'bundle', 'members': ids}
            entry.update(title=row['title'].strip(), lessonIds=row['lessonIds'].split('|'),
                         category=row['category'], reviewReason=row['reason'].strip(), status='approved')
            if not entry['title'] or not entry['reviewReason'] or entry['category'] not in {'summaries', 'practical', 'exams', 'references', 'lectures'}:
                raise ValueError('Every decision needs a title, category and evidence reason')
            if row.get('author'):
                entry['author'] = row['author'].strip()
            existing = row.get('existingMaterialId')
            if existing:
                if existing in existing_used or existing not in {material['id'] for material in materials}:
                    raise ValueError('Invalid or repeated existing material selection')
                entry['existingMaterialId'] = existing
                existing_used.add(existing)
            validate_lessons(entry, lessons)
            matches = existing_matches(entry, materials, stage)
            if matches and existing not in matches:
                raise ValueError(f"{entry_id}: unresolved catalogue duplicates: {matches}")
            plans.append((entry, members))
            used.update(ids)
    # Validate the entire decision sheet before changing any staging records.
    for entry, members in plans:
        stage.save(entry)
        if len(members) > 1:
            for member in members:
                member['bundledInto'] = entry['id']
                stage.save(member)
    for entry in stage.entries():
        if entry['kind'] == 'file' and entry.get('status') == 'unreviewed' and entry['id'] not in used:
            entry.update(status='held', reviewReason='Scope, lesson coverage, source attribution or possible catalogue duplication remains unconfirmed; do not upload.')
            stage.save(entry)
    publication_report(stage)
    return len(plans)


def publication_report(stage: Stage) -> None:
    entries = {entry['id']: entry for entry in stage.entries()}
    with (stage.directory / 'publication.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['entryId', 'title', 'status', 'reviewStatus', 'materialId', 'lessonIds', 'sha256', 'uploadedUrl', 'websitePath', 'reason'])
        for entry in entries.values():
            if entry['kind'] != 'file':
                continue
            parent = entries.get(entry.get('bundledInto'), entry)
            material_id = parent.get('materialId', '')
            writer.writerow([entry['id'], entry['title'], parent.get('status'), 'pending' if material_id else '', material_id,
                             '|'.join(parent.get('lessonIds', [])), entry['sha256'], entry.get('uploadedUrl', ''),
                             '/viewer/' + material_id if material_id else '', parent.get('reviewReason') or entry.get('exclusionReason', '')])
