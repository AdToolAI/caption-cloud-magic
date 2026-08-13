import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * v430 Step 0 — the client contract and its edge-function mirror MUST stay
 * byte-identical. Any drift silently reintroduces `dialog_too_long_for_plate`.
 */
describe('resolveEffectiveDialog client/server parity', () => {
  it('mirror file is byte-identical', () => {
    const root = process.cwd();
    const client = readFileSync(
      resolve(root, 'src/lib/composer/dialog/resolveEffectiveDialog.ts'),
      'utf8',
    );
    const server = readFileSync(
      resolve(root, 'supabase/functions/_shared/resolve-effective-dialog.ts'),
      'utf8',
    );
    expect(server).toBe(client);
  });

  it('contract module stays pure (no supabase / network imports)', () => {
    const client = readFileSync(
      resolve(process.cwd(), 'src/lib/composer/dialog/resolveEffectiveDialog.ts'),
      'utf8',
    );
    expect(client).not.toMatch(/from ['"].*supabase/i);
    expect(client).not.toMatch(/\bfetch\s*\(/);
  });
});
