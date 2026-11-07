"""End-to-end answer evaluation with the Groq model (uses tokens: ~14 calls).

Correct  = the expected fact (checked by hand in the PDF) appears in the answer, and it cites a source [n].
Refusal  = questions whose answer is NOT in the documents must be refused.
    python eval/answer_eval.py   -> eval/answer_report.md
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding="utf-8")

from src import llm  # noqa: E402
from src.embedding import HybridSearch  # noqa: E402
from src.generate import REFUSAL, answer  # noqa: E402

ANSWER = [  # (question, facts that must appear — any of them)
    ("كم ساعة تخصص علم الحاسوب؟", ["128"]),
    ("كم ساعة تخصص الأمن السيبراني؟", ["132"]),
    ("شو رمز مساق نظم التشغيل؟", ["5705"]),
    ("كم ساعة مساق تعلم الآلة؟", ["3"]),
    ("شو الحد الأعلى للساعات بالفصل الصيفي؟", ["10"]),
    ("كم ساعة بقدر أسجل إذا كنت محذر أكاديمياً؟", ["15"]),
    ("شو علامة النجاح بالمساق؟", ["60"]),
    ("إمتى بيجيني تحذير أكاديمي؟", ["65"]),
    ("شو الفرق بين W و WF؟", ["WF"]),
    ("كم ساعة تدريب ميداني لطلاب تكنولوجيا المعلومات؟", ["240"]),
    ("كم ساعة ماجستير المعلوماتية؟", ["36"]),
    ("شو ايميل عمادة الكلية؟", ["dean-citce"]),
]
REFUSE = [
    "متى امتحان الخوارزميات النهائي هالفصل؟",
    "قديش سعر الساعة المعتمدة بتخصص الذكاء الاصطناعي هالسنة؟",
]
PAUSE = float(__import__("os").getenv("EVAL_PAUSE", "13"))   # free-tier per-minute limits


def refused(text):
    return REFUSAL[:20] in text or "ما لقيت" in text


def main():
    s = HybridSearch()
    rows, ok_n, cite_n, ref_n, times = [], 0, 0, 0, []
    for q, facts in ANSWER:
        t = time.time(); r = answer(q, s); dt = time.time() - t; times.append(dt)
        txt = r["answer"]
        ok = any(f in txt for f in facts) and not refused(txt)
        cited = "[" in txt and bool(r["sources"])
        ok_n += ok; cite_n += cited
        print(f"{'OK  ' if ok else 'FAIL'} cite={cited} {dt:.1f}s | {q}\n      {txt[:160].replace(chr(10), ' ')}")
        rows.append(f"| {q} | {'/'.join(facts)} | {'✅' if ok else '❌'} | {'✅' if cited else '❌'} | {txt[:120].replace(chr(10), ' ').replace('|', '/')} |")
        time.sleep(PAUSE)
    for q in REFUSE:
        r = answer(q, s); txt = r["answer"]
        ok = refused(txt) or r["refused"]
        ref_n += ok
        print(f"{'OK  ' if ok else 'FAIL'} refusal | {q}\n      {txt[:160].replace(chr(10), ' ')}")
        rows.append(f"| {q} | (رفض) | {'✅' if ok else '❌'} | - | {txt[:120].replace(chr(10), ' ')} |")
        time.sleep(PAUSE)
    n = len(ANSWER)
    summary = (f"Answer accuracy = {ok_n}/{n} ({ok_n / n:.0%}) · cited = {cite_n}/{n} · "
               f"correct refusals = {ref_n}/{len(REFUSE)} · avg {sum(times) / len(times):.1f}s · model {llm.MODEL}")
    print("\n" + summary)
    (ROOT / "eval" / f"answer_report_{llm.MODEL.replace('/', '_')}.md").write_text(
        f"# Answer evaluation (Groq, end to end)\n\n{summary}\n\n| السؤال | المتوقع | صح | مصدر | الجواب |\n|---|---|---|---|---|\n"
        + "\n".join(rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
