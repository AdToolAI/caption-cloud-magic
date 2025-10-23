import type { Provider, ProviderPublisher } from './index.ts';
import { instagramProvider } from './instagram.ts';
import { linkedinProvider } from './linkedin.ts';
import { xProvider } from './x.ts';
import { facebookProvider } from './facebook.ts';
import { tiktokProvider } from './tiktok.ts';
import { youtubeProvider } from './youtube.ts';

const providers = new Map<Provider, ProviderPublisher>([
  ['instagram', instagramProvider],
  ['linkedin', linkedinProvider],
  ['x', xProvider],
  ['facebook', facebookProvider],
  ['tiktok', tiktokProvider],
  ['youtube', youtubeProvider],
]);

export function getProvider(name: Provider): ProviderPublisher | undefined {
  return providers.get(name);
}

export function getAllProviders(): ProviderPublisher[] {
  return Array.from(providers.values());
}
