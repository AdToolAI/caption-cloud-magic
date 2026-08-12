import { describe, expect, it } from 'vitest';
import {
  buildSpokenLanguageDirective,
  isSpokenLanguageSelection,
  resolveAutoSpokenLanguage,
  SEEDANCE_SPOKEN_LANGUAGES,
} from '../spokenLanguage';

describe('Seedance spoken-language prompt control', () => {
  it('keeps UI-language auto selection deterministic', () => {
    expect(resolveAutoSpokenLanguage('de')).toBe('de');
    expect(resolveAutoSpokenLanguage('es')).toBe('es');
    expect(resolveAutoSpokenLanguage('en')).toBe('en');
  });

  it.each([
    ['en', 'English'],
    ['de', 'German (Deutsch)'],
    ['es', 'Spanish (Español)'],
    ['ja', 'Japanese'],
  ] as const)('builds a strict %s dialogue directive', (code, label) => {
    const directive = buildSpokenLanguageDirective(code);
    expect(directive).toContain(label);
    expect(directive).toContain('MUST be performed');
  });

  it('offers the extended Seedance language set', () => {
    expect(SEEDANCE_SPOKEN_LANGUAGES.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['de', 'en', 'es', 'fr', 'pt', 'ar', 'hi', 'ja', 'ko', 'zh']),
    );
    expect(isSpokenLanguageSelection('ja')).toBe(true);
    expect(isSpokenLanguageSelection('unsupported')).toBe(false);
  });
});