import { describe, expect, it } from 'vitest';
import { parseBatchPrompts } from '@/lib/pictureModels/batchPrompts';
import { addNode, activeChain, emptyLineage, selectNode } from '@/lib/pictureModels/lineage';
import {
  createRun,
  markPersistFailed,
  markProviderFailed,
  canRetryPersistence,
  MAX_PERSIST_ATTEMPTS,
} from '@/lib/pictureModels/lifecycle';
import { estimatePrice } from '@/lib/pictureModels/pricing';

describe('parseBatchPrompts', () => {
  it('counts newline separated prompts', () => {
    expect(parseBatchPrompts('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('handles CRLF pastes', () => {
    expect(parseBatchPrompts('a\r\nb\r\n')).toEqual(['a', 'b']);
  });

  it('strips list markers', () => {
    expect(parseBatchPrompts('1. red shoe\n2. blue shoe')).toEqual(['red shoe', 'blue shoe']);
  });

  it('splits a single pasted numbered line instead of reporting one prompt', () => {
    expect(parseBatchPrompts('1. red shoe 2. blue shoe 3. green shoe')).toHaveLength(3);
  });

  it('never reports zero for non-empty text', () => {
    expect(parseBatchPrompts('  a luxury perfume bottle  ')).toEqual(['a luxury perfume bottle']);
  });

  it('reports zero only for empty input', () => {
    expect(parseBatchPrompts('   \n  ')).toEqual([]);
  });
});

describe('lineage', () => {
  it('keeps earlier versions selectable and chains to the active node', () => {
    let state = emptyLineage;
    state = addNode(state, { id: 'a', kind: 'upload', url: 'u', label: 'Original' });
    state = addNode(state, { id: 'b', kind: 'generate', url: 'g', label: 'Seedream' });
    state = addNode(state, { id: 'c', kind: 'enhance', url: 'e', label: 'Topaz 4x' });

    expect(state.activeId).toBe('c');
    expect(activeChain(state).map((n) => n.id)).toEqual(['a', 'b', 'c']);

    state = selectNode(state, 'b');
    expect(activeChain(state).map((n) => n.id)).toEqual(['a', 'b']);
    expect(state.nodes).toHaveLength(3);
  });
});

describe('run lifecycle', () => {
  it('refunds on provider failure', () => {
    const run = markProviderFailed(createRun('1', 'clarity-pro'), 'PROVIDER_ERROR');
    expect(run.state).toBe('credits_refunded');
    expect(run.refunded).toBe(true);
  });

  it('retries persistence before refunding', () => {
    let run = createRun('2', 'clarity-pro');
    run = markPersistFailed(run);
    expect(run.state).toBe('asset_persist_failed');
    expect(run.refunded).toBe(false);
    expect(canRetryPersistence(run)).toBe(true);
  });

  it('refunds only once persistence is exhausted', () => {
    let run = createRun('3', 'clarity-pro');
    for (let i = 0; i < MAX_PERSIST_ATTEMPTS; i++) run = markPersistFailed(run);
    expect(run.state).toBe('credits_refunded');
    expect(run.refunded).toBe(true);
  });

  it('never double refunds', () => {
    let run = markProviderFailed(createRun('4', 'clarity-pro'));
    run = markPersistFailed(run);
    expect(run.refunded).toBe(true);
    expect(run.state).toBe('asset_persist_failed');
  });
});

describe('pricing engine', () => {
  it('keeps the live Clarity prices unchanged', () => {
    expect(estimatePrice({ modelId: 'clarity-pro', scale: 2 })?.sellEUR).toBe(0.03);
    expect(estimatePrice({ modelId: 'clarity-pro', scale: 4 })?.sellEUR).toBe(0.06);
  });

  it('prices Topaz per output megapixel and keeps the margin floor', () => {
    const est = estimatePrice({
      modelId: 'topaz-image-upscale',
      inputWidth: 2048,
      inputHeight: 1365,
      scale: 4,
    });
    expect(est).not.toBeNull();
    expect(est!.outputWidth).toBe(8192);
    expect(est!.sellEUR).toBeGreaterThan(est!.providerCostEUR);
    expect(est!.costUnverified).toBe(true);
  });
});
