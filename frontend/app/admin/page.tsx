'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import PpuLogo from '@/components/PpuLogo';

const API = (process.env.NEXT_PUBLIC_RAG_API_URL || '').trim().replace(/\/$/, '');

type Stats = {
  total: number; cacheHits: number; refusedTotal: number; avgLatencyMs: number; dense: boolean;
  topQuestions: { q: string; count: number }[];
  refusedQuestions: { q: string; count: number }[];
  documents: { file: string; pages: number; tables: number; courses: number; chunks: number; warnings: number }[];
};

export default function Admin() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');

  const load = () => {
    if (!API) { setErr('الواجهة بالوضع التجريبي: حط NEXT_PUBLIC_RAG_API_URL بـ frontend/.env.local'); return; }
    fetch(`${API}/stats`).then((r) => r.json()).then(setS).catch(() => setErr('ما قدرت أوصل للـ backend على ' + API));
  };
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);

  const max = Math.max(1, ...(s?.topQuestions.map((x) => x.count) ?? [1]));

  return (
    <main className="admin">
      <header className="chat-head">
        <Link href="/" className="brand">
          <PpuLogo size={42} />
          <div className="brand-text"><b>لوحة الإدارة</b><small>المرشد الأكاديمي · جامعة بوليتكنك فلسطين</small></div>
        </Link>
        <div className="head-actions">
          <button className="btn ghost sm" onClick={load}>تحديث</button>
          <Link className="btn primary sm" href="/chat">الشات ←</Link>
        </div>
      </header>

      {err && <div className="adm-card warn">{err}</div>}
      {s && (
        <>
          <section className="kpis">
            <div className="adm-card kpi"><small>عدد الأسئلة</small><b>{s.total}</b></div>
            <div className="adm-card kpi"><small>من الذاكرة (بدون tokens)</small><b>{s.cacheHits}</b>
              <em>{s.total ? Math.round((s.cacheHits / s.total) * 100) : 0}%</em></div>
            <div className="adm-card kpi"><small>أسئلة مرفوضة</small><b>{s.refusedTotal}</b></div>
            <div className="adm-card kpi"><small>متوسط زمن الجواب</small><b>{(s.avgLatencyMs / 1000).toFixed(1)}<span> ث</span></b></div>
          </section>

          <section className="adm-grid">
            <div className="adm-card">
              <h3>الأسئلة الأكثر تكراراً</h3>
              {!s.topQuestions.length && <p className="muted">لسا ما في أسئلة.</p>}
              {s.topQuestions.map((x) => (
                <div key={x.q} className="bar-q">
                  <div className="bar-q-top"><span>{x.q}</span><b>{x.count}</b></div>
                  <div className="bar-q-track"><i style={{ width: `${(x.count / max) * 100}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="adm-card">
              <h3>أسئلة ما لقينالها جواب</h3>
              <p className="muted">هاي الفجوات بالمستندات: معلومات الطلاب بيدوّروا عليها ومش موجودة.</p>
              {!s.refusedQuestions.length && <p className="muted">ولا سؤال مرفوض.</p>}
              <ul className="ref-list">
                {s.refusedQuestions.map((x) => <li key={x.q}><span>{x.q}</span><b>{x.count}</b></li>)}
              </ul>
            </div>
          </section>

          <section className="adm-card">
            <h3>المستندات المفهرسة</h3>
            <table className="adm-table">
              <thead><tr><th>الملف</th><th>صفحات</th><th>جداول</th><th>مساقات</th><th>مقاطع</th><th>تحذيرات</th></tr></thead>
              <tbody>
                {s.documents.map((d) => (
                  <tr key={d.file}><td dir="ltr">{d.file}</td><td>{d.pages}</td><td>{d.tables}</td><td>{d.courses}</td><td>{d.chunks}</td><td>{d.warnings}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted">لإضافة مستند: حطه بـ <code>data/raw/</code> وشغّل <code>python ingest_ppu.py</code>. البحث: {s.dense ? 'هجين (vectors + BM25)' : 'BM25 + reranking'}.</p>
          </section>
        </>
      )}
    </main>
  );
}
