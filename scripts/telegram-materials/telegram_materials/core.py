from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

MODULE_ID = "year2-respiratory"
BOTS = ("ASUMedZonebot", "ASU_MedDataBot", "Medicine_way_bot")
RESPIRATORY = re.compile(r"respir|\bresp\b|تنفس|ريسب", re.I)
OTHER_MODULE_FILE = re.compile(r"\b(?:cvs|cardiovascular|renal|urinary|git|gastrointestinal|cns|endocrine|reproductive|musculoskeletal|msk|hematology|haematology)\b", re.I)
YEAR_TWO = re.compile(r"\b(?:second|2nd)\s+year\b|\byear\s*2\b|\b2\s*year\b|🥈\s*year|(?:فرقة|فرق[هة]|سن[ةه])\s*(?:ال)?(?:تاني[ةه]?|ثاني[ةه]?|[2٢])", re.I)
OTHER_SCOPE = re.compile(
    r"\b(?:year\s*[1345]|[1345](?:st|rd|th|ry)?\s*year|(?:first|third|fourth|fifth|1st|3rd|4th|5th)\s+year)\b|"
    r"(?:فرقة|فرق[هة]|سن[ةه])\s*(?:ال)?(?:اول[ىي]?|أول[ىي]?|ثالث[ةه]?|تالت[ةه]?|رابع[ةه]?|خامس[ةه]?|[١٣٤٥1345])|"
    r"[🥇🥉]\s*year|"
    r"^\W*(?:blood(?:\s*(?:and|&)\s*lymphatic)?|renal|urinary|cardiovascular|cardio|cvs|endocrine|musculoskeletal|locomotor|gastrointestinal|git|cns|reproductive|neuroscience)(?:\s+(?:module|system))?\W*$", re.I)
NAVIGATION = re.compile(r"^\W*(?:go back|back|home|main menu|رجوع|خروج|الرئيسية|القائمة الرئيسية|عودة|⬅|↩|🔙)", re.I)
URL_PATTERN = re.compile(r"https?://[^\s<>\"'\u200b]+", re.I)


def identity(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def normalize_url(value: str) -> str:
    parts = urlsplit(value.strip())
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("Only HTTP(S) resource URLs are supported")
    host = parts.hostname.lower()
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid", "usp"}]
    # These IDs identify the same content across Drive/YouTube sharing URL forms.
    if host in {"drive.google.com", "docs.google.com"}:
        match = re.search(r"/(?:file/d|folders)/([^/?#]+)", parts.path)
        file_id = match.group(1) if match else dict(query).get("id")
        if file_id:
            kind = "folders" if "/folders/" in parts.path else "file/d"
            query = [(k, v) for k, v in query if k == "resourcekey"]
            return f"https://drive.google.com/{kind}/{file_id}" + ("?" + urlencode(query) if query else "")
    if host in {"youtu.be", "www.youtube.com", "youtube.com", "m.youtube.com"}:
        args = dict(query)
        vid = parts.path.strip("/") if host == "youtu.be" else args.get("v")
        if not vid:
            path_video = re.match(r"/(?:shorts|embed|v)/([^/?]+)", parts.path)
            vid = path_video.group(1) if path_video else None
        if vid:
            # Preserve playlist membership and timestamps: they can carry lesson context.
            return "https://www.youtube.com/watch?" + urlencode({"v": vid, **{k: v for k, v in query if k in {"list", "t", "start"}}})
    if host == "telegram.me":
        host = "t.me"
    netloc = host + (f":{parts.port}" if parts.port else "")
    return urlunsplit((parts.scheme.lower(), netloc, parts.path or "/", urlencode(sorted(query)), parts.fragment))


def resource_key(url: str) -> str:
    """Dedup sharing forms without discarding the original URL stored in occurrences."""
    normalized = normalize_url(url)
    parts = urlsplit(normalized)
    if parts.hostname == "drive.google.com":
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    if parts.hostname == "www.youtube.com" and dict(parse_qsl(parts.query)).get("v"):
        return "youtube:" + dict(parse_qsl(parts.query))["v"]
    return normalized


def video_link_type(url: str) -> str | None:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().removeprefix("www.")
    if host in {"youtube.com", "m.youtube.com", "youtu.be"}:
        key = resource_key(url)
        return "youtube" if key.startswith("youtube:") else None
    if host in {"vimeo.com", "player.vimeo.com"} and re.search(r"/\d+(?:/|$)", parts.path):
        return "vimeo"
    return "direct" if re.search(r"\.(mp4|webm|mov)(?:[?#]|$)", url, re.I) else None


def link_id(material_id: str, lesson_id: str) -> str:
    encode = lambda value: quote(value, safe="-_.!~*'()").replace("~", "%7E")
    return f"{encode(material_id)}~{encode(lesson_id)}"


def words(value: str) -> set[str]:
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"[\u064b-\u065f\u0670]", "", value)
    return set(re.findall(r"[^\W_]+", value)) - {"and", "the", "of", "parts", "part", "lecture", "pdf", "i", "ii", "iii", "iv"}


def clearly_other_module(title: str) -> bool:
    return bool(OTHER_MODULE_FILE.search(title) and not RESPIRATORY.search(title))


def normalize_scope(stage: Stage) -> int:
    count = 0
    reason = "Filename/title explicitly identifies another module; excluded from the respiratory import"
    for entry in stage.entries():
        if entry.get("status") not in {"approved", "published"} and clearly_other_module(entry["title"]):
            entry.update(status="rejected", exclusionReason=reason)
            stage.save(entry)
            count += 1
    for source in stage.sources("pending"):
        if source["kind"] == "telegram_file" and clearly_other_module(source["payload"].get("filename", "")):
            stage.status(source["key"], "excluded", reason)
    return count


def propose_lessons(title: str, context: list[str], lessons: list[dict]) -> list[dict]:
    text = " / ".join([*context, title])
    text_words = words(text)
    aliases = {"Anatomy": {"anatomy", "anat", "اناتومي", "تشريح"}, "Histology": {"histology", "histo", "هستولوجي"},
               "Physiology": {"physiology", "physio", "فسيولوجي"}, "Biochemistry": {"biochemistry", "biochem", "bio", "بيوكيمياء"},
               "Pathology": {"pathology", "patho", "باثولوجي"}, "Pharmacology": {"pharmacology", "pharma", "pharm", "فارما"},
               "Microbiology": {"microbiology", "micro", "ميكرو"}, "Parasitology": {"parasitology", "para", "باراسيتولوجي"}}
    subjects = {lesson["subject"] for lesson in lessons if aliases.get(lesson["subject"], {lesson["subject"].lower()}) & text_words}
    proposals = []
    for lesson in lessons:
        if lesson.get("moduleId") != MODULE_ID or lesson.get("active") is False:
            continue
        if subjects and lesson["subject"] not in subjects:
            continue
        target = words(lesson["title"])
        overlap = len(target & text_words) / max(1, len(target))
        # Revisions require subject evidence; identical generic revision titles span subjects.
        if lesson.get("isRevision") and lesson["subject"] not in subjects:
            continue
        if overlap >= 0.6:
            proposals.append({"lessonId": lesson["id"], "subject": lesson["subject"],
                              "title": lesson["title"], "score": round(overlap, 3)})
    return sorted(proposals, key=lambda item: (-item["score"], item["lessonId"]))


class Stage:
    """Only ephemeral scrape output lives here; never used by the website."""

    def __init__(self, directory: Path):
        self.directory = directory.resolve()
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.files = self.directory / "files"
        self.files.mkdir(exist_ok=True)
        self.db = sqlite3.connect(self.directory / "stage.sqlite3", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sources (
                key TEXT PRIMARY KEY, kind TEXT NOT NULL, locator TEXT NOT NULL,
                context TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT,
                payload TEXT NOT NULL DEFAULT '{}');
            CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS source_reuse_lookup ON sources(kind, locator, status);
            CREATE TABLE IF NOT EXISTS occurrences (
                entry_id TEXT NOT NULL, source_key TEXT NOT NULL, context TEXT NOT NULL,
                payload TEXT NOT NULL, PRIMARY KEY(entry_id, source_key, context));
            CREATE INDEX IF NOT EXISTS occurrence_source_lookup ON occurrences(source_key);
            CREATE INDEX IF NOT EXISTS occurrence_url_lookup ON occurrences(json_extract(payload,'$.url'));
            CREATE TABLE IF NOT EXISTS excluded_branches (prefix TEXT PRIMARY KEY, reason TEXT NOT NULL);
            CREATE TRIGGER IF NOT EXISTS ignore_excluded_descendants BEFORE INSERT ON sources
            WHEN EXISTS (SELECT 1 FROM excluded_branches WHERE substr(NEW.context,1,length(prefix))=prefix)
            BEGIN SELECT RAISE(IGNORE); END;
            CREATE TRIGGER IF NOT EXISTS ignore_manybot_peer_reentries BEFORE INSERT ON sources
            WHEN NEW.kind='bot' AND lower(NEW.locator) IN ('asu_meddatabot','second_year_asu_med_data_bot')
              AND json_array_length(json_extract(NEW.payload,'$.route')) >= 2
              AND lower(json_extract(NEW.payload,'$.route[#-1].text')) NOT LIKE '%next%'
              AND lower(json_extract(NEW.payload,'$.route[#-1].text')) NOT LIKE '%more%'
              AND json_extract(NEW.payload,'$.route[#-1].text') NOT LIKE '%➡%'
              AND json_extract(NEW.payload,'$.route[#-1].text') NOT LIKE '%⬅%'
              AND json_extract(NEW.payload,'$.route[#-1].text') NOT LIKE '%التالي%'
              AND json_extract(NEW.payload,'$.route[#-1].text') NOT LIKE '%المزيد%'
              AND EXISTS (SELECT 1 FROM sources sibling WHERE sibling.kind='bot'
                AND lower(sibling.locator)=lower(NEW.locator)
                AND json_extract(sibling.payload,'$.route')=json_remove(json_extract(NEW.payload,'$.route'),'$[#-2]'))
            BEGIN SELECT RAISE(IGNORE); END;
        """)
        self.db.commit()
        if not self.setting("run_id"):
            import uuid
            self.setting("run_id", "telegram-resp-" + uuid.uuid4().hex)

    def setting(self, key: str, value: Any = None) -> Any:
        if value is not None:
            self.db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, json.dumps(value, ensure_ascii=False)))
            self.db.commit()
        row = self.db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def source(self, kind: str, locator: str, context: list[str], payload: dict | None = None) -> str:
        key = identity(json.dumps([kind, locator, context], ensure_ascii=False))
        self.db.execute("INSERT OR IGNORE INTO sources(key,kind,locator,context,payload) VALUES (?,?,?,?,?)",
                        (key, kind, locator, json.dumps(context, ensure_ascii=False), json.dumps(payload or {}, ensure_ascii=False)))
        self.db.commit()
        return key

    def status(self, key: str, status: str, error: str | None = None) -> None:
        self.db.execute("UPDATE sources SET status=?,error=? WHERE key=?", (status, error, key))
        self.db.commit()

    def requeue(self, key: str):
        self.db.execute("UPDATE sources SET status='pending',error=NULL WHERE key=? AND status!='excluded'", (key,))
        self.db.commit()

    def exclude_branch(self, context: list[str], reason: str):
        if not context:
            raise ValueError("Cannot exclude an empty root context")
        prefix = json.dumps(context, ensure_ascii=False)[:-1]
        self.db.execute("INSERT OR REPLACE INTO excluded_branches VALUES (?,?)", (prefix, reason))
        self.db.execute("UPDATE sources SET status='excluded',error=? WHERE substr(context,1,?)=?", (reason, len(prefix), prefix))
        self.db.commit()

    def sources(self, status: str | None = None) -> list[dict]:
        query = "SELECT * FROM sources" + (" WHERE status=?" if status else "") + " ORDER BY rowid"
        return [{**dict(row), "context": json.loads(row["context"]), "payload": json.loads(row["payload"])}
                for row in self.db.execute(query, (status,) if status else ())]

    def source_by_key(self, key: str) -> dict | None:
        row = self.db.execute("SELECT * FROM sources WHERE key=?", (key,)).fetchone()
        return {**dict(row), "context": json.loads(row["context"]), "payload": json.loads(row["payload"])} if row else None

    def reusable_source(self, source: dict) -> dict | None:
        row = self.db.execute("""SELECT key FROM sources WHERE kind=? AND locator=?
            AND status IN ('done','incomplete') AND key!=?
            AND coalesce(json_extract(payload,'$.trusted'),0)=?
            AND (kind!='youtube_playlist' OR json_type(payload,'$.availableVideos')='array')
            ORDER BY rowid LIMIT 1""", (source["kind"], source["locator"], source["key"], bool(source["payload"].get("trusted")))).fetchone()
        return self.source_by_key(row[0]) if row else None

    def reuse_pending_sources(self) -> int:
        """Clear cached references without RPCs, retaining their lesson evidence."""
        count = 0
        for source in self.sources("pending"):
            if source["kind"] not in {"telegram_archive", "drive_folder", "youtube_playlist", "telegram_file", "drive_file", "http_file"}:
                continue
            previous = self.reusable_source(source)
            if not previous:
                if source["kind"] != "telegram_archive":
                    continue
                captured = self.captured_telegram_message(source["locator"])
                if not captured:
                    continue
                proof = json.loads(captured[0]["payload"])
                for occurrence in captured:
                    entry = self.get(occurrence["entry_id"])
                    if entry:
                        self.put(entry, source["key"], source["context"], json.loads(occurrence["payload"]))
                payload = {**source["payload"], "capturedMessageId": proof["messageId"]}
                result = self.db.execute("UPDATE sources SET status='done',error=NULL,payload=? WHERE key=? AND status='pending'",
                                         (json.dumps(payload, ensure_ascii=False), source["key"]))
                count += result.rowcount
                self.db.commit()
                continue
            payload = {**source["payload"], "reusedFrom": previous["key"]}
            if source["kind"] == "youtube_playlist":
                payload.update({key: previous["payload"][key] for key in ("playlistTitle", "availableVideos")})
            if source["kind"] in {"telegram_file", "drive_file", "http_file"}:
                occurrences = self.db.execute("SELECT entry_id,payload FROM occurrences WHERE source_key=?", (previous["key"],)).fetchall()
                for occurrence in occurrences:
                    entry = self.get(occurrence["entry_id"])
                    if entry:
                        self.put(entry, source["key"], source["context"], json.loads(occurrence["payload"]))
            result = self.db.execute("UPDATE sources SET status=?,error=?,payload=? WHERE key=? AND status='pending'",
                                     (previous["status"], previous.get("error"), json.dumps(payload, ensure_ascii=False), source["key"]))
            count += result.rowcount
            self.db.commit()
        return count

    def captured_telegram_message(self, url: str) -> list:
        parts = urlsplit(url)
        if parts.hostname not in {"t.me", "telegram.me"} or not parts.path.rstrip("/").split("/")[-1].isdigit():
            return []
        row = self.db.execute("""SELECT source_key,payload FROM occurrences WHERE json_extract(payload,'$.url')=?
            AND json_type(payload,'$.video') IS NOT NULL LIMIT 1""", (url,)).fetchone()
        if not row:
            return []
        proof = json.loads(row["payload"])
        if str(proof.get("messageId")) != parts.path.rstrip("/").split("/")[-1] or proof.get("chatId") is None:
            return []
        # A media message's links and media were captured together. Reuse all
        # evidence for that exact chat/message, not only its recording URL.
        return self.db.execute("""SELECT entry_id,payload FROM occurrences WHERE source_key=?
            AND json_extract(payload,'$.messageId')=? AND json_extract(payload,'$.chatId')=?""",
            (row["source_key"], proof["messageId"], proof["chatId"])).fetchall()

    def reset_failures(self) -> None:
        self.db.execute("UPDATE sources SET status='pending',error=NULL WHERE status IN ('failed','blocked','incomplete') AND kind IN ('bot','telegram_file','telegram_archive','drive_file','drive_folder','http_file','youtube_playlist')")
        self.setting("seen_bot_states", [])
        self.db.commit()

    def put(self, entry: dict, source: str | None = None, context: list[str] | None = None, evidence: dict | None = None) -> str:
        entry_id = entry["id"]
        old = self.get(entry_id)
        # New occurrences must never erase human review or publication checkpoints.
        if old:
            urls = sorted(set([*entry.get("sourceUrls", []), *old.get("sourceUrls", [])]))
            entry = {**entry, **old}
            entry["sourceUrls"] = urls
        self.save(entry)
        if source:
            evidence = {key: value for key, value in (evidence or {}).items() if key not in {"source", "context"}}
            self.db.execute("INSERT OR REPLACE INTO occurrences VALUES (?,?,?,?)",
                            (entry_id, source, json.dumps(context or [], ensure_ascii=False), json.dumps(evidence or {}, ensure_ascii=False)))
            self.db.commit()
            target = self.get(entry["resolvedTo"]) if entry.get("resolvedTo") else None
            if target and target["kind"] == "file" and target["id"] != entry_id:
                target["sourceUrls"] = sorted(set([*target.get("sourceUrls", []), *entry.get("sourceUrls", [])]))
                self.put(target, source, context, evidence)
        return entry_id

    def save(self, entry: dict) -> None:
        self.db.execute("INSERT OR REPLACE INTO entries VALUES (?,?)", (entry["id"], json.dumps(entry, ensure_ascii=False)))
        self.db.commit()

    def get(self, entry_id: str) -> dict | None:
        row = self.db.execute("SELECT payload FROM entries WHERE id=?", (entry_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def entries(self) -> list[dict]:
        return [json.loads(row[0]) for row in self.db.execute("SELECT payload FROM entries ORDER BY rowid")]

    def occurrences(self, entry_id: str) -> list[dict]:
        return [{**json.loads(row[2]), "source": row[0], "context": json.loads(row[1])}
                for row in self.db.execute("SELECT source_key,context,payload FROM occurrences WHERE entry_id=?", (entry_id,))]

    def entry_for_url(self, url: str) -> dict | None:
        key = resource_key(url)
        for entry in self.entries():
            if any(resource_key(item) == key for item in [entry.get("url", ""), *entry.get("sourceUrls", [])] if item.startswith("http")):
                return entry
        return None
