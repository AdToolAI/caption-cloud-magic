/**
 * Non-destructive asset lineage for Picture Studio.
 *
 *  Original -> Generation -> Edit v1 -> Topaz 4x -> Background replacement
 *
 * The last node is the active asset, but every earlier node stays selectable,
 * so a user can go back and try a different model on an earlier version.
 */

export type LineageStepKind =
  | 'upload'
  | 'generate'
  | 'edit'
  | 'enhance'
  | 'background';

export interface LineageNode {
  id: string;
  kind: LineageStepKind;
  url: string;
  label: string;
  /** Model that produced this node (registry id or provider tier). */
  modelId?: string;
  parentId: string | null;
  createdAt: number;
  width?: number;
  height?: number;
  prompt?: string;
  mediaItemId?: string;
}

export interface LineageState {
  nodes: LineageNode[];
  activeId: string | null;
}

export const emptyLineage: LineageState = { nodes: [], activeId: null };

export function activeNode(state: LineageState): LineageNode | null {
  if (!state.activeId) return null;
  return state.nodes.find((n) => n.id === state.activeId) ?? null;
}

export function addNode(
  state: LineageState,
  node: Omit<LineageNode, 'parentId' | 'createdAt'> & { parentId?: string | null; createdAt?: number },
): LineageState {
  const parentId = node.parentId !== undefined ? node.parentId : state.activeId;
  const full: LineageNode = {
    ...node,
    parentId: parentId ?? null,
    createdAt: node.createdAt ?? Date.now(),
  };
  return { nodes: [...state.nodes.filter((n) => n.id !== full.id), full], activeId: full.id };
}

export function selectNode(state: LineageState, id: string): LineageState {
  if (!state.nodes.some((n) => n.id === id)) return state;
  return { ...state, activeId: id };
}

/** Root -> active chain, used for the breadcrumb strip under the canvas. */
export function activeChain(state: LineageState): LineageNode[] {
  const chain: LineageNode[] = [];
  let current = activeNode(state);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId
      ? state.nodes.find((n) => n.id === current!.parentId) ?? null
      : null;
  }
  return chain;
}

export function resetLineage(): LineageState {
  return { nodes: [], activeId: null };
}
