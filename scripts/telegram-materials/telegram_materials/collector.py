from __future__ import annotations

import asyncio
import base64
import hashlib
import html
import ipaddress
import json
import mimetypes
import os
import re
import socket
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from .core import (BOTS, MODULE_ID, NAVIGATION, OTHER_SCOPE, RESPIRATORY, URL_PATTERN,
                   YEAR_TWO, Stage, identity, normalize_url, resource_key, words, video_link_type)
from .files import MAX_FILE_BYTES, copy_stream, stage_file, unpack_zip, unpack_archive, check_book_size, IgnoredLargeBook

UNSAFE_BUTTON = re.compile(r"donat|payment|purchase|delete|report|feedback|contact|support|subscribe|join|تواصل|تبرع|اشتراك|انضم|حذف|شكوى|ارسال|إرسال", re.I)
SUBJECTS = re.compile(r"anatom|histo|physio|biochem|patho|pharma|micro|parasito|تشريح|فسيولوج|هستولوج|فارما|باثولوج|ميكرو|باراسيت", re.I)
GENERIC_MENU = re.compile(r"year|semester|term|ترم|batch|كلية|دفع|فرقة|سن[ةه]|level|academic|preclinical|pre.clerk|العربي|english|اللغة|module|موديول|مواد|material|content|مصادر|داتا|data|menu|رئيسية", re.I)
INDEX_MODULES = re.compile(r"\b(?:blood|renal|cardiovascular|musculoskeletal|gastrointestinal|git|cns|endocrine|reproductive|introduction)\b|جينرال|الكلى|الهضمي|العصبي|التناسلي|العضلي", re.I)


def validate_public_url(url: str) -> None:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in {"http", "https"} or parts.username or parts.password or not parts.hostname:
        raise ValueError("Invalid resource URL")
    for item in socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80)):
        if not ipaddress.ip_address(item[4][0]).is_global:
            raise ValueError("Resource URL must point to a public address")


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        validate_public_url(url)
        return super().redirect_request(request, fp, code, message, headers, url)


def open_url(url: str, headers: dict | None = None, data: bytes | None = None):
    validate_public_url(url)
    request = urllib.request.Request(url, data=data, headers={"User-Agent": "ASUMedMaterials-Importer/1.0", **(headers or {})})
    return urllib.request.build_opener(PublicRedirect()).open(request, timeout=60)


def is_scoped(context: list[str]) -> bool:
    text = re.sub("[\ufe0f\u20e3]", "", " / ".join(context))
    return bool(RESPIRATORY.search(text) and YEAR_TWO.search(text) and not OTHER_SCOPE.search(text))


def content_in_scope(text: str, lessons: list[dict]) -> bool:
    if OTHER_SCOPE.search(text) and not RESPIRATORY.search(text):
        return False
    if RESPIRATORY.search(text):
        return True
    tokens = words(text)
    for lesson in lessons:
        target = words(lesson["title"])
        if not lesson.get("isRevision") and len(target) >= 2 and len(target & tokens) / len(target) >= 0.85:
            return True
    return False


def is_mixed_index(text: str) -> bool:
    return bool(RESPIRATORY.search(text) and re.search(r"فهرس|index|modul|مديول", text, re.I)
                and len({match.group().lower() for match in INDEX_MODULES.finditer(text)}) >= 2)


def nearby_link_label(text: str, url: str, label: str = "") -> str:
    if label and label != url and not URL_PATTERN.search(label):
        return label
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if url not in line:
            continue
        inline = line.replace(url, "").strip(" \t:،.👇🔗")
        if len(words(inline)):
            return inline
        for previous in reversed(lines[:index]):
            if words(previous) and not URL_PATTERN.search(previous):
                return previous.strip()
    return label


def extract_links(message) -> list[tuple[str, str]]:
    text = message.raw_text or ""
    results = [(match.group(0).rstrip(".,،);]"), "") for match in URL_PATTERN.finditer(text)]
    for entity, visible in message.get_entities_text():
        url = getattr(entity, "url", None)
        if not url and type(entity).__name__ == "MessageEntityUrl":
            url = visible if visible.startswith(("http://", "https://")) else "https://" + visible
        if url:
            results.append((url, visible))
    for row in message.buttons or []:
        for button in row:
            if button.url:
                results.append((button.url, button.text))
    return list(dict.fromkeys((url, label) for url, label in results if url.startswith(("http://", "https://"))))


def recover_recording(stage: Stage, source: dict) -> bool:
    """Recover explicitly embedded YouTube IDs from reuploaded recording filenames."""
    filename = source["context"][-1]
    match = re.search(r"(?:\[|[_\s])([A-Za-z0-9_-]{11})(?:\]|\.(?:mp4|webm|mov)$)", filename, re.I)
    if not match:
        return False
    url = "https://www.youtube.com/watch?v=" + match.group(1)
    with open_url("https://www.youtube.com/oembed?" + urllib.parse.urlencode({"url": url, "format": "json"})) as response:
        metadata = json.load(response)
    stage.put({"id": identity(resource_key(url)), "kind": "video", "url": url, "title": metadata["title"],
               "sourceType": "youtube", "sourceUrls": [url], "status": "unreviewed"}, source["key"], source["context"],
              {"filename": filename, "verifiedYouTubeId": match.group(1), "sourceAuthor": metadata.get("author_name")})
    stage.status(source["key"], "done")
    return True


def button_actions(messages, include_navigation=False) -> list[dict]:
    actions = []
    for message in messages:
        for row in message.buttons or []:
            for button in row:
                kind = type(button.button).__name__
                if kind not in {"KeyboardButton", "KeyboardButtonCallback"}:
                    continue
                text = button.text.strip()
                if (NAVIGATION.search(text) and not include_navigation) or UNSAFE_BUTTON.search(text):
                    continue
                action = {"text": text, "kind": "callback" if button.data is not None else "text"}
                if button.data is not None:
                    action["data"] = base64.b64encode(button.data).decode()
                if action not in actions:
                    actions.append(action)
    return actions


def may_traverse(context: list[str], action: dict) -> bool:
    text = re.sub("[\ufe0f\u20e3]", "", action["text"])
    if OTHER_SCOPE.search(text) and not RESPIRATORY.search(text):
        return False
    return is_scoped(context) or bool(YEAR_TWO.search(text) or RESPIRATORY.search(text) or GENERIC_MENU.search(text) or SUBJECTS.search(text))


class Collector:
    def __init__(self, stage: Stage, client, lessons: list[dict], max_messages: int = 10000):
        self.stage, self.client, self.lessons = stage, client, lessons
        self.max_messages = max_messages
        self.last_action = 0.0
        self.pace_lock = asyncio.Lock()
        self.media_pace_lock = asyncio.Lock()
        self.last_media_action = 0.0
        self.processed = 0
        self.active_files = set()
        self.bot_states = {}
        self.menu_states = {}

    def remember(self, bot, route, messages, start=""):
        self.bot_states[bot] = {"route": route, "messages": messages, "start": start}
        self.menu_states[(bot, start, json.dumps(route, sort_keys=True))] = {
            "route": route, "messages": messages, "signature": ([message.raw_text for message in messages], button_actions(messages))}

    def persistent_parent(self, bot, start, route, messages):
        if not route or re.search(r"next|more|التالي|المزيد|➡|⬅", route[-1]["text"], re.I):
            return None
        if not (any(message.file for message in messages) or any(extract_links(message) for message in messages)):
            return None
        actions = button_actions(messages)
        selected = route[-1]
        inherited = not actions and all(getattr(message, "reply_markup", None) is None for message in messages)
        matches = [menu for (name, argument, _), menu in self.menu_states.items() if name == bot and argument == start
                   and len(menu["route"]) < len(route) and route[:len(menu["route"])] == menu["route"]
                   and (menu["signature"][1] == actions or (inherited and menu["signature"][1] and
                        all(action["kind"] == "text" for action in menu["signature"][1])))
                   and any(action["text"] == selected["text"] and (selected["kind"] == "label" or action == selected)
                           for action in menu["signature"][1])]
        return max(matches, key=lambda menu: len(menu["route"])) if matches else None

    async def seek(self, bot, route, start=""):
        state = self.bot_states.get(bot)
        # Use explicit Back/Exit buttons only when the response matches a previously
        # visited ancestor of the requested route. Otherwise replay from /start.
        for _ in range(14):
            if not state or state["start"] != start or route[:len(state["route"])] == state["route"]:
                break
            navigation = [action for action in button_actions(state["messages"], include_navigation=True) if NAVIGATION.search(action["text"])]
            if not navigation:
                break
            navigation.sort(key=lambda action: not bool(re.search(r"back|خروج|رجوع|عودة", action["text"], re.I)))
            messages = await self.exchange(bot, action=navigation[0])
            signature = ([message.raw_text for message in messages], button_actions(messages))
            candidates = [menu for (name, argument, _), menu in self.menu_states.items() if name == bot and argument == start
                          and route[:len(menu["route"])] == menu["route"] and menu["signature"] == signature
                          and len(menu["route"]) < len(state["route"])]
            if not candidates:
                state = None
                break
            parent = max(candidates, key=lambda menu: len(menu["route"]))
            self.remember(bot, parent["route"], messages, start)
            state = self.bot_states[bot]
        if state and state["start"] == start and route[:len(state["route"])] == state["route"]:
            messages, offset = state["messages"], len(state["route"])
        else:
            messages = await self.exchange(bot, command="/start" + (" " + start if start else ""))
            self.remember(bot, [], messages, start)
            offset = 0
        for index in range(offset, len(route)):
            messages = await self.exchange(bot, action=route[index])
            self.remember(bot, route[:index + 1], messages, start)
        return messages

    async def paced(self, interactive=True):
        async with self.pace_lock if interactive else self.media_pace_lock:
            while True:
                cooldown = max(0, (self.stage.setting("telegram_not_before") or 0) - time.time())
                interval = max(3.5, float(self.stage.setting("request_interval_seconds") or 3.5)) if interactive else 1.0
                previous = self.last_action if interactive else self.last_media_action
                delay = max(cooldown, interval - (time.monotonic() - previous), 0)
                if delay <= 0:
                    break
                await asyncio.sleep(delay)
            if interactive:
                self.last_action = time.monotonic()
            else:
                self.last_media_action = time.monotonic()

    async def respect_flood(self, seconds):
        previous = self.stage.setting("telegram_not_before") or 0
        self.stage.setting("telegram_not_before", max(previous, time.time() + seconds + 1))
        if previous <= time.time():
            interval = max(3.5, float(self.stage.setting("request_interval_seconds") or 3.5))
            self.stage.setting("request_interval_seconds", min(30.0, max(5.0, interval * 1.5)))
            print(f"Telegram requested a {seconds}s wait; the saved cooldown will be honored before continuing at a lower request rate.", flush=True)
        await asyncio.sleep(max(0, self.stage.setting("telegram_not_before") - time.time()))

    async def exchange(self, bot: str, action=None, command: str | None = None) -> list:
        from telethon import events
        from telethon.errors import FloodWaitError
        received, last_update = {}, time.monotonic()
        async def receive(event):
            nonlocal last_update
            if not event.message.out:
                received[event.message.id] = event.message
                last_update = time.monotonic()
        builder = events.NewMessage(chats=bot, incoming=True)
        editor = events.MessageEdited(chats=bot, incoming=True)
        self.client.add_event_handler(receive, builder)
        self.client.add_event_handler(receive, editor)
        try:
            for attempt in range(3):
                try:
                    await self.paced()
                    if command is not None:
                        await self.client.send_message(bot, command)
                    elif action["kind"] == "text":
                        await self.client.send_message(bot, action["text"])
                    else:
                        recent = await self.client.get_messages(bot, limit=40)
                        selected = None
                        for message in recent:
                            for row in message.buttons or []:
                                for button in row:
                                    matches = (button.data is not None and action.get("data") == base64.b64encode(button.data).decode()) if action["kind"] == "callback" else (button.text.strip() == action["text"] and type(button.button).__name__ in ({"KeyboardButton", "KeyboardButtonCallback"} if action["kind"] == "label" else {"KeyboardButton"}))
                                    if matches:
                                        selected = button
                                        break
                                if selected:
                                    break
                            if selected:
                                break
                        if not selected:
                            raise ValueError("Menu changed; requested button was not found. Inspect and update the route.")
                        await selected.click()
                    break
                except FloodWaitError as exc:
                    if attempt == 2:
                        raise
                    await self.respect_flood(exc.seconds)
            started = time.monotonic()
            while time.monotonic() - started < 25:
                await asyncio.sleep(0.25)
                if received and time.monotonic() - last_update >= 3:
                    break
            if not received:
                raise TimeoutError("Bot produced no new or edited response within 25 seconds")
            return sorted(received.values(), key=lambda message: message.id)
        finally:
            self.client.remove_event_handler(receive, builder)
            self.client.remove_event_handler(receive, editor)

    async def inspect(self, bot: str, route: list[str]) -> list:
        messages = await self.exchange(bot, command="/start")
        for text in route:
            choices = [action for action in button_actions(messages) if action["text"] == text]
            if len(choices) != 1:
                raise ValueError(f"Route button {text!r} was not uniquely found")
            messages = await self.exchange(bot, action=choices[0])
        return messages

    def add_link(self, url: str, title: str, source: dict, evidence: dict | None = None):
        url = url.strip()
        key = resource_key(url)
        host = urllib.parse.urlsplit(url).hostname or ""
        video = bool((evidence or {}).get("video")) or bool(video_link_type(url))
        entry = {"id": identity(key), "kind": "video" if video else "link", "url": url,
                 "title": title.strip() or url, "status": "unreviewed", "sourceUrls": [url]}
        if video:
            entry["sourceType"] = video_link_type(url) or ("telegram" if host in {"t.me", "telegram.me"} else "external")
        playlist_id = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("list", [None])[0] if "youtu" in host else None
        if playlist_id:
            if not video:
                entry["kind"] = "link"
            self.stage.source("youtube_playlist", "https://www.youtube.com/playlist?" + urllib.parse.urlencode({"list": playlist_id}), source["context"] + [title or "Playlist"])
        self.stage.put(entry, source["key"], source["context"], {"url": url, **(evidence or {})})
        stored = self.stage.get(entry["id"])
        if video and stored["kind"] == "link" and stored.get("status") not in {"approved", "published"}:
            # A linked Telegram post starts as an ordinary link; inspecting its
            # actual media can establish that it is a video without losing evidence.
            stored.update(kind="video", sourceType=entry["sourceType"])
            self.stage.save(stored)
        if host in {"drive.google.com", "docs.google.com"}:
            kind = "drive_folder" if "/folders/" in url else "drive_file"
            self.stage.source(kind, url, source["context"] + ([title] if title else []))
        elif host in {"t.me", "telegram.me"}:
            parts = urllib.parse.urlsplit(url)
            target = parts.path.strip("/").split("/")[0]
            if target.lower().endswith("bot"):
                start = urllib.parse.parse_qs(parts.query).get("start", [""])[0]
                if target.lower() != source["locator"].lower():
                    key = self.stage.source("bot", target, source["context"] + [title or target], {"route": [], "start": start})
                    if source.get("kind", "bot") != "bot":
                        self.stage.status(key, "excluded", "Bot index link retained from a shared archive; crawl stays within the selected respiratory bot routes")
            elif not target.lower().endswith("bot"):
                self.stage.source("telegram_archive", url, source["context"] + ([title] if title else []))
        elif re.search(r"\.(pdf|png|jpe?g|gif|webp|avif|bmp|zip|rar|7z)(?:[?#]|$)", url, re.I):
            self.stage.source("http_file", url, source["context"] + ([title] if title else []))

    async def capture_message(self, message, source: dict, scoped: bool = True):
        text = message.raw_text or ""
        filename = message.file.name if message.file and message.file.name else ""
        evidence = {"messageId": message.id, "chatId": message.chat_id, "caption": text,
                    "albumId": str(message.grouped_id) if message.grouped_id else None}
        if not scoped:
            # Some source bots delegate Year 2 to a newer bot before offering modules.
            if source.get("kind", "bot") == "bot" and YEAR_TWO.search(" / ".join(source["context"])):
                for url, label in extract_links(message):
                    parts = urllib.parse.urlsplit(url)
                    target = parts.path.strip("/").split("/")[0]
                    if parts.hostname in {"t.me", "telegram.me"} and target.lower().endswith("bot") and target.lower() != source["locator"].lower():
                        self.stage.source("bot", target, source["context"] + [label or target], {"route": [], "start": urllib.parse.parse_qs(parts.query).get("start", [""])[0]})
            return
        mixed = is_mixed_index(text)
        for url, label in extract_links(message):
            local_label = nearby_link_label(text, url, label) if mixed else label
            if mixed and not content_in_scope(local_label, self.lessons):
                key = self.stage.source("out_of_scope_link", url, source["context"] + [local_label or url])
                self.stage.status(key, "excluded", "Another module in a mixed index; excluded from respiratory collection")
                continue
            self.add_link(url, local_label or text[:250], source, evidence)
        if mixed:
            return  # Index artwork is not a lesson document.
        if not message.file:
            return
        mime = message.file.mime_type or mimetypes.guess_type(filename)[0] or ""
        if mime != "application/pdf" and not mime.startswith("image/") and not filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".zip", ".rar", ".7z")):
            # Record original message links for recordings rather than downloading the binary.
            if mime.startswith(("video/", "audio/")):
                chat = await message.get_chat()
                username = None if getattr(chat, "bot", False) else getattr(chat, "username", None)
                url = f"https://t.me/{username}/{message.id}" if username else ""
                if url:
                    self.add_link(url, text or filename, source, {**evidence, "video": mime.startswith("video/")})
                else:
                    key = self.stage.source("unshareable_media", f"telegram:{message.chat_id}:{message.id}", source["context"] + [filename or text[:100]])
                    self.stage.status(key, "blocked", "Recording has no public message link; binary video/audio downloads are outside this PDF/image collection")
            return
        if message.file.size and message.file.size > MAX_FILE_BYTES:
            raise ValueError("Telegram file exceeds 512 MiB")
        media = message.document or message.photo
        key = self.stage.source("telegram_file", f"telegram-file:{type(media).__name__}:{media.id}", source["context"],
                          {"chatId": message.chat_id, "messageId": message.id, "filename": filename,
                           "title": filename or text[:200] or f"Image {message.id}", "expectedBytes": message.file.size,
                           "evidence": evidence})
        try:
            check_book_size(self.stage, message.file.size or 0, mime == "application/pdf" or filename.lower().endswith(".pdf"))
        except IgnoredLargeBook as exc:
            self.stage.status(key, "excluded", str(exc))

    async def telegram_file(self, source: dict):
        payload = source["payload"]
        fd, name = tempfile.mkstemp(dir=self.stage.directory, suffix=".part")
        os.close(fd)
        path = Path(name)
        try:
            await self.paced(interactive=False)
            # Re-fetch the message to refresh expiring Telegram file references.
            fresh = await self.client.get_messages(payload["chatId"], ids=payload["messageId"])
            if not fresh:
                raise ValueError("Telegram source message is no longer available")
            if fresh.file.size and fresh.file.size > MAX_FILE_BYTES:
                raise ValueError("Telegram file exceeds 512 MiB")
            check_book_size(self.stage, fresh.file.size or 0,
                            fresh.file.mime_type == "application/pdf" or payload["filename"].lower().endswith(".pdf"))
            last_progress = time.monotonic()
            def progress(downloaded, total):
                nonlocal last_progress
                now = time.monotonic()
                if now - last_progress >= 30:
                    print(f"  Downloading {payload['title'][:100]}: {downloaded}/{total} bytes", flush=True)
                    last_progress = now
            await self.client.download_media(fresh, file=str(path), progress_callback=progress)
            if fresh.document and fresh.file.size and path.stat().st_size != fresh.file.size:
                raise ValueError("Telegram download size did not match the source document")
            filename = payload["filename"]
            if filename.lower().endswith((".zip", ".rar", ".7z")) or zipfile.is_zipfile(path):
                self.unpack(path, source, source["context"] + [filename or "Archive"])
            else:
                stage_file(self.stage, path, payload["title"], source["key"], source["context"], evidence=payload["evidence"])
        finally:
            path.unlink(missing_ok=True)

    async def bot(self, source: dict):
        route = source["payload"].get("route", [])
        bot, start = source["locator"], source["payload"].get("start", "")
        messages = await self.seek(bot, route, start)
        self.remember(bot, route, messages, start)
        scoped = is_scoped(source["context"])
        actions = button_actions(messages)
        parent = self.persistent_parent(bot, start, route, messages)
        if parent:
            # A file response can leave its parent's keyboard active. The selected
            # resource is a leaf; its peers remain available without replaying /start.
            self.bot_states[bot] = {"route": parent["route"], "messages": messages if actions else parent["messages"], "start": start}
        # Message IDs change on replay; state identity includes content and buttons instead.
        fingerprint = identity(json.dumps([source["locator"].lower(), scoped, [(m.raw_text, m.file.name if m.file else None,
            getattr(m.document or m.photo, "id", None)) for m in messages], actions], sort_keys=True, ensure_ascii=False))
        source["payload"]["fingerprint"] = fingerprint
        source["payload"]["messageIds"] = [message.id for message in messages]
        self.stage.db.execute("UPDATE sources SET payload=? WHERE key=?", (json.dumps(source["payload"], ensure_ascii=False), source["key"]))
        self.stage.db.commit()
        seen = self.stage.setting("seen_bot_states") or []
        if fingerprint in seen:
            return
        for message in messages:
            await self.capture_message(message, source, scoped)
        incomplete = False
        for action in ([] if parent else actions):
            if route and action == route[-1] and not re.search(r"next|more|التالي|المزيد|➡|⬅", action["text"], re.I):
                continue  # A persistent doctor/category button is not another nested lesson.
            context = source["context"] + [action["text"]]
            if len(route) >= 14:
                incomplete = True
                continue
            if may_traverse(source["context"], action):
                self.stage.source("bot", source["locator"], context, {"route": [*route, action], "start": source["payload"].get("start", "")})
            elif not OTHER_SCOPE.search(action["text"]):
                key = self.stage.source("unclassified_menu", source["locator"], context, {"route": [*route, action], "start": source["payload"].get("start", "")})
                self.stage.status(key, "blocked", "Menu scope was not recognized; inspect it and supply an explicit route")
        if incomplete:
            raise ValueError("Bot traversal reached its 14-step depth limit")
        if not scoped and not actions:
            raise ValueError("No reachable respiratory menu; inspect the bot for an access gate or unrecognized route")
        self.stage.setting("seen_bot_states", list(dict.fromkeys([*(self.stage.setting("seen_bot_states") or []), fingerprint])))

    async def telegram_archive(self, source: dict):
        from telethon.tl.functions.messages import CheckChatInviteRequest
        parts = urllib.parse.urlsplit(source["locator"])
        segments = parts.path.strip("/").split("/")
        if segments[0] == "s":
            segments = segments[1:]
        if segments[0] == "addlist":
            self.stage.status(source["key"], "excluded", "Telegram folder invitation retained as a link; no folder was accepted")
            return
        if segments[0].startswith("+") or segments[0] == "joinchat":
            result = await self.client(CheckChatInviteRequest(segments[-1].lstrip("+")))
            entity = getattr(result, "chat", None)
            if entity is None:
                raise PermissionError("Telegram archive requires membership; no invitation was accepted")
        elif segments[0] == "c":
            entity = await self.client.get_entity(int("-100" + segments[1]))
        else:
            entity = await self.client.get_entity(segments[0])
        title = getattr(entity, "title", "")
        trusted = bool(RESPIRATORY.search(title)) or source["payload"].get("trusted", False)
        if segments[-1].isdigit() and len(segments) > 1:
            message = await self.client.get_messages(entity, ids=int(segments[-1]))
            if not message:
                raise ValueError("Linked Telegram message was not found")
            await self.capture_message(message, source, True)
            return
        if getattr(entity, "megagroup", False) and not trusted:
            self.stage.status(source["key"], "excluded", "General discussion group retained as a link; its chat history is outside the respiratory materials archive")
            return
        count = 0
        async for message in self.client.iter_messages(entity, limit=self.max_messages + 1):
            count += 1
            if count > self.max_messages:
                raise ValueError(f"Telegram archive exceeded {self.max_messages} messages; raise --max-messages to finish it")
            await self.capture_message(message, source, trusted or content_in_scope((message.raw_text or "") + " " + (message.file.name or "" if message.file else ""), self.lessons))
        if not trusted:
            # Shared archives can contain unlabeled files; do not claim exhaustive coverage.
            self.stage.status(source["key"], "incomplete", "Shared archive filtered by respiratory/lesson evidence; unlabeled content needs manual review")

    def drive_request(self, url: str, resource_key_value: str = "", file_id: str = ""):
        import google.auth.transport.requests
        from google.oauth2 import service_account
        api_key = os.environ.get("GOOGLE_DRIVE_API_KEY")
        headers = {}
        if api_key:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode({"key": api_key})
        else:
            credential_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if credential_file:
                credentials = service_account.Credentials.from_service_account_file(credential_file, scopes=["https://www.googleapis.com/auth/drive.readonly"])
            else:
                from .store import ROOT
                credentials = service_account.Credentials.from_service_account_file(str(ROOT / "firebaseadmin.json"), scopes=["https://www.googleapis.com/auth/drive.readonly"])
            credentials.refresh(google.auth.transport.requests.Request())
            headers["Authorization"] = "Bearer " + credentials.token
        if resource_key_value:
            headers["X-Goog-Drive-Resource-Keys"] = file_id + "/" + resource_key_value
        # Authorized Drive requests must never forward credentials across redirects.
        request = urllib.request.Request(url, headers=headers)
        return urllib.request.build_opener(urllib.request.HTTPHandler, urllib.request.HTTPSHandler).open(request, timeout=60)

    def drive(self, source: dict):
        if self.stage.setting("drive_api_unavailable"):
            return self.drive_public(source)
        url = source["locator"]
        match = re.search(r"/(?:folders|d)/([^/?#]+)", url)
        file_id = match.group(1) if match else urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("id", [None])[0]
        if not file_id:
            raise ValueError("Unrecognized Drive URL")
        rkey = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("resourcekey", [""])[0]
        api = "https://www.googleapis.com/drive/v3/files"
        try:
            with self.drive_request(f"{api}/{file_id}?fields=id,name,mimeType,size,resourceKey,shortcutDetails&supportsAllDrives=true", rkey, file_id) as response:
                metadata = json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in {403, 404}:
                raise
            try:
                error = json.load(exc).get("error", {})
                if any(item.get("reason") == "SERVICE_DISABLED" for item in error.get("details", [])):
                    self.stage.setting("drive_api_unavailable", True)
            except (ValueError, AttributeError):
                pass
            return self.drive_public(source)
        if metadata["mimeType"] == "application/vnd.google-apps.shortcut":
            target = metadata["shortcutDetails"]
            self.stage.source("drive_folder" if target["targetMimeType"].endswith("folder") else "drive_file",
                              f"https://drive.google.com/file/d/{target['targetId']}?resourcekey={target.get('targetResourceKey', '')}", source["context"])
            return
        if metadata["mimeType"] == "application/vnd.google-apps.folder":
            page, count = "", 0
            while True:
                query = urllib.parse.urlencode({"q": f"'{file_id}' in parents and trashed=false", "pageSize": 1000,
                                               "fields": "nextPageToken,files(id,name,mimeType,resourceKey)", "pageToken": page,
                                               "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"})
                with self.drive_request(api + "?" + query, rkey, file_id) as response:
                    payload = json.load(response)
                for item in payload.get("files", []):
                    folder = item["mimeType"] == "application/vnd.google-apps.folder"
                    child_url = f"https://drive.google.com/{'drive/folders' if folder else 'file/d'}/{item['id']}"
                    if item.get("resourceKey"):
                        child_url += "?resourcekey=" + urllib.parse.quote(item["resourceKey"])
                    context = source["context"] + [metadata["name"], item["name"]]
                    trusted = bool(RESPIRATORY.search(metadata["name"])) or source["payload"].get("trusted", False)
                    if folder or trusted or content_in_scope(item["name"], self.lessons):
                        self.stage.source("drive_folder" if folder else "drive_file", child_url, context, {"trusted": trusted})
                    count += 1
                page = payload.get("nextPageToken", "")
                if not page:
                    break
            if not RESPIRATORY.search(metadata["name"]) and not source["payload"].get("trusted", False):
                self.stage.status(source["key"], "incomplete", f"Shared Drive folder ({count} children); unlabeled files require scope review")
            return
        mime = metadata["mimeType"]
        check_book_size(self.stage, int(metadata.get("size", 0)), mime == "application/pdf")
        if mime == "application/pdf" or mime.startswith("image/") or mime in {"application/zip", "application/x-zip-compressed", "application/vnd.rar", "application/x-rar-compressed", "application/x-7z-compressed"} or metadata["name"].lower().endswith((".rar", ".7z")):
            fd, name = tempfile.mkstemp(dir=self.stage.directory, suffix=".part")
            os.close(fd)
            path = Path(name)
            try:
                with self.drive_request(f"{api}/{file_id}?alt=media&supportsAllDrives=true", rkey, file_id) as response:
                    copy_stream(response, path)
                if zipfile.is_zipfile(path) or metadata["name"].lower().endswith((".rar", ".7z")):
                    self.unpack(path, source, source["context"])
                else:
                    stage_file(self.stage, path, metadata["name"], source["key"], source["context"], url)
            finally:
                path.unlink(missing_ok=True)
        else:
            # Native Docs, videos, audio and other file types stay as links.
            self.stage.put({"id": identity(resource_key(url)), "kind": "link", "url": url, "title": metadata["name"],
                            "status": "unreviewed", "sourceUrls": [url]}, source["key"], source["context"], {"url": url})

    def drive_public(self, source: dict):
        """Use anonymous public sharing pages when the Drive API is unavailable."""
        import gdown
        url = source["locator"]
        options = {"quiet": True, "use_cookies": False, "timeout": (20, 60)}
        if source["kind"] == "drive_folder" or "/folders/" in url:
            # List one level at a time: gdown's recursive public API aborts an
            # entire tree when one child folder is inaccessible. Pin its 6.4 API.
            from gdown.download import _get_session
            from gdown.download_folder import _parse_embedded_folder_view
            match = re.search(r"/(?:folders|d)/([^/?#]+)", url)
            file_id = match.group(1) if match else urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["id"][0]
            session, _ = _get_session(proxy=None, use_cookies=False, user_agent="Mozilla/5.0", cookies_file=None)
            try:
                root, files = _parse_embedded_folder_view(sess=session, folder_id=file_id, verify=True, timeout=(20, 60))
            finally:
                session.close()
            trusted = bool(RESPIRATORY.search(root)) or source["payload"].get("trusted", False)
            for child_id, name, mime in files:
                folder = mime == "application/vnd.google-apps.folder"
                if folder or trusted or content_in_scope(name, self.lessons):
                    context = [*source["context"], root, name]
                    child_url = f"https://drive.google.com/{'drive/folders' if folder else 'file/d'}/{child_id}"
                    self.stage.source("drive_folder" if folder else "drive_file", child_url, context, {"trusted": trusted})
            # Public HTML listings cannot establish the API's pagination guarantees.
            self.stage.status(source["key"], "incomplete", f"Public Drive listing ({len(files)} files); verify folder completeness and unlabeled shared content")
            return
        metadata = gdown.download(url=url, skip_download=True, **options)
        filename = Path(metadata.path).name
        mime = mimetypes.guess_type(filename)[0] or ""
        archive = filename.lower().endswith((".zip", ".rar", ".7z"))
        if mime != "application/pdf" and not mime.startswith("image/") and not archive:
            self.stage.put({"id": identity(resource_key(url)), "kind": "link", "url": url, "title": filename,
                            "status": "unreviewed", "sourceUrls": [url]}, source["key"], source["context"], {"url": url})
            return
        fd, name = tempfile.mkstemp(dir=self.stage.directory, suffix=".part")
        os.close(fd)
        path = Path(name)
        def progress(downloaded, total):
            check_book_size(self.stage, max(downloaded, total or 0), mime == "application/pdf")
            if max(downloaded, total or 0) > MAX_FILE_BYTES:
                raise ValueError("Public Drive file exceeds 512 MiB")
        try:
            with path.open("wb") as handle:
                gdown.download(url=url, output=handle, progress=progress, **options)
            if archive or zipfile.is_zipfile(path):
                self.unpack(path, source, [*source["context"], filename])
            else:
                stage_file(self.stage, path, filename, source["key"], source["context"], url)
        finally:
            path.unlink(missing_ok=True)

    def http_file(self, source: dict):
        fd, name = tempfile.mkstemp(dir=self.stage.directory, suffix=".part")
        os.close(fd)
        path = Path(name)
        try:
            with open_url(source["locator"]) as response:
                if int(response.headers.get("Content-Length", 0)) > MAX_FILE_BYTES:
                    raise ValueError("HTTP file exceeds 512 MiB")
                copy_stream(response, path)
            if zipfile.is_zipfile(path) or urllib.parse.urlsplit(source["locator"]).path.lower().endswith((".rar", ".7z")):
                self.unpack(path, source, source["context"])
            else:
                stage_file(self.stage, path, Path(urllib.parse.urlsplit(source["locator"]).path).name,
                           source["key"], source["context"], source["locator"])
        finally:
            path.unlink(missing_ok=True)

    def unpack(self, path: Path, source: dict, context: list[str]):
        def on_link(url, title, member_context):
            self.add_link(url, title, {**source, "context": member_context}, {"archive": source["locator"]})
        extractor = unpack_zip if zipfile.is_zipfile(path) else unpack_archive
        extractor(self.stage, path, source["key"], context, on_link=on_link)

    def youtube_playlist(self, source: dict):
        """Read initial playlist data and every continuation; never silently stop at page one."""
        with open_url(source["locator"], {"Accept-Language": "en-US,en;q=0.9"}) as response:
            page = response.read(20 * 1024 * 1024).decode("utf8")
        decoder = json.JSONDecoder()
        initial = re.search(r"(?:var\s+)?ytInitialData\s*=\s*", page)
        if not initial:
            raise ValueError("YouTube playlist data was unavailable (private, removed, or consent gate)")
        payload, _ = decoder.raw_decode(page[initial.end():])
        config = {}
        for match in re.finditer(r"ytcfg\.set\(", page):
            try:
                data, _ = decoder.raw_decode(page[match.end():])
                if isinstance(data, dict):
                    config.update(data)
            except ValueError:
                continue
        title = payload.get("metadata", {}).get("playlistMetadataRenderer", {}).get("title", "YouTube playlist")
        videos, seen, visited = [], set(), set()
        while True:
            next_tokens = []
            def walk(value):
                if isinstance(value, list):
                    for child in value:
                        walk(child)
                elif isinstance(value, dict):
                    renderer = value.get("playlistVideoRenderer")
                    if renderer:
                        vid = renderer.get("videoId")
                        name = renderer.get("title", {})
                        name = name.get("simpleText") or "".join(run.get("text", "") for run in name.get("runs", []))
                        if vid and vid not in seen:
                            seen.add(vid)
                            videos.append({"id": vid, "youtubeId": vid, "title": name or vid, "url": f"https://youtu.be/{vid}", "sourceType": "youtube"})
                    # Current YouTube playlists use lockup view models in place
                    # of playlistVideoRenderer. Preserve their displayed order.
                    model = value.get("lockupViewModel")
                    if model and model.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO":
                        vid = model.get("contentId")
                        name = model.get("metadata", {}).get("lockupMetadataViewModel", {}).get("title", {}).get("content")
                        if vid and vid not in seen:
                            seen.add(vid)
                            videos.append({"id": vid, "youtubeId": vid, "title": name or vid, "url": f"https://youtu.be/{vid}", "sourceType": "youtube"})
                    continuation = value.get("continuationItemRenderer", {}).get("continuationEndpoint", {}).get("continuationCommand", {}).get("token")
                    if continuation:
                        next_tokens.append(continuation)
                    # Avoid unrelated recommended-video shelves outside the actual playlist renderer.
                    for key, child in value.items():
                        if key not in {"playlistVideoRenderer", "lockupViewModel", "secondaryContents"}:
                            walk(child)
            walk(payload)
            if not next_tokens:
                break
            token = next_tokens[0]
            if token in visited or len(visited) >= 200:
                raise ValueError("YouTube continuation loop or 200-page limit reached")
            visited.add(token)
            context = config.get("INNERTUBE_CONTEXT")
            key = config.get("INNERTUBE_API_KEY")
            if not key or not context:
                raise ValueError("YouTube continuation configuration missing; playlist is incomplete")
            body = json.dumps({"context": context, "continuation": token}).encode()
            with open_url("https://www.youtube.com/youtubei/v1/browse?key=" + urllib.parse.quote(key), {"Content-Type": "application/json"}, body) as response:
                payload = json.load(response)
            time.sleep(1.5)
        if not videos:
            raise ValueError("YouTube playlist returned no accessible videos")
        source["payload"].update(playlistTitle=title, availableVideos=videos)
        self.stage.db.execute("UPDATE sources SET payload=? WHERE key=?", (json.dumps(source["payload"], ensure_ascii=False), source["key"]))
        self.stage.db.commit()
        trusted = bool(RESPIRATORY.search(title)) or source["payload"].get("trusted", False)
        selected = videos if trusted else [video for video in videos if content_in_scope(video["title"], self.lessons)]
        if not selected:
            raise ValueError("Shared playlist needs scope review before including unlabeled videos")
        url = source["locator"]
        entry = {"id": identity(resource_key(url)), "kind": "playlist", "url": url, "title": title,
                 "videos": selected, "sourceUrls": [url], "status": "unreviewed"}
        existing = self.stage.get(entry["id"])
        if existing and existing.get("status") in {"approved", "published"}:
            raise ValueError("Playlist was already reviewed; start a new run to collect a changed source")
        # Replace the raw playlist link while retaining its review evidence.
        self.stage.save({**(existing or {}), **entry})
        self.stage.put(entry, source["key"], source["context"], {"url": url})
        if len(selected) != len(videos):
            self.stage.status(source["key"], "incomplete", f"Shared playlist: staged {len(selected)}/{len(videos)} videos with respiratory evidence; remaining titles need scope review")

    async def process_source(self, source):
        from telethon.errors import FloodWaitError
        if self.processed >= 10000:
            raise ValueError("Run reached 10,000 sources; pending sources remain visible in the report")
        self.processed += 1
        self.stage.status(source["key"], "running")
        context = ' / '.join(source['context']).replace('\n', ' ')
        print(f"Collecting {source['kind']}: {context[:180]}", flush=True)
        try:
            if source["kind"] != "bot":
                previous = self.stage.reusable_source(source)
                if previous:
                    source["payload"]["reusedFrom"] = previous["key"]
                    if source["kind"] == "youtube_playlist":
                        source["payload"].update({key: previous["payload"][key] for key in ("playlistTitle", "availableVideos")})
                    self.stage.db.execute("UPDATE sources SET payload=? WHERE key=?", (json.dumps(source["payload"], ensure_ascii=False), source["key"]))
                    self.stage.db.commit()
                    if source["kind"] not in {"telegram_archive", "drive_folder", "youtube_playlist"}:
                        for entry in self.stage.entries():
                            for occurrence in self.stage.occurrences(entry["id"]):
                                if occurrence["source"] == previous["key"]:
                                    self.stage.put(entry, source["key"], source["context"], occurrence)
                    # Archive breadcrumbs resolve through context_variants;
                    # cloning every occurrence would multiply cyclic references.
                    self.stage.status(source["key"], previous["status"], previous.get("error"))
                    return
            if source["kind"] == "bot":
                await self.bot(source)
            elif source["kind"] == "telegram_file":
                await self.telegram_file(source)
            elif source["kind"] == "telegram_archive":
                await self.telegram_archive(source)
            elif source["kind"] in {"drive_file", "drive_folder"}:
                await asyncio.to_thread(self.drive, source)
            elif source["kind"] == "http_file":
                await asyncio.to_thread(self.http_file, source)
            elif source["kind"] == "youtube_playlist":
                await asyncio.to_thread(self.youtube_playlist, source)
            else:
                raise ValueError("Unsupported source kind")
            current = self.stage.source_by_key(source["key"])
            if current["status"] in {"pending", "running"}:
                self.stage.status(source["key"], "done")
        except asyncio.CancelledError:
            self.stage.requeue(source["key"])
            raise
        except FloodWaitError as exc:
            self.stage.requeue(source["key"])
            await self.respect_flood(exc.seconds)
        except IgnoredLargeBook as exc:
            self.stage.status(source["key"], "excluded", str(exc))
        except Exception as exc:
            error = f"HTTP {exc.code}" if isinstance(exc, urllib.error.HTTPError) else f"{type(exc).__name__}: {exc}"
            self.stage.status(source["key"], "blocked" if isinstance(exc, PermissionError) else "failed", error)
            print(f"  Source unfinished: {error[:250]}", flush=True)

    async def drain_bot(self, name):
        # One sequential dialogue per Telegram identity, including case-variant usernames.
        while pending := [source for source in self.stage.sources("pending") if source["kind"] == "bot" and source["locator"].casefold() == name]:
            extensions = [source for source in pending if source["locator"] in self.bot_states and
                          source["payload"].get("route", [])[:len(self.bot_states[source["locator"]]["route"])] == self.bot_states[source["locator"]]["route"]]
            await self.process_source((extensions or pending)[0])

    async def drain_files(self):
        while True:
            pending = [source for source in self.stage.sources("pending") if source["kind"] == "telegram_file"]
            choices = [source for source in pending if source["locator"] not in self.active_files]
            if not choices:
                if pending and self.active_files:
                    await asyncio.sleep(0.25)
                    continue
                return
            source = choices[0]
            self.active_files.add(source["locator"])
            try:
                await self.process_source(source)
            finally:
                self.active_files.remove(source["locator"])

    async def run(self):
        while pending := self.stage.sources("pending"):
            names = list(dict.fromkeys(source["locator"].casefold() for source in pending if source["kind"] == "bot"))
            if names:
                gate = asyncio.Semaphore(3)
                async def dialogue(name):
                    async with gate:
                        await self.drain_bot(name)
                tasks = [asyncio.create_task(dialogue(name)) for name in names]
                try:
                    await asyncio.gather(*tasks)
                finally:
                    for task in tasks:
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
            elif any(source["kind"] == "telegram_file" for source in pending):
                tasks = [asyncio.create_task(self.drain_files()) for _ in range(4)]
                try:
                    await asyncio.gather(*tasks)
                finally:
                    for task in tasks:
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
            else:
                # Linked archives can enqueue another delegated bot; recheck after each.
                await self.process_source(pending[0])
