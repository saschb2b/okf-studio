// The field behind the stage: the open bundle, as points.
//
// Not decoration. Every point is a concept, and a point ignites when a beat
// touches the concept it stands for. That keeps the stage's one rule intact —
// nothing on screen without a referent — and it is the reason the background is
// worth rendering at all: it makes the sweep look like a search *through this
// bundle* rather than a generic sci-fi loop.
//
// three.js is dynamically imported by the caller so a user who never turns
// Jarvis Mode on never downloads it.

import { useEffect, useRef } from "react";
import type * as Three from "three";

/** All the field reads. Narrower than `Concept` on purpose: the stage is handed
 *  whatever the panel already has, and asking for more than is used would make
 *  this harder to call than it needs to be. */
export interface JarvisFieldConcept {
  id: string;
  degree?: number;
}

interface JarvisFieldProps {
  concepts: readonly JarvisFieldConcept[];
  /** Concept ids the sequence has reached so far. Points for these ignite. */
  litIds: readonly string[];
  three: typeof Three;
}

/** Points past this stop reading as a field and start costing frames. */
const MAX_POINTS = 1600;

/** Deterministic 0..1 from a concept id, so the same bundle always lays out the
 *  same way. A random layout would make each turn look unrelated to the last. */
function hashUnit(text: string, salt: number): number {
  let hash = salt * 2654435761;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 2246822519);
    hash = (hash << 13) | (hash >>> 19);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export function JarvisField({ concepts, litIds, three }: JarvisFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The running scene, so beat updates repaint rather than rebuild.
  const sceneRef = useRef<{
    dispose: () => void;
    ignite: (ids: readonly string[]) => void;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const points = concepts.slice(0, MAX_POINTS);

    // WebGL is not guaranteed: a headless browser, a blocklisted driver, or a
    // machine with no GPU acceleration all throw here. The field is the
    // decoration and the panels are the feature, so a failure degrades to no
    // field rather than taking the stage down with it.
    let renderer: Three.WebGLRenderer;
    try {
      renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(
      52,
      host.clientWidth / Math.max(host.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.z = 15;

    // Concepts on a sphere shell, jittered by degree so hubs sit inward. The
    // layout is meaningless as analysis and is not presented as any; it exists
    // so the field has structure instead of being noise.
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    const sizes = new Float32Array(points.length);
    const indexById = new Map<string, number>();

    points.forEach((concept, index) => {
      indexById.set(concept.id, index);
      const theta = hashUnit(concept.id, 1) * Math.PI * 2;
      const phi = Math.acos(2 * hashUnit(concept.id, 2) - 1);
      const radius = 6.5 + hashUnit(concept.id, 3) * 3.5 - Math.min(concept.degree ?? 0, 8) * 0.22;
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[index * 3 + 2] = radius * Math.cos(phi);
      colors.set([0.22, 0.28, 0.38], index * 3);
      sizes[index] = 0.06;
    });

    const geometry = new three.BufferGeometry();
    geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new three.BufferAttribute(colors, 3));
    const cloud = new three.Points(
      geometry,
      new three.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        depthWrite: false,
        blending: three.AdditiveBlending,
      }),
    );
    scene.add(cloud);

    // Two slow rings on different axes. The single most legible "this is an
    // instrument" cue, and cheap.
    const rings: Three.LineLoop[] = [];
    for (const [radius, tilt] of [[9.4, 0.42], [11.2, -0.9]] as const) {
      const segments = 128;
      const ringPositions = new Float32Array(segments * 3);
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        ringPositions[index * 3] = Math.cos(angle) * radius;
        ringPositions[index * 3 + 1] = Math.sin(angle) * radius;
        ringPositions[index * 3 + 2] = 0;
      }
      const ringGeometry = new three.BufferGeometry();
      ringGeometry.setAttribute("position", new three.BufferAttribute(ringPositions, 3));
      const ring = new three.LineLoop(
        ringGeometry,
        new three.LineBasicMaterial({ color: 0x4c7dff, transparent: true, opacity: 0.16 }),
      );
      ring.rotation.x = tilt;
      rings.push(ring);
      scene.add(ring);
    }

    let frame = 0;
    let elapsed = 0;
    let previous = performance.now();
    const render = () => {
      const now = performance.now();
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      elapsed += delta;
      // Slow enough to read as drift rather than spin. A fast rotation is the
      // difference between an instrument and a screensaver.
      cloud.rotation.y += delta * 0.055;
      cloud.rotation.x = Math.sin(elapsed * 0.11) * 0.12;
      rings[0].rotation.z += delta * 0.12;
      rings[1].rotation.z -= delta * 0.08;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    const onResize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    sceneRef.current = {
      ignite: (ids) => {
        const attribute = geometry.getAttribute("color") as Three.BufferAttribute;
        for (const id of ids) {
          const index = indexById.get(id);
          if (index === undefined) continue;
          attribute.setXYZ(index, 0.45, 0.62, 1);
          sizes[index] = 0.3;
        }
        attribute.needsUpdate = true;
      },
      dispose: () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        geometry.dispose();
        cloud.material.dispose();
        for (const ring of rings) {
          ring.geometry.dispose();
          (ring.material as Three.Material).dispose();
        }
        renderer.dispose();
        renderer.domElement.remove();
      },
    };

    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [concepts, three]);

  useEffect(() => {
    sceneRef.current?.ignite(litIds);
  }, [litIds]);

  return <div ref={hostRef} className="jarvis-field" aria-hidden="true" />;
}
