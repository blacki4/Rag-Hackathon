'use client';
/**
 * Landing 3D: the student guide book, driven by scroll (scrollState.p -> stage 0..4).
 *  0  closed book, angled, school objects floating around it
 *  1  the cover opens: table of contents + "ask in your own words"
 *  2  a page turns: the answer + where it came from
 *  3  another page turns: "if I don't know, I tell you where to go" + newest version
 *  4  the book comes closer: ready to ask
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ITEMS, SchoolItem } from '@/components/three/SchoolItems';
import { clamp01, smooth, stageOf } from '@/lib/stages';
import { scrollState } from '@/lib/store';

const W = 2.1;    // page width
const H = 2.88;   // page height
const BT = 0.34;  // page block thickness
const CT = 0.05;  // cover thickness
const BRAND = '#1e78e6';
const DEEP = '#0b3d7a';
const FONT = '"Segoe UI", Tahoma, "IBM Plex Sans Arabic", sans-serif';

/* ---------- page textures (canvas, Arabic RTL) ---------- */
type G = CanvasRenderingContext2D;
const CW = 512, CH = 700;

function canvasTex(draw: (g: G) => void) {
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const g = c.getContext('2d')!;
  g.direction = 'rtl';
  g.textAlign = 'right';
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function paper(g: G) {
  g.fillStyle = '#fffdf8'; g.fillRect(0, 0, CW, CH);
  g.strokeStyle = 'rgba(30,120,230,.12)'; g.lineWidth = 2;
  for (let y = 150; y < CH - 30; y += 34) { g.beginPath(); g.moveTo(24, y); g.lineTo(CW - 24, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,122,107,.35)';
  g.beginPath(); g.moveTo(CW - 46, 0); g.lineTo(CW - 46, CH); g.stroke();
}
function heading(g: G, text: string, sub?: string) {
  g.fillStyle = DEEP; g.font = `800 40px ${FONT}`; g.fillText(text, CW - 62, 82);
  g.fillStyle = '#ffc83d'; g.fillRect(CW - 62 - Math.min(g.measureText(text).width, 380), 94, Math.min(g.measureText(text).width, 380), 7);
  if (sub) { g.fillStyle = '#3d5677'; g.font = `400 21px ${FONT}`; g.fillText(sub, CW - 62, 134); }
}
function roundRect(g: G, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
}
function bubble(g: G, y: number, text: string, mine: boolean) {
  g.font = `500 22px ${FONT}`;
  const w = Math.min(g.measureText(text).width + 40, 400);
  const x = mine ? CW - 62 - w : 60;
  roundRect(g, x, y, w, 52, 18, mine ? BRAND : '#eaf4ff');
  g.fillStyle = mine ? '#fff' : '#0f2747';
  g.fillText(text, x + w - 20, y + 34);
}

/** Draw public/ppu-logo.png in the white circle on the cover once it loads (keeps the "PPU" text if it's missing). */
function withLogo(t: THREE.CanvasTexture) {
  const img = new Image();
  img.onload = () => {
    const g = (t.image as HTMLCanvasElement).getContext('2d')!;
    g.beginPath(); g.arc(CW / 2, 175, 70, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    const s = 118, ratio = img.width / img.height;
    const w = ratio >= 1 ? s : s * ratio, h = ratio >= 1 ? s / ratio : s;
    g.drawImage(img, CW / 2 - w / 2, 175 - h / 2, w, h);
    t.needsUpdate = true;
  };
  img.src = '/ppu-logo.png';
  return t;
}

const PAGES = {
  coverFront: () => withLogo(canvasTex((g) => {
    const grd = g.createLinearGradient(0, 0, CW, CH);
    grd.addColorStop(0, '#2b8af0'); grd.addColorStop(1, DEEP);
    g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.strokeRect(26, 26, CW - 52, CH - 52);
    g.fillStyle = '#ffc83d'; g.fillRect(0, 470, CW, 12);
    g.beginPath(); g.arc(CW / 2, 175, 70, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.textAlign = 'center'; g.fillStyle = DEEP; g.font = `800 44px ${FONT}`; g.fillText('PPU', CW / 2, 191);
    g.fillStyle = '#fff'; g.font = `800 62px ${FONT}`; g.fillText('دليل الطالب', CW / 2, 335);
    g.font = `500 26px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('المرشد الأكاديمي الذكي', CW / 2, 390);
    g.font = `600 24px ${FONT}`; g.fillStyle = '#fff'; g.fillText('جامعة بوليتكنك فلسطين', CW / 2, 560);
    g.font = `400 18px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Palestine Polytechnic University', CW / 2, 596);
  })),
  coverInner: () => canvasTex((g) => {
    paper(g); heading(g, 'الفهرس', 'كل اللي بيهمك بمكان واحد');
    const rows: [string, string][] = [
      ['التسجيل والعبء الدراسي', '12'], ['الحضور والغياب', '18'], ['الانسحاب والإضافة', '23'],
      ['المعدل والإنذار الأكاديمي', '27'], ['الخطة الدراسية والمتطلبات', '4'], ['شروط التخرج', '30'],
    ];
    rows.forEach(([t, p], i) => {
      const y = 205 + i * 68;
      g.fillStyle = '#0f2747'; g.font = `500 24px ${FONT}`; g.fillText(t, CW - 62, y);
      const tw = g.measureText(t).width;
      g.fillStyle = 'rgba(15,39,71,.25)';
      for (let x = CW - 74 - tw; x > 110; x -= 12) g.fillRect(x, y - 6, 4, 4);
      roundRect(g, 52, y - 30, 50, 40, 12, '#eaf4ff');
      g.textAlign = 'center'; g.fillStyle = BRAND; g.font = `700 22px ${FONT}`; g.fillText(p, 77, y - 2); g.textAlign = 'right';
    });
  }),
  p1Front: () => canvasTex((g) => {
    paper(g); heading(g, 'اسأل بلهجتك', 'زي ما بتحكي مع صاحبك');
    bubble(g, 200, 'شو بقي لي عشان أتخرّج؟', true);
    bubble(g, 290, 'كم مادة بقدر أسجّل بأول فصل؟', true);
    bubble(g, 380, 'رسبت بمادة، شو بصير؟', true);
    bubble(g, 470, 'لإمتى بقدر أنسحب؟', true);
    g.fillStyle = '#7a8ea8'; g.font = `400 20px ${FONT}`; g.fillText('بالعامية أو بالفصحى، أنا بفهمك', CW - 62, 600);
  }),
  p1Back: () => canvasTex((g) => {
    paper(g); heading(g, 'الجواب', 'واضح، قصير، وبالخطوات');
    roundRect(g, 56, 180, CW - 118, 320, 22, '#ffffff', 'rgba(30,120,230,.25)');
    const lines = ['عشان تتخرّج لازم:', '١. تنجح بكل ساعات خطتك', '٢. معدلك ما يقل عن الحد المطلوب', '٣. تخلّص التدريب الميداني'];
    lines.forEach((l, i) => { g.fillStyle = i ? '#3d5677' : '#0f2747'; g.font = `${i ? 400 : 700} 23px ${FONT}`; g.fillText(l, CW - 86, 232 + i * 56); });
    roundRect(g, 220, 440, 196, 40, 20, '#eaf4ff');
    g.fillStyle = BRAND; g.font = `600 18px ${FONT}`; g.fillText('دليل الطالب · صفحة 30', 400, 467);
    g.fillStyle = '#7a8ea8'; g.font = `400 18px ${FONT}`; g.fillText('* مثال توضيحي', CW - 62, 560);
  }),
  p2Front: () => canvasTex((g) => {
    paper(g); heading(g, 'تأكّد بنفسك', 'كل جواب معه مصدره');
    roundRect(g, 56, 190, CW - 118, 250, 22, '#ffffff', 'rgba(15,165,160,.35)');
    g.beginPath(); g.arc(CW / 2, 268, 46, 0, Math.PI * 2); g.fillStyle = '#2cc4a0'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(CW / 2 - 20, 268); g.lineTo(CW / 2 - 4, 284); g.lineTo(CW / 2 + 22, 252); g.stroke();
    g.textAlign = 'center'; g.fillStyle = '#0f2747'; g.font = `700 25px ${FONT}`; g.fillText('اسم الدليل + رقم الصفحة', CW / 2, 360);
    g.fillStyle = '#3d5677'; g.font = `400 20px ${FONT}`; g.fillText('افتح الصفحة واقرأ القانون بعينك', CW / 2, 400);
  }),
  p2Back: () => canvasTex((g) => {
    paper(g); heading(g, 'ما لقيت الجواب؟', 'بحكيلك بصراحة، وبدلّك لوين تروح');
    const offices = ['دائرة القبول والتسجيل', 'مرشدك الأكاديمي', 'عمادة شؤون الطلبة'];
    offices.forEach((o, i) => {
      const y = 200 + i * 92;
      roundRect(g, 56, y, CW - 118, 70, 18, '#ffffff', 'rgba(30,120,230,.22)');
      g.fillStyle = '#0f2747'; g.font = `600 23px ${FONT}`; g.fillText(o, CW - 90, y + 44);
      g.fillStyle = BRAND; g.font = `700 26px ${FONT}`; g.fillText('←', 100, y + 45);
    });
    g.fillStyle = '#7a8ea8'; g.font = `400 19px ${FONT}`; g.fillText('ما بألّف جواب إذا مش موجود بالأنظمة', CW - 62, 520);
  }),
  blockTop: () => canvasTex((g) => {
    paper(g); heading(g, 'دايماً آخر نسخة', 'إذا القانون تغيّر، باخد الجديد');
    roundRect(g, 56, 190, CW - 118, 110, 20, '#fff6f4', 'rgba(255,122,107,.4)');
    g.fillStyle = '#c04a3a'; g.font = `700 24px ${FONT}`; g.fillText('دليل 2023 · نسخة قديمة', CW - 86, 236);
    g.fillStyle = '#7a8ea8'; g.font = `400 20px ${FONT}`; g.fillText('ما بعتمد عليها', CW - 86, 274);
    g.strokeStyle = 'rgba(192,74,58,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(130, 230); g.lineTo(CW - 86, 230); g.stroke();
    roundRect(g, 56, 326, CW - 118, 110, 20, '#f1fbf8', 'rgba(44,196,160,.5)');
    g.fillStyle = '#0b8a6b'; g.font = `700 24px ${FONT}`; g.fillText('دليل 2025 · النسخة المعتمدة ✓', CW - 86, 372);
    g.fillStyle = '#3d5677'; g.font = `400 20px ${FONT}`; g.fillText('وبحكيلك إنه القانون تغيّر', CW - 86, 410);
  }),
};

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.45, 'rgba(214,233,255,.7)');
  r.addColorStop(1, 'rgba(214,233,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- the book ---------- */
const CAM: [number, number, number][] = [[0, 0.2, 10], [0, 0.4, 9.4], [0, 0.4, 9.2], [0, 0.4, 9.2], [0, 0.2, 7.8]];
const SPREAD = [1, 1.18, 1.22, 1.25, 1.05];

function World() {
  const tex = useMemo(() => {
    const t = Object.fromEntries(Object.entries(PAGES).map(([k, f]) => [k, f()])) as unknown as Record<keyof typeof PAGES, THREE.Texture>;
    return { ...t, halo: haloTexture() };
  }, []);
  const coverMats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: BRAND, roughness: 0.55 });
    return [side, side, side, side,
      new THREE.MeshStandardMaterial({ map: tex.coverFront, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ map: tex.coverInner, roughness: 0.9 })];
  }, [tex]);
  const blockMats = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.95 });
    return [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: tex.blockTop, roughness: 0.95 }), edge];
  }, [tex]);

  const book = useRef<THREE.Group>(null);
  const cover = useRef<THREE.Group>(null);
  const p1 = useRef<THREE.Group>(null);
  const p2 = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const items = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const st = useRef({ cur: 0, dive: 0 });

  const orbit = useMemo(() => ITEMS.map((_, i) => ({
    a: (i / ITEMS.length) * Math.PI * 2 + (i % 2) * 0.2,
    rx: 4.4 + (i % 3) * 0.75,
    ry: 2.7 + (i % 2) * 0.6,
    z: -1.6 + (i % 4) * 0.75,
    speed: 0.035 + (i % 5) * 0.007,
    spin: new THREE.Vector3(0.2 + (i % 3) * 0.15, 0.3 + (i % 4) * 0.1, 0.1 + (i % 2) * 0.2),
    bob: i * 1.7,
  })), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => { mouse.current.tx = e.clientX / innerWidth - 0.5; mouse.current.ty = e.clientY / innerHeight - 0.5; };
    addEventListener('pointermove', onMove);
    return () => removeEventListener('pointermove', onMove);
  }, []);

  const v = useMemo(() => new THREE.Vector3(), []);
  const w = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const S = st.current;
    S.cur += (scrollState.p - S.cur) * 0.07;
    S.dive += ((scrollState.dive ? 1 : 0) - S.dive) * 0.05;
    const s = stageOf(S.cur);
    const i0 = Math.min(3, Math.floor(s)), i1 = i0 + 1, f = smooth(s - i0);
    const M = mouse.current;
    M.x += (M.tx - M.x) * 0.05; M.y += (M.ty - M.y) * 0.05;

    // camera: book on the left, chapter card on the right (wide screens)
    const cam = state.camera as THREE.PerspectiveCamera;
    v.fromArray(CAM[i0]); w.fromArray(CAM[i1]);
    cam.position.lerpVectors(v, w, f);
    cam.position.x += M.x * 0.9; cam.position.y -= M.y * 0.6;
    cam.position.z -= S.dive * 4;
    const wide = cam.aspect > 1.15;
    const off = wide ? Math.min(2.8, (cam.aspect - 1) * 2.6) * (1 - S.dive) : 0;
    cam.lookAt(off, wide ? 0 : -1.4, 0);

    // book: open the cover, then turn two pages
    const coverOpen = smooth(clamp01((s - 0.15) / 0.85));
    const flip1 = smooth(clamp01((s - 1.15) / 0.85));
    const flip2 = smooth(clamp01((s - 2.15) / 0.85));
    const B = book.current!;
    B.position.set(-(W / 2) * coverOpen, Math.sin(t * 0.8) * 0.06 + 0.1 * coverOpen, 0);
    B.rotation.set(-0.2 - 0.12 * coverOpen + M.y * 0.08, -0.55 * (1 - coverOpen) + M.x * 0.12, 0.06 * (1 - coverOpen));
    B.scale.setScalar(1 + 0.06 * clamp01(s - 3));

    const zCover = BT / 2 + CT / 2 + 0.006;
    cover.current!.position.z = zCover;
    cover.current!.rotation.y = Math.PI * coverOpen;
    const page = (g: THREE.Group, k: number, flip: number) => {
      const closed = BT / 2 + 0.003 * k;
      const open = BT / 2 + CT + 0.012 + 0.006 * (3 - k);
      g.position.z = closed + (open - closed) * flip + Math.sin(Math.PI * flip) * 0.35;
      g.rotation.y = Math.PI * flip;
      g.visible = coverOpen > 0.02;
    };
    page(p1.current!, 2, flip1);
    page(p2.current!, 1, flip2);

    halo.current!.scale.setScalar(7.5 + coverOpen * 3 + Math.sin(t) * 0.2);
    halo.current!.position.x = 0;

    // school objects orbiting the book
    const spread = SPREAD[i0] + (SPREAD[i1] - SPREAD[i0]) * f;
    items.current!.children.forEach((child, i) => {
      const o = orbit[i];
      const a = o.a + t * o.speed;
      child.position.set(Math.cos(a) * o.rx * spread, Math.sin(a) * o.ry * spread + Math.sin(t + o.bob) * 0.15, o.z + Math.sin(a * 2) * 0.4);
      child.rotation.set(t * o.spin.x * 0.5 + o.bob, t * o.spin.y * 0.5, t * o.spin.z * 0.3);
    });
  });

  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffffff', '#b9d7ff', 0.9]} />
      <directionalLight position={[4, 6, 9]} intensity={1.7} />
      <directionalLight position={[-6, -2, 4]} intensity={0.45} color="#cfe4ff" />

      <sprite ref={halo} position={[0, 0, -2.5]}>
        <spriteMaterial map={tex.halo} transparent depthWrite={false} />
      </sprite>

      <group ref={book}>
        {/* back cover + spine */}
        <mesh position={[0, 0, -(BT / 2 + CT / 2)]}>
          <boxGeometry args={[W + 0.06, H + 0.06, CT]} />
          <meshStandardMaterial color={DEEP} roughness={0.55} />
        </mesh>
        <mesh position={[W / 2 + 0.03, 0, 0]}>
          <boxGeometry args={[0.07, H + 0.06, BT + CT * 2]} />
          <meshStandardMaterial color={DEEP} roughness={0.5} />
        </mesh>
        {/* page block */}
        <mesh material={blockMats}>
          <boxGeometry args={[W - 0.04, H - 0.06, BT]} />
        </mesh>
        {/* pages that turn (pivot on the spine, right side: Arabic books open to the right) */}
        <group ref={p2} position={[W / 2, 0, 0]}>
          <mesh position={[-W / 2 + 0.02, 0, 0]}>
            <planeGeometry args={[W - 0.06, H - 0.1]} />
            <meshStandardMaterial map={tex.p2Front} roughness={0.95} />
          </mesh>
          <mesh position={[-W / 2 + 0.02, 0, -0.001]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[W - 0.06, H - 0.1]} />
            <meshStandardMaterial map={tex.p2Back} roughness={0.95} />
          </mesh>
        </group>
        <group ref={p1} position={[W / 2, 0, 0]}>
          <mesh position={[-W / 2 + 0.02, 0, 0]}>
            <planeGeometry args={[W - 0.06, H - 0.1]} />
            <meshStandardMaterial map={tex.p1Front} roughness={0.95} />
          </mesh>
          <mesh position={[-W / 2 + 0.02, 0, -0.001]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[W - 0.06, H - 0.1]} />
            <meshStandardMaterial map={tex.p1Back} roughness={0.95} />
          </mesh>
        </group>
        {/* front cover */}
        <group ref={cover} position={[W / 2 + 0.03, 0, 0]}>
          <mesh position={[-(W + 0.06) / 2, 0, 0]} material={coverMats}>
            <boxGeometry args={[W + 0.06, H + 0.06, CT]} />
          </mesh>
        </group>
      </group>

      <group ref={items}>
        {ITEMS.map((it, i) => (
          <group key={i} scale={it.scale ?? 1}>
            <SchoolItem kind={it.kind} color={it.color} />
          </group>
        ))}
      </group>
    </>
  );
}

export default function BookScene({ onReady }: { onReady?: () => void }) {
  return (
    <Canvas
      className="gl"
      flat
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.2, 10], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={() => onReady?.()}
    >
      <World />
    </Canvas>
  );
}
