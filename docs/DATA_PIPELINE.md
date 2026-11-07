# Data pipeline: PPU ITCE guide → ChromaDB

```
data/raw/PPU_ITCE_Full_Guide.pdf
   │  src/chunking.py  parse_pdf()      PyMuPDF: text blocks + tables, page numbers, font sizes
   │  src/cleaning.py  to_display()     NFKC, tatweel, lam-alef fix, footer removal, line joins
   │                   to_search()      diacritics, alef forms, ى→ي, Arabic digits → 0-9 (search only)
   │  src/chunking.py  build_chunks()   structure-aware chunks + validation warnings
   │  src/embedding.py store()          multilingual-e5-small → ChromaDB (upsert by stable id)
   ▼
chroma_db/  +  data/processed/*.json(l)  +  data/reports/*.json
```

## Run
```bash
python ingest_ppu.py                 # parse + chunk + embed + store + reports
python ingest_ppu.py --dry-run       # no embeddings / DB
python ingest_ppu.py --reset         # rebuild the collection
python ingest_ppu.py --ask "شو عدد ساعات تعلم الآلة؟"
python tests/test_pipeline.py
```

## Key decisions
| Problem found in the PDF | What we did |
|---|---|
| `find_tables().extract()` returned reversed Arabic (`تاعاسلا`) | read each cell with `get_text(clip=cell)` → correct text |
| Mixed Arabic + numbers out of order (`علم الحاسوب2025`) | rebuild every line from word boxes, right-to-left; Latin/number runs keep their order |
| lam-alef ligature flipped (`األكاديمي`) | `ا([أإآا])ل → ال\1` in the display text |
| Stray letters inside code cells (`5643ا`) | keep the single 3–6 digit code, log `code_cell_noise_removed` |
| Same course in several programs / plan years (5646 in CS 2025 and AI 2025) | one record per table row with `program` + `plan_year` from the table title or section heading; never merged |
| Plan year not written near a table | `plan_year = 0` (unknown), never guessed |
| Merged rows / non-numeric hours | kept as-is and listed in `data/reports/validation_errors.json` |

## Chunk types
- **course** (one per table row, atomic, no overlap): labelled text "البرنامج / سنة الخطة / المجموعة / رمز المساق / اسم المساق / عدد الساعات".
- **table** (whole table + its title): answers "شو مساقات التخصص الإجباري؟".
- **section** (text under a numbered heading; split on paragraph boundaries above 1200 chars).

Each chunk stores `display_text`, `embedding_text` (with a short "university — section" prefix) and `search_text`,
plus metadata: page_start/page_end, section_title, table_title, program, plan_year, course_code, document_id.

## Retrieval prepared for generation
`HybridSearch`: dense (Chroma, cosine) + BM25 on `search_text`, fused with RRF `1/(60+rank)`; an exact course-code
match in the question (e.g. "5646") always ranks first.
