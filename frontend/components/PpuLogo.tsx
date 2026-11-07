'use client';
import { useEffect, useState } from 'react';

const SRC = '/ppu-logo.png';
let cached: boolean | null = null; // does the logo file exist? checked once per page load

/**
 * Put the official logo at  frontend/public/ppu-logo.png  and it shows here automatically.
 * Until then a neutral "PPU" badge is shown.
 */
export default function PpuLogo({ size = 40 }: { size?: number }) {
  const [ok, setOk] = useState<boolean>(cached ?? false);

  useEffect(() => {
    if (cached !== null) { setOk(cached); return; }
    const img = new Image();
    img.onload = () => { cached = true; setOk(true); };
    img.onerror = () => { cached = false; setOk(false); };
    img.src = SRC;
  }, []);

  if (ok) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={SRC} alt="جامعة بوليتكنك فلسطين" width={size} height={size} className="ppu-logo" />;
  }
  return (
    <span className="ppu-badge" style={{ width: size, height: size, fontSize: size * 0.3 }} aria-label="جامعة بوليتكنك فلسطين">
      PPU
    </span>
  );
}
