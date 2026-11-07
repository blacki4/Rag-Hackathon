'use client';
/**
 * Light background for the chat: school objects drifting slowly.
 * While the assistant is thinking they spin faster; when an answer arrives they do a small hop.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ITEMS, SchoolItem } from '@/components/three/SchoolItems';
import { chatPulse } from '@/lib/store';

function Drift() {
  const group = useRef<THREE.Group>(null);
  const spinBoost = useRef(0);
  const layout = useMemo(() => ITEMS.slice(0, 12).map((_, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    return {
      base: new THREE.Vector3(-7.5 + col * 5 + (row % 2) * 2.2, 3.6 - row * 3.4, -3 - (i % 3) * 1.4),
      phase: i * 1.37,
      spin: 0.15 + (i % 4) * 0.06,
    };
  }), []);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    const age = performance.now() / 1000 - chatPulse.at;
    const hop = age >= 0 && age < 1.2 && !chatPulse.refused ? Math.sin((age / 1.2) * Math.PI) * 0.5 : 0;
    spinBoost.current += ((chatPulse.thinking ? 1 : 0) - spinBoost.current) * 0.05;
    group.current!.rotation.set(pointer.y * 0.04, pointer.x * 0.06, 0);
    group.current!.children.forEach((c, i) => {
      const L = layout[i];
      c.position.set(L.base.x + Math.sin(t * 0.3 + L.phase) * 0.5, L.base.y + Math.sin(t * 0.6 + L.phase) * 0.35 + hop, L.base.z);
      const sp = L.spin * (1 + spinBoost.current * 6);
      c.rotation.x += sp * 0.01;
      c.rotation.y += sp * 0.014;
    });
  });

  return (
    <group ref={group}>
      {ITEMS.slice(0, 12).map((it, i) => (
        <group key={i} scale={(it.scale ?? 1) * 1.1}>
          <SchoolItem kind={it.kind} color={it.color} />
        </group>
      ))}
    </group>
  );
}

export default function ChatScene() {
  return (
    <Canvas className="gl" flat dpr={[1, 1.5]} camera={{ position: [0, 0, 10], fov: 50 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#ffffff', '#b9d7ff', 0.9]} />
      <directionalLight position={[4, 6, 9]} intensity={1.5} />
      <Drift />
    </Canvas>
  );
}
