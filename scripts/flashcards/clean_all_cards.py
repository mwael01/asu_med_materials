import socket
orig = socket.getaddrinfo
socket.getaddrinfo = lambda host, port, family=0, type=0, proto=0, flags=0: orig(host, port, socket.AF_INET, type, proto, flags)

import json
from pathlib import Path
import re
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from flashcards.firebase_store import get_db

db = get_db(Path(__file__).resolve().parents[2] / "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json")

CLOZE_RE = re.compile(r"\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}", re.IGNORECASE | re.DOTALL)
R2_BASE = "https://asumed.eduvour.com"

def rewrite_imgs(s: str) -> str:
    def repl(m):
        attr = m.group(1)
        src = m.group(2).strip()
        if src.startswith("http://") or src.startswith("https://") or src.startswith("data:"):
            return f'{attr}"{src}"'
        fname = Path(src).name
        return f'{attr}"{R2_BASE}/{fname}"'
    return re.sub(r'(\bsrc\s*=\s*)["\']([^"\']+)["\']', repl, s, flags=re.IGNORECASE)

def sanitize_clean(s: str) -> str:
    if not s:
        return ""
    # Strip dead hint buttons and snackbars
    s = re.sub(r'<div\s+[^>]*(?:class=[\"\']hint_btn[\"\']|id=[\"\'](?:hint_btn|snackbar)[\"\'])[^>]*>.*?</div>', '', s, flags=re.DOTALL)
    s = re.sub(r'<(?:button|a|span|div)[^>]*>\s*Show hint\s*</(?:button|a|span|div)>', '', s, flags=re.DOTALL)
    # Strip tags metadata
    s = re.sub(r'<div[^>]*>\s*<b>Tags</b>:.*?</div>', '', s, flags=re.DOTALL | re.IGNORECASE)
    # Strip empty sections if they were in the text
    section_patterns = [
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Etymology\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Mnemonics\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Extra Section\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Images\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
    ]
    for pat in section_patterns:
        def repl(m):
            content = m.group(1) or ""
            has_img = "<img" in content.lower()
            t = re.sub(r"<[^>]+>", "", content).strip()
            if has_img:
                return rewrite_imgs(content)
            elif t:
                return f"<div>{content}</div>"
            return ""
        s = re.sub(pat, repl, s, flags=re.IGNORECASE | re.DOTALL)

    # Clean whitespace & empty tags
    s = re.sub(r'&nbsp;', ' ', s)
    s = re.sub(r'[ \t]{2,}', ' ', s)
    s = re.sub(r'<div>\s*</div>', '', s)
    s = re.sub(r'<span>\s*</span>', '', s)
    s = re.sub(r'(?:<br\s*/?>\s*){2,}', '<br>', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    s = re.sub(r'^\s*(?:<hr[^>]*>|<br\s*/?>)+', '', s)
    s = re.sub(r'(?:<hr[^>]*>|<br\s*/?>)+\s*$', '', s)
    return s.strip()

def render_cloze_q(text: str, cloze_num: int) -> str:
    def repl(m):
        idx = int(m.group(1))
        ans = m.group(2)
        hint = m.group(3)
        if idx == cloze_num:
            return f'<span class="cloze">[{hint or "..."}]</span>'
        return ans
    return sanitize_clean(CLOZE_RE.sub(repl, text))

def render_cloze_a(text: str, cloze_num: int) -> str:
    def repl(m):
        idx = int(m.group(1))
        ans = m.group(2)
        if idx == cloze_num:
            return f'<span class="cloze">{ans}</span>'
        return ans
    return sanitize_clean(CLOZE_RE.sub(repl, text))

def load_canonical_renders(anki_db_path: Path):
    con = sqlite3.connect(anki_db_path)
    col = con.execute("select models from col").fetchone()
    models = json.loads(col[0])

    cards = con.execute("""
        select c.id, c.ord, n.guid, n.mid, n.flds 
        from cards c join notes n on c.nid = n.id
    """).fetchall()

    lookup = {}
    for cid, ord_, guid, mid, flds in cards:
        m = models[str(mid)]
        mname = m["name"]
        fields = flds.split("\x1f")
        fnames = [f["name"] for f in m["flds"]]
        fmap = {fnames[i]: fields[i] if i < len(fields) else "" for i in range(len(fnames))}

        if "Cloze" in mname:
            content = fmap.get("Text") or fmap.get("Content", "")
            q = render_cloze_q(content, ord_ + 1)
            a = render_cloze_a(content, ord_ + 1)
        else:
            q = sanitize_clean(fmap.get("Front", ""))
            a = sanitize_clean(fmap.get("Back", ""))

        # Check for image
        img = fmap.get("Images", "").strip()
        if img and "<img" in img.lower():
            clean_img = rewrite_imgs(sanitize_clean(img))
            if clean_img and clean_img not in a:
                a += f"<br>{clean_img}"

        # Check for non-empty Extra
        extra = fmap.get("Extra", "").strip()
        if extra and not re.match(r"^\s*(?:<div>\s*</div>|<br\s*/?>\s*)*$", extra):
            clean_extra = sanitize_clean(extra)
            if clean_extra and clean_extra not in a:
                a += f"<div>{clean_extra}</div>"

        # Check for non-empty Mnemonics
        mnemonics = fmap.get("Mnemonics", "").strip()
        if mnemonics and not re.match(r"^\s*(?:<div>\s*</div>|<br\s*/?>\s*)*$", mnemonics):
            clean_mnem = sanitize_clean(mnemonics)
            if clean_mnem and clean_mnem not in a:
                a += f"<div>{clean_mnem}</div>"

        lookup[(guid, ord_)] = (q, a)

    con.close()
    return lookup

def main():
    anki_db = Path("/tmp/collection.anki21")
    if not anki_db.exists():
        import zipfile
        apkg_path = Path(__file__).resolve().parents[2] / "ASU__Year 2__Semester 1__Blood.apkg"
        with zipfile.ZipFile(apkg_path) as z:
            z.extract("collection.anki21", "/tmp")

    print("Building canonical renders from Anki collection database...")
    renders = load_canonical_renders(anki_db)
    print(f"Loaded {len(renders)} canonical card renders.")

    decks = list(db.collection("flashcard_decks").stream())
    print(f"Updating cards across {len(decks)} Firestore decks...")

    total_updated = 0
    total_scanned = 0

    for i, d in enumerate(decks, 1):
        deck_id = d.id
        title = d.to_dict().get("title")
        rev_id = d.to_dict().get("activeRevisionId")
        if not rev_id:
            continue

        cards_ref = (
            db.collection("flashcard_decks")
            .document(deck_id)
            .collection("revisions")
            .document(rev_id)
            .collection("cards")
        )
        cards = list(cards_ref.stream())
        total_scanned += len(cards)

        batch = db.batch()
        batch_count = 0
        deck_updated = 0

        for c in cards:
            cd = c.to_dict()
            guid = cd.get("sourceNoteGuid")
            ord_ = cd.get("sourceTemplateOrdinal", 0)

            canonical = renders.get((guid, ord_))
            if canonical:
                new_q, new_a = canonical
            else:
                # Fallback if card was somehow not in lookup
                new_q = sanitize_clean(cd.get("questionHtml", ""))
                new_a = sanitize_clean(cd.get("answerHtml", ""))

            old_q = cd.get("questionHtml", "")
            old_a = cd.get("answerHtml", "")

            if new_q != old_q or new_a != old_a:
                batch.update(c.reference, {"questionHtml": new_q, "answerHtml": new_a})
                batch_count += 1
                deck_updated += 1
                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

        if batch_count > 0:
            batch.commit()

        total_updated += deck_updated
        if deck_updated > 0:
            print(f"[{i}/{len(decks)}] Updated {deck_updated}/{len(cards)} cards in '{title}'")

    print(f"\n[Done] Scanned {total_scanned} cards, updated {total_updated} cards to canonical clean state!")

if __name__ == "__main__":
    main()
