#!/usr/bin/env node
// Generates the client mirror of the canonical video model capability registry.
//
//   node scripts/generate-video-model-specs.mjs
//
// Source of truth : supabase/functions/_shared/videoModelSpecs.ts
// Generated mirror: src/config/videoModelSpecs.ts   (never edit by hand)
//
// The mirror is a byte-identical copy of the source plus a banner and a
// SPECS_SOURCE_HASH constant. `src/config/__tests__/videoModelSpecsParity.test.ts`
// recomputes the hash and fails CI whenever the two drift apart.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'supabase/functions/_shared/videoModelSpecs.ts');
const TARGET = resolve(root, 'src/config/videoModelSpecs.ts');

export function hashSource(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

const source = readFileSync(SOURCE, 'utf8');
const hash = hashSource(source);

const banner = `// =============================================================================
// GENERATED FILE — DO NOT EDIT.
// Mirror of supabase/functions/_shared/videoModelSpecs.ts
// Regenerate with: node scripts/generate-video-model-specs.mjs
// =============================================================================

export const SPECS_SOURCE_HASH = '${hash}';

`;

writeFileSync(TARGET, banner + source, 'utf8');
console.log(`videoModelSpecs mirror written (${hash.slice(0, 12)}…)`);
