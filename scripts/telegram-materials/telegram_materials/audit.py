"""Reconcile published staging against Firestore and public R2 responses, without writes."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

from .core import MODULE_ID, Stage, link_id
from .store import catalogue


def audit_publication(stage: Stage, db) -> list[str]:
    _, lessons, materials = catalogue(db)
    material_map = {material['id']: material for material in materials}
    lesson_map = {lesson['id']: lesson for lesson in lessons}
    from google.cloud.firestore_v1.base_query import FieldFilter
    edges = {doc.id: doc.to_dict() for doc in db.collection('material_lesson_links').where(
        filter=FieldFilter('moduleId', '==', MODULE_ID)).stream()}
    run_ref = db.collection('material_imports').document(stage.setting('run_id'))
    checkpoints = {doc.id: doc.to_dict() for doc in run_ref.collection('entries').stream()}
    errors, files, seen = [], {}, {}
    entries = stage.entries()
    published = [entry for entry in entries if entry.get('status') == 'published']
    for entry in published:
        material = material_map.get(entry.get('materialId'))
        checkpoint = checkpoints.get(entry['id'])
        if not material or not checkpoint or checkpoint.get('materialId') != entry.get('materialId'):
            errors.append(entry['id'] + ': missing live material or checkpoint')
            continue
        if material.get('importReviewStatus') != 'pending' or checkpoint.get('reviewStatus') != 'pending':
            errors.append(entry['id'] + ': missing pending-review marker')
        if material.get('moduleId') != MODULE_ID or material.get('year') != 2 or material.get('semester') != 1:
            errors.append(entry['id'] + ': incorrect curriculum scope')
        for lesson_id in entry['lessonIds']:
            lesson = lesson_map.get(lesson_id)
            edge = edges.get(link_id(material['id'], lesson_id))
            if not lesson or lesson.get('active') is False or not edge or edge.get('materialId') != material['id'] or edge.get('lessonId') != lesson_id:
                errors.append(entry['id'] + ': missing or invalid lesson assignment ' + lesson_id)
        urls = {item['url'] for item in material.get('documents', [])}
        checkpoint_files = {item['sha256']: item['url'] for item in checkpoint.get('files', [])}
        for member in [stage.get(member_id) for member_id in entry.get('members', [])] or [entry]:
            sha, url = member['sha256'], member.get('uploadedUrl')
            if sha in seen:
                errors.append(sha + ': file referenced by more than one imported material')
            seen[sha] = entry['id']
            if not url or url not in urls or checkpoint_files.get(sha) != url:
                errors.append(sha + ': file URL disagrees with live document or checkpoint')
            else:
                files[sha] = member
    if any(entry.get('status') == 'held' and entry.get('uploadedUrl') for entry in entries):
        errors.append('A held file has an upload checkpoint')

    def inspect(entry):
        try:
            headers = {'User-Agent': 'ASUMedMaterials/1.0'}
            with urlopen(Request(entry['uploadedUrl'], method='HEAD', headers=headers), timeout=40) as response:
                if response.status != 200 or response.headers.get_content_type() != entry['mime'] or int(response.headers.get('Content-Length', 0)) != entry['bytes']:
                    return entry['id'] + ': incorrect public status, MIME or length'
                if response.headers.get('Content-Disposition') != 'inline':
                    return entry['id'] + ': missing inline disposition'
            with urlopen(Request(entry['uploadedUrl'], headers={**headers, 'Range': 'bytes=0-15'}), timeout=40) as response:
                if response.status != 206 or len(response.read(17)) != 16:
                    return entry['id'] + ': byte-range preview failed'
        except Exception as exc:
            return entry['id'] + ': public file check failed: ' + str(exc)[:180]
        return None

    with ThreadPoolExecutor(max_workers=5) as workers:
        errors.extend(error for error in workers.map(inspect, files.values()) if error)
    summary = [f'Published materials: {len(published)}', f'Unique public files checked: {len(files)}',
               f'Lesson associations: {sum(len(entry["lessonIds"]) for entry in published)}', f'Errors: {len(errors)}']
    (stage.directory / 'VERIFICATION.md').write_text('# Publication verification\n\n' + '\n'.join('- ' + line for line in summary + errors) + '\n')
    print('\n'.join(summary), flush=True)
    return errors
