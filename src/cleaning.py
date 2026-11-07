"""Arabic text cleaning with 3 versions of every text unit.

raw     : exactly what the PDF parser returned (never modified)
display : readable text for the answer and citations (meaning untouched)
search  : normalized text for BM25 / exact matching (same function is applied to queries)

Negations and conditions (لا، ليس، لم، لن، إلا، باستثناء، بشرط، إذا ...) are never removed:
there is no stopword removal anywhere.
"""
import re
import unicodedata

TATWEEL = "ـ"
DIACRITICS = re.compile(r"[ً-ْٰۖ-ۭ]")
ZERO_WIDTH = re.compile(r"[​-‏‪-‮⁦-⁩﻿\x00]")
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
FOOTER = re.compile(r"^\s*PPU ITCE\s*\|.*$|^\s*\d+\s*•\s*\d{4}\s*.*PPU ITCE.*$", re.M)
URL = re.compile(r"https?://\S+")

# words that change the meaning of a rule; tests make sure they survive cleaning
PROTECTED = ["لا", "ليس", "لم", "لن", "إلا", "باستثناء", "بشرط", "في حال", "إذا", "عند", "دون", "يجب", "يجوز"]


# The PDF font writes the lam-alef ligature "لا" as "ال" (reversed). The definite article never stands alone,
# so these whole-token fixes are safe; they restore negations ("ال يجوز" -> "لا يجوز", "إال" -> "إلا").
LAM_ALEF_TOKENS = {"ال": "لا", "وال": "ولا", "فال": "فلا", "إال": "إلا", "أال": "ألا", "بال": "بلا"}
# Frequent words in university regulations where the ligature sits inside the word.
LAM_ALEF_WORDS = {
    "مالحظة": "ملاحظة", "مالحظات": "ملاحظات", "عالمة": "علامة", "العالمة": "العلامة", "عالمات": "علامات",
    "العالمات": "العلامات", "ثالثة": "ثلاثة", "ثالث": "ثلاث", "الئحة": "لائحة", "الالئحة": "اللائحة",
    "العالقات": "العلاقات", "عالقة": "علاقة", "إعالن": "إعلان", "اإلعالن": "الإعلان", "اإلعالنات": "الإعلانات",
    "الالحق": "اللاحق", "الالزمة": "اللازمة", "الزمة": "لازمة", "يمثالن": "يمثلان", "الامتزامن": "المتزامن",
    "الاساعات": "الساعات", "الالزم": "اللازم", "الطالبي": "الطلابي", "والطالبي": "والطلابي","إلتمام": "لإتمام", "إلجابة": "لإجابة",
    "لألبحاث": "للأبحاث", "الستكمال": "لاستكمال", "الجتياز": "لاجتياز", "العتماد": "لاعتماد", "لالعتماد": "للاعتماد",
}


def fix_lam_alef(t: str) -> str:
    def tok(m):
        w = m.group(0)
        return LAM_ALEF_TOKENS.get(w) or LAM_ALEF_WORDS.get(w) or w
    return re.sub(r"[؀-ۿ]+", tok, t)


def to_display(raw: str) -> str:
    """Safe, non-destructive cleanup."""
    t = ZERO_WIDTH.sub("", raw)
    t = unicodedata.normalize("NFKC", t)          # fixes presentation forms (e.g. lam-alef ligatures)
    t = t.replace(TATWEEL, "")
    # PDF lam-alef ligature comes out flipped: "األكاديمي" -> "الأكاديمي", "االصطناعي" -> "الاصطناعي"
    t = re.sub(r"ا([أإآا])ل", r"ال\1", t)
    t = re.sub(r"ىل(?=[\s.,،؛:)]|$)", "لى", t)      # lam + alef maksura ligature: "عىل" -> "على", "إىل" -> "إلى"
    t = fix_lam_alef(t)
    t = FOOTER.sub("", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    # join lines broken in the middle of a sentence (next line does not start a bullet / number / heading)
    t = re.sub(r"(?<![.:؛!?\n])\n(?![\n•\-\d])", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def to_search(display: str) -> str:
    """Lexical-matching form. Applied identically to documents and queries."""
    urls = URL.findall(display)
    t = URL.sub(" ", display).lower()
    t = DIACRITICS.sub("", t).replace(TATWEEL, "")
    t = t.translate(ARABIC_DIGITS)
    t = re.sub("[إأآٱ]", "ا", t)
    t = t.replace("ى", "ي")               # search-only: queries often write ي for ى
    # ة is kept (ة/ه merge hurts precision); the light stemmer below handles common suffixes
    t = re.sub(r"[^\w\s%.+\-/]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return (t + " " + " ".join(urls)).strip()


PREFIXES = ("وال", "بال", "كال", "فال", "لل", "ال")
SUFFIXES = ("ات", "ون", "ين", "ها", "ية", "ه", "ة")


def light_stem(word: str) -> str:
    """Very light Arabic stemming for BM25 tokens only (never for display/embedding)."""
    if not re.search(r"[؀-ۿ]", word) or len(word) <= 3:
        return word
    for p in PREFIXES:
        if word.startswith(p) and len(word) - len(p) >= 3:
            word = word[len(p):]
            break
    for s in SUFFIXES:
        if word.endswith(s) and len(word) - len(s) >= 3:
            word = word[: -len(s)]
            break
    return word


def tokenize(search_text: str) -> list[str]:
    return [light_stem(w) for w in search_text.split() if w]


# Controlled dialect/abbreviation aliases. Used ONLY to expand the lexical query, never to rewrite source text.
ALIASES = {
    r"غبت|بغيب|غياب|غايب|غيابات": "الغياب الحضور المواظبة الحرمان",
    r"اسحب|انسحب|سحب": "الانسحاب السحب",
    r"انزل ماد|نزلت ماد|اسجل|سجلت|تسجيل": "التسجيل العبء الدراسي",
    r"انذار|انذارات": "الإنذار الأكاديمي الإنذارات",
    r"اتخرج|تخرج|بقي لي|ضل لي": "التخرج متطلبات التخرج الساعات",
    r"اعيد الماده|اعيد|رسبت|راسب": "إعادة المساق الرسوب",
    r"متطلب سابق|prerequisite": "المتطلب السابق",
    r"متطلب مرافق|متزامن|corequisite": "المتطلب المتزامن",
    r"منحه|منح|scholarship": "المنح المنحة",
    r"تدريب|training": "التدريب الميداني",
    r"تبادل|exchange": "التبادل الطلابي",
    r"مشروع التخرج|graduation project": "مشروع التخرج",
    r"معدل|gpa": "المعدل التراكمي",
    r"\bos\b": "نظم التشغيل",
    r"\bdb\b|داتابيس": "قواعد البيانات",
    r"\bai\b": "الذكاء الاصطناعي",
}


def expand_query(q: str) -> str:
    s = to_search(q)
    extra = [to_search(v) for k, v in ALIASES.items() if re.search(k, s)]
    return (s + " " + " ".join(extra)).strip()


def looks_reversed(text: str) -> bool:
    """Detect visually-ordered (reversed) Arabic extraction: common words appear backwards."""
    probes = ["جامعة", "المساق", "الطالب", "الساعات", "التسجيل", "الخطة"]
    fwd = sum(text.count(w) for w in probes)
    rev = sum(text.count(w[::-1]) for w in probes)
    return rev > fwd


def quality_flags(display: str) -> list[str]:
    flags = []
    if not display.strip():
        flags.append("empty")
    if "�" in display:
        flags.append("replacement_char")
    if looks_reversed(display):
        flags.append("reversed_arabic")
    return flags
