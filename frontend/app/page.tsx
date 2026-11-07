'use client';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import PpuLogo from '@/components/PpuLogo';
import { CHAPTER_P, stageOf } from '@/lib/stages';
import { scrollState } from '@/lib/store';

const BookScene = dynamic(() => import('@/components/landing/BookScene'), { ssr: false });

const NAV = ['أهلاً', 'شو بتسأل', 'كيف بساعدك', 'بصراحة', 'يلا نبلّش'];
const TOPICS = [
  { ic: '📝', t: 'التسجيل والعبء', s: 'كم ساعة بقدر أسجّل؟' },
  { ic: '⏰', t: 'الحضور والغياب', s: 'شو بصير إذا غبت كتير؟' },
  { ic: '↩️', t: 'الانسحاب والإضافة', s: 'لإمتى بقدر أنسحب؟' },
  { ic: '📊', t: 'المعدل والإنذار', s: 'إمتى بيجيني إنذار؟' },
  { ic: '🗺️', t: 'الخطة والمتطلبات', s: 'شو متطلب المادة؟' },
  { ic: '🎓', t: 'التخرّج', s: 'شو بقي لي عشان أتخرّج؟' },
];
const QUICK = ['شو بقي لي عشان أتخرّج؟', 'لإمتى بقدر أنسحب من مادة؟', 'شو بصير إذا غبت أكثر من المسموح؟', 'معدلي 2.1، كم ساعة بقدر أسجّل؟'];

const fade = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: [0.2, 0.7, 0.2, 1] as const } },
  exit: { opacity: 0, y: -14, scale: 0.98, transition: { duration: 0.25 } },
};

function Chapter({ idx, go }: { idx: number; go: (q?: string) => void }) {
  switch (idx) {
    case 0:
      return (
        <>
          <div className="tag">🎒 مرشدك الأكاديمي · جامعة بوليتكنك فلسطين</div>
          <h1>عندك سؤال عن دراستك؟ <em>اسألني</em>، وبجاوبك من <span className="hl">أنظمة الجامعة</span>.</h1>
          <p>بدل ما تقلّب بدليل الطالب أو تستنى بالدور عند التسجيل، اكتب سؤالك زي ما بتحكي، وخذ الجواب بثواني.</p>
          <div className="chips">
            <span>📝 التسجيل</span><span>⏰ الغياب</span><span>↩️ الانسحاب</span><span>🎓 التخرّج</span>
          </div>
        </>
      );
    case 1:
      return (
        <>
          <div className="tag">📖 شو بتقدر تسألني؟</div>
          <h2>كل اللي بيهمك <em>بمكان واحد</em>.</h2>
          <div className="topics">
            {TOPICS.map((x) => (
              <div key={x.t} className="topic">
                <span className="ic">{x.ic}</span>
                <div><b>{x.t}</b><small>«{x.s}»</small></div>
              </div>
            ))}
          </div>
        </>
      );
    case 2:
      return (
        <>
          <div className="tag">💬 كيف بساعدك</div>
          <h2>اسأل بلهجتك، <em>وخذ الجواب</em> مع رقم الصفحة.</h2>
          <ol className="steps">
            <li><span><b>اكتب سؤالك</b> بالعامية أو بالفصحى، زي ما بتحكي مع صاحبك.</span></li>
            <li><span><b>بدوّرلك</b> بدليل الطالب ولوائح الدراسة وخطتك الدراسية.</span></li>
            <li><span><b>بعطيك جواب واضح</b> ومعه اسم الدليل ورقم الصفحة، عشان تتأكد بنفسك.</span></li>
          </ol>
        </>
      );
    case 3:
      return (
        <>
          <div className="tag">🤝 بحكيلك بصراحة</div>
          <h2>إذا ما لقيت الجواب، <em>ما بألّف</em>.</h2>
          <ul className="trust">
            <li><span>✓</span>كل جواب معه اسم الدليل ورقم الصفحة.</li>
            <li><span>✓</span>إذا القانون تغيّر، باخد <b>آخر نسخة</b> وبحكيلك إنه تغيّر.</li>
            <li><span>✓</span>إذا سؤالك مش موجود بالأنظمة، بحكيلك لوين تروح، مثلاً دائرة القبول والتسجيل.</li>
          </ul>
          <div className="aside-note">أنا مساعد بيوفّر عليك وقت، بس بالقرارات الكبيرة ارجع لمرشدك الأكاديمي.</div>
        </>
      );
    default:
      return (
        <>
          <div className="tag">🚀 يلا نبلّش</div>
          <h2>جاهز؟ <em>اسأل سؤالك الأول</em>.</h2>
          <p>اختار سؤال، أو افتح المرشد واكتب سؤالك.</p>
          <div className="chips">
            {QUICK.map((q) => <button key={q} onClick={() => go(q)}>{q}</button>)}
          </div>
          <button className="btn primary" onClick={() => go()}>افتح المرشد ←</button>
        </>
      );
  }
}

export default function Landing() {
  const router = useRouter();
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(false);
  const diving = useRef(false);

  const go = useCallback((q?: string) => {
    if (diving.current) return;
    diving.current = true;
    scrollState.dive = true;
    setFlash(true);
    setTimeout(() => router.push(q ? `/chat?q=${encodeURIComponent(q)}` : '/chat'), 700);
  }, [router]);

  useEffect(() => {
    router.prefetch('/chat');
    scrollState.p = 0;
    scrollState.dive = false;
    const t = setTimeout(() => setReady(true), 3500); // slow GPU / no WebGL: still let them in
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? scrollY / max : 0;
      scrollState.p = p;
      setProgress(p);
      setIdx(Math.round(stageOf(p)));
      if (p > 0.992) go();
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(t); removeEventListener('scroll', onScroll); };
  }, [go, router]);

  useEffect(() => {
    document.body.style.overflow = entered ? '' : 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [entered]);

  const jump = (i: number) =>
    scrollTo({ top: CHAPTER_P[i] * (document.documentElement.scrollHeight - innerHeight), behavior: 'smooth' });

  return (
    <main className="landing">
      <BookScene onReady={() => setTimeout(() => setReady(true), 300)} />
      <div className="scroll-space" />

      <AnimatePresence>
        {!entered && (
          <motion.div className="gate" exit={{ opacity: 0, transition: { duration: 0.7 } }}>
            <div className="gate-inner">
              <PpuLogo size={78} />
              <h1>المرشد الأكاديمي الذكي</h1>
              <p>{ready ? 'انزل بالماوس، والكتاب بيفتح معك 📖' : 'بنحضّرلك دليل الطالب…'}</p>
              <div className="bar"><i style={{ width: ready ? '100%' : '65%' }} /></div>
              <button className="btn primary" disabled={!ready} onClick={() => setEntered(true)}>يلا نبلّش</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`hud ${entered ? 'on' : ''}`}>
        <header className="top">
          <div className="brand">
            <PpuLogo size={42} />
            <div className="brand-text"><b>المرشد الأكاديمي</b><small>جامعة بوليتكنك فلسطين</small></div>
          </div>
          <Link className="btn ghost sm" href="/chat" onClick={(e) => { e.preventDefault(); go(); }}>افتح المرشد ←</Link>
        </header>

        <nav className="index">
          {NAV.map((n, i) => (
            <button key={n} className={i === idx ? 'on' : ''} onClick={() => jump(i)}>
              <span>{n}</span><i />
            </button>
          ))}
        </nav>

        <section className="chapters">
          <AnimatePresence mode="wait">
            <motion.div key={idx} className="ch" {...fade}>
              <Chapter idx={idx} go={go} />
            </motion.div>
          </AnimatePresence>
        </section>

        <div className="cue" style={{ opacity: progress > 0.88 ? 0 : 1 }}><i />انزل</div>
      </div>

      <div className={`flash ${flash ? 'on' : ''}`} />
    </main>
  );
}
