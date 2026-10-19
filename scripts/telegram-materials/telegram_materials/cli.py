from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from .core import BOTS, MODULE_ID, Stage
from .store import ROOT

AUTH_DIRECTORY = ROOT / ".telegram-materials"
DEFAULT_RUN = ROOT / "tmp/telegram-materials" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def acquire_telegram_lock():
    import fcntl
    AUTH_DIRECTORY.mkdir(mode=0o700, exist_ok=True)
    handle=(AUTH_DIRECTORY / "operation.lock").open("a")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise ValueError("Another Telegram command is running; wait for it to finish before starting another") from None
    return handle


def client_credentials(interactive: bool = False):
    path = AUTH_DIRECTORY / "credentials.json"
    saved = json.loads(path.read_text()) if path.is_file() else {}
    api_id = os.environ.get("TELEGRAM_API_ID") or saved.get("api_id")
    api_hash = os.environ.get("TELEGRAM_API_HASH") or saved.get("api_hash")
    if interactive:
        api_id = api_id or input("Telegram API ID: ").strip()
        api_hash = api_hash or getpass.getpass("Telegram API hash (hidden): ").strip()
    if not api_id or not api_hash:
        raise ValueError("Run the login command first, or set TELEGRAM_API_ID and TELEGRAM_API_HASH locally")
    import re
    if int(api_id) <= 0 or not re.fullmatch(r"[0-9a-fA-F]{32}", api_hash):
        raise ValueError("Application credentials need a positive API ID and a 32-character hexadecimal hash")
    return int(api_id), api_hash


def save_credentials(api_id: int, api_hash: str):
    path = AUTH_DIRECTORY / "credentials.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        json.dump({"api_id": api_id, "api_hash": api_hash}, handle)
    os.chmod(path, 0o600)


async def telegram_client(login=False, request_code=False):
    from telethon import TelegramClient
    from telethon.errors import SessionPasswordNeededError
    api_id, api_hash = client_credentials(login)
    AUTH_DIRECTORY.mkdir(mode=0o700, exist_ok=True)
    os.chmod(AUTH_DIRECTORY, 0o700)
    client = TelegramClient(str(AUTH_DIRECTORY / "account"), api_id, api_hash, flood_sleep_threshold=60)
    await client.connect()
    if login:
        pending_file = AUTH_DIRECTORY / "pending-login.json"
        try:
            authorized = await client.is_user_authorized()
            if request_code and not authorized:
                phone = getpass.getpass("Phone number with country code (hidden): ").strip()
                result = await client.send_code_request(phone)
                fd = os.open(pending_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as handle:
                    json.dump({"phone": phone, "phone_code_hash": result.phone_code_hash}, handle)
                save_credentials(api_id, api_hash)
                return client
            if pending_file.is_file() and not authorized:
                pending = json.loads(pending_file.read_text())
                code = getpass.getpass("Telegram login code (hidden): ").strip()
                try:
                    await client.sign_in(phone=pending["phone"], code=code, phone_code_hash=pending["phone_code_hash"])
                except SessionPasswordNeededError:
                    await client.sign_in(password=getpass.getpass("Telegram 2FA password (hidden): "))
            elif not authorized:
                await client.start(phone=lambda: getpass.getpass("Phone number with country code (hidden): ").strip(),
                                   code_callback=lambda: getpass.getpass("Telegram login code (hidden): ").strip(),
                                   password=lambda: getpass.getpass("Telegram 2FA password (hidden): "))
            save_credentials(api_id, api_hash)
            pending_file.unlink(missing_ok=True)
        except BaseException:
            await client.disconnect()
            raise
    if not await client.is_user_authorized():
        await client.disconnect()
        raise ValueError("Telegram session is not authenticated. Run login in your terminal first")
    return client


async def collect(args, stage: Stage):
    from .collector import Collector
    from .store import catalogue, get_db
    from .review import refresh_review
    db = get_db()
    _, lessons, _ = catalogue(db)
    if args.max_book_mib is not None:
        if args.max_book_mib < 1:
            raise ValueError("--max-book-mib must be positive")
        stage.setting("max_book_bytes", args.max_book_mib * 1048576)
    client = await telegram_client()
    try:
        stage.db.execute("UPDATE sources SET status='pending' WHERE status='running'")
        stage.db.commit()
        collector = Collector(stage, client, lessons, args.max_messages)
        if args.retry_failed:
            stage.reset_failures()
        for bot in ([] if args.queued_only else args.bot or BOTS):
            route = []
            context = [bot]
            if args.route:
                from .collector import button_actions
                messages = await collector.exchange(bot, command="/start")
                collector.remember(bot, [], messages)
                for text in args.route:
                    choices = [action for action in button_actions(messages) if action["text"] == text]
                    if len(choices) != 1:
                        raise ValueError(f"Route {text!r} was not uniquely found; inspect this bot")
                    route.append(choices[0]); context.append(text)
                    messages = await collector.exchange(bot, action=choices[0])
                    collector.remember(bot, list(route), messages)
            if args.scope_respiratory:
                if not args.route:
                    raise ValueError("--scope-respiratory requires an inspected explicit --route")
                context.append("Year 2 Respiratory (scope reviewed)")
            stage.source("bot", bot, context, {"route": route})
        await collector.run()
    finally:
        await client.disconnect()
        refresh_review(stage, db)
    print(f"Collection stopped before upload/publication. Review: {stage.directory / 'REVIEW.md'}")


def parser():
    root = argparse.ArgumentParser(description="Telegram materials: ongoing channel inbox and respiratory bot imports; review before publication")
    commands = root.add_subparsers(dest="command", required=True)
    from .inbox_cli import add_parser
    add_parser(commands)
    login = commands.add_parser("login", help="Authenticate interactively; no bot messages are sent")
    login.add_argument("--request-code", action="store_true", help="Request a code, save the private challenge, and exit; run login again to enter the code")
    inspect = commands.add_parser("inspect", help="Show bot responses/buttons to establish a respiratory route")
    inspect.add_argument("--bot", choices=BOTS, required=True)
    inspect.add_argument("--route", action="append", default=[])
    collect = commands.add_parser("collect", help="Stage files and links only; never writes Firestore/R2")
    collect.add_argument("--run", type=Path, default=DEFAULT_RUN)
    collect.add_argument("--bot", action="append", choices=BOTS)
    collect.add_argument("--route", action="append", default=[])
    collect.add_argument("--scope-respiratory", action="store_true", help="Confirm an inspected manual route contains respiratory resources for this import")
    collect.add_argument("--queued-only", action="store_true", help="Process existing queued sources without adding default bot roots")
    collect.add_argument("--retry-failed", action="store_true")
    collect.add_argument("--max-messages", type=int, default=10000)
    collect.add_argument("--max-book-mib", type=int, help="Skip PDF books above this size; the choice persists when resuming the run")
    queue = commands.add_parser("queue", help="Queue an inspected bot route without connecting to Telegram")
    queue.add_argument("--run", type=Path, required=True)
    queue.add_argument("--bot", choices=BOTS, required=True)
    queue.add_argument("--route", action="append", default=[])
    queue.add_argument("--scope-respiratory", action="store_true")
    for command in ("review", "validate", "approve", "reject", "bundle", "publish", "curate", "publication-report", "audit-publication", "pdf-evidence", "scope-source", "exclude-source", "resolve-recordings", "normalize-links", "normalize-scope", "reuse-sources"):
        sub = commands.add_parser(command)
        sub.add_argument("--run", type=Path, required=True)
        if command in {"approve", "reject"}:
            sub.add_argument("--entry", required=True)
        if command == "approve":
            sub.add_argument("--lesson", action="append", required=True)
            sub.add_argument("--author")
            sub.add_argument("--title")
            sub.add_argument("--existing-material")
            sub.add_argument("--category", choices=["central", "lectures", "practical", "summaries", "exams", "references"])
        if command == "bundle":
            sub.add_argument("--entry", action="append", required=True)
            sub.add_argument("--title", required=True)
        if command == "publish":
            sub.add_argument("--apply", action="store_true", help="Actually upload and publish; default is a read-only preview")
        if command == "curate":
            sub.add_argument("--decisions", type=Path, required=True)
        if command in {"scope-source", "exclude-source"}:
            sub.add_argument("--source", required=True)
            sub.add_argument("--reason", required=True)
    return root


def main():
    args = parser().parse_args()
    operation_lock = None
    try:
        if args.command == 'inbox':
            from .inbox_cli import run
            run(args)
            return
        if args.command in {"login", "inspect", "collect"}:
            operation_lock = acquire_telegram_lock()
        if args.command == "login":
            async def login():
                client = await telegram_client(True, args.request_code)
                await client.disconnect()
            asyncio.run(login())
            print("Login code requested. Run login again in your terminal to finish authentication." if args.request_code and (AUTH_DIRECTORY / "pending-login.json").is_file() else "Telegram login saved locally. No bot was contacted.")
            return
        if args.command == "inspect":
            from .collector import Collector, button_actions
            async def inspect():
                client = await telegram_client()
                try:
                    # Inspect has no staging side effects beyond an empty disposable run.
                    import tempfile
                    with tempfile.TemporaryDirectory(prefix="telegram-inspect-") as temporary:
                        stage = Stage(Path(temporary))
                        messages = await Collector(stage, client, []).inspect(args.bot, args.route)
                        for message in messages:
                            print(message.raw_text or "[attachment]")
                        print("Buttons:")
                        for action in button_actions(messages):
                            print("- " + action["text"])
                        stage.db.close()
                finally:
                    await client.disconnect()
            asyncio.run(inspect())
            return
        if args.command not in {"collect", "queue"} and not (args.run / "stage.sqlite3").is_file():
            raise ValueError("Run directory has no staged database")
        stage = Stage(args.run)
        if args.command == "audit-publication":
            from .audit import audit_publication
            from .store import get_db
            if errors := audit_publication(stage, get_db()):
                for error in errors:
                    print(error)
                raise SystemExit(2)
            return
        if args.command == "curate":
            from .curation import curate
            from .store import get_db
            print(f"Staged {curate(stage, get_db(), args.decisions)} explicit decisions; remaining files held. No uploads performed.")
            return
        if args.command == "publication-report":
            from .curation import publication_report
            from .review import write_summary
            publication_report(stage)
            write_summary(stage, stage.entries(), stage.sources())
            print(stage.directory / 'publication.csv')
            return
        if args.command == "pdf-evidence":
            from .evidence import extract_evidence
            extract_evidence(stage)
            print(f"PDF evidence saved to {stage.directory / 'pdf-evidence.csv'}; no approvals or uploads made.")
            return
        if args.command == "reuse-sources":
            print(f"Reused {stage.reuse_pending_sources()} captured source references; no network requests made.")
            return
        if args.command == "normalize-scope":
            from .core import normalize_scope
            print(f"Excluded {normalize_scope(stage)} entries with explicit other-module titles; existing approvals are preserved.")
            return
        if args.command == "normalize-links":
            from .core import video_link_type
            from .collector import Collector
            from urllib.parse import urlsplit, parse_qs
            collector, changed = Collector(stage, None, []), 0
            for entry in stage.entries():
                if entry.get("status") in {"approved", "published"} or entry.get("kind") not in {"link", "video"}:
                    continue
                url = entry.get("url", "")
                if (urlsplit(url).hostname or "").lower().removeprefix("www.") not in {"youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"}:
                    continue
                source_type = video_link_type(url)
                expected_kind = "video" if source_type else "link"
                if entry["kind"] != expected_kind:
                    entry["kind"] = expected_kind; changed += 1
                    if source_type:
                        entry["sourceType"] = source_type
                    else:
                        entry.pop("sourceType", None)
                    stage.save(entry)
                if parse_qs(urlsplit(url).query).get("list"):
                    for occurrence in stage.occurrences(entry["id"]):
                        collector.add_link(url, entry["title"], {"key": occurrence["source"], "context": occurrence["context"], "locator": "normalization"})
            print(f"Normalized {changed} link types and queued any linked playlist memberships.")
            return
        if args.command == "resolve-recordings":
            from .collector import recover_recording
            count = 0
            for source in stage.sources("blocked"):
                if source["kind"] != "unshareable_media":
                    continue
                try:
                    count += recover_recording(stage, source)
                except Exception:
                    pass  # Keep the original blocked source; do not invent an unavailable link.
            print(f"Recovered and verified {count} public YouTube recording links.")
            return
        if args.command == "queue":
            if args.scope_respiratory and not args.route:
                raise ValueError("Scope confirmation requires an inspected route")
            context = [args.bot, *args.route] + (["Year 2 Respiratory (scope reviewed)"] if args.scope_respiratory else [])
            print("Queued source:", stage.source("bot", args.bot, context, {"route": [{"kind": "label", "text": text} for text in args.route]}))
            return
        if args.command in {"scope-source", "exclude-source"}:
            source = next((item for item in stage.sources() if item["key"] == args.source), None)
            if not source:
                raise ValueError("Source was not found")
            if args.command == "scope-source":
                source["payload"]["trusted"] = True
                source["payload"]["scopeReview"] = args.reason
                context = source["context"] + ["Year 2 Respiratory (scope reviewed)"]
                kind = "bot" if source["kind"] == "unclassified_menu" else source["kind"]
                new_key = stage.source(kind, source["locator"], context, source["payload"])
                stage.status(new_key, "pending")
            if args.command == "exclude-source":
                stage.exclude_branch(source["context"], args.reason)
            else:
                stage.status(source["key"], "excluded", args.reason)
            from .review import write_report
            write_report(stage)
            print("Source decision saved locally; resume collection with the same --run directory.")
            return
        if args.command == "collect":
            if args.max_messages < 1:
                raise ValueError("--max-messages must be positive")
            asyncio.run(collect(args, stage))
            return
        from .review import approve, bundle, refresh_review, write_report
        if args.command == "bundle":
            print("Bundle ID:", bundle(stage, args.entry, args.title))
            return
        if args.command == "reject":
            entry = stage.get(args.entry)
            if not entry or entry.get("status") == "published":
                raise ValueError("Cannot reject a missing or published entry")
            entry["status"] = "rejected"
            stage.save(entry); write_report(stage)
            return
        from .store import get_db, publish
        db = get_db()
        if args.command in {"review", "validate"}:
            entries = refresh_review(stage, db)
            errors = sum(bool(entry.get("validationErrors")) for entry in entries)
            unfinished = sum(source["status"] not in {"done", "excluded"} for source in stage.sources())
            print(f"{len(entries)} resources; {errors} validation failures; {unfinished} unfinished sources.")
            print(stage.directory / "REVIEW.md")
            if args.command == "validate" and (errors or unfinished):
                raise SystemExit(2)
        elif args.command == "approve":
            approve(stage, db, args.entry, args.lesson, args.author, args.title, args.existing_material, args.category)
            print("Entry approved locally. Nothing uploaded or published.")
        elif args.command == "publish":
            plans = publish(stage, db, args.apply)
            print(json.dumps(plans, ensure_ascii=False, indent=2))
            write_report(stage)
            print("Published approved entries." if args.apply else "Dry run only. No uploads or database changes.")
    except KeyboardInterrupt:
        print("Interrupted. Staged results and pending sources are retained.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        # Authentication/network libraries can include credential-bearing request URLs in exceptions.
        if args.command in {"login", "inspect"}:
            print(f"{type(exc).__name__}: Telegram operation failed. Check local credentials/session and retry.", file=sys.stderr)
        else:
            message = str(exc)
            import re
            message = re.sub(r"([?&](?:key|access_token|token)=)[^&\s]+", r"\1[redacted]", message)
            print(f"{type(exc).__name__}: {message}", file=sys.stderr)
        raise SystemExit(1)
    finally:
        if operation_lock is not None:
            operation_lock.close()


if __name__ == "__main__":
    main()
