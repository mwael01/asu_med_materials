#!/usr/bin/env python3
"""ASU2Learn respiratory links-only collection and publication commands."""
import argparse
from collections import Counter
import json
import subprocess
import sys

from client import Client, ROOT


def parse(mode, html, url):
    result = subprocess.run(['node', str(ROOT / 'scripts/asu2learn/parse.mjs')],
                            input=json.dumps({'mode': mode, 'html': html, 'url': url}),
                            text=True, capture_output=True, check=True, cwd=ROOT)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('login', help='Authenticate interactively; save private cookies, never the password')
    sub.add_parser('scan', help='Read course HTML and stage current links in Firestore')
    status = sub.add_parser('status', help='Show staged metadata and pending reviews')
    status.add_argument('--all', action='store_true', help='Include published entries')
    sub.add_parser('lessons', help='List active respiratory lesson IDs')
    review = sub.add_parser('review', help='Bind current revisions to reviewed lessons; group related recordings')
    review.add_argument('--entry', action='append', required=True)
    scope = review.add_mutually_exclusive_group(required=True)
    scope.add_argument('--lesson', action='append')
    scope.add_argument('--module-wide', action='store_true', help='Orientation/schedule covering the whole module')
    review.add_argument('--group', required=True, help='Stable series/group key; reuse for future additions')
    review.add_argument('--title', required=True, help='Shared group title')
    review.add_argument('--kind', choices=['link', 'video'], required=True)
    review.add_argument('--category', choices=['central', 'lectures', 'practical', 'summaries', 'exams', 'references'], required=True)
    review.add_argument('--reason', required=True)
    review.add_argument('--author', action='append', help='Optional source speaker context only; published owner is always ASU Faculty Staff')
    ignore = sub.add_parser('ignore', help='Record why a non-study activity is excluded')
    ignore.add_argument('--entry', action='append', required=True)
    ignore.add_argument('--reason', required=True)
    publish = sub.add_parser('publish', help='Preview reviewed groups; --apply publishes links to Firestore')
    publish.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.command == 'login':
        Client().login(parse)
        return
    from sync import Repository, collect
    repo = Repository()
    if args.command == 'status':
        state = repo.source.get().to_dict() or {}
        entries = repo.read_entries()
        summary = {k: state.get(k) for k in ('courseUrl', 'lastSuccessfulScanAt', 'rescanIntervalHours', 'linksSeen', 'scanStatus')}
        summary['statuses'] = dict(Counter(e.get('status', 'needs_review') for e in entries.values()))
        print(json.dumps(summary, indent=2))
        for entry in sorted(entries.values(), key=lambda e: (e.get('section', ''), e['id'])):
            if args.all or entry.get('status') not in {'published', 'ignored'}:
                print(json.dumps({k: entry.get(k) for k in ('id', 'title', 'url', 'section', 'kind', 'status', 'suggestedLessonIds', 'review', 'sourceMissing')}, ensure_ascii=False))
        return
    if args.command == 'lessons':
        for lesson in sorted(repo.lessons(), key=lambda l: (l.get('subject', ''), l.get('order', 0))):
            if lesson.get('active') is not False:
                print(json.dumps({k: lesson.get(k) for k in ('id', 'title', 'subject')}, ensure_ascii=False))
        return
    with repo.lease():
        if args.command == 'scan':
            entries, pages, activities = collect(Client(), parse)
            result = repo.stage(entries, pages, activities)
        elif args.command == 'review':
            if not all(value.strip() for value in (args.group, args.title, args.reason)):
                raise ValueError('Group, title and review reason must be nonempty')
            repo.review(args.entry, args.lesson or [], args.group, args.title, args.kind, args.category, args.reason, args.module_wide, args.author)
            result = {'reviewed': args.entry}
        elif args.command == 'ignore':
            if not args.reason.strip():
                raise ValueError('An exclusion reason is required')
            repo.ignore(args.entry, args.reason)
            result = {'ignored': args.entry}
        else:
            result = repo.publish(args.apply)
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f'ASU2Learn: {error}', file=sys.stderr)
        sys.exit(1)
