from __future__ import annotations

import uuid
from urllib.parse import urlsplit

from firebase_admin import firestore

from .core import link_id, video_link_type
from .inbox_core import SOURCE_ID, MAX_R2_BYTES, TERMINAL, asset_key, fingerprint, item_keys, message_key, now, resource_keys, validate_decision
from .inbox_analysis import matches
from .inbox_catalogue import INDEX_ID, index_state, version
from .inbox_media import cache_path, ensure_cache, inspect_file
from .inbox_sync import verify_source
from .store import put_r2


def plans(repo, batch_id):
    batch = repo.read('material_inbox_batches', batch_id)
    if not batch:
        raise ValueError('Batch not found')
    return batch, repo.list(f'material_inbox_batches/{batch_id}/plans')


def decide(repo, batch_id, ids, decision, plan_id=None):
    batch, previous = plans(repo, batch_id)
    if batch['status'] in {'approved', 'publishing', 'published'}:
        raise ValueError('Approved batches are immutable; analyze or retry in a new batch')
    if not ids or not set(ids).issubset(batch['itemIds']):
        raise ValueError('Choose items in this batch')
    if plan_id:
        old_plan = next((p for p in previous if p['id'] == plan_id), None)
        if not old_plan or old_plan['status'] == 'published' or set(old_plan['itemIds']) != set(ids):
            raise ValueError('Amend an unpublished plan with the same items, or create a new batch')
    modules, lessons = repo.destinations([decision['moduleId']], decision.get('lessonIds', [])) if decision.get('moduleId') else ([], [])
    validate_decision(decision, modules, lessons)
    for old in previous:
        if old['id'] != plan_id and old['action'] in {'create', 'reuse'} and old.get('moduleId') == decision.get('moduleId') and set(old['itemIds']) & set(ids):
            raise ValueError('Overlapping decisions in the same destination are not allowed; use a new batch')
    items = [repo.read('material_inbox_items', key) for key in ids]
    for item in items:
        current = repo.read('material_inbox', message_key(item['messageId']))
        if not current or current['fingerprint'] != item['revision'] or current.get('sourceMissing'):
            raise ValueError('Item source revision is stale or missing')
        if decision['action'] == 'duplicate' and not matches(repo, item):
            raise ValueError('Duplicate decisions require an exact existing asset match')
        if decision['action'] in {'hold', 'ignore', 'duplicate'} and any(t['status'] != 'published' for k, t in item.get('targetPlans', {}).items() if k != plan_id):
            raise ValueError('Resolve pending destination plans before ignoring or holding this item')
        if decision['action'] in {'create', 'reuse'} and item.get('status') in {'queued', 'analyzing', 'failed'}:
            raise ValueError('Analyze and resolve errors before creating a publication decision')
    kinds = {item['kind'] in {'audio', 'video', 'playlist'} or bool(video_link_type(item['url'])) for item in items}
    if decision['action'] in {'create', 'reuse'} and len(kinds) > 1:
        raise ValueError('Group recordings and documents into separate materials')
    if decision['action'] == 'reuse':
        target = repo.read('materials', decision['existingMaterialId'])
        if not target or target.get('moduleId') != decision['moduleId']:
            raise ValueError('Existing material must belong to the selected module')
        if any(decision['existingMaterialId'] not in matches(repo, item) for item in items):
            raise ValueError('Reuse requires verified identity matches for every selected item')
    plan_id = plan_id or uuid.uuid4().hex
    value = {**decision, 'sourceId': SOURCE_ID, 'itemIds': ids, 'revisions': {i['id']: i['revision'] for i in items},
             'status': 'needs_review', 'createdAt': now()}
    def commit(tx):
        repo.guard(tx)
        live_batch = repo.read('material_inbox_batches', batch_id, tx)
        live_items = [repo.read('material_inbox_items', item['id'], tx) for item in items]
        sources = [repo.read('material_inbox', message_key(item['messageId']), tx) for item in items]
        if live_batch['status'] in {'approved', 'publishing', 'published'}:
            raise ValueError('Batch was approved during review')
        if any(not source or source['fingerprint'] != item['revision'] or source.get('sourceMissing') for source, item in zip(sources, items)):
            raise ValueError('Source changed during review')
        repo.write(f'material_inbox_batches/{batch_id}/plans', plan_id, value, tx, merge=False)
        for item in live_items:
            status = {'hold': 'held', 'ignore': 'ignored', 'duplicate': 'duplicate'}.get(decision['action'], 'needs_review')
            targets = {k: v for k, v in item.get('targetPlans', {}).items() if k != plan_id}
            if decision['action'] in {'create', 'reuse'}:
                targets[plan_id] = {'batchId': batch_id, 'status': 'needs_review'}
            # Replace the map so amendments really remove old Firestore map keys.
            repo.write('material_inbox_items', item['id'], {**item, 'status': status, 'reason': decision['reason'], 'targetPlans': targets}, tx, merge=False)
    repo.atomic(commit)
    for message_id in {item['messageId'] for item in items}:
        repo.refresh_message_status(message_id)
    return plan_id


def validate_plans(repo, batch_id):
    batch, decisions = plans(repo, batch_id)
    actionable = [p for p in decisions if p['action'] in {'create', 'reuse'}]
    modules, lessons = repo.destinations([p['moduleId'] for p in actionable], [lid for p in actionable for lid in p['lessonIds']])
    destinations = {}
    if not actionable:
        raise ValueError('No create/reuse decisions are ready for approval')
    index_state(repo, required=True)
    for plan in actionable:
        if len(plan['itemIds']) * 5 + len(plan['lessonIds']) + 6 > 450:
            raise ValueError('Publication group is too large for one transaction; split it before approval')
        validate_decision(plan, modules, lessons)
        for item_id in plan['itemIds']:
            item = repo.read('material_inbox_items', item_id)
            current = repo.read('material_inbox', message_key(item['messageId']))
            if not current or current['fingerprint'] != plan['revisions'][item_id] or current.get('sourceMissing'):
                raise ValueError('A source revision changed after review')
            if item['storage'] == 'r2' and (not item.get('sha256') or item.get('bytes', MAX_R2_BYTES + 1) > MAX_R2_BYTES or item['kind'] == 'archive'):
                raise ValueError('Small files require verified analysis before publication')
            for key in item_keys(item):
                destination = (plan['moduleId'], key)
                previous = destinations.get(destination)
                if previous and previous != (plan['id'], item_id):
                    raise ValueError('Selected items repeat the same asset in one module; consolidate them')
                destinations[destination] = (plan['id'], item_id)
            existing = matches(repo, item)
            same_module = [mid for mid, module_id in existing.items() if module_id == plan['moduleId']]
            own_id = 'inbox-' + fingerprint({'batch': batch_id, 'plan': plan['id']})[:32]
            if plan['action'] == 'create' and any(mid != own_id for mid in same_module):
                raise ValueError('Exact asset already exists in this module; select reuse instead')
            if plan['action'] == 'reuse' and plan['existingMaterialId'] not in same_module:
                raise ValueError('Selected existing material is no longer a verified match')
    digest = fingerprint({'plans': [{k: v for k, v in p.items() if k not in {'status', 'publishedAt', 'materialId', 'reviewStatus'}} for p in sorted(actionable, key=lambda p: p['id'])]})
    return batch, actionable, digest, modules, lessons


def approve(repo, batch_id):
    batch, decisions, digest, _, _ = validate_plans(repo, batch_id)
    repo.write('material_inbox_batches', batch_id, {'status': 'approved', 'approvedDigest': digest, 'approvedAt': now()})
    message_ids = set()
    for plan in decisions:
        if plan['status'] == 'published':
            continue
        for key in plan['itemIds']:
            item = repo.read('material_inbox_items', key)
            message_ids.add(item['messageId'])
            targets = {**item.get('targetPlans', {}), plan['id']: {'batchId': batch_id, 'status': 'approved'}}
            repo.write('material_inbox_items', key, {'status': 'approved', 'targetPlans': targets})
    for message_id in message_ids:
        repo.refresh_message_status(message_id)
    return {'batchId': batch_id, 'approvedPlans': len(decisions), 'digest': digest}


def material_payload(plan, module, lessons, members, urls, material_id):
    value = {'id': material_id, 'title': plan['title'], 'year': module['year'], 'moduleId': module['id'],
             'type': 'other', 'category': plan['category'], 'tags': [], 'createdAt': now(),
             'importRunId': plan['batchId'], 'importReviewStatus': 'pending',
             'importSources': sorted({url for member in members for url in [member['sourceUrl'], member['url']]}),
             'url': urls[members[0]['id']]}
    if module.get('semester'):
        value['semester'] = module['semester']
    subjects = {lesson['subject'] for lesson in lessons if lesson['id'] in plan['lessonIds']}
    if len(subjects) == 1:
        value.update(subject=next(iter(subjects)), lessonId=plan['lessonIds'][0])
    if plan.get('author'):
        value['author'] = plan['author']
    recordings, documents = [], []
    for member in members:
        url = urls[member['id']]
        kind = member['kind']
        source_type = 'direct' if member['storage'] == 'r2' else video_link_type(url) or 'telegram'
        title = member.get('reviewedTitle') or member['title']
        if kind == 'playlist':
            recordings.extend(member['videos'])
        elif kind in {'audio', 'video'} or video_link_type(url):
            recordings.append({'id': member['id'][:32], 'title': title, 'url': url,
                               'sourceType': source_type, 'mediaKind': 'audio' if kind == 'audio' else 'video'})
        else:
            doc = {'id': member['id'][:32], 'title': title, 'url': url}
            if member.get('mime'):
                doc['mimeType'] = member['mime']
            documents.append(doc)
    if recordings:
        value.update(type='playlist', videos=recordings)
    if documents:
        value['documents'] = documents
    if len(members) == 1 and members[0]['kind'] == 'link' and not recordings:
        host = (urlsplit(value['url']).hostname or '').lower().removeprefix('www.')
        value['type'] = ('drive' if host in {'drive.google.com', 'docs.google.com'} else
                         'telegram' if host in {'t.me', 'telegram.me'} else
                         'whatsapp' if host in {'chat.whatsapp.com', 'whatsapp.com', 'wa.me'} else 'website')
    if len(members) == 1 and members[0].get('sha256'):
        value['contentSha256'] = members[0]['sha256']
    return value


async def publish(repo, client, batch_id, apply=False):
    batch, decisions, digest, modules, lessons = validate_plans(repo, batch_id)
    summary = [{'planId': p['id'], 'title': p['title'], 'action': p['action'], 'moduleId': p['moduleId'],
                'lessonIds': p['lessonIds'], 'items': p['itemIds']} for p in decisions]
    if not apply:
        return summary
    if batch.get('status') not in {'approved', 'publishing', 'published'} or batch.get('approvedDigest') != digest:
        raise ValueError('Batch is not approved, or decisions changed since approval')
    # Check every source before any upload. Approval is bound to the exact revision.
    fresh = {}
    for plan in decisions:
        if plan['status'] == 'published':
            continue
        for key in plan['itemIds']:
            item = repo.read('material_inbox_items', key)
            if key not in fresh:
                fresh[key] = await verify_source(repo, client, item)
    repo.write('material_inbox_batches', batch_id, {'status': 'publishing'})
    for plan in decisions:
        if plan['status'] == 'published':
            continue
        repo.guard()
        members = [repo.read('material_inbox_items', key) for key in plan['itemIds']]
        urls = {}
        for index, member in enumerate(members):
            url = member['url']
            if member['storage'] == 'r2' and plan['action'] == 'create':
                if not member.get('sha256') or not cache_path(member).is_file():
                    member = await ensure_cache(repo, client, fresh[member['id']], member)
                    members[index] = member
                if member['bytes'] > MAX_R2_BYTES or cache_path(member).stat().st_size > MAX_R2_BYTES:
                    raise ValueError('25 MB policy forbids this upload')
                checked = inspect_file(cache_path(member), member['kind'])
                if checked['sha256'] != member['sha256']:
                    raise ValueError('Cached file was modified after review')
                # The shared uploader verifies existing bytes before reuse.
                url = put_r2(cache_path(member), member)
                repo.write('material_inbox_items', member['id'], {'uploadedUrl': url})
            urls[member['id']] = url
        mid = plan.get('existingMaterialId') or 'inbox-' + fingerprint({'batch': batch_id, 'plan': plan['id']})[:32]
        module = next(m for m in modules if m['id'] == plan['moduleId'])
        payload = material_payload({**plan, 'batchId': batch_id}, module, lessons, members, urls, mid)
        identities = {key for member in members for key in item_keys(member)}
        indexed_keys = identities | resource_keys(payload)

        def commit(tx):
            repo.guard(tx)
            current_plan = repo.read(f'material_inbox_batches/{batch_id}/plans', plan['id'], tx)
            current_batch = repo.read('material_inbox_batches', batch_id, tx)
            live_index = repo.read('material_asset_index', INDEX_ID, tx) or {}
            live_version = version(repo, tx)
            material = repo.read('materials', mid, tx)
            live_module = repo.read('modules', module['id'], tx)
            assigned = [repo.read('lessons', lid, tx) for lid in plan['lessonIds']]
            sources = [repo.read('material_inbox', message_key(i['messageId']), tx) for i in members]
            live_items = [repo.read('material_inbox_items', i['id'], tx) for i in members]
            asset_records = {key: repo.read('material_asset_index', asset_key(key), tx) or {} for key in indexed_keys}
            if current_plan.get('status') == 'published':
                return
            if not live_index.get('complete') or live_index.get('version') != live_version:
                raise ValueError('Catalogue changed; refresh the duplicate index before resuming publication')
            ignored_fields = {'status', 'publishedAt', 'materialId', 'reviewStatus'}
            if fingerprint({k: v for k, v in current_plan.items() if k not in ignored_fields}) != fingerprint({k: v for k, v in plan.items() if k not in ignored_fields}):
                raise ValueError('Decision changed during publication')
            if current_batch.get('approvedDigest') != digest or not live_module or live_module.get('active') is False:
                raise ValueError('Approval or module visibility changed')
            validate_decision(plan, [live_module], [l for l in assigned if l])
            if any(not source or source['fingerprint'] != item['revision'] or source.get('sourceMissing') for source, item in zip(sources, members)):
                raise ValueError('Source changed during publication')
            if material and plan['action'] == 'create':
                raise ValueError('Material ID collision')
            if plan['action'] == 'reuse' and (not material or material.get('moduleId') != module['id']):
                raise ValueError('Existing material changed or was deleted')
            for key in identities:
                record = asset_records[key]
                if record.get('generation') == live_index['generation'] and plan['action'] == 'create' and any(m != mid and mod == module['id'] for m, mod in record.get('materials', {}).items()):
                    raise ValueError('Another process already published this asset in the module')
            if plan['action'] == 'create':
                repo.write('materials', mid, payload, tx, merge=False)
            else:
                repo.write('materials', mid, {'importReviewStatus': 'pending', 'importRunId': batch_id,
                    'importSources': sorted(set((material.get('importSources') or []) + payload['importSources']))}, tx)
            for lid in plan['lessonIds']:
                repo.write('material_lesson_links', link_id(mid, lid), {'materialId': mid, 'lessonId': lid, 'moduleId': module['id']}, tx, merge=False)
            for item, live in zip(members, live_items):
                targets = {**(live or {}).get('publishedTargets', {}), plan['id']: mid}
                target_plans = {**(live or {}).get('targetPlans', {}), plan['id']: {'batchId': batch_id, 'status': 'published'}}
                status = 'published' if all(t['status'] == 'published' for t in target_plans.values()) else 'publishing'
                repo.write('material_inbox_items', item['id'], {'status': status, 'publishedTargets': targets, 'targetPlans': target_plans, 'publishedAt': now()}, tx)
            for key, old in asset_records.items():
                associations = old.get('materials', {}) if old.get('generation') == live_index['generation'] else {}
                record = {'key': key, 'generation': live_index['generation'], 'materials': {**associations, mid: module['id']}, 'updatedAt': now()}
                repo.write('material_asset_index', asset_key(key), record, tx, merge=False)
            repo.write(f'material_inbox_batches/{batch_id}/plans', plan['id'], {'status': 'published', 'materialId': mid,
                'publishedAt': now(), 'reviewStatus': 'pending'}, tx)
            repo.write('materials_version', 'current', {'version': firestore.Increment(1), 'updatedAt': now()}, tx)
            repo.write('material_asset_index', INDEX_ID, {'version': live_version + 1, 'updatedAt': now()}, tx)
        repo.atomic(commit)
        for message_id in {member['messageId'] for member in members}:
            repo.refresh_message_status(message_id)
    unresolved = [repo.read('material_inbox_items', key)['status'] for key in batch['itemIds']]
    repo.write('material_inbox_batches', batch_id, {'status': 'published' if all(s in TERMINAL for s in unresolved) else 'needs_review', 'updatedAt': now()})
    return summary
