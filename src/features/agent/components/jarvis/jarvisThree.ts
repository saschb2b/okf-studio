// Loading three.js and the two post-processing passes the field needs.
//
// At module scope, and memoized, for two reasons: the React Compiler cannot
// lower an `import()` expression inside a component, and a user who never turns
// Jarvis Mode on should never download any of this. Nothing here is imported
// until the first staged turn runs.

import type * as Three from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface JarvisThree {
  three: typeof Three;
  EffectComposer: typeof EffectComposer;
  RenderPass: typeof RenderPass;
  UnrealBloomPass: typeof UnrealBloomPass;
}

let pending: Promise<JarvisThree> | null = null;

export function loadJarvisThree(): Promise<JarvisThree> {
  pending ??= Promise.all([
    import("three"),
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
  ]).then(([three, composer, render, bloom]) => ({
    three,
    EffectComposer: composer.EffectComposer,
    RenderPass: render.RenderPass,
    UnrealBloomPass: bloom.UnrealBloomPass,
  }));
  return pending;
}
