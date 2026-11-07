'use client';
import { AnimatePresence, motion } from 'framer-motion';
import type { AskResponse } from '@/lib/types';

const DOC_VAR = ['var(--doc0)', 'var(--doc1)', 'var(--doc2)'];

const REFUSAL_COPY = {
  not_found: { t: 'هالسؤال مش موجود بالأنظمة اللي عندي', p: 'ما بدي أعطيك جواب مش متأكد منه. الأفضل تسأل الجهة المختصة مباشرة.', go: 'دائرة القبول والتسجيل' },
  out_of_scope: { t: 'هاد برا اختصاصي', p: 'أنا بساعدك بس بالأمور الأكاديمية: التسجيل، الغياب، الانسحاب، المعدل، الخطة الدراسية، والتخرّج.', go: '' },
  error: { t: 'النظام عليه ضغط هلأ', p: 'ما قدرت أجاوب هالمرة. جرّب كمان شوي.', go: '' },
} as const;

export default function EvidencePanel({ response, active, demo }: { response?: AskResponse; active: number | null; demo: boolean }) {
  const ref = response?.refused ? REFUSAL_COPY[response.refusalKind ?? 'not_found'] : null;
  return (
    <aside className="evidence">
      <div className="ev-head">
        <h3>من وين جبت الجواب؟</h3>
        <small>افتح الدليل على نفس الصفحة وتأكد بنفسك</small>
      </div>

      {!response && (
        <div className="ev-empty">
          <span className="big">📚</span>
          <p>لما أجاوبك، رح تشوف هون اسم الدليل ورقم الصفحة والنص بالزبط زي ما هو مكتوب.</p>
        </div>
      )}

      {ref && (
        <div className="ev-refused">
          <b>{ref.t}</b>
          <p>{ref.p}</p>
          {ref.go && <span className="go">← {ref.go}</span>}
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {response?.sources.map((s, i) => (
          <motion.article
            key={`${response.latencyMs}-${s.n}`}
            className={`ev-card ${active === s.n ? 'active' : ''} ${s.version === 'old' ? 'old' : ''}`}
            style={{ ['--doc' as string]: DOC_VAR[s.doc] }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.08 * i } }}
            exit={{ opacity: 0 }}
            id={`src-${s.n}`}
          >
            <header>
              <span className="n">{s.n}</span>
              <div>
                <b>{s.title}</b>
                <small>صفحة {s.page}</small>
              </div>
              {s.version && <span className={`ver ${s.version}`}>{s.version === 'new' ? 'النسخة المعتمدة' : 'نسخة قديمة'}</span>}
            </header>
            {s.section && <div className="sec">{s.section}</div>}
            <p className="snip">{s.snippet}</p>
          </motion.article>
        ))}
      </AnimatePresence>

      {response && (
        <footer className="ev-foot">
          <span>⏱ جاوبتك بـ {(response.latencyMs / 1000).toFixed(1)} ثانية</span>
          {response.cached && <span>⚡ من الذاكرة: سؤال مكرر</span>}
          {demo && <span className="warn">نسخة تجريبية: الأمثلة للعرض بس</span>}
        </footer>
      )}
    </aside>
  );
}
