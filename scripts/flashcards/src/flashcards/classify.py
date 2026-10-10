from __future__ import annotations

import re
from dataclasses import dataclass, field

SUBJECT_ALIASES: dict[str, str] = {
    "bio": "Biochemistry",
    "biochem": "Biochemistry",
    "biochemistry": "Biochemistry",
    "biochemistery": "Biochemistry",
    "physio": "Physiology",
    "phsyio": "Physiology",
    "physiology": "Physiology",
    "histo": "Histology",
    "histology": "Histology",
    "patho": "Pathology",
    "pathology": "Pathology",
    "para": "Parasitology",
    "parasitology": "Parasitology",
    "parastology": "Parasitology",
    "micro": "Microbiology",
    "microbiology": "Microbiology",
    "pharma": "Pharmacology",
    "pharmacology": "Pharmacology",
    "anatomy": "Anatomy",
    "anat": "Anatomy",
    "genetics": "Genetics",
    "genetic": "Genetics",
    "immuno": "Immunology",
    "immunology": "Immunology",
    "embryo": "Embryology",
    "embryology": "Embryology",
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
    semester: int
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
    full_text = f"{path} {filename}"

    # 1. Detect Academic Year
    year = 2  # default
    year_match = re.search(r"year\s*(\d)", full_text, re.IGNORECASE)
    if year_match:
        year = int(year_match.group(1))
        evidence.append(f"year-match:{year}")

    # 2. Detect Semester
    semester = 1
    sem_match = re.search(r"semester\s*(\d)", full_text, re.IGNORECASE)
    if sem_match:
        semester = int(sem_match.group(1))
        evidence.append(f"semester-match:{semester}")

    # 3. Detect Curriculum Module
    module_id: str | None = None
    if year == 1 and semester == 1:
        if "ict" in full_text.lower():
            module_id = "year1-ict"
        else:
            module_id = "year1-introduction"
        evidence.append(f"matched-module:{module_id}")
    elif year == 1 and semester == 2:
        if "locomotor" in full_text.lower():
            module_id = "year1-locomotor"
        elif "infection" in full_text.lower():
            module_id = "year1-infection"
        elif "pharma" in full_text.lower():
            module_id = "year1-general-pharmacology"
        elif "patho" in full_text.lower():
            module_id = "year1-general-pathology"
        if module_id:
            evidence.append(f"matched-module:{module_id}")
    elif "blood" in full_text.lower():
        module_id = "year2-blood"
        evidence.append("blood-module-evidence")

    # Match against known_modules from Firestore if available
    if not module_id and known_modules:
        for mod in known_modules:
            mid = mod.get("id", "")
            title = mod.get("title", "") or mod.get("titleEn", "")
            if mid and (mid.lower() in full_text.lower() or (title and title.lower() in full_text.lower())):
                module_id = mid
                evidence.append(f"matched-module:{mid}")
                break

    if not module_id:
        module_id = "year2-blood" if year == 2 else f"year{year}-general"

    # 4. Resolve Subject
    subject: str | None = None
    subject_index: int | None = None

    # Check parts of deck path for subject alias
    for index, part in enumerate(parts):
        clean_part = part.lower().strip()
        if clean_part in SUBJECT_ALIASES:
            subject = SUBJECT_ALIASES[clean_part]
            subject_index = index
            evidence.append(f"subject-alias:{part}->{subject}")
            break
        for alias, std_name in SUBJECT_ALIASES.items():
            if re.search(r"\b" + re.escape(alias) + r"\b", clean_part):
                subject = std_name
                subject_index = index
                evidence.append(f"subject-alias:{part}->{std_name}")
                break
        if subject:
            break

    # Check filename if not yet resolved
    if not subject and filename:
        for alias, std_name in SUBJECT_ALIASES.items():
            if re.search(r"\b" + re.escape(alias) + r"\b", filename.lower()):
                subject = std_name
                evidence.append(f"subject-filename:{filename}->{std_name}")
                break

    # Topic fallbacks in path text
    if not subject:
        tail_text = " ".join(parts).lower()
        for keyword, fallback_subj in TOPIC_SUBJECT_FALLBACKS.items():
            if keyword in tail_text:
                subject = fallback_subj
                evidence.append(f"topic-keyword:{keyword}->{fallback_subj}")
                break

    # Blood chapter mappings if blood module
    if not subject and module_id == "year2-blood":
        tail_key = "::".join(parts).lower()
        for chapter_key, chapter_subj in BLOOD_CHAPTER_SUBJECTS.items():
            if chapter_key in tail_key:
                subject = chapter_subj
                evidence.append(f"curriculum-chapter:{chapter_key}->{chapter_subj}")
                break

    # Fallback for single-subject modules
    if not subject:
        if module_id == "year1-general-pharmacology":
            subject = "Pharmacology"
        elif module_id == "year1-general-pathology":
            subject = "Pathology"

    # 5. Extract Unit and Chapter hierarchy and meaningful Title
    meaningful_parts: list[str] = []
    for p in parts:
        if re.match(r"^year\s*\d.*", p, re.IGNORECASE):
            continue
        if p.lower() in ("blood", "introduction", "locomotor", "infection", "pharmacology", "pathology", "ict"):
            continue
        meaningful_parts.append(p)

    if not meaningful_parts:
        meaningful_parts = parts[-1:] if parts else ["General"]

    unit = "General"
    chapter = "General"
    for p in meaningful_parts:
        m_unit = re.search(r"unit[_\s-]*(\d+)", p, re.IGNORECASE)
        if m_unit:
            unit = f"Unit {m_unit.group(1)}"
        m_ch = re.search(r"ch[_\s-]*(\d+)(.*)", p, re.IGNORECASE)
        if m_ch:
            ch_num = m_ch.group(1)
            extra = m_ch.group(2).replace("_", " ").strip()
            chapter = f"Chapter {ch_num}"
            if extra:
                chapter = f"{chapter} · {extra}"

    title = " · ".join(meaningful_parts).replace("_", " ")
    if subject and not any(subject.lower() in p.lower() for p in meaningful_parts):
        title = f"{subject} · {title}"

    unit_path = " · ".join(meaningful_parts[:2]) if len(meaningful_parts) >= 2 else (meaningful_parts[0] if meaningful_parts else "General")
    author = "ASU Anki Flashcards"

    if filename:
        evidence.append(f"filename:{filename}")

    return Classification(
        title=title,
        year=year,
        semester=semester,
        moduleId=module_id,
        subject=subject,
        unit=unit,
        chapter=chapter,
        author=author,
        unit_path=unit_path,
        evidence=evidence,
    )

