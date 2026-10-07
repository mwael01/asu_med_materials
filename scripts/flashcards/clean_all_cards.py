import socket
orig = socket.getaddrinfo
socket.getaddrinfo = lambda host, port, family=0, type=0, proto=0, flags=0: orig(host, port, socket.AF_INET, type, proto, flags)

from pathlib import Path
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from flashcards.firebase_store import get_db

db = get_db(Path(__file__).resolve().parents[2] / "medmaterials-firebase-adminsdk-fbsvc-849748c5bd.json")

def clean_card_htmls(q, a):
    # 1. Clean question
    q_clean = re.sub(r'<div\s+[^>]*(?:class=[\"\']hint_btn[\"\']|id=[\"\'](?:hint_btn|snackbar)[\"\'])[^>]*>.*?</div>', '', q, flags=re.DOTALL)
    q_clean = re.sub(r'<(?:button|a|span|div)[^>]*>\s*Show hint\s*</(?:button|a|span|div)>', '', q_clean, flags=re.DOTALL)
    q_clean = re.sub(r'<div>\s*</div>', '', q_clean)
    q_clean = re.sub(r'(?:\s*<br\s*/?>\s*)+$', '', q_clean)
    q_clean = re.sub(r'^(?:\s*<br\s*/?>\s*)+', '', q_clean)
    q_clean = q_clean.strip()

    # 2. Clean answer
    a_clean = a

    # Strip FrontSide / repeated question from start of answer
    hr_match = re.search(r'\s*<hr[^>]*>\s*', a_clean)
    if hr_match:
        before_hr = a_clean[:hr_match.start()]
        after_hr = a_clean[hr_match.end():]
        q_text = re.sub(r'<[^>]+>', ' ', q_clean).strip()
        before_text = re.sub(r'<[^>]+>', ' ', before_hr).strip()
        if before_text and (before_text == q_text or before_text.startswith(q_text) or q_text.startswith(before_text)):
            a_clean = after_hr

    # Remove empty sections: Etymology, Mnemonics, Extra Section, Images
    section_patterns = [
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Etymology\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Mnemonics\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Extra Section\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
        r'(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*Images\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?',
    ]

    for pat in section_patterns:
        def repl(m):
            content = m.group(1) or ''
            has_img = '<img' in content.lower()
            text = re.sub(r'<[^>]+>', '', content).strip()
            if has_img:
                return content
            elif text:
                return f'<div>{content}</div>'
            return ''
        a_clean = re.sub(pat, repl, a_clean, flags=re.IGNORECASE | re.DOTALL)

    a_clean = re.sub(r'<div\s+[^>]*(?:class=[\"\']hint_btn[\"\']|id=[\"\'](?:hint_btn|snackbar)[\"\'])[^>]*>.*?</div>', '', a_clean, flags=re.DOTALL)
    a_clean = re.sub(r'<div>\s*</div>', '', a_clean)
    a_clean = re.sub(r'(?:<br\s*/?>\s*){2,}', '<br>', a_clean)
    a_clean = re.sub(r'^\s*(?:<hr[^>]*>|<br\s*/?>)+', '', a_clean)
    a_clean = re.sub(r'(?:<hr[^>]*>|<br\s*/?>)+\s*$', '', a_clean)
    a_clean = a_clean.strip()

    return q_clean, a_clean

def main():
    decks = list(db.collection('flashcard_decks').stream())
    print(f"Starting batch cleanup across {len(decks)} decks...")
    total_cleaned = 0

    for i, d in enumerate(decks, 1):
        deck_id = d.id
        title = d.to_dict().get('title')
        rev_id = d.to_dict().get('activeRevisionId')
        if not rev_id:
            continue

        cards_ref = db.collection('flashcard_decks').document(deck_id).collection('revisions').document(rev_id).collection('cards')
        cards = list(cards_ref.stream())

        batch = db.batch()
        batch_count = 0
        deck_cleaned = 0

        for c in cards:
            cd = c.to_dict()
            q = cd.get('questionHtml', '')
            a = cd.get('answerHtml', '')
            qc, ac = clean_card_htmls(q, a)
            if qc != q or ac != a:
                batch.update(c.reference, {'questionHtml': qc, 'answerHtml': ac})
                batch_count += 1
                deck_cleaned += 1
                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

        if batch_count > 0:
            batch.commit()

        total_cleaned += deck_cleaned
        if deck_cleaned > 0:
            print(f"[{i}/{len(decks)}] Cleaned {deck_cleaned}/{len(cards)} cards in '{title}'")

    print(f"\nCompleted cleanup! Total cards updated: {total_cleaned}")

if __name__ == "__main__":
    main()
