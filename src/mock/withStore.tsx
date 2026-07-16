// Story harness for store-bound components. Off Tauri, the ipc layer serves
// the browser mock (src/mock/fixture.ts) — the same data `pnpm dev` shows —
// so wrapping a story in <WithStore withBundle> boots the real AppProvider
// and opens the mock bundle before rendering the component under test.
import { useEffect, type ReactNode } from "react";
import { AppProvider, useApp } from "@/shared/store.tsx";

function MockBundleBoot({ children }: { children: ReactNode }) {
  const { state, actions } = useApp();
  const hasBundle = state.bundle !== null;
  useEffect(() => {
    if (!hasBundle) void actions.openFolder();
    // The store's actions object is stable; boot exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBundle]);
  if (!hasBundle) return <p role="status">Opening the mock bundle…</p>;
  return <>{children}</>;
}

export function WithStore({
  withBundle = false,
  children,
}: {
  withBundle?: boolean;
  children: ReactNode;
}) {
  return (
    <AppProvider>
      {withBundle ? <MockBundleBoot>{children}</MockBundleBoot> : children}
    </AppProvider>
  );
}
