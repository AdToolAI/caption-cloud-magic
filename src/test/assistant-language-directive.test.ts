import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression guard for the "assistant answers in a random language" complaint.
 * Both assistant functions must pin the reply language to the UI language via
 * an explicit system-prompt directive, with English (never German/Spanish) as
 * the only fallback.
 */
const coach = readFileSync('supabase/functions/coach-chat/index.ts', 'utf8');
const textStudio = readFileSync('supabase/functions/text-studio-chat/index.ts', 'utf8');

describe('assistant reply language', () => {
  it('coach-chat maps all three UI languages', () => {
    for (const code of ['de', 'en', 'es']) {
      expect(coach).toMatch(new RegExp(`${code}\\s*:`));
    }
    expect(coach).toContain('German (Deutsch)');
    expect(coach).toContain('English');
    expect(coach).toContain('Spanish (Español)');
  });

  it('coach-chat falls back to English, never to another language', () => {
    expect(coach).toMatch(/langMap\[[^\]]+\]\s*\|\|\s*'English'/);
  });

  it('coach-chat sets the language as the highest-priority system instruction', () => {
    expect(coach).toContain('OUTPUT LANGUAGE (ABSOLUTE, HIGHEST PRIORITY)');
    expect(coach).toMatch(/Write every single reply in \$\{langName\}/);
  });

  it('text-studio-chat prepends a language directive to the system prompt', () => {
    expect(textStudio).toContain('langDirective');
    expect(textStudio).toContain('effectiveSystemPrompt');
    expect(textStudio).toMatch(/system:\s*effectiveSystemPrompt/);
  });

  it('text-studio-chat knows all three languages and defaults to English', () => {
    expect(textStudio).toContain('LANG_NAMES');
    for (const name of ['English', 'German', 'Spanish']) {
      expect(textStudio).toContain(name);
    }
    expect(textStudio).toMatch(/LANG_NAMES\[[^\]]+\]\s*(\?\?|\|\|)\s*['"]English/);
  });

  it('both clients send the active UI language with every request', () => {
    const page = readFileSync('src/pages/AITextStudio.tsx', 'utf8');
    const pinned = readFileSync('src/components/text-studio/PinnedChatWindow.tsx', 'utf8');
    expect(page).toContain('language: getLang()');
    expect(pinned).toContain('language: getLang()');
  });
});
