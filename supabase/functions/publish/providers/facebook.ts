import type { ProviderPublisher, PublishResult } from './index.ts';

export const facebookProvider: ProviderPublisher = {
  name: 'facebook',

  async publish({ userId, text, media }): Promise<PublishResult> {
    console.log('[Facebook Provider] Not yet implemented for user:', userId);
    return {
      provider: 'facebook',
      ok: false,
      error_code: 'NOT_IMPLEMENTED',
      error_message: 'Facebook publishing is not yet implemented',
    };
  },
};
