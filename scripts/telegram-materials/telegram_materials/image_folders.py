"""Lesson-owned practical folder configuration; no global subject distribution."""
import re
from .inbox_core import now
from .inbox_catalogue import INDEX_ID, version


def validate_folders(folders):
    ids = set()
    for folder in folders:
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', folder.get('id', '')) or not folder.get('title', '').strip() or folder['id'] in ids:
            raise ValueError('Image folders require unique lowercase IDs and titles')
        ids.add(folder['id'])


def configure_folders(repo, lesson_id, folders, apply=False):
    validate_folders(folders)
    lesson = repo.read('lessons', lesson_id)
    if not lesson or lesson.get('revisionType') != 'practical' or lesson.get('active') is False:
        raise ValueError('Choose an active Practical Revision lesson')
    if not apply:
        return {'lessonId': lesson_id, 'folders': folders, 'apply': False}
    def commit(tx):
        repo.guard(tx)
        live = repo.read('lessons', lesson_id, tx)
        state = repo.read('material_asset_index', INDEX_ID, tx) or {}
        current_version = version(repo, tx)
        if not live or live.get('revisionType') != 'practical' or live.get('active') is False:
            raise ValueError('Lesson changed during folder configuration')
        merged = {folder['id']: folder for folder in live.get('practicalImageFolders', [])}
        merged.update({folder['id']: folder for folder in folders})
        result = list(merged.values())
        if result != live.get('practicalImageFolders'):
            repo.write('lessons', lesson_id, {'practicalImageFolders': result}, tx)
            repo.write('materials_version', 'current', {'version': current_version + 1, 'updatedAt': now()}, tx)
            if state.get('complete') and state.get('version') == current_version:
                repo.write('material_asset_index', INDEX_ID, {'version': current_version + 1, 'updatedAt': now()}, tx)
        return {'lessonId': lesson_id, 'folders': result, 'apply': True}
    return repo.atomic(commit)
