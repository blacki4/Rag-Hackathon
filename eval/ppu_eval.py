"""Retrieval evaluation on the PPU ITCE guide (no LLM, no tokens).

Each question has evidence checked by hand in the PDF: an exact course code, or the page + a phrase
of the section that answers it.  Metrics: Hit@1, Hit@4, MRR@4.
    python eval/ppu_eval.py            -> eval/ppu_report.md
"""
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding="utf-8")

from src.embedding import HybridSearch  # noqa: E402  (SEARCH_MODE=hybrid to evaluate with vectors)

Q = [  # (question, kind of question, evidence: ("code", "5646") or ("page", 11, "phrase"))
    ("كم ساعة مساق تعلم الآلة؟", "مساق بالاسم", ("code", "5646")),
    ("5705", "رمز مساق", ("code", "5705")),
    ("شو رمز مساق نظم التشغيل؟", "رمز من الاسم", ("code", "5705")),
    ("مساق معالجة اللغة الطبيعية كم ساعة؟", "جدول", ("code", "8448")),
    ("كم ساعة تخصص علم الحاسوب؟", "ساعات برنامج", ("page", (2, 4), "علم الحاسوب")),
    ("شو بصير اذا غبت كتير؟", "عامية", ("page", (11,), "الغياب")),
    ("لإمتى بقدر أسحب مادة؟", "عامية", ("page", (11,), "السحب")),
    ("كيف بيجيني إنذار أكاديمي؟", "عامية", ("page", (12,), "الإنذار")),
    ("شو مساقات التخصص الإجباري بالذكاء الاصطناعي؟", "جدول", ("page", (6,), "الذكاء الاصطناعي")),
    ("شو يعني متطلب سابق؟", "تعريف", ("page", (4,), "Prerequisite")),
    ("خطة تكنولوجيا المعلومات 2022 كم ساعة مجموعها؟", "سنة خطة", ("page", (15,), "2022")),
    ("وين ألاقي رابط تعليمات البكالوريوس؟", "مصدر/رابط", ("page", (15,), "bylaws")),
    # --- set B: written after inspecting the sections, before the retrieval changes of round 2
    ("شو الحد الأعلى للساعات بالفصل الصيفي؟", "قاعدة رقمية", ("page", (10, 11), "الصيفي")),
    ("كم ساعة بقدر أسجل إذا كنت محذر أكاديمياً؟", "عامية + قاعدة", ("page", (10, 11), "المحذر")),
    ("شو علامة النجاح بالمساق؟", "قاعدة رقمية", ("page", (12,), "60%")),
    ("شو الفرق بين W و WF؟", "مصطلح إنجليزي", ("page", (11,), "WF")),
    ("شو شروط منحة التفوق؟", "منح", ("page", (13,), "منحة التفوق")),
    ("كم ساعة تدريب ميداني لطلاب تكنولوجيا المعلومات؟", "تدريب", ("page", (21, 22), "240")),
    ("كم ساعة ماجستير المعلوماتية؟", "دراسات عليا", ("page", (3, 19, 20), "36")),
    ("شو معدل القبول بتخصص الذكاء الاصطناعي؟", "قبول", ("page", (2, 3), "80")),
    ("بقدر أعادل مساقات من جامعة تانية؟", "عامية + معادلة", ("page", (13,), "المعادلة")),
    ("شو شروط التخرج؟", "تخرج", ("page", (12, 13), "التدريب الميداني")),
    ("كم ساعة تخصص الأمن السيبراني؟", "ساعات برنامج", ("page", (2, 3), "132")),
    ("شو ايميل عمادة الكلية؟", "معلومة اتصال", ("page", (1, 2), "dean-citce")),
    # --- set C: official transfer regulations (dar.ppu.edu, articles 16-18)
    ("بدي أحوّل من تخصص لتخصص بنفس الكلية، شو الشروط؟", "تحويل داخلي", ("article", "16", "تغيير التخصص")),
    ("كيف بنتقل من كلية لكلية تانية بالجامعة؟", "تحويل داخلي", ("article", "16", "من كلية إلى كلية")),
    ("أنا طالب بجامعة تانية وبدي أحوّل لبوليتكنك، شو الشروط؟", "تحويل خارجي", ("article", "17", "من خارج")),
    ("قديش أكثر نسبة ساعات بتنحسبلي إذا حوّلت من جامعة تانية؟", "رقم + عامية", ("article", "17", "49%")),
    ("شو أقل علامة لازم تكون بالمادة عشان تنحسبلي بالمعادلة؟", "رقم + عامية", ("article", "18", "70%")),
    # --- set D: official Computer Engineering 2025 plan (dar.ppu.edu)
    ("شو المتطلبات الاجبارية لتخصص هندسة الحاسوب؟", "قائمة خطة", ("plan", "متطلبات التخصص الاجبارية", "5705")),
    ("هل مساق تعلم الآلة إجباري ولا اختياري بهندسة الحاسوب؟", "تصنيف مساق", ("plan", "متطلبات التخصص الاختيارية", "5646")),
    ("شو المساقات الاختيارية بهندسة الحاسوب؟", "قائمة خطة", ("plan", "متطلبات التخصص الاختيارية", "")),
]


def relevant(hit, ev):
    if ev[0] == "code":
        return hit.get("course_code") == ev[1]
    if ev[0] == "plan":
        return "computer_engineering" in hit["source_filename"] and ev[1] in hit.get("section_title", "") and ev[2] in hit["text"]
    if ev[0] == "article":
        return hit.get("article_number") == ev[1] and (ev[2] in hit["text"] or ev[2] in hit.get("section_title", ""))
    pages, phrase = ev[1], ev[2]
    return hit["page_start"] in pages and (phrase in hit["text"] or phrase in hit.get("section_title", "") or phrase in hit.get("table_title", ""))


def main():
    s = HybridSearch()
    mode = "hybrid (vectors + BM25 + RRF + rerank)" if s.dense else "BM25 + rerank (no vectors)"
    rows, h1, h4, mrr, t0 = [], 0, 0, 0.0, time.time()
    for q, kind, ev in Q:
        hits = s.search(q, k=4)
        rank = next((i + 1 for i, h in enumerate(hits) if relevant(h, ev)), None)
        h1 += rank == 1
        h4 += rank is not None
        mrr += 1 / rank if rank else 0
        top = hits[0] if hits else {}
        rows.append(f"| {q} | {kind} | {rank or '✗'} | p{top.get('page_start', '-')} {(top.get('table_title') or top.get('section_title') or '')[:40]} |")
        print(f"{'OK ' if rank else 'MISS'} rank={rank} | {q}")
    n = len(Q)
    ms = round((time.time() - t0) / n * 1000)
    summary = f"Hit@1 = {h1}/{n} ({h1 / n:.0%}) · Hit@4 = {h4}/{n} ({h4 / n:.0%}) · MRR@4 = {mrr / n:.2f} · {ms} ms/question"
    print(f"\n{mode}\n{summary}")
    out = ROOT / "eval" / f"ppu_report_{'hybrid' if s.dense else 'bm25'}.md"
    out.write_text(f"# Retrieval evaluation — {mode}\n\n{summary}\n\n| السؤال | النوع | ترتيب الدليل | أول نتيجة |\n|---|---|---|---|\n"
                   + "\n".join(rows) + "\n", encoding="utf-8")
    print(f"-> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
