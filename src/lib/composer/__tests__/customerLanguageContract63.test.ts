/**
 * v430 Schritt 6.3 — Kundensprache im Motion Studio.
 *
 * In sichtbaren UI-Strings der Composer-Oberfläche dürfen keine internen
 * Pipeline-/Provider-Begriffe mehr auftauchen ("Plate", "Two-Shot",
 * "Cinematic-Sync", "Sync.so", "HappyHorse" …). Interne Bezeichner,
 * Kommentare, Feldnamen und Provider-IDs bleiben unverändert — dieser
 * Scanner prüft ausschliesslich String- und Template-Literale.
 *
 * Ausnahme zeilenbezogen über
 *   // customer-language-allowed: <Grund>
 * am Treffer oder in der Zeile davor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SCAN_DIRS = [
  join(ROOT, 'src/components/video-composer'),
  join(ROOT, 'src/hooks/usePipelineProgress.ts'),
  join(ROOT, 'src/hooks/useTwoShotAutoTrigger.ts'),
];

const FORBIDDEN: RegExp[] = [
  /\bSync\.so\b/i,
  /\bCinematic[-\s]Sync\b/i,
  /\bTwo[-\s]Shot\b/i,
  /\bPlate\b/,
  /\bplaca\b/i,
];

const ALLOW_MARKER = /customer-language-allowed:/;

function collectFiles(target: string): string[] {
  const st = statSync(target, { throwIfNoEntry: false } as any);
  if (!st) return [];
  if (st.isFile()) return target.endsWith('.ts') || target.endsWith('.tsx') ? [target] : [];
  return readdirSync(target).flatMap((entry) => {
    if (entry === '__tests__' || entry === 'node_modules') return [];
    return collectFiles(join(target, entry));
  });
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

function scan(file: string): Violation[] {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Violation[] = [];

  const check = (text: string, pos: number) => {
    if (!FORBIDDEN.some((re) => re.test(text))) return;
    const line = sf.getLineAndCharacterOfPosition(pos).line;
    const current = lines[line] ?? '';
    const previous = lines[line - 1] ?? '';
    if (ALLOW_MARKER.test(current) || ALLOW_MARKER.test(previous)) return;
    out.push({ file: relative(ROOT, file), line: line + 1, text: text.slice(0, 160) });
  };

  const USER_PROP_NAMES = new Set(['de', 'en', 'es', 'title', 'description', 'label', 'placeholder', 'headline', 'hint']);

  const checkExpr = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      check(node.text, node.getStart(sf));
    } else if (ts.isTemplateExpression(node)) {
      check(node.head.text, node.getStart(sf));
      node.templateSpans.forEach((span) => check(span.literal.text, span.getStart(sf)));
    } else if (ts.isConditionalExpression(node)) {
      checkExpr(node.whenTrue);
      checkExpr(node.whenFalse);
    }
  };

  const visit = (node: ts.Node) => {
    // Sichtbare Texte: tx()/Objekt-Properties mit Kunden-Slots, JSX-Text,
    // JSX-Attribute wie title/placeholder. Interne IDs ('cinematic-sync'),
    // Konsolen-Logs und Storage-Keys werden bewusst nicht geprüft.
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/['"]/g, '');
      if (USER_PROP_NAMES.has(name)) checkExpr(node.initializer);
    } else if (ts.isJsxText(node)) {
      check(node.text, node.getStart(sf));
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (USER_PROP_NAMES.has(name) && node.initializer) {
        if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          checkExpr(node.initializer.expression);
        } else {
          checkExpr(node.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('v430/6.3 — Kundensprache im Composer-UI', () => {
  const files = SCAN_DIRS.flatMap(collectFiles);

  it('scannt die Composer-Oberfläche', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('enthält keine internen Pipeline-Begriffe in sichtbaren Strings', () => {
    const violations = files.flatMap(scan);
    const report = violations.map((v) => `${v.file}:${v.line} → ${v.text}`).join('\n');
    expect(report, `Interne Begriffe in Kunden-Strings:\n${report}`).toBe('');
  });
});
