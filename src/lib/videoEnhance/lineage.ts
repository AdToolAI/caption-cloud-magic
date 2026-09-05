/**
 * Non-destructive video lineage.
 *
 *   Seedance scene -> Lip-Sync -> Stitch -> 4K master
 *
 * The enhanced master is a CHILD asset. The source keeps existing, stays in
 * the media library and stays selectable, so a user can go back and enhance an
 * earlier version differently.
 */

export type VideoLineageKind =
  | 'upload'
  | 'generate'
  | 'lipsync'
  | 'stitch'
  | 'enhance';

export interface VideoLineageNode {
  id: string;
  kind: VideoLineageKind;
  url: string;
  label: string;
  parentId: string | null;
  createdAt: number;
  modelId?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
}

export interface VideoLineageState {
  nodes: VideoLineageNode[];
  activeId: string | null;
}

export const emptyVideoLineage: VideoLineageState = { nodes: [], activeId: null };

export function activeVideoNode(state: VideoLineageState): VideoLineageNode | null {
  if (!state.activeId) return null;
  return state.nodes.find((n) => n.id === state.activeId) ?? null;
}

export function addVideoNode(
  state: VideoLineageState,
  node: Omit<VideoLineageNode, 'parentId' | 'createdAt'> & {
    parentId?: string | null;
    createdAt?: number;
  },
): VideoLineageState {
  const parentId = node.parentId !== undefined ? node.parentId : state.activeId;
  const full: VideoLineageNode = {
    ...node,
    parentId: parentId ?? null,
    createdAt: node.createdAt ?? Date.now(),
  };
  return { nodes: [...state.nodes.filter((n) => n.id !== full.id), full], activeId: full.id };
}

export function selectVideoNode(state: VideoLineageState, id: string): VideoLineageState {
  if (!state.nodes.some((n) => n.id === id)) return state;
  return { ...state, activeId: id };
}

/** Root -> active path, used for the before/after comparison. */
export function videoLineagePath(state: VideoLineageState): VideoLineageNode[] {
  const path: VideoLineageNode[] = [];
  let current = activeVideoNode(state);
  while (current) {
    path.unshift(current);
    current = current.parentId
      ? (state.nodes.find((n) => n.id === current!.parentId) ?? null)
      : null;
  }
  return path;
}

/** The node an enhance run should compare against (its direct parent). */
export function comparisonSource(
  state: VideoLineageState,
  nodeId: string,
): VideoLineageNode | null {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node?.parentId) return null;
  return state.nodes.find((n) => n.id === node.parentId) ?? null;
}
