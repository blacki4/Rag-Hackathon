"""PDF -> structured units -> chunks (structure-aware, not fixed-size).

Parsing (PyMuPDF):
  * tables with page.find_tables(); every row stays a whole record (code + name + hours together)
  * text blocks outside the tables; headings detected by font size
Chunk types:
  * course   : one chunk per table row  (atomic record: never split, no overlap)
  * table    : the whole table with its title (for "list all courses of X")
  * section  : text under a heading, kept whole if short, else split on paragraph boundaries
Every chunk keeps: stable id, page, section path, table title, program, plan year (only if written in the source).
"""
import hashlib
import re
from collections import Counter
from pathlib import Path

import fitz  # PyMuPDF

from src.cleaning import quality_flags, to_display, to_search

MAX_SECTION_CHARS = 1200      # a section longer than this is split on paragraph boundaries
MIN_CHUNK_CHARS = 40
YEAR = re.compile(r"(?<!\d)(20\d\d)(?!\d)")
CODE = re.compile(r"^\d{3,6}$")
NUM_HEADING = re.compile(r"^\s*(\d{1,2})\s*\.\s*(.+)$|^(.+?)\s*\.(\d{1,2})\s*$")
PROGRAM_HINTS = {
    "علم الحاسوب": "علم الحاسوب",
    "تكنولوجيا المعلومات": "تكنولوجيا المعلومات",
    "الذكاء الاصطناعي": "الذكاء الاصطناعي",
    "الأمن السيبراني": "الأمن السيبراني",
    "هندسة أنظمة الحاسوب": "هندسة أنظمة الحاسوب",
    "هندسة الحاسوب": "هندسة الحاسوب",
}


def sha(s: str, n: int = 16) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:n]


def find_program(text: str):
    for k, v in PROGRAM_HINTS.items():
        if k in text:
            return v
    return None


def find_year(text: str):
    m = YEAR.search(text or "")
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------- parsing
AR = re.compile(r"[؀-ۿ]")
MIRROR = str.maketrans("()[]{}", ")(][}{")


def rtl_lines(page, clip):
    """Rebuild lines from word boxes. Arabic lines: words right-to-left; runs of Latin/number
    tokens keep their left-to-right order. Fixes numbers jumping around in mixed lines."""
    groups = {}
    for w in page.get_text("words", clip=clip):
        groups.setdefault((w[5], w[6]), []).append(w)
    out = []
    for _, ws in sorted(groups.items()):
        if any(AR.search(w[4]) for w in ws):
            res, run = [], []
            for t in [w[4] for w in sorted(ws, key=lambda w: -w[0])]:
                if AR.search(t):
                    res += run[::-1] + [t.translate(MIRROR)]
                    run = []
                else:
                    run.append(t.translate(MIRROR))
            res += run[::-1]
            out.append(" ".join(res))
        else:
            out.append(" ".join(w[4] for w in sorted(ws, key=lambda w: w[0])))
    return out


def parse_pdf(path: Path):
    """Return ordered page items: headings, paragraphs and tables, with page numbers."""
    doc = fitz.open(path)
    sizes = Counter()
    for page in doc:
        for b in page.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                for s in line["spans"]:
                    if s["text"].strip():
                        sizes[round(s["size"])] += len(s["text"])
    body = sizes.most_common(1)[0][0] if sizes else 11

    items, stats = [], {"pages": doc.page_count, "tables": 0, "table_rows": 0, "chars_raw": 0, "flagged_pages": []}
    for pno, page in enumerate(doc, start=1):
        tables = page.find_tables().tables
        tboxes = [fitz.Rect(t.bbox) for t in tables]
        page_items = []
        for t, box in zip(tables, tboxes):
            # read every cell by its own box: t.extract() returns visually-reversed Arabic here
            rows = [[" ".join(rtl_lines(page, fitz.Rect(c))).strip() if c else "" for c in r.cells]
                    for r in t.rows]
            rows = [r for r in rows if any(r)]
            if not rows:
                continue
            stats["tables"] += 1
            stats["table_rows"] += max(0, len(rows) - 1)
            page_items.append({"kind": "table", "page": pno, "y": box.y0, "rows": rows})

        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            rect = fitz.Rect(b["bbox"])
            if any(rect.intersects(tb) for tb in tboxes):
                continue
            maxsize = max((s["size"] for line in b["lines"] for s in line["spans"] if s["text"].strip()), default=0)
            raw = "\n".join(rtl_lines(page, rect)).strip()
            if not raw:
                continue
            stats["chars_raw"] += len(raw)
            # body text ~10pt, sub-headings / table titles ~12pt, numbered sections ~17pt, title ~27pt
            kind = "para"
            if len(raw) < 160 and maxsize >= 15:
                kind = "section"
            elif len(raw) < 160 and maxsize >= 11.5:
                kind = "heading"
            page_items.append({"kind": kind, "page": pno, "y": rect.y0, "raw": raw, "size": maxsize})

        page_items.sort(key=lambda x: x["y"])
        page_text = " ".join(i.get("raw", "") for i in page_items)
        if quality_flags(page_text):
            stats["flagged_pages"].append({"page": pno, "flags": quality_flags(page_text)})
        items.extend(page_items)
    return items, stats


# ---------------------------------------------------------------- official text pages (.md) -> one chunk per article
def build_text_chunks(path: Path):
    """Markdown copied verbatim from an official page: front matter (title, source_url) + '## المادة (n)' blocks."""
    raw = path.read_text(encoding="utf-8")
    meta = dict(re.findall(r"^(\w+):\s*(.+)$", raw.split("---")[1], re.M)) if raw.startswith("---") else {}
    body = raw.split("---", 2)[2] if raw.startswith("---") else raw
    title = meta.get("title", path.stem)
    chunks = []
    for block in re.split(r"^## ", body, flags=re.M)[1:]:
        head, _, text = block.partition("\n")
        head = head.strip()
        ctx = {"source": path.name, "page": 1, "section": head, "program": find_program(title + " " + head),
               "plan_year": find_year(title + " " + head)}
        kind = "study_plan_group" if "خطة" in head else "regulation_article"
        # long lists (e.g. 41 electives) are split on line boundaries; every part repeats the group header
        lines = [l for l in text.strip().split("\n") if l.strip()]
        intro = [l for l in lines if not l.startswith("- ")]
        items = [l for l in lines if l.startswith("- ")]
        parts = [lines] if len("\n".join(lines)) <= MAX_SECTION_CHARS or not items else \
            [intro + items[i:i + 15] for i in range(0, len(items), 15)]
        if kind == "study_plan_group":            # one atomic record per course, like the PDF course rows
            group = head.split("—")[-1].strip()
            for it in items:
                m = re.match(r"^- (\d{3,6}) — (.+?) — (\d+) ساعات", it)
                if not m:
                    continue
                code, cname, hrs = m.groups()
                rec = "\n".join([f"البرنامج: {ctx['program']}" if ctx["program"] else "",
                                 f"سنة الخطة: {ctx['plan_year']}" if ctx["plan_year"] else "",
                                 f"المجموعة: {group}", f"رمز المساق: {code}", f"اسم المساق: {to_display(cname)}",
                                 f"عدد الساعات المعتمدة: {hrs}"]).strip()
                chunks.append(make_chunk("course", rec, ctx,
                                         extra={"course_code": code, "source_url": meta.get("source_url", "")},
                                         embed_prefix=f"{title} — {group}\n"))
        for part in parts:
            display = to_display(head + "\n" + "\n".join(part)).replace(" - ", "\n- ")
            chunks.append(make_chunk(kind, display, ctx,
                                     extra={"source_url": meta.get("source_url", ""),
                                            "article_number": (re.findall(r"\((\d+)\)", head) or [""])[0]},
                                     embed_prefix=f"جامعة بوليتكنك فلسطين — {title}\n"))
    stats = {"pages": 1, "tables": 0, "table_rows": 0, "chars_raw": len(raw), "flagged_pages": [], "chunks": len(chunks),
             "courses": len(re.findall(r"^- \d{3,6} — ", body, re.M)),
             "chunks_by_type": dict(Counter(c["metadata"]["chunk_type"] for c in chunks)), "pages_with_chunks": [1]}
    return chunks, [], [], stats


# ---------------------------------------------------------------- tables -> course records
HEADER_KEYS = {"code": ["الرمز", "رمز", "code"], "name": ["المساق", "اسم", "course"], "hours": ["الساعات", "ساعات", "credit"]}


def map_header(header):
    cols = {}
    for i, h in enumerate(header):
        hn = to_display(h)
        for key, words in HEADER_KEYS.items():
            if key not in cols and any(w in hn.lower() for w in words):
                cols[key] = i
    return cols


def table_records(rows, ctx, warnings):
    header, body = rows[0], rows[1:]
    cols = map_header(header)
    recs = []
    if not {"code", "name"} <= cols.keys():
        return recs, False
    for r in body:
        if len(r) != len(header):
            warnings.append({"type": "row_column_mismatch", "page": ctx["page"], "row": r})
            continue
        cell = r[cols["code"]]
        digits = re.findall(r"\d{3,6}", cell)
        code = digits[0] if len(digits) == 1 else re.sub(r"\s", "", cell)
        if len(digits) == 1 and cell.strip() != code:
            warnings.append({"type": "code_cell_noise_removed", "page": ctx["page"], "raw": cell, "code": code})
        name = to_display(r[cols["name"]])
        hours_raw = r[cols["hours"]].strip() if "hours" in cols else ""
        hours = int(hours_raw) if hours_raw.isdigit() else None
        if not CODE.match(code):
            warnings.append({"type": "bad_course_code", "page": ctx["page"], "value": code, "name": name})
        if hours_raw and hours is None:
            warnings.append({"type": "bad_credit_value", "page": ctx["page"], "code": code, "value": hours_raw})
        # keep every other column too (e.g. "المتطلب وفق الخطة") — never drop information
        extra = [(to_display(header[i]), to_display(v)) for i, v in enumerate(r)
                 if i not in cols.values() and to_display(v) and to_display(header[i])]
        recs.append({"course_code": code, "course_name_ar": name, "credit_hours": hours, "extra": extra, **ctx})
    return recs, True


# ---------------------------------------------------------------- chunk builder
def make_chunk(kind, display, ctx, extra=None, embed_prefix=""):
    display = display.strip()
    meta = {
        "chunk_type": kind,
        "source_filename": ctx["source"],
        "page_start": ctx["page"],
        "page_end": ctx.get("page_end", ctx["page"]),
        "section_title": ctx.get("section") or "",
        "table_title": ctx.get("table_title") or "",
        "program": ctx.get("program") or "",
        "plan_year": ctx.get("plan_year") or 0,          # 0 = not stated in the source
        **(extra or {}),
    }
    embed = (embed_prefix + display).strip()
    cid = sha(f"{ctx['source']}|{kind}|{ctx['page']}|{meta['section_title']}|{meta['table_title']}|{display}")
    return {"id": cid, "display_text": display, "embedding_text": embed, "search_text": to_search(embed), "metadata": meta}


def split_paragraphs(text, limit=MAX_SECTION_CHARS):
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for p in re.split(r"\n{1,}", text):
        if cur and len(cur) + len(p) > limit:
            parts.append(cur)
            cur = p
        else:
            cur = f"{cur}\n{p}".strip()
    if cur:
        parts.append(cur)
    return parts


def build_chunks(path: Path):
    items, stats = parse_pdf(path)
    src = path.name
    chunks, courses, warnings = [], [], []
    section, section_page, buf = "", 1, []
    last_title = ""                      # nearest heading/paragraph above a table = table title

    def flush():
        text = to_display("\n".join(buf))
        if len(text) >= MIN_CHUNK_CHARS:
            ctx = {"source": src, "page": section_page, "page_end": cur_page, "section": section,
                   "program": find_program(section), "plan_year": find_year(section)}
            prefix = f"جامعة بوليتكنك فلسطين — {section}\n" if section else "جامعة بوليتكنك فلسطين\n"
            for part in split_paragraphs(text):
                chunks.append(make_chunk("section", part, ctx, embed_prefix=prefix))
        buf.clear()

    cur_page = 1
    for it in items:
        cur_page = it["page"]
        if it["kind"] == "section":               # big numbered heading = new top-level section
            flush()
            section, section_page = to_display(it["raw"]).replace("\n", " "), it["page"]
            last_title = ""
        elif it["kind"] == "heading":             # sub-heading: stays inside the section, titles the next table
            title = to_display(it["raw"]).replace("\n", " ")
            last_title = title
            buf.append(title)
        elif it["kind"] == "para":
            buf.append(it["raw"])
            last_title = to_display(it["raw"]).split("\n")[-1][:160]
        else:  # table
            title = last_title
            program = find_program(title) or find_program(section)
            year = find_year(title) or find_year(section)
            ctx = {"source": src, "page": it["page"], "section": section, "table_title": title,
                   "program": program, "plan_year": year}
            recs, is_course_table = table_records(it["rows"], ctx, warnings)
            header = " | ".join(to_display(h) for h in it["rows"][0])
            lines = [" | ".join(to_display(c) for c in r) for r in it["rows"][1:]]
            label = " — ".join(x for x in [section, title] if x)
            chunks.append(make_chunk("table", f"{title}\n{header}\n" + "\n".join(lines), ctx,
                                     embed_prefix=f"{section}\n" if section else ""))
            if is_course_table:
                total = sum(r["credit_hours"] or 0 for r in recs)
                m = re.search(r"(\d+)\s*ساع", title) or re.search(r"ساع\S*?\s*(\d+)", title)
                if m and "يختار" not in title and int(m.group(1)) != total:
                    warnings.append({"type": "subtotal_mismatch", "page": it["page"], "table": title,
                                     "stated": int(m.group(1)), "sum_of_rows": total})
                for r in recs:
                    courses.append(r)
                    parts = [f"البرنامج: {program}" if program else "", f"سنة الخطة: {year}" if year else "",
                             f"المجموعة: {title}" if title else "", f"رمز المساق: {r['course_code']}",
                             f"اسم المساق: {r['course_name_ar']}",
                             f"عدد الساعات المعتمدة: {r['credit_hours']}" if r["credit_hours"] is not None else ""]
                    parts += [f"{h}: {v}" for h, v in r.get("extra", [])]
                    chunks.append(make_chunk("course", "\n".join(p for p in parts if p), ctx,
                                             extra={"course_code": r["course_code"]},
                                             embed_prefix=f"{label}\n" if label else ""))
            else:
                buf.append(header + "\n" + "\n".join(lines))   # non-course table: keep it in the section text too
                # ... and one labelled record per row ("header: value | ..."), never mixing rows
                heads = [to_display(h) for h in it["rows"][0]]
                for r in it["rows"][1:]:
                    cells = [f"{h}: {to_display(c)}" for h, c in zip(heads, r) if to_display(c)]
                    if cells:
                        row_text = (f"{title}\n" if title else "") + " | ".join(cells)
                        row_ctx = {**ctx, "program": find_program(" ".join(r)) or ctx.get("program"),
                                   "plan_year": find_year(" ".join(r)) or ctx.get("plan_year")}
                        chunks.append(make_chunk("table_row", row_text, row_ctx,
                                                 embed_prefix=f"{label}\n" if label else ""))
    flush()

    # de-duplicate identical chunks (same id)
    seen, unique = set(), []
    for c in chunks:
        if c["id"] in seen:
            warnings.append({"type": "duplicate_chunk", "page": c["metadata"]["page_start"]})
            continue
        seen.add(c["id"])
        unique.append(c)
    stats.update({"chunks": len(unique), "courses": len(courses),
                  "chunks_by_type": dict(Counter(c["metadata"]["chunk_type"] for c in unique)),
                  "pages_with_chunks": sorted({c["metadata"]["page_start"] for c in unique})})
    return unique, courses, warnings, stats
