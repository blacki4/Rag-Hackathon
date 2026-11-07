"""Quick checks for cleaning + chunking.  Run:  python tests/test_pipeline.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding="utf-8")

from src.chunking import build_chunks  # noqa: E402
from src.cleaning import PROTECTED, to_display, to_search  # noqa: E402

PDF = ROOT / "data" / "raw" / "PPU_ITCE_Full_Guide.pdf"
results = []


def check(name, ok):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name)


# --- cleaning
rule = "لا يجوز للطالب الانسحاب إلا بشرط ألا يقل عبؤه عن 12 ساعة، إذا كان معدله 2.5% في حال وجود عذر دون استثناء"
d = to_display(rule)
check("negations/conditions preserved in display", all(w in d for w in PROTECTED if w in rule))
check("numbers preserved in display", all(n in d for n in ["12", "2.5%"]))
check("search text keeps numbers", "12" in to_search(rule) and "2.5" in to_search(rule))
check("lam-alef fix", to_display("الدليل األكاديمي واإلنذارات") == "الدليل الأكاديمي والإنذارات")
check("arabic-indic digits normalized for search only", "2025" in to_search("خطة ٢٠٢٥") and "٢٠٢٥" in to_display("خطة ٢٠٢٥"))
check("url preserved", "https://dar.ppu.edu/ar/bylaws" in to_search("راجع https://dar.ppu.edu/ar/bylaws"))

# --- chunking on the real PDF
c1, courses, warns, stats = build_chunks(PDF)
c2, *_ = build_chunks(PDF)
check("stable chunk ids across runs", [c["id"] for c in c1] == [c["id"] for c in c2])
check("no duplicate ids", len({c["id"] for c in c1}) == len(c1))
check("every chunk has a page", all(c["metadata"]["page_start"] >= 1 for c in c1))
check("all 23 pages parsed", stats["pages"] == 23)
ml = [c for c in c1 if c["metadata"].get("course_code") == "5646"]
check("5646 = تعلم الآلة in every record", ml and all("تعلم الآلة" in c["display_text"] for c in ml))
check("5705 = نظم التشغيل", any(c["metadata"].get("course_code") == "5705" and "نظم التشغيل" in c["display_text"] for c in c1))
check("plan years not mixed (2022 IT appendix stays 2022)",
      all(c["metadata"]["plan_year"] == 2022 for c in c1 if "IT 2022" in c["metadata"]["table_title"]))
check("course records are atomic (code+name+hours in one chunk)",
      all("رمز المساق" in c["display_text"] and "اسم المساق" in c["display_text"] for c in c1 if c["metadata"]["chunk_type"] == "course"))

# --- official regulation text (.md) -> one chunk per article, with article number + source URL
from src.chunking import build_text_chunks  # noqa: E402
MD = ROOT / "data" / "raw" / "ppu_bylaws_bachelor_ch9_transfer.md"
art, *_ = build_text_chunks(MD)
check("transfer regulations: 4 article chunks", len(art) == 4)
check("articles keep number + URL", all(c["metadata"]["article_number"] in {"16", "17", "18"} and
                                        "dar.ppu.edu" in c["metadata"]["source_url"] for c in art))
check("article 17 keeps 49% and 50% limits", any("49%" in c["display_text"] and "50%" in c["display_text"] for c in art))
check("article 18 keeps the negation (لا تحتسب)", any("لا تحتسب" in c["display_text"] for c in art))

# --- official Computer Engineering 2025 plan
PLAN = ROOT / "data" / "raw" / "ppu_plan_computer_engineering_2025.md"
pc, *_ = build_text_chunks(PLAN)
crs = [c for c in pc if c["metadata"]["chunk_type"] == "course"]
check("CE plan: 99 course records", len(crs) == 99)
check("CE plan: 5646 is in the specialization electives", any(c["metadata"]["course_code"] == "5646" and "الاختيارية" in c["display_text"] for c in crs))
check("CE plan: records carry program + year", all(c["metadata"]["program"] == "هندسة الحاسوب" and c["metadata"]["plan_year"] == 2025 for c in crs))

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
