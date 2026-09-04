import { clarityProAdapter } from './clarityPro';
import { topazColorizationAdapter } from './topazColorization';
import { topazDustScratchAdapter } from './topazDustScratch';
import { topazImageUpscaleAdapter } from './topazImageUpscale';
import type { ProviderAdapter } from './types';

export * from './types';
export { clarityProAdapter, topazColorizationAdapter, topazDustScratchAdapter, topazImageUpscaleAdapter };

const ADAPTERS: ProviderAdapter[] = [
  clarityProAdapter,
  topazImageUpscaleAdapter,
  topazDustScratchAdapter,
  topazColorizationAdapter,
];

export function getAdapter(modelId: string): ProviderAdapter | undefined {
  return ADAPTERS.find((a) => a.modelId === modelId);
}

export function listAdapters(): ProviderAdapter[] {
  return [...ADAPTERS];
}
