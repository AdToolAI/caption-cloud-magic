/**
 * v430 Schritt 5E — Client-Reader-Contract.
 *
 * Im Frontend darf der Zustand einer Szene nur noch über die
 * Zustandsmaschine gelesen werden:
 *   Hauptzustand   → sceneState()
 *   Detailzustand  → sceneSubstate()
 *   Output         → resolveSceneOutput()
 *   Ready/Failed   → legacyClipReadyEquivalentRow() / legacyClipFailedEquivalentRow()
 *
 * Dieser Scanner blockiert direkte LESE-Zugriffe auf die Legacy-Spalten
 * `clip_status`, `twoshot_stage`, `lip_sync_status` (snake_ und camelCase).
 *
 * Er arbeitet AST-basiert (TypeScript-Parser), damit Helfer-Namen wie
 * `clipStatusFromState()` oder `legacyClipReadyEquivalentRow()` keine
 * False Positives erzeugen. Schreib-Zugriffe (Objekt-Literal-Keys in
 * update/insert-Payloads) werden bewusst NICHT gemeldet — 5E ändert keine
 * Writer.
 *
 * Ausnahmen ausschliesslich zeilenbezogen über den Marker
 *   // legacy-mapping-allowed: <Grund>
 * am Treffer oder in der Zeile davor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const LEGACY_FIELDS = new Set([
  'clip_status',
  'clipStatus',
  'twoshot_stage',
  'twoshotStage',
  'lip_sync_status',
  'lipSyncStatus',
]);

/** Generierte Dateien und Tests. */
const SKIP_FILES = new Set([
  'src/integrations/supabase/types.ts',
  // Kanonische Resolver — sie DÜRFEN die Alt-Spalten lesen, das ist ihr Zweck.
  'src/lib/composer/sceneState.ts',
  'src/lib/composer/output/resolveSceneOutput.ts',
  'src/lib/composer/continuity/continuityState.ts',
]);

const MARKER = 'legacy-mapping-allowed:';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function scanFile(absPath: string): Hit[] {
  const rel = relative(ROOT, absPath).split(sep).join('/');
  if (SKIP_FILES.has(rel)) return [];

  const source = readFileSync(absPath, 'utf8');
  if (!/clip_status|clipStatus|twoshot_stage|twoshotStage|lip_sync_status|lipSyncStatus/.test(source)) {
    return [];
  }

  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split('\n');
  const hits: Hit[] = [];

  const allowed = (lineIdx: number) =>
    (lines[lineIdx] ?? '').includes(MARKER) || (lines[lineIdx - 1] ?? '').includes(MARKER);

  const push = (node: ts.Node) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    if (allowed(line)) return;
    hits.push({ file: rel, line: line + 1, text: (lines[line] ?? '').trim() });
  };

  const visit = (node: ts.Node) => {
    // x.clip_status / x?.clipStatus — Schreibziele (`x.clipStatus = …`) sind
    // Writer und werden in 5E bewusst nicht gemeldet.
    if (ts.isPropertyAccessExpression(node) && LEGACY_FIELDS.has(node.name.text)) {
      const parent = node.parent;
      const isWriteTarget =
        ts.isBinaryExpression(parent) &&
        parent.left === node &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      if (!isWriteTarget) push(node);
    }
    // x['clip_status']
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      LEGACY_FIELDS.has(node.argumentExpression.text)
    ) {
      push(node);
    }
    // const { clip_status } = scene
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const key = node.propertyName ?? node.name;
      if (ts.isIdentifier(key) && LEGACY_FIELDS.has(key.text)) push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return hits;
}

describe('v430 5E — Client-Reader-Contract', () => {
  it('kein direkter Legacy-Feld-Read im Frontend ohne Ausnahme-Marker', () => {
    const hits = walk(SRC).flatMap(scanFile);
    const report = hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n');
    expect(report, `Direkte Legacy-Reads gefunden:\n${report}`).toBe('');
  });

  it('erkennt Legacy-Reads und ignoriert die kanonischen Helfer', () => {
    // Selbsttest des Scanners über eine temporäre Quelle.
    const probe = `
      const a = scene.clip_status;
      const b = clipStatusFromState(sceneState(scene));
      const c = legacyClipReadyEquivalentRow(scene);
      const { twoshot_stage } = scene;
      const d = scene['lip_sync_status'];
    `;
    const sf = ts.createSourceFile('probe.ts', probe, ts.ScriptTarget.Latest, true);
    let found = 0;
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && LEGACY_FIELDS.has(n.name.text)) found += 1;
      if (
        ts.isElementAccessExpression(n) &&
        ts.isStringLiteralLike(n.argumentExpression) &&
        LEGACY_FIELDS.has(n.argumentExpression.text)
      ) {
        found += 1;
      }
      if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
        const key = n.propertyName ?? n.name;
        if (ts.isIdentifier(key) && LEGACY_FIELDS.has(key.text)) found += 1;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(found).toBe(3);
  });
});
