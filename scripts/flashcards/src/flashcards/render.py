from __future__ import annotations

import html
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
    return rewrite_media_urls(cleaned)


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
    return RenderedCard(safe_html(question), safe_html(answer), kind)
