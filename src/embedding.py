"""Embeddings + ChromaDB storage + hybrid search (vectors + BM25 fused with RRF).

Model: intfloat/multilingual-e5-small (Arabic + English, 384 dims, ~470 MB, runs on CPU).
E5 needs the prefixes "passage: " for documents and "query: " for questions; vectors are normalized
so cosine distance is meaningful. One Chroma collection per model, so models never get mixed.
"""
import os
import re

from rank_bm25 import BM25Okapi

from src.cleaning import expand_query, to_search, tokenize

EMBED_MODEL = os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-small")
CHROMA_DIR = os.getenv("CHROMA_DIR", "chroma_db")
COLLECTION = "ppu_itce__" + re.sub(r"[^a-z0-9]+", "_", EMBED_MODEL.lower()).strip("_")[-40:]
BATCH = 32
DENSE_WEIGHT = float(os.getenv("DENSE_WEIGHT", "0.5"))   # RRF weight of the vector list (BM25 = 1.0)
_model = None


def model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(EMBED_MODEL, device="cpu")
    return _model


def embed_passages(texts):
    return model().encode(["passage: " + t for t in texts], batch_size=BATCH,
                          normalize_embeddings=True, show_progress_bar=True).tolist()


def embed_query(q):
    return model().encode(["query: " + q], normalize_embeddings=True)[0].tolist()


def collection():
    import chromadb
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_or_create_collection(COLLECTION, metadata={"hnsw:space": "cosine", "embed_model": EMBED_MODEL})


def store(chunks, reset=False):
    """Upsert by stable id: re-running never duplicates. reset=True rebuilds the collection."""
    import chromadb
    if reset:
        try:
            chromadb.PersistentClient(path=CHROMA_DIR).delete_collection(COLLECTION)
        except Exception:
            pass
    col = collection()
    vecs = embed_passages([c["embedding_text"] for c in chunks])
    dim = len(vecs[0])
    for i in range(0, len(chunks), 100):
        part = chunks[i:i + 100]
        col.upsert(
            ids=[c["id"] for c in part],
            embeddings=vecs[i:i + 100],
            documents=[c["display_text"] for c in part],
            metadatas=[{**c["metadata"], "search_text": c["search_text"]} for c in part],
        )
    # remove ids that are no longer produced (e.g. after a parser fix)
    keep = {c["id"] for c in chunks}
    stale = [i for i in col.get(include=[])["ids"] if i not in keep]
    if stale:
        col.delete(ids=stale)
    return {"collection": COLLECTION, "model": EMBED_MODEL, "dim": dim, "stored": col.count(), "removed_stale": len(stale)}


class HybridSearch:
    """Dense (Chroma) + BM25 over search_text, fused with Reciprocal Rank Fusion 1/(60+rank)."""

    def __init__(self):
        try:
            if os.getenv("SEARCH_MODE", "bm25").lower() != "hybrid":   # measured best: BM25 + rerank (README)
                raise RuntimeError("SEARCH_MODE=bm25")
            self.col = collection()
            data = self.col.get(include=["documents", "metadatas"])
            self.ids, self.docs, self.metas = data["ids"], data["documents"], data["metadatas"]
            self.dense = bool(self.ids)
        except Exception as e:           # chromadb / torch not available -> BM25 only, from chunks.jsonl
            print(f"[search] dense index unavailable ({type(e).__name__}); using BM25 only")
            self.dense = False
            self.ids = []
        if not self.ids:
            import json
            from pathlib import Path
            path = Path(__file__).resolve().parents[1] / "data" / "processed" / "chunks.jsonl"
            rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
            self.ids = [r["id"] for r in rows]
            self.docs = [r["display_text"] for r in rows]
            self.metas = [{**r["metadata"], "search_text": r["search_text"]} for r in rows]
        self.bm25 = BM25Okapi([tokenize(m["search_text"]) for m in self.metas]) if self.ids else None

    def rerank(self, q, fused, idx):
        """Second-stage, metadata-aware reranking of the fused top candidates:
        boost chunks whose program / plan year / course name are named in the question,
        and prefer explanatory sections for "how / what happens" questions."""
        from src.chunking import find_program, find_year
        qd = to_search(q)                 # same normalization as the index (أإآ→ا, ى→ي, no diacritics)
        program, year = find_program(q), find_year(q)
        asks_how = bool(re.search(r"كيف|شو بصير|ايش بصير|اذا|إذا|شروط|متى|لامتى|لإمتى", q))
        asks_list = bool(re.search(r"متطلبات|مساقات|المواد|اجباري|اختياري|اجبارية|اختيارية", qd)) and not re.search(r"\b\d{4,5}\b", qd)
        # a question that names a specific course ("تعلم الآلة") is about that course, not a request for a list
        for cid in list(fused)[:80]:
            mm, dd = self.metas[idx[cid]], self.docs[idx[cid]]
            cn = re.search(r"اسم المساق: (.+)", dd) if mm.get("chunk_type") == "course" else None
            if cn and len(cn.group(1).strip()) > 4 and to_search(cn.group(1).strip()) in qd:
                asks_list = False
                break
        if asks_list and program:         # metadata filter: bring every plan group of that program into the pool
            floor = min(fused.values()) if fused else 0.0
            for cid, i in idx.items():
                mm = self.metas[i]
                if mm.get("chunk_type") == "study_plan_group" and mm.get("program") == program:
                    fused.setdefault(cid, floor)
        top = sorted(fused.items(), key=lambda x: -x[1])[:80]
        out = {}
        for cid, s in top:
            m = self.metas[idx[cid]]
            bonus = 0.0
            if program and m.get("program") == program:
                bonus += 0.01
            elif program and m.get("program") and m.get("program") != program:
                bonus -= 0.015            # the student named a program: never answer from another one
            if m.get("chunk_type") == "study_plan_group":
                names = re.findall(r"^- \d{3,6} — (.+?) — ", self.docs[idx[cid]], re.M)
                if any(to_search(n) in qd for n in names if len(n) > 4):
                    bonus += 0.02
                elif asks_list and program:   # "شو المتطلبات الاجبارية لهندسة الحاسوب؟" -> whole group lists
                    bonus += 0.03
                    sec = to_search(m.get("section_title", ""))
                    bonus += 0.01 * sum(w in sec for w in set(re.findall(r"اجباري|اختياري|جامع|كلي|دائر|تخصص", qd)))
            if year and m.get("plan_year") == year:
                bonus += 0.01
            name = self.docs[idx[cid]]
            if name.count("؟") >= 4:          # a list of questions without answers (e.g. "student needs" section)
                bonus -= 0.01
            if m.get("chunk_type") == "course":
                cname = re.search(r"اسم المساق: (.+)", name)
                named = bool(cname and to_search(cname.group(1).strip()) in qd)
                coded = bool(m.get("course_code") and m["course_code"] in q)
                if named or coded:
                    bonus += 0.02
                else:                       # "كم ساعة <program>?" must not be answered by random course rows
                    bonus -= 0.012
                if asks_how and not coded:
                    bonus -= 0.005
            out[cid] = s + bonus
        return out

    def search(self, q, k=4, pool=50):
        if not self.ids:
            return []
        qs = to_search(q)
        d_ids, d_dist = [], []
        if self.dense:
            dense = self.col.query(query_embeddings=[embed_query(q)], n_results=min(pool, len(self.ids)))
            d_ids, d_dist = dense["ids"][0], dense["distances"][0]
        scores = self.bm25.get_scores(tokenize(expand_query(q)))
        b_rank = sorted(range(len(self.ids)), key=lambda i: -scores[i])[:pool]
        fused = {}
        for r, cid in enumerate(d_ids):            # dense is the helper signal: half weight (measured better, see README)
            fused[cid] = fused.get(cid, 0) + DENSE_WEIGHT / (60 + r + 1)
        for r, i in enumerate(b_rank):
            if scores[i] > 0:
                fused[self.ids[i]] = fused.get(self.ids[i], 0) + 1 / (60 + r + 1)
        # exact course-code match always wins (e.g. "5646")
        for code in re.findall(r"\b\d{4,5}\b", qs):
            for i, m in enumerate(self.metas):
                if m.get("course_code") == code:
                    fused[self.ids[i]] = fused.get(self.ids[i], 0) + 1
        dist = dict(zip(d_ids, d_dist))
        idx = {cid: i for i, cid in enumerate(self.ids)}
        fused = self.rerank(q, fused, idx)
        out = []
        for cid, s in sorted(fused.items(), key=lambda x: -x[1])[:k]:
            i = idx[cid]
            m = self.metas[i]
            hit = {"id": cid, "text": self.docs[i], "rrf": round(s, 4), "bm25": round(float(scores[i]), 3), **m,
                   # fields used by src/generate.py (citations + version handling)
                   "source": m["source_filename"], "page": m["page_start"],
                   "section": m["table_title"] or m["section_title"], "year": m["plan_year"] or None}
            if cid in dist:
                hit["distance"] = dist[cid]
            out.append(hit)
        return out
