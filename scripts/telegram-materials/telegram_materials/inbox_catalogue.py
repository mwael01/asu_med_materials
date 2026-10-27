"""Resumable Firestore identity index; routine analysis never scans materials."""
from __future__ import annotations

import uuid

from .inbox_core import asset_key, now, resource_keys

INDEX_ID = 'catalogue-state'


def index_id(module_id=None):
    return 'catalogue-module-' + module_id if module_id else INDEX_ID


def index_asset_key(key, module_id=None):
    return (module_id + '--' if module_id else '') + asset_key(key)


def version(repo, tx=None):
    return (repo.read('materials_version', 'current', tx) or {}).get('version', 0)


def index_state(repo, module_id=None, *, required=False):
    state = repo.read('material_asset_index', index_id(module_id)) or {}
    ready = state.get('complete') and state.get('version') == version(repo)
    if not ready and module_id:
        return index_state(repo, required=required)
    if required and not ready:
        raise ValueError('Duplicate index is missing or outdated. Run inbox index --module MODULE_ID --limit 50 until complete before approval/publication')
    return state if ready else None


def index_catalogue(repo, limit=50, force=False, module_id=None):
    if not 1 <= limit <= 200:
        raise ValueError('Index page limit must be between 1 and 200')
    repo.guard()
    current_version = version(repo)
    checkpoint_id = index_id(module_id)
    state = repo.read('material_asset_index', checkpoint_id) or {}
    if not force and state.get('complete') and state.get('version') == current_version:
        return {'complete': True, 'materialsRead': 0, 'version': current_version}
    if force or state.get('version') != current_version or not state.get('generation'):
        state = {'generation': uuid.uuid4().hex, 'version': current_version, 'cursor': '',
                 'complete': False, 'indexedMaterials': 0, 'updatedAt': now()}
        if module_id:
            if not repo.read('modules', module_id):
                raise ValueError('Unknown module for scoped duplicate indexing')
            state['moduleId'] = module_id
        def begin(tx):
            repo.guard(tx)
            if version(repo, tx) != current_version:
                raise ValueError('Catalogue changed; retry indexing')
            repo.write('material_asset_index', checkpoint_id, state, tx, merge=False)
        repo.atomic(begin)
    materials = repo.list('materials', module_id=module_id, limit=limit, after=state.get('cursor') or None)
    grouped = {}
    for material in materials:
        for key in resource_keys(material):
            record = grouped.setdefault(key, {'key': key, 'materials': {}})
            record['materials'][material['id']] = material.get('moduleId')
            if key.startswith('sha256:'):
                for member in [material, *(material.get('documents') or []), *(material.get('videos') or [])]:
                    url = member.get('url') or ''
                    if '/materials/sha256/' + key[7:] + '.' in url:
                        record['uploadedUrl'] = url
    keys = sorted(grouped)
    # Bound each transaction independently of how many URLs a material contains.
    for start in range(0, len(keys), 200):
        chunk = keys[start:start + 200]
        def save(tx):
            repo.guard(tx)
            live = repo.read('material_asset_index', checkpoint_id, tx)
            old = repo.read_many('material_asset_index', [index_asset_key(key, module_id) for key in chunk], tx)
            if live.get('generation') != state['generation']:
                raise ValueError('Index generation changed; retry')
            for key in chunk:
                previous = old[index_asset_key(key, module_id)] or {}
                associations = previous.get('materials', {}) if previous.get('generation') == state['generation'] else {}
                value = {**grouped[key], 'generation': state['generation'],
                         'materials': {**associations, **grouped[key]['materials']}, 'updatedAt': now()}
                repo.write('material_asset_index', index_asset_key(key, module_id), value, tx, merge=False)
        repo.atomic(save)
    def checkpoint(tx):
        repo.guard(tx)
        live = repo.read('material_asset_index', checkpoint_id, tx)
        live_version = version(repo, tx)
        if live.get('generation') != state['generation'] or live_version != current_version:
            raise ValueError('Catalogue changed during indexing; retry starts a fresh generation')
        repo.write('material_asset_index', checkpoint_id, {'cursor': materials[-1]['id'] if materials else state.get('cursor', ''),
            'indexedMaterials': state.get('indexedMaterials', 0) + len(materials),
            'complete': len(materials) < limit, 'updatedAt': now()}, tx)
    repo.atomic(checkpoint)
    return {'complete': len(materials) < limit, 'materialsRead': len(materials),
            'indexedMaterials': state.get('indexedMaterials', 0) + len(materials), 'version': current_version}
