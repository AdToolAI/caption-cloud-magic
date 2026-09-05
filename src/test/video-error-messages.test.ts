import { describe, it, expect, beforeEach } from 'vitest';
import { classifyVideoError, friendlyVideoErrorMessage } from '@/lib/videoErrorMessages';
import { formatRuntimeEstimate, formatElapsed } from '@/hooks/useVideoModelRuntimeStats';

const setLang = (l: string) => localStorage.setItem('adtool-ai-lang', l);

describe('video provider error classification', () => {
  it('detects overload the way the real Seedance failure reported it', () => {
    expect(
      classifyVideoError(
        'Prediction failed: Async prediction failed: ModelError: Service is currently unavailable due to high demand. Please try again (E003)',
      ),
    ).toBe('overloaded');
  });

  it.each([
    ['Request timed out after 600s', 'timeout'],
    ['Blocked by content moderation policy', 'moderation'],
    ['Invalid input: duration must be 4, 8 or 12', 'invalid_input'],
    ['Rate limit exceeded, too many requests', 'rate_limit'],
    ['Provider internal server error', 'provider_error'],
    ['fetch failed: ECONNRESET', 'network'],
  ])('classifies %s', (msg, kind) => {
    expect(classifyVideoError(msg)).toBe(kind);
  });

  it('never returns a bare "failed" message without an explanation', () => {
    setLang('en');
    expect(friendlyVideoErrorMessage(null)).toContain('refunded');
  });
});

describe('localized provider messages', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ['de', 'überlastet'],
    ['en', 'overloaded'],
    ['es', 'sobrecargado'],
  ])('explains overload in %s', (lang, needle) => {
    setLang(lang);
    const msg = friendlyVideoErrorMessage('Service unavailable due to high demand');
    expect(msg.toLowerCase()).toContain(needle);
  });

  it('mentions the refund in every language', () => {
    for (const [lang, needle] of [
      ['de', 'zurückerstattet'],
      ['en', 'refunded'],
      ['es', 'reembolsado'],
    ]) {
      setLang(lang);
      expect(friendlyVideoErrorMessage('Request timed out').toLowerCase()).toContain(needle);
    }
  });
});

describe('runtime estimate formatting', () => {
  it('renders seconds for short runs and minutes for long ones', () => {
    expect(formatRuntimeEstimate(45)).toBe('~45 sec');
    expect(formatRuntimeEstimate(253)).toBe('~4 min');
    expect(formatRuntimeEstimate(310)).toBe('~5 min');
  });

  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(9)).toBe('0:09');
  });
});
