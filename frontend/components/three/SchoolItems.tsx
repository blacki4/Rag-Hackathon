'use client';
/** Low-poly school objects built from primitives (no external models, works offline). */
import { useMemo } from 'react';
import * as THREE from 'three';

export function Pencil({ color = '#ffc83d' }: { color?: string }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.075, 0.075, 1.1, 6]} />
        <meshStandardMaterial color={color} roughness={0.55} flatShading />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <coneGeometry args={[0.075, 0.2, 6]} />
        <meshStandardMaterial color="#f3d6a8" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.735, 0]}>
        <coneGeometry args={[0.026, 0.07, 6]} />
        <meshStandardMaterial color="#2b2f36" />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.078, 0.078, 0.1, 12]} />
        <meshStandardMaterial color="#c9d3df" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.7, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.12, 12]} />
        <meshStandardMaterial color="#ff8fa3" roughness={0.7} />
      </mesh>
    </group>
  );
}

export function MiniBook({ color = '#1e78e6' }: { color?: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.62, 0.84, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[-0.02, 0, 0]}>
        <boxGeometry args={[0.6, 0.79, 0.12]} />
        <meshStandardMaterial color="#fbfcff" roughness={0.9} />
      </mesh>
      <mesh position={[0.05, 0.22, 0.081]}>
        <planeGeometry args={[0.36, 0.05]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export function GradCap() {
  return (
    <group rotation={[0.35, 0, 0]}>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.95, 0.05, 0.95]} />
        <meshStandardMaterial color="#0b3d7a" roughness={0.5} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.32, 0.36, 0.3, 24]} />
        <meshStandardMaterial color="#0b3d7a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#ffc83d" />
      </mesh>
      <mesh position={[0.33, 0.02, 0.33]}>
        <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
        <meshStandardMaterial color="#ffc83d" />
      </mesh>
      <mesh position={[0.33, -0.18, 0.33]}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshStandardMaterial color="#ffc83d" />
      </mesh>
    </group>
  );
}

export function Ruler() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 80;
    const g = c.getContext('2d')!;
    g.fillStyle = '#bfe0ff'; g.fillRect(0, 0, 512, 80);
    g.fillStyle = '#0b3d7a';
    for (let i = 0; i <= 60; i++) {
      const x = 12 + i * 8;
      const h = i % 10 === 0 ? 30 : i % 5 === 0 ? 20 : 12;
      g.fillRect(x, 0, 2, h);
      if (i % 10 === 0) { g.font = '16px sans-serif'; g.fillText(String(i / 10), x - 4, 50); }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh>
      <boxGeometry args={[1.5, 0.24, 0.03]} />
      <meshStandardMaterial map={tex} transparent opacity={0.92} roughness={0.25} />
    </mesh>
  );
}

export function PaperPlane() {
  const geo = useMemo(() => {
    // nose at +x, two wings and a keel
    const v = new Float32Array([
      0.6, 0, 0, -0.4, 0, 0.42, -0.4, 0.02, 0,
      0.6, 0, 0, -0.4, 0.02, 0, -0.4, 0, -0.42,
      0.6, 0, 0, -0.4, 0.02, 0, -0.4, -0.16, 0,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} roughness={0.7} flatShading />
    </mesh>
  );
}

export function StickyNote({ color = '#fff1a8' }: { color?: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.012]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {[0.1, 0, -0.1].map((y) => (
        <mesh key={y} position={[0.02, y, 0.007]}>
          <planeGeometry args={[0.32, 0.025]} />
          <meshBasicMaterial color="#000" transparent opacity={0.12} />
        </mesh>
      ))}
    </group>
  );
}

export function Pen() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.055, 0.055, 1, 16]} />
        <meshStandardMaterial color="#1e78e6" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.56, 0]}>
        <coneGeometry args={[0.055, 0.14, 16]} />
        <meshStandardMaterial color="#dfe7f1" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0.06, -0.25, 0]}>
        <boxGeometry args={[0.02, 0.35, 0.03]} />
        <meshStandardMaterial color="#dfe7f1" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

export type ItemKind = 'pencil' | 'book' | 'cap' | 'ruler' | 'plane' | 'note' | 'pen';

export function SchoolItem({ kind, color }: { kind: ItemKind; color?: string }) {
  switch (kind) {
    case 'pencil': return <Pencil color={color} />;
    case 'book': return <MiniBook color={color} />;
    case 'cap': return <GradCap />;
    case 'ruler': return <Ruler />;
    case 'plane': return <PaperPlane />;
    case 'note': return <StickyNote color={color} />;
    case 'pen': return <Pen />;
  }
}

/** The set of objects floating around the guide book. */
export const ITEMS: { kind: ItemKind; color?: string; scale?: number }[] = [
  { kind: 'cap', scale: 1.15 },
  { kind: 'pencil', color: '#ffc83d' },
  { kind: 'book', color: '#1e78e6' },
  { kind: 'note', color: '#fff1a8' },
  { kind: 'plane' },
  { kind: 'book', color: '#0fa5a0' },
  { kind: 'ruler' },
  { kind: 'pencil', color: '#7cc4ff' },
  { kind: 'book', color: '#ff7a6b' },
  { kind: 'pen' },
  { kind: 'note', color: '#bfe3ff' },
  { kind: 'book', color: '#f29a1f' },
  { kind: 'plane' },
  { kind: 'pencil', color: '#2cc4a0' },
  { kind: 'book', color: '#0b3d7a' },
  { kind: 'note', color: '#ffd1cb' },
];
