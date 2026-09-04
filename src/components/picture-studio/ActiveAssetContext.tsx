import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  activeChain,
  activeNode,
  addNode,
  emptyLineage,
  resetLineage,
  selectNode,
  type LineageNode,
  type LineageState,
} from "@/lib/pictureModels/lineage";

interface ActiveAssetContextValue {
  lineage: LineageState;
  active: LineageNode | null;
  chain: LineageNode[];
  push: (node: Omit<LineageNode, "parentId" | "createdAt"> & { parentId?: string | null }) => void;
  select: (id: string) => void;
  reset: () => void;
}

const ActiveAssetContext = createContext<ActiveAssetContextValue | null>(null);

export function ActiveAssetProvider({ children }: { children: ReactNode }) {
  const [lineage, setLineage] = useState<LineageState>(emptyLineage);

  const push = useCallback<ActiveAssetContextValue["push"]>((node) => {
    setLineage((prev) => addNode(prev, node));
  }, []);

  const select = useCallback((id: string) => {
    setLineage((prev) => selectNode(prev, id));
  }, []);

  const reset = useCallback(() => setLineage(resetLineage()), []);

  const value = useMemo<ActiveAssetContextValue>(
    () => ({
      lineage,
      active: activeNode(lineage),
      chain: activeChain(lineage),
      push,
      select,
      reset,
    }),
    [lineage, push, select, reset],
  );

  return <ActiveAssetContext.Provider value={value}>{children}</ActiveAssetContext.Provider>;
}

export function useActiveAsset(): ActiveAssetContextValue {
  const ctx = useContext(ActiveAssetContext);
  if (!ctx) {
    throw new Error("useActiveAsset must be used inside <ActiveAssetProvider>");
  }
  return ctx;
}

/** Safe variant for components that can render outside the studio. */
export function useOptionalActiveAsset(): ActiveAssetContextValue | null {
  return useContext(ActiveAssetContext);
}
