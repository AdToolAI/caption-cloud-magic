import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

/**
 * Marken-Wächter: die Altmarke "CaptionGenie" darf nicht in nutzersichtbaren
 * Code zurückkehren. Bekannte, bewusst belassene Ausnahmen sind unten gelistet.
 */
const ALLOWED = [
  // Legacy-Origin für bereits versendete Verifizierungslinks
  'supabase/functions/send-verification-email/index.ts',
  // Rückwärtskompatible Erkennung alter Demo-Verbindungen
  'src/components/performance/ConnectionsTab.tsx',
  // Dieser Test selbst
  'src/test/brand-consistency.test.ts',
];

function grep(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rniE "${pattern}" src supabase/functions -l || true`,
      { encoding: 'utf8' },
    );
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

describe('brand consistency', () => {
  it('has no CaptionGenie / caption-cloud-magic references', () => {
    const hits = grep('captiongenie|caption-cloud-magic').filter(
      (f) => !ALLOWED.some((a) => f.endsWith(a)),
    );
    expect(hits).toEqual([]);
  });
});
