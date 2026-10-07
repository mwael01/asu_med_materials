from __future__ import annotations

import re
from dataclasses import dataclass, field

SUBJECT_ALIASES: dict[str, str] = {
    "bio": "Biochemistry",
    "biochem": "Biochemistry",
    "biochemistry": "Biochemistry",
    "physio": "Physiology",
    "phsyio": "Physiology",
    "physiology": "Physiology",
    "histo": "Histology",
    "histology": "Histology",
    "patho": "Pathology",
    "pathology": "Pathology",
    "para": "Parasitology",
    "parasitology": "Parasitology",
    "micro": "Microbiology",
    "microbiology": "Microbiology",
    "pharma": "Pharmacology",
    "pharmacology": "Pharmacology",
    "anatomy": "Anatomy",
    "anat": "Anatomy",
    "clinical": "Clinical Lectures",
}

TOPIC_SUBJECT_FALLBACKS: dict[str, str] = {
    "malaria": "Parasitology",
    "plasmodium": "Parasitology",
    "trypanosomiasis": "Parasitology",
    "mosquito": "Parasitology",
    "tularemia": "Microbiology",
    "brucella": "Microbiology",
    "lyme": "Microbiology",
    "relapsing": "Microbiology",
    "mycoses": "Microbiology",
    "glycosis": "Biochemistry",
    "hmp_pathway": "Biochemistry",
    "coagulation": "Physiology",
    "anticoagulant": "Physiology",
    "parvovirus": "Microbiology",
    "hemoglobin": "Pathology",
    "thalassemia": "Pathology",
    "agglutinogen": "Physiology",
    "platelet": "Physiology",
}

# Explicit ASU Blood module chapter-to-subject curriculum mappings
BLOOD_CHAPTER_SUBJECTS: dict[str, str] = {
    "unit_1": "Physiology",
    "unit_2::ch4": "Physiology",
    "unit_2::ch5": "Pathology",
    "unit_2::ch5_clinical": "Clinical Lectures",
    "unit_2::ch7": "Microbiology",
    "unit_3::ch1": "Physiology",
}



@dataclass(frozen=True)
class Classification:
    title: str
    year: int
    moduleId: str
    subject: str | None
    unit: str
    chapter: str
    author: str
    unit_path: str
    evidence: list[str] = field(default_factory=list)

    @property
    def is_resolved(self) -> bool:
        return self.subject is not None and bool(self.moduleId)


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "deck"


def classify_deck_path(
    path: str,
    known_modules: list[dict] | None = None,
    filename: str = "",
) -> Classification:
    parts = [part.strip() for part in path.split("::") if part.strip()]
    evidence: list[str] = [f"anki-deck:{path}"]

    # 1. Detect Academic Year
    year = 2  # default
    year_match = re.search(r"year\s*(\d)", f"{path} {filename}", re.IGNORECASE)
    if year_match:
        year = int(year_match.group(1))
        evidence.append(f"year-match:{year}")

    # 2. Detect Curriculum Module
    module_id = "year2-blood"  # default for Blood deck
    if known_modules:
        for mod in known_modules:
            mid = mod.get("id", "")
            title = mod.get("title", "")
            if mid and (mid.lower() in path.lower() or title.lower() in path.lower()):
                module_id = mid
                evidence.append(f"matched-module:{mid}")
                break

    # If Blood is in path or filename
    if "blood" in path.lower() or "blood" in filename.lower():
        module_id = "year2-blood"
        evidence.append("blood-module-evidence")

    # 3. Find subdeck elements after Module Name
    blood_index = next(
        (i for i, part in enumerate(parts) if part.lower() in ("blood", "foundation", "introduction")),
        len(parts) - 1,
    )
    tail = parts[blood_index + 1 :]

    subject: str | None = None
    subject_index: int | None = None

    # Check explicit alias in tail parts
    for index, part in enumerate(tail):
        clean_part = part.lower().replace(" ", "").replace("_", "")
        for alias, std_name in SUBJECT_ALIASES.items():
            if clean_part == alias or clean_part.endswith(alias) or clean_part.startswith(alias):
                subject = std_name
                subject_index = index
                evidence.append(f"subject-alias:{part}->{std_name}")
                break
        if subject:
            break

    # Fallback: check topic-level clues in tail
    if not subject:
        tail_text = " ".join(tail).lower()
        for keyword, fallback_subj in TOPIC_SUBJECT_FALLBACKS.items():
            if keyword in tail_text:
                subject = fallback_subj
                evidence.append(f"topic-keyword:{keyword}->{fallback_subj}")
                break

    # Fallback: check specific curriculum chapter mappings
    if not subject:
        tail_key = "::".join(tail).lower()
        for chapter_key, chapter_subj in BLOOD_CHAPTER_SUBJECTS.items():
            if chapter_key in tail_key:
                subject = chapter_subj
                evidence.append(f"curriculum-chapter:{chapter_key}->{chapter_subj}")
                break

    # 4. Extract Unit and Chapter hierarchy
    unit = "General"
    chapter = "General"
    topic = ""

    for p in tail:
        m_unit = re.search(r"unit[_\s-]*(\d+)", p, re.IGNORECASE)
        if m_unit:
            unit = f"Unit {m_unit.group(1)}"
        m_ch = re.search(r"ch[_\s-]*(\d+)(.*)", p, re.IGNORECASE)
        if m_ch:
            ch_num = m_ch.group(1)
            extra = m_ch.group(2).replace("_", " ").strip()
            chapter = f"Chapter {ch_num}"
            if extra and extra.lower() not in (
                "bio", "histo", "physio", "micro", "patho", "para", "pharma", "anatomy", "clinical"
            ):
                topic = extra

    # Check last parts for topics not matching subject
    if tail:
        last_part = tail[-1].replace("_", " ")
        if last_part.lower() not in (
            (subject.lower() if subject else ""),
            "bio", "histo", "physio", "micro", "patho", "para", "pharma", "anatomy", "clinical"
        ):
            if not topic and last_part != unit and not re.match(r"^ch\d+$", last_part, re.I):
                topic = last_part

    if topic:
        chapter = f"{chapter} · {topic.strip()}"

    unit_parts = tail[: subject_index if subject_index is not None else len(tail)]
    unit_path = " · ".join(unit_parts) or (tail[0] if tail else "Blood")

    # Author is the official ASU Anki Flashcards team
    author = "ASU Anki Flashcards"

    # Human-readable title
    title = f"{subject or 'Blood'} · {unit} · {chapter}" if subject else " · ".join(["Blood", *tail]).replace("_", " ")

    if filename:
        evidence.append(f"filename:{filename}")

    return Classification(
        title=title,
        year=year,
        moduleId=module_id,
        subject=subject,
        unit=unit,
        chapter=chapter,
        author=author,
        unit_path=unit_path,
        evidence=evidence,
    )

