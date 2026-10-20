"""Resumable Firestore identity index; routine analysis never scans materials."""
from __future__ import annotations

import uuid

from .inbox_core import asset_key, now, resource_keys

INDEX_ID = 'catalogue-state'


def version(repo, tx=None):
    return (repo.read('materials_version', 'current', tx) or {}).get('version', 0)


def index_state(repo, *, required=False):
    state = repo.read('material_asset_index', INDEX_ID) or {}
    ready = state.get('complete') and state.get('version') == version(repo)
    if required and not ready:
        raise ValueError('Duplicate index is missing or outdated. Run inbox index --limit 50 until complete before approval/publication')
    return state if ready else None


def index_catalogue(repo, limit=50, force=False):
    if not 1 <= limit <= 200:
        raise ValueError('Index page limit must be between 1 and 200')
    repo.guard()
    current_version = version(repo)
    state = repo.read('material_asset_index', INDEX_ID) or {}
    if not force and state.get('complete') and state.get('version') == current_version:
        return {'complete': True, 'materialsRead': 0, 'version': current_version}
    if force or state.get('version') != current_version or not state.get('generation'):
        state = {'generation': uuid.uuid4().hex, 'version': current_version, 'cursor': '',
                 'complete': False, 'indexedMaterials': 0, 'updatedAt': now()}
        def begin(tx):
            repo.guard(tx)
            if version(repo, tx) != current_version:
                raise ValueError('Catalogue changed; retry indexing')
            repo.write('material_asset_index', INDEX_ID, state, tx, merge=False)
        repo.atomic(begin)
    materials = repo.list('materials', limit=limit, after=state.get('cursor') or None)
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
            live = repo.read('material_asset_index', INDEX_ID, tx)
            old = repo.read_many('material_asset_index', [asset_key(key) for key in chunk], tx)
            if live.get('generation') != state['generation']:
                raise ValueError('Index generation changed; retry')
            for key in chunk:
                previous = old[asset_key(key)] or {}
                associations = previous.get('materials', {}) if previous.get('generation') == state['generation'] else {}
                value = {**grouped[key], 'generation': state['generation'],
                         'materials': {**associations, **grouped[key]['materials']}, 'updatedAt': now()}
                repo.write('material_asset_index', asset_key(key), value, tx, merge=False)
        repo.atomic(save)
    def checkpoint(tx):
        repo.guard(tx)
        live = repo.read('material_asset_index', INDEX_ID, tx)
        live_version = version(repo, tx)
        if live.get('generation') != state['generation'] or live_version != current_version:
            raise ValueError('Catalogue changed during indexing; retry starts a fresh generation')
        repo.write('material_asset_index', INDEX_ID, {'cursor': materials[-1]['id'] if materials else state.get('cursor', ''),
            'indexedMaterials': state.get('indexedMaterials', 0) + len(materials),
            'complete': len(materials) < limit, 'updatedAt': now()}, tx)
    repo.atomic(checkpoint)
    return {'complete': len(materials) < limit, 'materialsRead': len(materials),
            'indexedMaterials': state.get('indexedMaterials', 0) + len(materials), 'version': current_version}
