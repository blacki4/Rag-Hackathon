"""Step 4 - Generation: decide whether to answer, build the prompt, call the LLM, attach the sources.

Try it:  python -m src.generate "شو آخر موعد للانسحاب من مادة؟"
"""
import re
import sys

from src.embedding import HybridSearch as Retriever
from src.llm import chat

K = 4                  # chunks given to the model
MAX_CHARS = 900        # per chunk in the prompt (sections are split at 1200; most chunks are shorter)
MAX_DIST = 0.55        # "I don't know" gate for the embedding distance (tune it in step 5)
REFUSAL = "ما لقيت هالمعلومة بمستندات الجامعة. الأفضل تسأل المرشد الأكاديمي أو عمادة القبول والتسجيل."

SYSTEM = f"""إنت "المرشد الأكاديمي" لطلاب جامعة بوليتكنك فلسطين (كلية تكنولوجيا المعلومات وهندسة الحاسوب).
القواعد:
1. جاوب من النصوص المرقّمة اللي تحت بس. ممنوع تستخدم معلوماتك العامة.
2. بعد كل معلومة حط رقم مصدرها بين قوسين مربعين، مثل [1] أو [2].
3. إذا الجواب مش موجود بالنصوص، رد بهالجملة بالزبط وبس: {REFUSAL}
4. إذا نصين بيحكوا عن نفس الموضوع بأرقام مختلفة، اعتمد النص المكتوب جنبه (الأحدث)، وقول إنه القاعدة تغيّرت عن النسخة القديمة.
5. افهم سؤال الطالب حتى لو بالعامية، وجاوب بعربي فصيح مبسّط وواضح، بجمل قصيرة. ابدأ بالجواب المباشر بأول جملة.
6. انقل الأرقام والتواريخ ورموز المواد زي ما هي بالنص بالزبط.
7. إذا النصوص من أكثر من برنامج أو سنة خطة، اذكر البرنامج وسنة الخطة وما تخلط بينهم.
8. إذا الجواب إجراءات، اكتبه خطوات مرقّمة (1. 2. 3.). وإذا بدك تقارن أو تعدّد مساقات، اكتب كل مساق بسطر: الرمز — الاسم — الساعات.
9. إذا الجواب بيحتاج معلومات من أكثر من نص، اجمعهم بجواب واحد وحط رقم مصدر كل معلومة.
10. لا تذكر أي رقم أو رمز مساق غير مكتوب حرفياً في النصوص.
11. إذا النصوص فيها جزء من الجواب بس، أعطِ الجزء الموجود مع مصدره، وقل بوضوح شو الناقص (مثلاً: «النص ما بيحدد إذا هالمساقات إجبارية أو اختيارية»)، وانصح بمراجعة الخطة الرسمية. استخدم جملة الرفض فقط إذا ما في ولا معلومة متعلقة بالسؤال.

مثال على الشكل المطلوب (المحتوى للتوضيح فقط):
سؤال: «إذا معدلي نازل، كم ساعة بقدر أسجل؟»
جواب: الطالب المحذَّر أكاديمياً سقفه 15 ساعة في الفصل [1].
ويمكن أن يصل إلى 18 ساعة إذا توقّف تخرجه عليها في الفصل الأخير [1]."""

NUM = re.compile(r"\d+(?:\.\d+)?")


def unsupported_numbers(text, hits):
    """Numbers in the answer that appear in none of the retrieved chunks (possible hallucination)."""
    body = re.sub(r"\[\d+\]", " ", text).translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    pool = " ".join(h.get("text", "") for h in hits).translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    have = set(NUM.findall(pool))
    return sorted({n for n in NUM.findall(body) if n not in have and len(n) > 1})


def mark_versions(hits):
    """Conflicting sources: the same section from two years. Keep both, but label which one is current."""
    newest, files = {}, {}
    for h in hits:
        key = h.get("section")
        if key and h.get("year"):
            newest[key] = max(newest.get(key, 0), h["year"])
            files.setdefault(key, set()).add(h["source"])
    for h in hits:
        key = h.get("section")
        if not (key and h.get("year")) or len(files[key]) < 2:   # a conflict needs the same section in 2 files
            continue
        if newest[key] != h["year"]:
            h["version"] = f"نسخة قديمة ({h['year']}) - تم استبدالها بنسخة {newest[key]}"
        else:
            h["version"] = f"النسخة الأحدث ({h['year']})"
    return hits


def build_prompt(question, hits):
    blocks = []
    for n, h in enumerate(hits, start=1):
        label = f"[{n}] المصدر: {h['source']}، صفحة {h['page']}"
        if h.get("section"):
            label += f" — القسم: {h['section']}"
        if h.get("program"):
            label += f" — البرنامج: {h['program']}"
        if h.get("plan_year"):
            label += f" — سنة الخطة: {h['plan_year']}"
        if h.get("version"):
            label += f" — {h['version']}"
        text = h["text"] if len(h["text"]) <= MAX_CHARS else h["text"][:MAX_CHARS] + " …"   # smaller prompt = faster
        blocks.append(f"{label}\n{text}")
    return "النصوص:\n\n" + "\n\n".join(blocks) + f"\n\nسؤال الطالب: {question}"


def should_refuse(hits):
    """Refuse before calling the model when nothing relevant was found (cheaper and safer)."""
    if not hits:
        return True
    dists = [h["distance"] for h in hits if "distance" in h]
    if dists:                                   # embeddings available: use the meaning distance
        return min(dists) > MAX_DIST
    return not any(h.get("bm25", 0) > 0 for h in hits)   # keyword-only mode: at least one shared word


def answer(question, retriever=None):
    retriever = retriever or Retriever()
    hits = mark_versions(retriever.search(question, k=K))
    if should_refuse(hits):
        return {"answer": REFUSAL, "sources": [], "hits": hits, "refused": True}
    text = chat(SYSTEM, build_prompt(question, hits), max_tokens=700)
    used = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text) if 1 <= int(n) <= len(hits)})
    sources = [{"n": n, "source": hits[n - 1]["source"], "page": hits[n - 1]["page"],
                "section": hits[n - 1].get("section")} for n in used]
    bad = unsupported_numbers(text, hits)
    return {"answer": text, "sources": sources, "hits": hits, "refused": REFUSAL in text, "unsupported_numbers": bad}


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or "شو آخر موعد للانسحاب من مادة؟"
    r = answer(q)
    print(r["answer"])
    for s in r["sources"]:
        print(f"  [{s['n']}] {s['source']} - page {s['page']} - {s['section'] or ''}")
