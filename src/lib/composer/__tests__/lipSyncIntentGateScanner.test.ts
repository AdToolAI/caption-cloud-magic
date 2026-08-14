/**
 * v430.1 Schritt 1 — Intent-Gate-Scanner.
 *
 * Erfasst AST-basiert JEDE **lesende Verwendung** der Intent-Felder
 * (`dialogMode`, `dialog_mode`, `engineOverride`, `engine_override`,
 * `lipSyncWithVoiceover`, `lip_sync_with_voiceover`) in einem
 * Bedingungskontext — nicht nur eine bestimmte Vergleichssyntax:
 *
 *   x === '…' / x !== '…'      Vergleiche
 *   if (dialogMode) / !x        Truthiness und Negation
 *   a && x / x || b             Boolesche Operanden
 *   cond ? a : b                Ternäre Bedingung
 *   isLipsyncEngine(x)          Helferaufrufe
 *   [...].includes(x)           Mengenprüfungen
 *   SET.has(x)
 *
 * Writer und Mapping bleiben ausgenommen: sobald der Ausdruck der Wert
 * einer Objekt-Property mit Intent-Feldnamen ist (`dialog_mode: s.dialogMode
 * === true`, `engineOverride: … ?? 'auto'`), zählt er als Schreib-/
 * Mapping-Pfad.
 *
 * Der Scanner ändert nichts — er friert das heutige Gate-Inventar ein.
 * Jeder NEUE Treffer lässt den Test rot laufen, damit während v430.1 keine
 * weiteren direkten Gates entstehen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const INTENT_FIELDS = new Set([
  'dialogMode',
  'dialog_mode',
  'engineOverride',
  'engine_override',
  'lipSyncWithVoiceover',
  'lip_sync_with_voiceover',
]);

/** Die SSoT selbst darf die Felder lesen — das ist ihr Zweck. */
const SKIP_FILES = new Set([
  'src/lib/video-composer/lipSyncIntent.ts',
  'src/integrations/supabase/types.ts',
]);

const CONDITIONAL_CALLEES = new Set([
  'isLipsyncEngine',
  'isLipsyncClipSource',
  'includes',
  'has',
  'Boolean',
]);

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

/** Klettert durch transparente Wrapper (Klammern, as, !, ?.). */
function unwrap(node: ts.Node): ts.Node {
  let cur = node;
  while (
    cur.parent &&
    (ts.isParenthesizedExpression(cur.parent) ||
      ts.isAsExpression(cur.parent) ||
      ts.isNonNullExpression(cur.parent) ||
      (ts.isBinaryExpression(cur.parent) &&
        cur.parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
        cur.parent.left === cur))
  ) {
    cur = cur.parent;
  }
  return cur;
}

/** Ist der Ausdruck Teil eines Writers / Mappings? */
function isWriterContext(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isPropertyAssignment(cur)) {
      const name = cur.name;
      const key = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : '';
      if (INTENT_FIELDS.has(key)) return true;
    }
    if (
      ts.isBinaryExpression(cur) &&
      cur.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      cur.left === node
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/** Wird der gelesene Wert in einer Bedingung ausgewertet? */
function isConditionalUse(read: ts.Node): boolean {
  const node = unwrap(read);
  const parent = node.parent;
  if (!parent) return false;

  if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) {
    return true;
  }
  if (ts.isBinaryExpression(parent)) {
    const k = parent.operatorToken.kind;
    return (
      k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      k === ts.SyntaxKind.EqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsToken ||
      k === ts.SyntaxKind.AmpersandAmpersandToken ||
      k === ts.SyntaxKind.BarBarToken
    );
  }
  if (ts.isConditionalExpression(parent) && parent.condition === node) return true;
  if (ts.isIfStatement(parent) && parent.expression === node) return true;
  if (ts.isWhileStatement(parent) && parent.expression === node) return true;
  if (ts.isCallExpression(parent) && parent.arguments.includes(node as ts.Expression)) {
    const callee = parent.expression;
    const name = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isIdentifier(callee)
        ? callee.text
        : '';
    return CONDITIONAL_CALLEES.has(name);
  }
  return false;
}

export interface GateHit {
  file: string;
  line: number;
  text: string;
}

function scanFile(absPath: string): GateHit[] {
  const rel = relative(ROOT, absPath).split(sep).join('/');
  if (SKIP_FILES.has(rel)) return [];
  const source = readFileSync(absPath, 'utf8');
  if (![...INTENT_FIELDS].some((f) => source.includes(f))) return [];

  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split('\n');
  const hits: GateHit[] = [];

  const consider = (node: ts.Node) => {
    if (isWriterContext(node)) return;
    if (!isConditionalUse(node)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    hits.push({ file: rel, line: line + 1, text: (lines[line] ?? '').trim() });
  };

  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && INTENT_FIELDS.has(node.name.text)) consider(node);
    else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      INTENT_FIELDS.has(node.argumentExpression.text)
    ) {
      consider(node);
    } else if (
      ts.isIdentifier(node) &&
      INTENT_FIELDS.has(node.text) &&
      !ts.isPropertyAccessExpression(node.parent) &&
      !ts.isPropertyAssignment(node.parent) &&
      !ts.isBindingElement(node.parent) &&
      !ts.isVariableDeclaration(node.parent) &&
      !ts.isParameter(node.parent) &&
      !ts.isPropertySignature(node.parent)
    ) {
      consider(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return hits;
}

function scanAll(): GateHit[] {
  return walk(SRC).flatMap(scanFile);
}

/** Eingefrorenes Inventar: Datei -> Anzahl lesender Intent-Gates. */
const ALLOWLIST: Record<string, number> = {
  'src/components/video-composer/ClipsTab.tsx': 12,
  'src/components/video-composer/FaceMapReviewDialog.tsx': 1,
  'src/components/video-composer/RenderPreFlightDialog.tsx': 1,
  'src/components/video-composer/SceneActionsMenu.tsx': 1,
  'src/components/video-composer/SceneCard.tsx': 20,
  'src/components/video-composer/SceneClipProgress.tsx': 3,
  'src/components/video-composer/SceneDialogStudio.tsx': 12,
  'src/components/video-composer/SceneInlinePlayer.tsx': 3,
  'src/hooks/useApplyProductionPlan.ts': 4,
  'src/hooks/useGenerateAllClips.ts': 7,
  'src/hooks/useMouthYavgProbe.ts': 1,
  'src/hooks/usePipelineProgress.ts': 1,
  'src/hooks/useSceneGenerate.ts': 2,
  'src/hooks/useTwoShotAutoTrigger.ts': 1,
  'src/lib/composer/sceneActionAvailability.ts': 1,
  'src/lib/composer/visualInputs/classifyScene.ts': 1,
  'src/lib/video-composer/lipsyncPreflight.ts': 1,
  'src/lib/video-composer/sceneEngineRouter.ts': 5,
};

describe('v430.1 — Intent-Gate-Scanner', () => {
  it('erkennt alle Bedingungsformen und ignoriert Writer/Mapping', () => {
    const probe = `
      const a = scene.engineOverride === 'cinematic-sync';
      const b = !scene.dialogMode;
      if (scene.dialogMode) { doIt(); }
      const c = isLipsyncEngine(scene.engineOverride);
      const d = ['cinematic-sync'].includes(scene.engineOverride);
      const e = scene.lipSyncWithVoiceover ? 1 : 2;
      const f = other && scene.dialogMode;
      const payload = { dialog_mode: scene.dialogMode === true };
      const g = { engineOverride: scene.engineOverride ?? 'auto' };
      const h = scene.engineOverride;
      send(scene.dialogMode);
    `;
    const sf = ts.createSourceFile('probe.tsx', probe, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = 0;
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && INTENT_FIELDS.has(n.name.text)) {
        if (!isWriterContext(n) && isConditionalUse(n)) found += 1;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    // a, b, if, c, d, e, f  → 7. payload/g sind Writer, h und send() keine Bedingung.
    expect(found).toBe(7);
  });

  it('kein neues direktes Intent-Gate ausserhalb des eingefrorenen Inventars', () => {
    const counts: Record<string, number> = {};
    for (const hit of scanAll()) counts[hit.file] = (counts[hit.file] ?? 0) + 1;

    console.log("COUNTS="+JSON.stringify(counts));
    const drift: string[] = [];
    for (const file of new Set([...Object.keys(counts), ...Object.keys(ALLOWLIST)])) {
      const now = counts[file] ?? 0;
      const frozen = ALLOWLIST[file] ?? 0;
      if (now !== frozen) drift.push(`${file}: eingefroren ${frozen}, gefunden ${now}`);
    }
    expect(drift, `Intent-Gate-Inventar hat sich geändert:\n${drift.join('\n')}`).toEqual([]);
  });
});
