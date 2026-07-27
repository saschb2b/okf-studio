// The field behind the stage: the bundle's concept graph as a lit sphere.
//
// The real graph, from the real links — nodes force-laid onto a spherical
// shell, every authored link drawn as a filament. A node ignites when a beat
// reaches the concept it stands for, and an edge lights only when both of its
// ends are lit, so the retrieval burns a visible path along authored links
// rather than dotting the field at random.
//
// Two earlier passes were wrong in instructive ways. The first hashed ids onto
// a sphere and drew no edges, which is a starfield wearing a graph's name. The
// second drew the real graph but let it float free and coloured nodes by type,
// which reads as scattered confetti rather than as one object.
//
// This one holds three properties the reference look depends on:
//   - a shell, so the graph is a *ball* with structure on its surface;
//   - a single hot hue, so it reads as one instrument rather than a legend; and
//   - real bloom, which is what makes filaments glow instead of merely being
//     thin bright lines.
//
// Type colour is deliberately dropped. It tied the field to the Graph View's
// palette, but a dozen hues at once is the difference between a diagram and a
// brain, and the brain is what this is for.

import { useEffect, useRef } from "react";
import type { JarvisThree } from "./jarvisThree.ts";
import { buildLayout, MAX_LAYOUT_NODES, SHELL_RADIUS } from "./jarvisLayout.ts";

/** All the field reads. Narrower than `Concept` on purpose. */
export interface JarvisFieldConcept {
  id: string;
  links?: readonly string[];
}

interface JarvisFieldProps {
  concepts: readonly JarvisFieldConcept[];
  /** Concept ids the sequence has reached. Their nodes, and the edges between
   *  them, ignite. */
  litIds: readonly string[];
  loaded: JarvisThree;
}

/** Layout ticks per frame. Enough that the sphere forms within the first
 *  seconds of a turn, few enough to hold the frame rate while it does. */
const TICKS_PER_FRAME = 2;

/** The resting hue: deep amber, well below full brightness so bloom has
 *  somewhere to climb to. */
const EMBER = [0.42, 0.16, 0.03] as const;
/** A node the turn touched. White-hot, which is what makes ignition read as
 *  heat rather than as a colour change. */
const IGNITED = [1, 0.72, 0.32] as const;
const EDGE_REST = [0.24, 0.09, 0.02] as const;
const EDGE_LIT = [1, 0.58, 0.18] as const;

export function JarvisField({ concepts, litIds, loaded }: JarvisFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    dispose: () => void;
    ignite: (ids: readonly string[]) => void;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { three, EffectComposer, RenderPass, UnrealBloomPass } = loaded;

    // WebGL is not guaranteed: a headless browser, a blocklisted driver, or a
    // machine with no acceleration all throw here. The field is decoration and
    // the panels are the feature, so this degrades to no field rather than
    // taking the stage down.
    let renderer: InstanceType<typeof three.WebGLRenderer>;
    try {
      renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    // Bloom renders the scene several times over, so the pixel ratio is capped
    // harder here than it would be for a plain pass.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(48, width / height, 0.1, 200);
    camera.position.z = 23;

    const used = concepts.slice(0, MAX_LAYOUT_NODES);
    const layout = buildLayout(used);
    const nodeCount = layout.nodes.length;

    const nodePositions = new Float32Array(nodeCount * 3);
    const nodeColors = new Float32Array(nodeCount * 3);
    for (let index = 0; index < nodeCount; index += 1) {
      nodeColors.set(EMBER, index * 3);
    }

    const nodeGeometry = new three.BufferGeometry();
    nodeGeometry.setAttribute("position", new three.BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute("color", new three.BufferAttribute(nodeColors, 3));
    const nodes = new three.Points(
      nodeGeometry,
      new three.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        depthWrite: false,
        blending: three.AdditiveBlending,
      }),
    );
    scene.add(nodes);

    // Edges as filaments. Per-vertex colour so a lit pair brightens its own
    // line without a second draw call.
    const edgePositions = new Float32Array(layout.edges.length * 6);
    const edgeColors = new Float32Array(layout.edges.length * 6);
    for (let index = 0; index < layout.edges.length; index += 1) {
      edgeColors.set([...EDGE_REST, ...EDGE_REST], index * 6);
    }
    const edgeGeometry = new three.BufferGeometry();
    edgeGeometry.setAttribute("position", new three.BufferAttribute(edgePositions, 3));
    edgeGeometry.setAttribute("color", new three.BufferAttribute(edgeColors, 3));
    const edges = new three.LineSegments(
      edgeGeometry,
      new three.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: three.AdditiveBlending,
      }),
    );
    scene.add(edges);

    const globe = new three.Group();
    globe.add(nodes);
    globe.add(edges);
    scene.add(globe);

    // Sweeping arcs behind the sphere. Partial rather than closed rings, which
    // is what suggests an instrument housing rather than an orbit diagram.
    const arcs: InstanceType<typeof three.Line>[] = [];
    for (const [radius, sweep, tilt, spin] of [
      [SHELL_RADIUS * 1.5, 2.3, 0.34, 0.05],
      [SHELL_RADIUS * 1.72, 1.5, -0.72, -0.035],
      [SHELL_RADIUS * 1.28, 0.9, 1.1, 0.07],
    ] as const) {
      const segments = 96;
      const points = new Float32Array((segments + 1) * 3);
      for (let index = 0; index <= segments; index += 1) {
        const angle = (index / segments) * sweep;
        points[index * 3] = Math.cos(angle) * radius;
        points[index * 3 + 1] = Math.sin(angle) * radius;
      }
      const geometry = new three.BufferGeometry();
      geometry.setAttribute("position", new three.BufferAttribute(points, 3));
      const arc = new three.Line(
        geometry,
        new three.LineBasicMaterial({
          color: 0xff8a2b,
          transparent: true,
          opacity: 0.22,
          blending: three.AdditiveBlending,
        }),
      );
      arc.rotation.x = tilt;
      arc.userData.spin = spin;
      arcs.push(arc);
      scene.add(arc);
    }

    // Bloom is the single biggest contributor to the look: without it these are
    // thin bright lines, with it they are filaments that glow.
    //
    // Guarded separately from the renderer. The composer and the bloom pass
    // allocate their own render targets, so they can fail where renderer
    // construction succeeded — a real hole in the first version, which only
    // wrapped `new WebGLRenderer`. A failure here degrades to the graph without
    // glow rather than to no graph at all.
    let composer: InstanceType<typeof EffectComposer> | null = null;
    let bloom: InstanceType<typeof UnrealBloomPass> | null = null;
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(
        new three.Vector2(width, height),
        1.05, // strength
        0.62, // radius
        0.14, // threshold, low so the dim resting graph still catches a little
      );
      composer.addPass(bloom);
      composer.setSize(width, height);
    } catch {
      composer?.dispose();
      composer = null;
      bloom = null;
    }

    const litIndices = new Set<number>();

    const writePositions = () => {
      for (let index = 0; index < nodeCount; index += 1) {
        const node = layout.nodes[index];
        nodePositions[index * 3] = node.x;
        nodePositions[index * 3 + 1] = node.y;
        nodePositions[index * 3 + 2] = node.z;
      }
      for (let index = 0; index < layout.edges.length; index += 1) {
        const edge = layout.edges[index];
        const source = layout.nodes[edge.source];
        const target = layout.nodes[edge.target];
        edgePositions.set([source.x, source.y, source.z], index * 6);
        edgePositions.set([target.x, target.y, target.z], index * 6 + 3);
      }
      nodeGeometry.getAttribute("position").needsUpdate = true;
      edgeGeometry.getAttribute("position").needsUpdate = true;
      nodeGeometry.computeBoundingSphere();
    };

    const paintIgnition = () => {
      if (litIndices.size === 0) return;
      const nodeAttribute = nodeGeometry.getAttribute("color");
      for (const index of litIndices) {
        nodeAttribute.setXYZ(index, IGNITED[0], IGNITED[1], IGNITED[2]);
      }
      nodeAttribute.needsUpdate = true;

      const edgeAttribute = edgeGeometry.getAttribute("color");
      for (let index = 0; index < layout.edges.length; index += 1) {
        const edge = layout.edges[index];
        // Both ends, so the trail follows an authored link rather than glowing
        // wherever a single hit happens to land.
        if (!litIndices.has(edge.source) || !litIndices.has(edge.target)) continue;
        edgeAttribute.setXYZ(index * 2, EDGE_LIT[0], EDGE_LIT[1], EDGE_LIT[2]);
        edgeAttribute.setXYZ(index * 2 + 1, EDGE_LIT[0], EDGE_LIT[1], EDGE_LIT[2]);
      }
      edgeAttribute.needsUpdate = true;
    };

    let frame = 0;
    let elapsed = 0;
    let previous = performance.now();
    const render = () => {
      const now = performance.now();
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      elapsed += delta;

      for (let tick = 0; tick < TICKS_PER_FRAME; tick += 1) layout.step();
      writePositions();
      paintIgnition();

      // Slow enough to read as drift rather than spin. A fast rotation is the
      // difference between an instrument and a screensaver.
      globe.rotation.y = elapsed * 0.05;
      globe.rotation.x = Math.sin(elapsed * 0.1) * 0.09;
      for (const arc of arcs) {
        arc.rotation.z += delta * (arc.userData.spin as number);
      }

      if (composer) composer.render();
      else renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    const onResize = () => {
      const nextWidth = Math.max(host.clientWidth, 1);
      const nextHeight = Math.max(host.clientHeight, 1);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      composer?.setSize(nextWidth, nextHeight);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    sceneRef.current = {
      ignite: (ids) => {
        for (const id of ids) {
          const index = layout.indexById.get(id);
          if (index !== undefined) litIndices.add(index);
        }
      },
      dispose: () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        nodeGeometry.dispose();
        nodes.material.dispose();
        edgeGeometry.dispose();
        edges.material.dispose();
        for (const arc of arcs) {
          arc.geometry.dispose();
          (arc.material as InstanceType<typeof three.Material>).dispose();
        }
        bloom?.dispose();
        composer?.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      },
    };

    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [concepts, loaded]);

  useEffect(() => {
    sceneRef.current?.ignite(litIds);
  }, [litIds]);

  return <div ref={hostRef} className="jarvis-field" aria-hidden="true" />;
}
