"""HTTP bridge between the Next.js frontend and the RAG pipeline.

Run from the Rag_Hac root:
    .venv\\Scripts\\python -m uvicorn backend.api:app --port 8000
frontend/.env.local -> NEXT_PUBLIC_RAG_API_URL=http://localhost:8000

Endpoints
    POST /ask    {question, history}  -> answer + sources   (answer cache + follow-up handling + logging)
    GET  /stats  most asked questions, refused questions, cache hits, latency, indexed documents
    GET  /health
"""
import json
import os
import re
import threading
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src import llm
from src.cleaning import to_search
from src.embedding import HybridSearch as Retriever
from src.generate import REFUSAL, answer

ROOT = Path(__file__).resolve().parents[1]
CACHE_FILE = ROOT / "data" / "cache" / "answers.json"
LOG_FILE = ROOT / "logs" / "questions.jsonl"
REPORT = ROOT / "data" / "reports" / "ingestion_report.json"

app = FastAPI(title="PPU Academic Advisor RAG")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])
retriever = Retriever()          # load the index once
lock = threading.Lock()

DOCS = {
    "PPU_ITCE": (0, "الدليل الأكاديمي لكلية ITCE"),
    "ppu_bylaws_bachelor": (1, "تعليمات البكالوريوس (dar.ppu.edu)"),
    "ppu_plan_computer_engineering": (2, "خطة هندسة الحاسوب 2025 (dar.ppu.edu)"),
    "student_guide": (0, "دليل الطالب"),
    "regulations": (1, "لوائح الدراسة والامتحانات"),
    "study_plan": (2, "الخطة الدراسية"),
}
OUT_OF_SCOPE = re.compile(r"قصيد|شعر|نكت|طقس|ماتش|دوري|اغني|طبخ|وصف[ةه] اكل")
FOLLOW_UP = re.compile(r"^(و|طيب|طب|ولو|بس|يعني)\s?|\b(هيك|ذلك|هاد|هاي|فيه|فيها|منه|منها)\b")


class Turn(BaseModel):
    role: str
    content: str


class AskBody(BaseModel):
    question: str
    history: list[Turn] = []


CHUNKS = ROOT / "data" / "processed" / "chunks.jsonl"


def index_version():
    """Changes whenever the documents are re-ingested -> old cached answers are ignored."""
    try:
        return str(int(CHUNKS.stat().st_mtime))
    except Exception:
        return "0"


def load_cache():
    try:
        data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        return data if data.get("_version") == index_version() else {"_version": index_version()}
    except Exception:
        return {"_version": index_version()}


CACHE = load_cache()


def save_cache():
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(CACHE, ensure_ascii=False), encoding="utf-8")


def log(entry):
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def doc_info(file: str):
    for key, (doc, title) in DOCS.items():
        if key in file:
            return doc, title
    return 0, file


def contextualize(q: str, history: list[Turn]) -> tuple[str, bool]:
    """Short follow-up ("وإذا معدلي أعلى؟") -> prepend the previous question so retrieval has the topic."""
    prev = [t.content for t in history if t.role == "user"]
    if prev and len(q) < 60 and FOLLOW_UP.search(q.strip()):
        return f"{prev[-1]} — {q}", True
    return q, False


@app.post("/ask")
def ask(body: AskBody):
    t0 = time.perf_counter()
    q = body.question.strip()
    full_q, follow = contextualize(q, body.history)
    key = to_search(full_q)

    with lock:
        if CACHE.get("_version") != index_version():     # documents changed since the cache was built
            CACHE.clear()
            CACHE["_version"] = index_version()
        hit = CACHE.get(key)
    if hit:                                   # same question again: no tokens, no LLM latency
        res = {**hit, "latencyMs": round((time.perf_counter() - t0) * 1000), "cached": True}
        log({"ts": datetime.now().isoformat(timespec="seconds"), "q": q, "key": key, "refused": res["refused"],
             "cached": True, "followUp": follow, "ms": res["latencyMs"]})
        return res

    if OUT_OF_SCOPE.search(key):
        res = {"answer": "عذراً، أنا مرشد أكاديمي وبجاوب بس عن أنظمة الجامعة وبرامج كلية ITCE ومساقاتها.",
               "sources": [], "refused": True, "refusalKind": "out_of_scope", "model": None}
    else:
        r = answer(full_q, retriever)
        hits = r.get("hits", [])
        sources = []
        for s in r["sources"]:
            h = hits[s["n"] - 1]
            doc, title = doc_info(s["source"])
            sources.append({
                "n": s["n"], "file": s["source"], "title": title, "page": s["page"], "section": s.get("section"),
                "snippet": h.get("text", "")[:500], "doc": doc, "year": h.get("year"),
                "version": None,
            })
        busy = r["answer"] == llm.BUSY
        res = {"answer": r["answer"], "sources": sources, "refused": r["refused"] or busy,
               "refusalKind": "error" if busy else ("not_found" if r["refused"] else None),
               "model": llm.last_model or llm.MODEL}
        notes = []
        if follow:
            notes.append("فهمت إنه سؤالك متابعة للسؤال اللي قبله.")
        if r.get("unsupported_numbers") and not res["refused"]:
            notes.append("تنبيه: الرقم " + "، ".join(r["unsupported_numbers"]) + " مش مكتوب حرفياً بالمصادر، تأكد منه.")
        if notes:
            res["note"] = " ".join(notes)
        if not busy and not res["refused"]:          # never cache refusals: new documents may answer them
            with lock:
                CACHE[key] = res
                save_cache()

    res = {**res, "latencyMs": round((time.perf_counter() - t0) * 1000), "cached": False}
    log({"ts": datetime.now().isoformat(timespec="seconds"), "q": q, "key": key, "refused": res["refused"],
         "refusalKind": res.get("refusalKind"), "cached": False, "followUp": follow, "ms": res["latencyMs"],
         "model": res.get("model")})
    return res


@app.get("/stats")
def stats():
    rows = []
    if LOG_FILE.exists():
        rows = [json.loads(l) for l in LOG_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]
    by_key = Counter(r["key"] for r in rows)
    first_text = {}
    for r in rows:
        first_text.setdefault(r["key"], r["q"])
    refused = Counter(r["key"] for r in rows if r.get("refused"))
    live = [r["ms"] for r in rows if not r.get("cached")]
    docs = []
    if REPORT.exists():
        rep = json.loads(REPORT.read_text(encoding="utf-8"))
        docs = [{k: d.get(k) for k in ["file", "pages", "tables", "courses", "chunks", "warnings"]} for d in rep.get("documents", [])]
    return {
        "total": len(rows),
        "cacheHits": sum(1 for r in rows if r.get("cached")),
        "refusedTotal": sum(1 for r in rows if r.get("refused")),
        "avgLatencyMs": round(sum(live) / len(live)) if live else 0,
        "topQuestions": [{"q": first_text[k], "count": c} for k, c in by_key.most_common(10)],
        "refusedQuestions": [{"q": first_text[k], "count": c} for k, c in refused.most_common(10)],
        "documents": docs,
        "dense": getattr(retriever, "dense", False),
    }


@app.get("/health")
def health():
    return {"ok": True, "refusal": REFUSAL, "dense": getattr(retriever, "dense", False)}
