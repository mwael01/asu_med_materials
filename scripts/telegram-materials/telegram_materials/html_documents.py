"""Validate standalone HTML and collect review evidence without executing it."""
from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


class HtmlEvidence(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = Counter()
        self.external = []
        self.handlers = []
        self.text = []
        self.title = []
        self.suppressed = 0
        self.in_title = False
        self.questions = 0

    def handle_starttag(self, tag, attrs):
        self.tags[tag] += 1
        values = dict(attrs)
        if tag in {'script', 'style'}:
            self.suppressed += 1
        if tag == 'title':
            self.in_title = True
        if tag == 'div' and 'q' in values.get('class', '').split():
            self.questions += 1
        for name, value in attrs:
            if name.startswith('on'):
                self.handlers.append(name)
            if name in {'src', 'href', 'action', 'data', 'poster'} and value and not value.startswith('#'):
                self.external.append(value)

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.suppressed = max(0, self.suppressed - 1)
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        if not self.suppressed:
            self.text.append(data)


def is_html(path: Path) -> bool:
    with path.open('rb') as handle:
        start = handle.read(2048).decode('utf-8-sig', errors='replace').lstrip().lower()
    return start.startswith(('<!doctype html', '<html'))


def inspect_html(path: Path) -> dict:
    text = path.read_text(encoding='utf-8-sig')
    if not is_html(path) or '</html>' not in text.lower() or '</body>' not in text.lower():
        raise ValueError('HTML must be a complete UTF-8 standalone document')
    parsed = HtmlEvidence()
    parsed.feed(text)
    if not parsed.tags['html'] or not parsed.tags['body'] or not parsed.title:
        raise ValueError('HTML requires a title and body')
    return {'title': ''.join(parsed.title).strip(), 'text': ' '.join(' '.join(parsed.text).split())[:48000],
            'scripts': parsed.tags['script'], 'forms': parsed.tags['form'], 'frames': parsed.tags['iframe'],
            'eventHandlers': sorted(set(parsed.handlers)), 'externalResources': list(dict.fromkeys(parsed.external))[:40],
            'questionCount': parsed.questions, 'requiresHtmlReview': True}
