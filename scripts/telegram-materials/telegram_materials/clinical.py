"""Idempotent Clinical subject and one lesson per verified PDF."""
from .inbox_core import now
from .inbox_catalogue import INDEX_ID, version


def clinical_lesson(repo, item_id, module_id, title, apply=False):
    item = repo.read('material_inbox_items', item_id)
    module = repo.read('modules', module_id)
    if not item or item.get('mime') != 'application/pdf' or not item.get('sha256'):
        raise ValueError('Choose an analyzed PDF with a verified checksum')
    if not module or module.get('active') is False or not title.strip():
        raise ValueError('Choose an active module and a clinical lesson title')
    lesson_id = module_id + '-clinical-' + item['sha256'][:16]
    result = {'id': lesson_id, 'title': title.strip(), 'moduleId': module_id, 'subject': 'Clinical', 'order': 10, 'active': True}
    if not apply:
        return {'lesson': result, 'author': 'ASU Faculty Staff', 'apply': False}

    def commit(tx):
        repo.guard(tx)
        live_module = repo.read('modules', module_id, tx)
        old_lesson = repo.read('lessons', lesson_id, tx)
        state = repo.read('material_asset_index', INDEX_ID, tx) or {}
        current_version = version(repo, tx)
        if not live_module or live_module.get('active') is False:
            raise ValueError('Module visibility changed')
        if old_lesson and (old_lesson.get('moduleId') != module_id or old_lesson.get('subject') != 'Clinical'):
            raise ValueError('Clinical lesson ID conflicts with another destination')
        subjects = live_module.get('subjects', [])
        changed = 'Clinical' not in subjects or not old_lesson
        if 'Clinical' not in subjects:
            repo.write('modules', module_id, {'subjects': [*subjects, 'Clinical']}, tx)
        if not old_lesson:
            repo.write('lessons', lesson_id, result, tx, merge=False)
        if changed:
            repo.write('materials_version', 'current', {'version': current_version + 1, 'updatedAt': now()}, tx)
            # Only curriculum changed; a current asset index still describes identical materials.
            if state.get('complete') and state.get('version') == current_version:
                repo.write('material_asset_index', INDEX_ID, {'version': current_version + 1, 'updatedAt': now()}, tx)
        return old_lesson or result
    return {'lesson': repo.atomic(commit), 'author': 'ASU Faculty Staff', 'apply': True}
