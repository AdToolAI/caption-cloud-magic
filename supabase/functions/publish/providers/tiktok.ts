import type { ProviderPublisher, PublishResult } from './index.ts';

export const tiktokProvider: ProviderPublisher = {
  name: 'tiktok',

  async publish({ userId, text, media }): Promise<PublishResult> {
    console.log('[TikTok Provider] Not yet implemented for user:', userId);
    return {
      provider: 'tiktok',
      ok: false,
      error_code: 'NOT_IMPLEMENTED',
      error_message: 'TikTok publishing is not yet implemented',
    };
  },
};
