'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';

type Seg = { k: 'text' | 'bold' | 'cite' | 'br'; v: string };

/** "**bold**", "[n]" and "\n" -> segments; text is split into words so it can be revealed word by word. */
function parse(text: string): Seg[] {
  const out: Seg[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|\[\d+\]|\n)/)) {
    if (!part) continue;
    if (part === '\n') out.push({ k: 'br', v: '' });
    else if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ k: 'bold', v: part.slice(2, -2) });
    else if (/^\[\d+\]$/.test(part)) out.push({ k: 'cite', v: part.slice(1, -1) });
    else for (const w of part.split(/(\s+)/)) if (w) out.push({ k: 'text', v: w });
  }
  return out;
}

export default function RichText({
  text, animate, onCite, onCiteHover, onDone,
}: {
  text: string;
  animate?: boolean;
  onCite?: (n: number) => void;
  onCiteHover?: (n: number | null) => void;
  onDone?: () => void;
}) {
  const segs = useMemo(() => parse(text), [text]);
  const [shown, setShown] = useState(animate ? 0 : segs.length);

  useEffect(() => {
    if (!animate) { setShown(segs.length); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(Math.min(i, segs.length));
      if (i >= segs.length) { clearInterval(id); onDone?.(); }
    }, 28);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segs, animate]);

  return (
    <div className="rich">
      {segs.slice(0, shown).map((s, i) => (
        <Fragment key={i}>
          {s.k === 'text' && s.v}
          {s.k === 'bold' && <b>{s.v}</b>}
          {s.k === 'br' && <br />}
          {s.k === 'cite' && (
            <button
              type="button"
              className="cite"
              onClick={() => onCite?.(+s.v)}
              onMouseEnter={() => onCiteHover?.(+s.v)}
              onMouseLeave={() => onCiteHover?.(null)}
            >
              {s.v}
            </button>
          )}
        </Fragment>
      ))}
      {shown < segs.length && <span className="caret" />}
    </div>
  );
}
