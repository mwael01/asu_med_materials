from __future__ import annotations

import asyncio
import json

from .inbox_core import SOURCE_ID, TERMINAL, now
from .inbox_repository import InboxRepository
from .store import get_db


def add_parser(commands):
    root = commands.add_parser('inbox', help='Persistent, curriculum-wide archive channel queue')
    sub = root.add_subparsers(dest='inbox_command', required=True)
    sync = sub.add_parser('sync'); sync.add_argument('--full', action='store_true'); sync.add_argument('--limit', type=int, default=500)
    analyze = sub.add_parser('analyze'); analyze.add_argument('--limit', type=int, default=50)
    analyze.add_argument('--module', action='append', default=[], help='Load lesson suggestions only for these modules')
    index = sub.add_parser('index', help='Build/resume one bounded page of the Firestore duplicate index')
    index.add_argument('--limit', type=int, default=50); index.add_argument('--rebuild', action='store_true')
    sub.add_parser('status')
    show = sub.add_parser('show'); show.add_argument('item', nargs='?'); show.add_argument('--batch'); show.add_argument('--full', action='store_true')
    decision = sub.add_parser('decide')
    decision.add_argument('--batch', required=True); decision.add_argument('--item', action='append', required=True)
    decision.add_argument('--plan', help='Amend an unpublished decision for these same items')
    decision.add_argument('--action', choices=['create', 'reuse', 'hold', 'ignore', 'duplicate'], required=True)
    decision.add_argument('--module'); decision.add_argument('--lesson', action='append', default=[])
    decision.add_argument('--title'); decision.add_argument('--author'); decision.add_argument('--existing-material')
    decision.add_argument('--replace-lessons', action='store_true', help='Explicitly replace existing lesson assignments on a reused material')
    decision.add_argument('--category', default='summaries', choices=['central', 'lectures', 'practical', 'summaries', 'exams', 'references'])
    decision.add_argument('--reason', required=True)
    approve = sub.add_parser('approve'); approve.add_argument('--batch', required=True)
    publish = sub.add_parser('publish'); publish.add_argument('--batch', required=True); publish.add_argument('--apply', action='store_true')
    retry = sub.add_parser('retry'); retry.add_argument('--item', action='append')


def show_item(item, full=False, source=None):
    if not item:
        raise ValueError('Item not found')
    result = dict(item)
    if source:
        result['sourceContext'] = {key: source.get(key) for key in ['fingerprint', 'forward', 'replyTo', 'albumId', 'editedAt', 'sourceMissing']}
    if not full and result.get('evidence', {}).get('text'):
        result['evidence'] = {**result['evidence'], 'text': result['evidence']['text'][:6000]}
    return result


def run(args):
    repo = InboxRepository(get_db())
    command = args.inbox_command
    if command == 'status':
        counts = repo.message_counts()
        result = {'source': repo.read('material_inbox_sources', SOURCE_ID), 'counts': dict(counts),
                  'countsUnit': 'current source messages, including service posts',
                  'done': sum(v for k, v in counts.items() if k in TERMINAL), 'outstanding': sum(v for k, v in counts.items() if k not in TERMINAL),
                  'batches': [{'id': b['id'], 'status': b['status']} for b in repo.list('material_inbox_batches', limit=20, order='createdAt', descending=True)]}
    elif command == 'show':
        def inspect(key):
            item = repo.read('material_inbox_items', key)
            source = repo.read('material_inbox', f"{SOURCE_ID}-{item['messageId']}") if item else None
            return show_item(item, args.full, source)
        if args.batch:
            batch = repo.read('material_inbox_batches', args.batch)
            if not batch:
                raise ValueError('Batch not found')
            result = {'batch': batch, 'plans': repo.list(f'material_inbox_batches/{args.batch}/plans'),
                      'items': [inspect(key) for key in batch['itemIds']]}
        else:
            result = inspect(args.item or '')
    else:
        with repo.lease():
            if command in {'sync', 'analyze'} or command == 'publish' and args.apply:
                result = asyncio.run(telegram_operation(args, repo))
            elif command == 'index':
                from .inbox_catalogue import index_catalogue
                result = index_catalogue(repo, args.limit, args.rebuild)
            elif command == 'decide':
                from .inbox_publication import decide
                result = {'planId': decide(repo, args.batch, args.item, {'action': args.action, 'moduleId': args.module,
                    'lessonIds': list(dict.fromkeys(args.lesson)), 'title': args.title, 'author': args.author,
                    'existingMaterialId': args.existing_material, 'replaceLessonAssignments': args.replace_lessons,
                    'category': args.category, 'reason': args.reason}, args.plan)}
            elif command == 'approve':
                from .inbox_publication import approve
                result = approve(repo, args.batch)
            elif command == 'publish':
                from .inbox_publication import publish
                result = asyncio.run(publish(repo, None, args.batch, False))
            elif command == 'retry':
                items = [repo.read('material_inbox_items', key) for key in args.item] if args.item else repo.list('material_inbox_items', {'failed'})
                count = 0
                for item in items:
                    if not item or item['status'] in {'published', 'approved', 'publishing'}:
                        raise ValueError('Cannot retry a missing, approved or published item')
                    if any(t['status'] != 'published' for t in item.get('targetPlans', {}).values()):
                        raise ValueError('Amend pending decisions to hold before retrying; their publication targets must be resolved first')
                    repo.write('material_inbox_items', item['id'], {'status': 'queued', 'reason': 'Explicit retry requested', 'updatedAt': now()})
                    repo.refresh_message_status(item['messageId']); count += 1
                result = {'queuedAgain': count}
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


async def telegram_operation(args, repo):
    from .cli import acquire_telegram_lock, telegram_client
    from .inbox_sync import sync, cooldown
    from .inbox_analysis import analyze
    from .inbox_publication import publish
    from telethon.errors import FloodWaitError
    lock = acquire_telegram_lock()
    client = None
    try:
        source = repo.read('material_inbox_sources', SOURCE_ID) or {}
        if source.get('cooldownUntil', '') > now():
            raise ValueError('Telegram cooldown active until ' + source['cooldownUntil'])
        client = await telegram_client()
        if args.inbox_command in {'sync', 'analyze'} and args.limit < 1:
            raise ValueError('Limit must be positive')
        if args.inbox_command == 'sync':
            return await sync(repo, client, full=args.full, limit=args.limit)
        if args.inbox_command == 'analyze':
            return await analyze(repo, client, args.limit, args.module)
        return await publish(repo, client, args.batch, True)
    except FloodWaitError as exc:
        cooldown(repo, exc.seconds)
        raise ValueError(f'Telegram rate limit: retry after {exc.seconds} seconds') from None
    finally:
        if client is not None:
            await client.disconnect()
        lock.close()
