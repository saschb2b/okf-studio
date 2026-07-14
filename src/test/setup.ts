import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

// Persisted layout, saved-thread pointers, and the remembered last agent
// connection must not leak between tests: restore and auto-resume act on them.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// jsdom lacks canvas; the Graph View needs a 2D context stub to render in tests.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    const noop = () => {};
    return {
      canvas: document.createElement("canvas"),
      setTransform: noop,
      scale: noop,
      translate: noop,
      clearRect: noop,
      fillRect: noop,
      beginPath: noop,
      arc: noop,
      moveTo: noop,
      lineTo: noop,
      stroke: noop,
      fill: noop,
      save: noop,
      restore: noop,
      setLineDash: noop,
      getLineDash: () => [],
      measureText: () => ({ width: 0 }),
      fillText: noop,
      closePath: noop,
      set fillStyle(_v: string) {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set font(_v: string) {},
      set globalAlpha(_v: number) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
    } as unknown as CanvasRenderingContext2D;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// jsdom lacks ResizeObserver; the Graph View observes its container.
const g = globalThis as { ResizeObserver?: typeof ResizeObserver };
g.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom lacks scrollIntoView; the index tree reveals the active concept with it.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom lacks Element.getAnimations; Base UI awaits it for open/close transitions.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function () {
    return [];
  };
}

// jsdom lacks matchMedia; theme resolution calls it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
