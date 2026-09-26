import json
from pathlib import Path

path = Path(r'D:\code\asu_med_materials-main\src\data\materials\reference\reference-books.json')
data = json.loads(path.read_text(encoding='utf-8'))

books = [
    ('Case Files Anatomy 2nd Edition', 'Eugene C. Toy, et al.', 'https://drive.google.com/file/d/1tnraBlhYSphBAjizQWwkbsXo7b_Pwu_f/view?usp=drive_link'),
    ('Color Atlas of Anatomy 7th Edition', 'Johannes C. Rohen, Chihiro Yokochi, Elke Lütjen-Drecoll', 'https://drive.google.com/file/d/1JqWKtV1Na_12r1J_CdjPKwvxCOtsiJL7/view?usp=drive_link'),
    ("Grant's Dissector 15th Ed.", 'Anne M. R. Agur, Arthur F. Dalley', 'https://drive.google.com/file/d/1SkIHOwuoV8EmIghO8BuL2WURenftf_7y/view?usp=drive_link'),
    ("Gray's Anatomy for Students 3rd", 'Richard L. Drake, A. Wayne Vogl, Adam W. M. Mitchell', 'https://drive.google.com/file/d/1a3THbLeKwxJpqV9xkILWoQX1zeAaFcWy/view?usp=drive_link'),
    ('High-Yield Gross Anatomy, Fifth Edition', 'Ronald W. Dudek', 'https://drive.google.com/file/d/1wy_Yuc3UF8woOg3Utc3MFaoHP9yyAnKV/view?usp=drive_link'),
    ('Clinically Oriented Anatomy (7th Edition)', 'Keith L. Moore, Arthur F. Dalley, Anne M. R. Agur', 'https://drive.google.com/file/d/1zW3lp4Dhjy-KdeFNYIbANj-F2wdisExl/view?usp=drive_link'),
    ('Atlas of Human Anatomy (6th Edition)', 'Frank H. Netter', 'https://drive.google.com/file/d/1Y9c1YS_B8N-zzbQJSNfcFaNj7eZzmdnS/view?usp=drive_link'),
    ("Snell's Clinical Anatomy by Regions (9th Edition)", 'Richard S. Snell', 'https://drive.google.com/file/d/17ty-QlMW1_QSYKQs2gKOhDamzEoWdvMa/view?usp=drive_link'),
    ('The Massage Connection Anatomy and Physiology', 'Ruth Werner', 'https://drive.google.com/file/d/1N4EKclUHV9YaAdiNJP5GnMi344qGv_OI/view?usp=drive_link'),
]

new_data = []
for item in data:
    if item.get('id', '').startswith('ref-anatomy-year'):
        year = item['year']
        for idx, book in enumerate(books, start=1):
            new_data.append({
                'id': f'ref-anatomy-book-{year}-{idx}',
                'title': book[0],
                'description': f'Anatomy reference book for Year {year}: {book[0]} .',
                'url': book[2],
                'type': 'book',
                'category': 'references',
                'year': year,
                'moduleId': f'year{year}-reference-books',
                'author': book[1],
                'addedBy': 'Mazen Yasin',
                'tags': ['anatomy', 'reference', 'book', 'medical', f'year{year}'],
            })
    else:
        new_data.append(item)

path.write_text(json.dumps(new_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Updated {len(new_data)} entries in {path}')
