'use client';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import EvidencePanel from '@/components/chat/EvidencePanel';
import RichText from '@/components/chat/RichText';
import PpuLogo from '@/components/PpuLogo';
import { ask, BUSY_TEXT, isDemo } from '@/lib/api';
import { SUGGESTIONS } from '@/lib/mock';
import { chatPulse } from '@/lib/store';
import type { AskResponse, Message } from '@/lib/types';

const ChatScene = dynamic(() => import('@/components/chat/ChatScene'), { ssr: false });
const KEY = 'ppu-advisor-chat-v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const REF_TAG = { not_found: 'مش موجود بالأنظمة', out_of_scope: 'برا اختصاصي', error: 'ضغط على النظام' } as const;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeSrc, setActiveSrc] = useState<number | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const booted = useRef(false);

  // restore the saved conversation, then send ?q= from the landing page
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let restored: Message[] = [];
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) restored = (JSON.parse(saved) as Message[]).filter((m) => !m.pending).map((m) => ({ ...m, fresh: false }));
    } catch { /* storage blocked: start empty */ }
    setMessages(restored);
    const last = [...restored].reverse().find((m) => m.response);
    if (last) setSelected(last.id);
    const q = new URLSearchParams(location.search).get('q');
    if (q) {
      history.replaceState(null, '', '/chat');
      send(q, restored);
    }
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(messages.filter((m) => !m.pending))); } catch { /* ignore */ }
    if (messages.length) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string, base?: Message[]) {
    const q = text.trim();
    if (!q || busy) return;
    const prior = base ?? messages;
    const turns = prior.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content }));
    const aid = uid();
    setMessages((m) => [...(base ?? m), { id: uid(), role: 'user', content: q }, { id: aid, role: 'assistant', content: '', pending: true }]);
    setInput('');
    setBusy(true);
    chatPulse.thinking = true;

    let res: AskResponse;
    try {
      res = await ask(q, turns);
    } catch {
      res = { answer: BUSY_TEXT, sources: [], refused: true, refusalKind: 'error', latencyMs: 0 };
    }
    chatPulse.thinking = false;
    chatPulse.refused = res.refused;
    chatPulse.at = performance.now() / 1000;
    chatPulse.seed += 1;
    setMessages((m) => m.map((x) => (x.id === aid ? { ...x, content: res.answer, response: res, pending: false, fresh: true } : x)));
    setSelected(aid);
    setActiveSrc(null);
    setBusy(false);
    inputRef.current?.focus();
  }

  function cite(msgId: string, n: number) {
    setSelected(msgId);
    setActiveSrc(n);
    setShowEvidence(true);
    setTimeout(() => document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function reset() {
    setMessages([]);
    setSelected(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  const selectedRes = messages.find((m) => m.id === selected)?.response;

  return (
    <main className="chat-page">
      <ChatScene />

      <motion.div className="chat-shell" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <header className="chat-head">
          <Link href="/" className="brand">
            <PpuLogo size={42} />
            <div className="brand-text"><b>المرشد الأكاديمي</b><small>جامعة بوليتكنك فلسطين</small></div>
          </Link>
          <div className="head-actions">
            {isDemo
              ? <span className="badge demo">نسخة تجريبية</span>
              : <span className="badge live"><i />جاهز</span>}
            <Link className="btn ghost sm" href="/admin">📊 اللوحة</Link>
            <button className="btn ghost sm only-mobile" onClick={() => setShowEvidence((v) => !v)}>📚 المصادر</button>
            <button className="btn ghost sm" onClick={reset} disabled={busy || !messages.length}>＋ محادثة جديدة</button>
          </div>
        </header>

        <div className="chat-body">
          <section className="conv">
            <div className="msgs" ref={listRef}>
              {!messages.length && (
                <div className="welcome">
                  <span className="wave">👋</span>
                  <h1>أهلين! أنا <em>مرشدك الأكاديمي</em>.</h1>
                  <p>اسألني عن أي إشي بالتسجيل والدراسة، وبجاوبك من دليل الطالب وأنظمة الجامعة مع رقم الصفحة.</p>
                  <div className="suggest">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.button
                        key={s.q}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.05 } }}
                        onClick={() => send(s.q)}
                      >
                        <span className="ic">{s.ic}</span>
                        <div><small>{s.type}</small><span>{s.q}</span></div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    className={`m ${m.role} ${m.response?.refused ? 'refused' : ''} ${selected === m.id ? 'sel' : ''}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => m.response && setSelected(m.id)}
                  >
                    {m.pending ? (
                      <div className="thinking"><i /><i /><i /><span>بدوّرلك بدليل الطالب…</span></div>
                    ) : m.role === 'user' ? (
                      m.content
                    ) : (
                      <>
                        {m.response?.refused && <div className="ref-tag">{REF_TAG[m.response.refusalKind ?? 'not_found']}</div>}
                        <RichText
                          text={m.content}
                          animate={m.fresh}
                          onCite={(n) => cite(m.id, n)}
                          onCiteHover={(n) => { if (selected === m.id) setActiveSrc(n); }}
                          onDone={() => setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, fresh: false } : x)))}
                        />
                        {m.response?.note && <div className="note">💡 {m.response.note}</div>}
                        {!!m.response?.sources.length && (
                          <div className="srcs">
                            {m.response.sources.map((s) => (
                              <button key={s.n} className={`src d${s.doc}`} onClick={(e) => { e.stopPropagation(); cite(m.id, s.n); }}>
                                <b>{s.n}</b>{s.title} · صفحة {s.page}{s.version === 'old' ? ' · قديمة' : ''}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                placeholder="اكتب سؤالك… مثلاً: شو بصير إذا غبت كتير؟"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              />
              <button type="submit" disabled={busy || !input.trim()} aria-label="إرسال">
                <svg viewBox="0 0 24 24" width="20" height="20"><path d="M20 12H5m6-7-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </form>
            <div className="disclaimer">بجاوب من أنظمة الجامعة بس. بالقرارات الكبيرة، تأكد مع مرشدك الأكاديمي.</div>
          </section>

          <div className={`ev-wrap ${showEvidence ? 'open' : ''}`}>
            <EvidencePanel response={selectedRes} active={activeSrc} demo={isDemo} />
          </div>
        </div>
      </motion.div>
    </main>
  );
}
