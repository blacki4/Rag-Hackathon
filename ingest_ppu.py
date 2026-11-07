"""One command: PDF -> clean -> chunk -> embed -> ChromaDB -> reports.

    python ingest_ppu.py                          # all PDFs in data/raw
    python ingest_ppu.py --input data/raw/PPU_ITCE_Full_Guide.pdf
    python ingest_ppu.py --dry-run                # parse + chunk + reports, no embeddings/DB
    python ingest_ppu.py --reset                  # rebuild the Chroma collection
    python ingest_ppu.py --ask "شو متطلب تعلم الآلة؟"   # quick retrieval check
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from src.chunking import build_chunks, build_text_chunks  # noqa: E402

PROC, REP = ROOT / "data" / "processed", ROOT / "data" / "reports"


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="data/raw")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--ask")
    a = ap.parse_args()

    if a.ask:
        from src.embedding import HybridSearch
        for h in HybridSearch().search(a.ask, k=5):
            print(f"[{h['chunk_type']}] p{h['page_start']} rrf={h['rrf']} dist={round(h['distance'], 3) if h.get('distance') is not None else '-'} | {h['table_title'] or h['section_title']}")
            print("   ", h["text"][:160].replace("\n", " / "))
        return

    inp = ROOT / a.input
    files = sorted([*inp.rglob("*.pdf"), *inp.rglob("*.md")]) if inp.is_dir() else [inp]
    all_chunks, all_courses, report = [], [], {"documents": []}
    warnings = []
    for f in files:
        h = hashlib.sha256(f.read_bytes()).hexdigest()
        print(f"parsing {f.name} ...")
        chunks, courses, warns, stats = build_text_chunks(f) if f.suffix == ".md" else build_chunks(f)
        for c in chunks:
            c["metadata"]["document_id"] = h[:16]
        all_chunks += chunks
        all_courses += courses
        warnings += [{"file": f.name, **w} for w in warns]
        missing_pages = [p for p in range(1, stats["pages"] + 1) if p not in stats["pages_with_chunks"]]
        report["documents"].append({"file": f.name, "sha256": h, **stats, "pages_without_chunks": missing_pages,
                                    "warnings": len(warns)})
        print(f"  pages={stats['pages']} tables={stats['tables']} rows={stats['table_rows']} "
              f"courses={stats['courses']} chunks={stats['chunks']} {stats['chunks_by_type']}")
        if missing_pages:
            print(f"  ! pages with no chunk: {missing_pages}")

    PROC.mkdir(parents=True, exist_ok=True)
    with open(PROC / "chunks.jsonl", "w", encoding="utf-8") as fh:
        for c in all_chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")
    write_json(PROC / "structured_courses.json", all_courses)
    write_json(REP / "validation_errors.json", warnings)
    print(f"warnings: {len(warnings)}  -> data/reports/validation_errors.json")

    if not a.dry_run:
        from src.embedding import store
        print("embedding + storing in ChromaDB ...")
        report["vector_store"] = store(all_chunks, reset=a.reset)
        ok = report["vector_store"]["stored"] == len(all_chunks)
        report["vector_store"]["count_matches_chunks"] = ok
        print(f"  {report['vector_store']}")
        if not ok:
            print("  ! stored count differs from chunk count")
    write_json(REP / "ingestion_report.json", report)
    print("done -> data/processed/chunks.jsonl, structured_courses.json, data/reports/ingestion_report.json")


if __name__ == "__main__":
    main()
