import type { ProviderPublisher, PublishResult } from './index.ts';

export const youtubeProvider: ProviderPublisher = {
  name: 'youtube',

  async publish({ userId, text, media }): Promise<PublishResult> {
    console.log('[YouTube Provider] Not yet implemented for user:', userId);
    return {
      provider: 'youtube',
      ok: false,
      error_code: 'NOT_IMPLEMENTED',
      error_message: 'YouTube publishing is not yet implemented',
    };
  },
};
