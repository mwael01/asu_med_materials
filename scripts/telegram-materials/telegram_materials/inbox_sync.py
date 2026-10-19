from __future__ import annotations

from datetime import datetime, timedelta, timezone
from telethon.tl.types import MessageEmpty

from .collector import extract_links
from .inbox_core import CHANNEL, SOURCE_ID, PEER_ID, TERMINAL, fingerprint, message_key, message_payload, now


def ingest(repo, payload: dict, *, full_scan=False) -> bool:
    """A cursor advances in the same transaction that durably queues a message."""
    def commit(tx):
        repo.guard(tx)
        key = message_key(payload['messageId'])
        previous = repo.read('material_inbox', key, tx)
        source = repo.read('material_inbox_sources', SOURCE_ID, tx) or {}
        changed = not previous or previous['fingerprint'] != payload['fingerprint']
        if changed:
            if len(payload['parts']) > 200:
                raise ValueError('Post contains too many resources; split it before retrying')
            for part in payload['parts']:
                item_id = fingerprint({'message': key, 'revision': payload['fingerprint'], 'part': part['key']})
                repo.write('material_inbox_items', item_id, {**part, 'sourceId': SOURCE_ID,
                    'messageId': payload['messageId'], 'revision': payload['fingerprint'],
                    'sourceUrl': payload['sourceUrl'], 'caption': payload['caption'], 'albumId': payload['albumId'],
                    'replyTo': payload['replyTo'], 'date': payload['date'], 'status': 'queued', 'createdAt': now()}, tx, merge=False)
            repo.write(f'material_inbox/{key}/revisions', payload['fingerprint'], payload, tx, merge=False)
            repo.write('material_inbox', key, {**payload, 'status': 'queued' if payload['parts'] else 'ignored',
                'reason': '' if payload['parts'] else 'Service or empty message has no materials',
                'sourceMissing': False, 'updatedAt': now()}, tx, merge=False)
        elif previous.get('sourceMissing'):
            repo.write('material_inbox', key, {'sourceMissing': False}, tx)
        checkpoint = {'channel': CHANNEL, 'peerId': PEER_ID,
            'lastMessageId': max(payload['messageId'], source.get('lastMessageId', 0)), 'updatedAt': now()}
        if full_scan:
            checkpoint['fullReconciliationCursor'] = payload['messageId']
        repo.write('material_inbox_sources', SOURCE_ID, checkpoint, tx)
        return changed
    return repo.atomic(commit)


def mark_missing(repo, message_id):
    repo.guard()
    previous = repo.read('material_inbox', message_key(message_id))
    if previous and previous.get('sourceMissing'):
        return
    repo.write('material_inbox', message_key(message_id), {'sourceMissing': True, 'updatedAt': now()})
    for item in repo.list('material_inbox_items', message_id=message_id):
        if item['messageId'] == message_id:
            patch = {'sourceMissing': True}
            if item['status'] not in TERMINAL:
                patch.update(status='held', reason='Source post was deleted or is unavailable; website materials were not removed')
            repo.write('material_inbox_items', item['id'], patch)
    repo.refresh_message_status(message_id)


async def sync(repo, client, *, full=False, limit=500):
    channel = await client.get_entity(CHANNEL)
    if channel.id != int(SOURCE_ID.split('-')[-1]):
        raise ValueError('The configured username no longer identifies the approved channel')
    source = repo.read('material_inbox_sources', SOURCE_ID) or {}
    if source.get('cooldownUntil', '') > now():
        raise ValueError('Telegram cooldown remains active until ' + source['cooldownUntil'])
    latest = await client.get_messages(channel, limit=1)
    tip = latest[0].id if latest else 0
    if full:
        if source.get('fullReconciliationInProgress'):
            cursor = source.get('fullReconciliationCursor', 0)
            tip = source['fullReconciliationTip']
        else:
            cursor = 0
            repo.write('material_inbox_sources', SOURCE_ID, {'fullReconciliationInProgress': True,
                'fullReconciliationCursor': 0, 'fullReconciliationTip': tip})
    else:
        cursor = source.get('lastMessageId', 0)
    count, changed, complete = 0, 0, True
    async for message in client.iter_messages(channel, min_id=cursor, max_id=tip + 1, reverse=True):
        if count >= limit:
            complete = False
            break
        changed += ingest(repo, message_payload(message, extract_links(message)), full_scan=full)
        count += 1
    if full and not complete:
        # A partial full scan must never label messages it has not visited as deleted.
        to_check = []
    else:
        known = repo.list('material_inbox') if full else repo.recent_messages(200)
        to_check = [m['messageId'] for m in known]
        previous_messages = {m['messageId']: m for m in known}
    for start in range(0, len(to_check), 100):
        ids = to_check[start:start + 100]
        messages = await client.get_messages(channel, ids=ids)
        available = {m.id: m for m in messages if m and not isinstance(m, MessageEmpty)}
        for message_id in ids:
            if message_id in available:
                m = available[message_id]
                payload = message_payload(m, extract_links(m))
                previous = previous_messages[message_id]
                if previous['fingerprint'] != payload['fingerprint'] or previous.get('sourceMissing'):
                    changed += ingest(repo, payload)
                elif previous.get('sourceStatus') != SOURCE_ID + ':' + previous['status']:
                    repo.write('material_inbox', previous['id'], {'status': previous['status']})
            else:
                mark_missing(repo, message_id)
    repo.guard()
    repo.write('material_inbox_sources', SOURCE_ID, {'lastSuccessfulSyncAt': now(),
        'lastFullReconciliationAt': now() if full and complete else source.get('lastFullReconciliationAt'),
        'syncComplete': complete, 'observedTip': tip})
    if full and complete:
        repo.write('material_inbox_sources', SOURCE_ID, {'fullReconciliationInProgress': False, 'fullReconciliationCursor': 0})
    return {'messagesScanned': count, 'newOrChanged': changed, 'complete': complete, 'tip': tip}


def cooldown(repo, seconds):
    repo.write('material_inbox_sources', SOURCE_ID, {'cooldownUntil':
        (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()})


async def verify_source(repo, client, item):
    message = repo.read('material_inbox', message_key(item['messageId']))
    if not message or message['fingerprint'] != item['revision'] or message.get('sourceMissing'):
        raise ValueError('Source revision is stale or unavailable; sync and review again')
    fresh = await client.get_messages(PEER_ID, ids=item['messageId'])
    if not fresh or isinstance(fresh, MessageEmpty):
        mark_missing(repo, item['messageId'])
        raise ValueError('Telegram source was removed')
    payload = message_payload(fresh, extract_links(fresh))
    if payload['fingerprint'] != item['revision']:
        ingest(repo, payload)
        raise ValueError('Telegram source changed; the new revision needs review')
    return fresh
