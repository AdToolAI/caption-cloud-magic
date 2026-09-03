import { describe, expect, it } from 'vitest';
import { classifyConnectionHealth } from '@/lib/socialConnectionHealth';
import { parseTikTokTokenResponse } from '../../../supabase/functions/_shared/tiktok-token-response';
import {
  classifyTikTokPublishStatus,
  tiktokPollDelayMs,
  TIKTOK_POLL_MAX_MS,
} from '../../../supabase/functions/_shared/tiktok-publish-status';

const NOW = new Date('2026-05-01T12:00:00Z');
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe('parseTikTokTokenResponse', () => {
  it('accepts the flat TikTok v2 shape', () => {
    const result = parseTikTokTokenResponse({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 7200,
      open_id: 'oid',
      scope: 'video.publish',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shape).toBe('flat');
    expect(result.tokens.access_token).toBe('a');
    expect(result.tokens.expires_in).toBe(7200);
  });

  it('accepts the legacy nested shape', () => {
    const result = parseTikTokTokenResponse({
      data: { access_token: 'a', refresh_token: 'r' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shape).toBe('nested');
    expect(result.tokens.expires_in).toBe(86400);
  });

  it('reports provider errors and missing fields distinctly', () => {
    expect(parseTikTokTokenResponse(null)).toMatchObject({ ok: false, code: 'EMPTY_RESPONSE' });
    expect(
      parseTikTokTokenResponse({ error: 'invalid_grant', error_description: 'bad' }),
    ).toMatchObject({ ok: false, code: 'PROVIDER_ERROR' });
    expect(parseTikTokTokenResponse({ refresh_token: 'r' })).toMatchObject({
      ok: false,
      code: 'MISSING_ACCESS_TOKEN',
    });
    expect(parseTikTokTokenResponse({ access_token: 'a' })).toMatchObject({
      ok: false,
      code: 'MISSING_REFRESH_TOKEN',
    });
  });

  it('treats error: { code: "ok" } as success', () => {
    const result = parseTikTokTokenResponse({
      error: { code: 'ok' },
      access_token: 'a',
      refresh_token: 'r',
    });
    expect(result.ok).toBe(true);
  });
});

describe('classifyTikTokPublishStatus', () => {
  it('only reports published on a terminal success status', () => {
    expect(
      classifyTikTokPublishStatus({
        data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['123'] },
      }).state,
    ).toBe('published');
    expect(classifyTikTokPublishStatus({ data: { status: 'SEND_TO_USER_INBOX' } }).state).toBe(
      'published',
    );
    expect(classifyTikTokPublishStatus({ data: { status: 'PROCESSING_UPLOAD' } }).state).toBe(
      'processing',
    );
    expect(classifyTikTokPublishStatus({ data: { status: 'FAILED' } }).state).toBe('failed');
  });

  it('surfaces the publicly available post id', () => {
    const result = classifyTikTokPublishStatus({
      data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['999'] },
    });
    expect(result.publiclyAvailablePostId).toBe('999');
  });

  it('detects rate limiting', () => {
    const result = classifyTikTokPublishStatus(
      { error: { code: 'rate_limit_exceeded', message: 'slow down' } },
      429,
    );
    expect(result.state).toBe('rate_limited');
  });

  it('keeps polling on unrecognized statuses and stays unknown on empty bodies', () => {
    expect(classifyTikTokPublishStatus(null).state).toBe('unknown');
    expect(classifyTikTokPublishStatus({ data: { status: 'WHATEVER' } }).state).toBe('processing');
  });

  it('backs off longer when rate limited and stays inside the poll window', () => {
    expect(tiktokPollDelayMs(0)).toBeLessThan(tiktokPollDelayMs(0, true));
    expect(tiktokPollDelayMs(0)).toBeLessThan(tiktokPollDelayMs(3));
    expect(tiktokPollDelayMs(99)).toBeLessThanOrEqual(TIKTOK_POLL_MAX_MS);
  });
});

describe('classifyConnectionHealth', () => {
  it('flags an expired token as requiring reconnect', () => {
    const result = classifyConnectionHealth(
      {
        provider: 'tiktok',
        token_expires_at: iso(-1000),
        account_metadata: { granted_scopes: ['video.publish'] },
      } as never,
      NOW,
    );
    expect(result.health).toBe('expired');
    expect(result.requiresReconnect).toBe(true);
  });

  it('warns shortly before expiry', () => {
    const result = classifyConnectionHealth(
      {
        provider: 'tiktok',
        token_expires_at: iso(60 * 60 * 1000),
        account_metadata: { granted_scopes: ['video.publish'] },
      } as never,
      NOW,
    );
    expect(result.health).toBe('attention');
  });

  it('requires reconnect when a Meta scope is missing', () => {
    const result = classifyConnectionHealth(
      {
        provider: 'facebook',
        token_expires_at: iso(30 * 24 * 60 * 60 * 1000),
        account_metadata: { granted_scopes: ['pages_show_list'] },
      } as never,
      NOW,
    );
    expect(result.health).toBe('attention');
    expect(result.requiresReconnect).toBe(true);
    expect(result.missingScopes).toContain('business_management');
  });

  it('marks legacy rows without metadata as unverified, not missing', () => {
    const result = classifyConnectionHealth(
      { provider: 'facebook', token_expires_at: null, account_metadata: null } as never,
      NOW,
    );
    expect(result.health).toBe('unverified');
  });

  it('reports a fully scoped, long lived connection as healthy', () => {
    const result = classifyConnectionHealth(
      {
        provider: 'instagram',
        token_expires_at: iso(45 * 24 * 60 * 60 * 1000),
        account_metadata: {
          granted_scopes: ['instagram_content_publish', 'instagram_basic', 'business_management'],
          page_access_token_encrypted: 'x',
        },
      } as never,
      NOW,
    );
    expect(result.health).toBe('healthy');
    expect(result.requiresReconnect).toBe(false);
  });

  it('returns missing for no connection at all', () => {
    expect(classifyConnectionHealth(null, NOW).health).toBe('missing');
  });
});
