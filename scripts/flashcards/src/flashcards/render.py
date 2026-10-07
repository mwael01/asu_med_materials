from __future__ import annotations

import html
from pathlib import Path
import re
from dataclasses import dataclass

import nh3

FIELD_RE = re.compile(r"{{\s*([^{}]+?)\s*}}")
CLOZE_RE = re.compile(r"{{c(\d+)::(.*?)(?:::(.*?))?}}", re.IGNORECASE | re.DOTALL)
SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.IGNORECASE | re.DOTALL)
EVENT_RE = re.compile(r"\s+on[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)

ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3",
    "h4", "hr", "i", "img", "li", "ol", "p", "pre", "small", "span", "strong", "sub",
    "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
}


R2_PUBLIC_BASE_URL = "https://asumed.eduvour.com"


def rewrite_media_urls(html_content: str, base_url: str = R2_PUBLIC_BASE_URL) -> str:
    """Rewrite relative image and media src attributes to Cloudflare R2 public URL."""
    def replace_src(match: re.Match[str]) -> str:
        attr = match.group(1)
        src = match.group(2)
        if src.startswith("http://") or src.startswith("https://") or src.startswith("data:"):
            return f'{attr}"{src}"'
        filename = Path(src).name
        return f'{attr}"{base_url.rstrip("/")}/{filename}"'

    return re.sub(r'(\bsrc\s*=\s*)["\']([^"\']+)["\']', replace_src, html_content, flags=re.IGNORECASE)


@dataclass(frozen=True)
class RenderedCard:
    question_html: str
    answer_html: str
    kind: str
    quarantined: bool = False
    quarantine_reason: str | None = None


EMPTY_SECTION_RE = re.compile(
    r"<div\s+id=[\"'](?:images_section|extra_section|Etymology_section|Mnemonics_section)[\"'][^>]*>[\s\S]*?<div\s+id=[\"'](?:Images|extra|Etymology|Mnemonics)[\"'][^>]*>(.*?)</div>[\s\S]*?</div>",
    re.IGNORECASE
)
HINT_BTN_RE = re.compile(r"<div\s+[^>]*class=[\"']hint_btn[\"'][^>]*>[\s\S]*?</div>", re.IGNORECASE)
SNACKBAR_RE = re.compile(r"<div\s+[^>]*id=[\"']snackbar[\"'][^>]*>[\s\S]*?</div>", re.IGNORECASE)


SECTION_NAMES = ("Etymology", "Mnemonics", "Extra Section", "Images")


def clean_anki_boilerplate(html_str: str, question_html: str | None = None) -> str:
    """Strip empty Anki template boilerplate like empty Images/Etymology sections and dead buttons."""
    if not html_str:
        return ""

    # 1. Strip FrontSide / repeated question from start of answer
    if question_html:
        hr_match = re.search(r"\s*<hr[^>]*>\s*", html_str)
        if hr_match:
            before_hr = html_str[:hr_match.start()]
            after_hr = html_str[hr_match.end():]
            q_text = re.sub(r"<[^>]+>", " ", question_html).strip().lower()
            before_text = re.sub(r"<[^>]+>", " ", before_hr).strip().lower()
            if before_text and (before_text == q_text or before_text.startswith(q_text) or q_text.startswith(before_text)):
                html_str = after_hr

    # 2. Strip empty sections (with or without id attributes)
    for name in SECTION_NAMES:
        pat = rf"(?:<hr[^>]*>\s*)?(?:<div[^>]*>\s*)?<h[1-6][^>]*>\s*{name}\s*</h[1-6]>\s*(?:<div[^>]*>(.*?)</div>)?\s*(?:<hr[^>]*>)?\s*(?:</div>)?"
        def repl(m: re.Match[str]) -> str:
            content = m.group(1) or ""
            has_img = "<img" in content.lower()
            text = re.sub(r"<[^>]+>", "", content).strip()
            if has_img:
                return content  # Keep image without section title!
            elif text:
                return f"<div>{content}</div>"
            return ""
        html_str = re.sub(pat, repl, html_str, flags=re.IGNORECASE | re.DOTALL)

    html_str = HINT_BTN_RE.sub("", html_str)
    html_str = SNACKBAR_RE.sub("", html_str)
    html_str = re.sub(r"<(?:button|a|span|div)[^>]*>\s*Show hint\s*</(?:button|a|span|div)>", "", html_str, flags=re.IGNORECASE)
    html_str = re.sub(r"<div>\s*</div>", "", html_str)
    html_str = re.sub(r"(?:<br\s*/?>\s*){2,}", "<br>", html_str)
    html_str = re.sub(r"(?:\s*<hr[^>]*>\s*)+$", "", html_str.strip())
    html_str = re.sub(r"^(?:\s*<hr[^>]*>\s*)+", "", html_str.strip())
    html_str = re.sub(r"(?:\s*<br\s*/?>\s*)+$", "", html_str.strip())
    html_str = re.sub(r"^(?:\s*<br\s*/?>\s*)+", "", html_str.strip())
    return html_str.strip()


def safe_html(value: str) -> str:
    value = EVENT_RE.sub("", SCRIPT_RE.sub("", value))
    cleaned = nh3.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes={
            "a": {"href", "title", "target"},
            "img": {"src", "alt", "width", "height", "class", "loading"},
            "*": {"class", "dir", "style"},
        },
        url_schemes={"http", "https", "data"},
        strip_comments=True,
    )
    return clean_anki_boilerplate(rewrite_media_urls(cleaned))


def _fields_map(field_names: list[str], field_values: list[str]) -> dict[str, str]:
    return {name: (field_values[i] if i < len(field_values) else "") for i, name in enumerate(field_names)}


def _render_template(template: str, fields: dict[str, str], front: str = "", cloze_ord: int | None = None) -> str:
    def replacement(match: re.Match[str]) -> str:
        token = match.group(1).strip()
        if token == "FrontSide":
            return front
        if token.startswith("cloze:"):
            field = fields.get(token.split(":", 1)[1], "")
            return _render_cloze(field, cloze_ord)
        if token.startswith("#") or token.startswith("/") or token.startswith("^"):
            return ""
        if token.startswith("hint:"):
            return fields.get(token.split(":", 1)[1], "")
        return fields.get(token, "")

    return FIELD_RE.sub(replacement, template)


def _render_cloze(value: str, ordinal: int | None) -> str:
    def replace(match: re.Match[str]) -> str:
        number = int(match.group(1))
        text = match.group(2)
        hint = match.group(3)
        if ordinal == number:
            return f"<span class=\"cloze\">[{html.escape(hint) if hint else '…'}]</span>"
        return text

    return CLOZE_RE.sub(replace, value)


def render_card(model: dict, field_names: list[str], field_values: list[str], template_index: int, cloze_ord: int | None = None) -> RenderedCard:
    fields = _fields_map(field_names, field_values)
    template = model.get("tmpls", [])[template_index]
    question = _render_template(template.get("qfmt", ""), fields, cloze_ord=cloze_ord)
    answer = _render_template(template.get("afmt", ""), fields, front=question, cloze_ord=cloze_ord)
    is_cloze = "cloze:" in template.get("qfmt", "") or "{{c" in " ".join(field_values)
    kind = "cloze" if is_cloze else "basic"
    if "<img" in question.lower() or "<img" in answer.lower():
        kind = "image"
    if "occlusion" in str(model).lower():
        kind = "occlusion"
    clean_q = safe_html(question)
    clean_a = clean_anki_boilerplate(safe_html(answer), clean_q)
    return RenderedCard(clean_q, clean_a, kind)
