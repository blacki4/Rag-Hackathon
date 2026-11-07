"""Warm the backend answer cache with common student questions before a demo.
Each question is asked once through the running backend (POST /ask); afterwards the same question
is answered from the cache instantly with zero LLM tokens.
    python scripts/warm_cache.py            (backend must be running on :8000)
"""
import json
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
API = "http://localhost:8000/ask"
PAUSE = 20   # stay under the free-tier tokens-per-minute limit

QUESTIONS = [
    "كم ساعة تخصص علم الحاسوب؟",
    "كم ساعة بقدر أسجل إذا كنت محذر أكاديمياً؟",
    "شو بصير اذا غبت كتير؟",
    "لإمتى بقدر أسحب مادة؟",
    "شو الفرق بين W و WF؟",
    "إمتى بيجيني تحذير أكاديمي؟",
    "شو شروط التخرج؟",
    "شو شروط منحة التفوق؟",
    "كم ساعة مساق تعلم الآلة؟",
    "شو الحد الأعلى للساعات بالفصل الصيفي؟",
]


def ask(q):
    body = json.dumps({"question": q, "history": []}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


for i, q in enumerate(QUESTIONS):
    res = ask(q)
    tag = "cached" if res.get("cached") else f"{res['latencyMs']} ms"
    ok = "BUSY" if res.get("refusalKind") == "error" else ("refused" if res["refused"] else "ok")
    print(f"[{ok:7}] {tag:>8} | {q}")
    if not res.get("cached") and i < len(QUESTIONS) - 1:
        time.sleep(PAUSE)
