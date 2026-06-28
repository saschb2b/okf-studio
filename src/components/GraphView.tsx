// STUB — replaced by the Graph View agent with a canvas force-directed renderer.
import { useApp } from "../store.tsx";

export function GraphView() {
  const { state } = useApp();
  return (
    <div className="graph-placeholder">
      <p>Graph View</p>
      <small>{state.bundle?.concepts.length ?? 0} concepts — canvas renderer pending</small>
    </div>
  );
}
