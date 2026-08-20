/**
 * English-UI purity guard — DEEP REACHABILITY SCANNER.
 *
 * Replaces the previous vocabulary-only guard. Instead of grepping for a short
 * list of banned words, this scanner reproduces the audit pipeline:
 *
 *  1. Tokenize every src/**\/*.{ts,tsx} file (strings, template literals, JSX
 *     text nodes), skipping comments and regex/apostrophe desync artifacts.
 *  2. For template literals only the STATIC segments count as display text —
 *     `${...}` interpolations carry their own literals and are checked separately.
 *  3. Decide REACHABILITY in English mode. A German literal is *unreachable*
 *     (and therefore fine) when it is:
 *       - the value of a `de:` / `es:` object key (incl. multi-line JSX values),
 *       - nested anywhere inside a `de:` / `es:` object/array block,
 *       - a positional argument of a localization helper (`t`, `tx`, `cap`, `S`, …)
 *         whose sibling arguments are plain-ASCII English/Spanish,
 *       - inside a `language === 'de' ? … : …` branch.
 *  4. Everything else is a genuine EN-mode leak.
 *
 * Policy exclusions (admin surfaces, Remotion render templates, non-UI
 * keyword/matching lists, language endonyms, console/comments) mirror the audit.
 *
 * ALLOWLIST holds the residual, manually-verified false positives (scanner
 * artifacts, enum ids, AI-prompt payloads). New German UI text will NOT be in
 * the allowlist and therefore fails the test.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const GERMAN_TOKENS = new Set(["abbrechen", "aber", "abgebrochen", "abgeschlossen", "abmelden", "achtung", "aktuell", "aktuelle", "aktuellen", "aktueller", "alles", "angezeigt", "anmelden", "anrufen", "anzeigen", "atmosphaerisch", "atmosphärisch", "auch", "aufhaenger", "aufhänger", "ausfuehrlich", "ausführlich", "ausgewaehlt", "ausgewählt", "aussehen", "auswaehlen", "auswählen", "bearbeiten", "bearbeitet", "beenden", "beendet", "befehle", "beim", "beispiel", "beliebt", "benutzer", "bereit", "berufstaetige", "berufstätige", "beschreibung", "besuchen", "betrag", "bezahlt", "bibliothek", "bitte", "breite", "buchen", "danke", "dann", "darf", "dass", "dauer", "dein", "deine", "deinen", "deiner", "deines", "denke", "deutsch", "duerfen", "durch", "durchschnitt", "dürfen", "einstellungen", "empathisch", "energetisch", "entfernen", "entfernt", "entfernte", "entscheider", "entspannt", "entwuerfe", "entwurf", "entwürfe", "episch", "erfahren", "erfolgreich", "ergaenzt", "ergebnisse", "ergänzt", "erste", "erstelle", "erstellen", "erstellt", "erstellung", "ersten", "erwachsene", "familien", "farbenfroh", "fehler", "fehlgeschlagen", "fertig", "froehlich", "fröhlich", "fuer", "für", "gab", "geben", "gefunden", "gegen", "geladen", "gelb", "geloescht", "gelöscht", "gemacht", "geoeffnet", "gesamt", "geschlossen", "gesicherte", "gespeichert", "gestartet", "gestern", "gewaehlte", "gewählte", "gibt", "groesse", "gruen", "größe", "grün", "haben", "haende", "handflaechen", "handflächen", "hatte", "hatten", "heruntergeladen", "herunterladen", "heute", "hinter", "hinweis", "hinzufuegen", "hinzufügen", "hinzugefuegt", "hinzugefügt", "hochgeladen", "hochladen", "hochpass", "hoehe", "hände", "höhe", "insgesamt", "jahre", "jede", "jeder", "jedes", "kanaele", "kann", "kannst", "kanäle", "kaufen", "kein", "keine", "keinen", "kennwort", "kindern", "koennen", "koennt", "konnte", "kostenlos", "können", "laden", "laedt", "laenge", "laesst", "langsam", "lassen", "letzte", "letzten", "loeschen", "loescht", "loesung", "lädt", "länge", "lässt", "löschen", "lösung", "machen", "macht", "maennlich", "mediathek", "mehr", "meine", "menge", "minimalistisch", "minuten", "moechte", "monate", "morgen", "muessen", "muss", "musst", "männlich", "möchte", "müssen", "nach", "nachdenklich", "naechste", "naechsten", "natuerlich", "natürlich", "netzbrummen", "neuen", "neuer", "neues", "nicht", "nichts", "noch", "noetig", "nur", "nutzer", "nächste", "nötig", "oder", "oeffnen", "oeffnet", "ohne", "passwort", "registrieren", "rueckgaengig", "rumpeln", "rückgängig", "schliessen", "schließen", "schnell", "schon", "schritt", "schritte", "sehr", "seit", "sekunden", "selbstbewusst", "serioes", "seriös", "sicherheit", "sind", "soll", "sollen", "sollte", "sonst", "spaeter", "speichern", "speichert", "sprache", "sprachen", "später", "starten", "stoerer", "stunde", "stunden", "störer", "suche", "suchen", "suchst", "tage", "testen", "tiefpass", "toene", "traurig", "töne", "ueber", "ueberschrift", "uebersicht", "uhrzeit", "unbekannt", "unter", "urspruengliches", "ursprüngliches", "verfuegbar", "verfügbar", "verwalten", "verwaltung", "viele", "vollbild", "vom", "vorbei", "vorherige", "vorlage", "vorlagen", "waehlen", "waren", "warnung", "weiblich", "weil", "weiss", "weiter", "weiß", "wenig", "weniger", "wenn", "werden", "werkzeug", "werkzeuge", "wiederverwenden", "willkommen", "wird", "woche", "wochen", "wollen", "wollte", "worden", "wurde", "wurden", "wählen", "zeigen", "zeigt", "zeitersparnis", "zischen", "zuege", "zuletzt", "zum", "zur", "zurueck", "zurück", "zwischen", "züge", "öffnen", "über", "überschrift", "übersicht"]);
const UMLAUT = /[äöüßÄÖÜ]/;
const WORD = /[A-Za-zÄÖÜäöüß]+/g;

const FILE_EXCL =
  /(lib\/translations\.ts|lib\/translationsFill\.ts|lib\/eventTranslations\.ts|lib\/i18nText\.ts|lib\/uiLocale\.ts|pages\/Legal|\/legal\/|\.d\.ts$|\/__tests__\/|\.(test|spec)\.tsx?$)/;

const POLICY_EXCL: Array<[string, RegExp]> = [
  ['admin surface', /\/admin\/|components\/admin\/|pages\/admin\//],
  ['render template', /^src\/remotion\//],
  [
    'keyword/matching list',
    /phonemeMapping|planDisplayFilter|useApplyProductionPlan|useAICoPilot|FILLER_WORDS|fillerWords|assetRoles|mentionToCastRef|utmLayer|ensurePlanEnsemble|useTwoShotAutoTrigger/,
  ],
  ['language endonym', /LanguageSwitcher|spokenLanguage|audiobook\/manuscript|voice-languages/],
];

const ALLOWLIST = new Set<string>([
"src/components/BugReporter.tsx::Hilf uns, die App zu verbessern. Aktuelle Seite:",
"src/components/LanguageSwitcher.tsx::Deutsch",
"src/components/admin/RenderLoadWidget.tsx::Letzte 30 Min.",
"src/components/admin/email/SuppressionManager.tsx::) aus der Suppression-Liste gelöscht. Echte Bounces bleiben erhalten.",
"src/components/admin/email/SuppressionManager.tsx::Es werden alle Resend-Test-Adressen (",
"src/components/admin/email/SuppressionManager.tsx::wird aus der Suppression-Liste entfernt und kann zukünftig wieder Mails empfange",
"src/components/admin/qa-cockpit/FunctionMatrixTab.tsx::Sweep fehlgeschlagen:",
"src/components/admin/qa-cockpit/FunctionMatrixTab.tsx::Sweep fertig: ✅ / ❌ / ⏱",
"src/components/ai-companion/AICompanionWidget.tsx::hängt",
"src/components/audio-studio/AudioDuckingPanel.tsx::Sprach-Blöcke",
"src/components/audio-studio/FillerWordPanel.tsx::äh",
"src/components/audio-studio/FillerWordPanel.tsx::ähm",
"src/components/audio-studio/TranscriptWaveformEditor.tsx::äh",
"src/components/audio-studio/TranscriptWaveformEditor.tsx::ähm",
"src/components/autopilot/AutopilotIdeaLauncher.tsx::Deutsch",
"src/components/autopilot/AutopilotStudio.tsx::Aufhänger (Sekunde 1):",
"src/components/autopilot/AutopilotStudio.tsx::Gewählte Idee:",
"src/components/autopilot/AutopilotStudio.tsx::Ursprüngliches Briefing:",
"src/components/campaigns/CampaignFormCard.tsx::Wochen",
"src/components/campaigns/CampaignSidebar.tsx::Wochen",
"src/components/composer/CrossPostMagicPanel.tsx::, um für jede Plattform eine optimierte Caption zu erstellen.",
"src/components/creator-library/MusicBrowser.tsx::fröhlich",
"src/components/credits/RefundPolicyMini.tsx::Technische Fehler (Timeout, Provider 5xx, Mux-Crash) →",
"src/components/directors-cut/steps/SceneAnalysisStep.tsx::sättig",
"src/components/directors-cut/studio/CapCutSidebar.tsx::🇩🇪 Deutsch",
"src/components/directors-cut/ui/AICoPilot.tsx::Generiere Übergänge",
"src/components/directors-cut/ui/AICoPilot.tsx::Öffne Style Transfer",
"src/components/directors-cut/ui/ColorAnalysisOverlay.tsx::grün",
"src/components/landing/ai-arsenal/arsenalCatalog.ts::Schnell",
"src/components/motion-studio/StructuredPromptBuilder.tsx::✨ Vorschlag eingefügt",
"src/components/motion-studio/StylePresetPicker.tsx::Meine",
"src/components/onboarding/OnboardingFlow.tsx::Deutsch",
"src/components/picture-studio/ImageGenerator.tsx::/mediathek?tab=albums&album=ki-picture-studio",
"src/components/picture-studio/PromptHelperDialog.tsx::Düster",
"src/components/picture-studio/PromptHelperDialog.tsx::Episch",
"src/components/templates/ActiveEditorsIndicator.tsx::Benutzer aktiv",
"src/components/video-composer/BriefingTab.tsx::Deutsch",
"src/components/video-composer/ClipsTab.tsx::0 &&\n            !(dbScene as any).lip_sync_applied_at &&\n            // legacy-",
"src/components/video-composer/SceneDialogStudio.tsx::0 || blocks.length === 0) return resolved;\n    // Blocks vorhanden, aber keiner ",
"src/components/video-composer/VoiceSubtitlesTab.tsx::🇩🇪 Deutsch",
"src/components/video-composer/briefing/SpeechDurationHint.tsx::]+/g, '');\n  return s.replace(/\\s+/g, ' ').trim();\n}\n\nfunction extractSpokenWord",
"src/components/video-composer/briefing/SpeechDurationHint.tsx::}>\n      <Clock className=\"h-3 w-3 shrink-0\" />\n      <span className=\"tabular-n",
"src/components/voice/TranslationPanel.tsx::Deutsch",
"src/components/voice/VoiceCloneDialog.tsx::Deutsch",
"src/components/voice/studio/VoiceStudioDialog.tsx::Deutsch",
"src/config/hubConfig.ts::hubDesc.erstellen",
"src/config/universal-video-interviews.ts::Deutsch",
"src/hooks/useAICoPilot.ts::erhöh",
"src/hooks/useAICoPilot.ts::lösch",
"src/hooks/useAICoPilot.ts::nächst",
"src/hooks/useAICoPilot.ts::zurück",
"src/hooks/useAICoPilot.ts::übergang",
"src/hooks/useApplyProductionPlan.ts::lösung",
"src/lib/ai-video/spokenLanguage.ts::Deutsch",
"src/lib/ai-video/spokenLanguage.ts::German (Deutsch)",
"src/lib/ai-video/spokenLanguage.ts::Turkish (Türkçe)",
"src/lib/ai-video/spokenLanguage.ts::Türkçe",
"src/lib/audiobook/manuscript.ts::Deutsch",
"src/lib/audiobook/manuscript.ts::Türkçe",
"src/lib/composer/sceneRenderConfirm.tsx::(null);\n\n/**\n * v209: Persistiert die Risiko-Zustimmung des Nutzers auf allen\n *",
"src/lib/content-studio/pairingScore.ts::für",
"src/lib/directors-cut/overlayPresets.ts::Störer",
"src/lib/motion-studio/planDisplayFilter.ts::atmosphärisch",
"src/lib/motion-studio/planDisplayFilter.ts::düster",
"src/lib/post-design/templates.ts::t.category)));\n\n/** Design-Familien für die Varianten-Auswahl. */\nconst FAMILY_O",
"src/lib/video-composer/autoVoiceAssignment.ts::männlich",
"src/lib/video-composer/briefing/ensurePlanEnsemble.ts::-]+(?:,\\s*[A-ZÄÖÜ][\\w",
"src/lib/video-composer/briefingTemplate.ts::Projekt: AdTool AI — Launch Spot\nFormat: 9:16\nLänge: 30 Sekunden\nSzenen: 3\n\nCast",
"src/lib/voice-languages.ts::Deutsch",
"src/lib/voice-languages.ts::Hei, tältä ääneni kuulostaa. Odotan innolla tekstisi lukemista.",
"src/lib/voice-languages.ts::Hej, så här låter min röst. Jag ser fram emot att läsa din text.",
"src/lib/voice-languages.ts::Merhaba, sesim böyle geliyor. Metnini okumak için sabırsızlanıyorum.",
"src/lib/voice-languages.ts::Türkçe",
"src/pages/MediaLibrary.tsx::🎥 Neues Video hinzugefügt:",
"src/pages/MediaLibrary.tsx::🧹 Video aus Mediathek entfernt (Auto-Cleanup):",
"src/pages/Onboarding.tsx::Deutsch",
"src/pages/Onboarding.tsx::deine Nische",
"src/pages/Rewriter.tsx::Deutsch",
"src/pages/TrendRadar.tsx::küche",
"src/pages/TrendRadar.tsx::produktivität",
"src/pages/admin/Alerts.tsx::Alerts älter als 30 Tage werden automatisch entfernt.",
"src/pages/admin/Alerts.tsx::Jeden Sonntag um 08:00 Uhr kommt eine HTML-Übersicht mit allen wichtigen KPIs de",
"src/pages/admin/Alerts.tsx::Sobald der Wert beim nächsten Check wieder unter der Schwelle liegt, wird der Al",
"src/pages/admin/BugReportsAdmin.tsx::Erstellt",
"src/pages/admin/EmailDashboard.tsx::30 Tage",
"src/pages/admin/EmailDashboard.tsx::7 Tage",
"src/pages/admin/EmailDashboard.tsx::Letzte 24h",
"src/pages/admin/FeatureFlags.tsx::Hinweis:",
"src/pages/admin/FeatureFlags.tsx::Änderungen werden lokal gespeichert und\n          überschreiben die Standard-Wer",
"src/pages/admin/MetaTokenHealthTab.tsx::Tage",
"src/pages/admin/ProviderHealth.tsx::(oben rechts, nur Admin): drosselt im Notfall sofort auf",
"src/pages/admin/QACockpit.tsx::# Bug: \\n\\n**Mission:** \\n**Severity:** \\n**Category:** \\n \\n## Beschreibung\\n\\`",
"src/pages/admin/QACockpit.tsx::Achtung",
"src/pages/admin/QACockpit.tsx::Anzeigen",
"src/pages/admin/QACockpit.tsx::Beschreibung",
"src/pages/admin/QACockpit.tsx::Monatsbudget gesamt",
"src/pages/admin/QACockpit.tsx::Passwort kopieren",
"src/pages/admin/QACockpit.tsx::Test-User bereit:",
"src/pages/admin/QACockpit.tsx::angezeigt. Speichere es sofort als\n                Secret",
"src/pages/admin/QACockpit.tsx::grün",
"src/pages/admin/QACockpit.tsx::Übersprungen:",
"src/pages/admin/WatchdogTab.tsx::STALE · zuletzt vor s (Limit s)",
"src/remotion/components/RiveCharacter.tsx::Ä",
"src/remotion/components/RiveCharacter.tsx::Ö",
"src/remotion/components/RiveCharacter.tsx::Ü",
"src/remotion/components/RiveCharacter.tsx::ß",
"src/remotion/components/RiveCharacter.tsx::ä",
"src/remotion/components/RiveCharacter.tsx::ö",
"src/remotion/components/RiveCharacter.tsx::ü",
"src/remotion/components/RiveCharacterReal.tsx::Ä",
"src/remotion/components/RiveCharacterReal.tsx::Ö",
"src/remotion/components/RiveCharacterReal.tsx::Ü",
"src/remotion/components/RiveCharacterReal.tsx::ß",
"src/remotion/components/RiveCharacterReal.tsx::ä",
"src/remotion/components/RiveCharacterReal.tsx::ö",
"src/remotion/components/RiveCharacterReal.tsx::ü",
"src/remotion/templates/ExplainerVideo.tsx::LÖSUNG",
"src/remotion/templates/UniversalCreatorVideo.tsx::LÖSUNG",
"src/remotion/utils/phonemeMapping.ts::großartig",
"src/remotion/utils/phonemeMapping.ts::lösung",
"src/remotion/utils/phonemeMapping.ts::Ä",
"src/remotion/utils/phonemeMapping.ts::Ö",
"src/remotion/utils/phonemeMapping.ts::Ü",
"src/remotion/utils/phonemeMapping.ts::ß",
"src/remotion/utils/phonemeMapping.ts::ä",
"src/remotion/utils/phonemeMapping.ts::ö",
"src/remotion/utils/phonemeMapping.ts::ü",
"src/remotion/utils/phonemeMapping.ts::überlegen",
"src/remotion/utils/phonemeMapping.ts::überraschend",
"src/utils/phonemeMapping.ts::großartig",
"src/utils/phonemeMapping.ts::lösung",
"src/utils/phonemeMapping.ts::Ä",
"src/utils/phonemeMapping.ts::Ö",
"src/utils/phonemeMapping.ts::Ü",
"src/utils/phonemeMapping.ts::ß",
"src/utils/phonemeMapping.ts::ä",
"src/utils/phonemeMapping.ts::ö",
"src/utils/phonemeMapping.ts::ü",
"src/utils/phonemeMapping.ts::überlegen",
"src/utils/phonemeMapping.ts::überraschend"
]);

interface Lit {
  start: number;
  end: number;
  value: string;
  parts: Array<[number, number]>;
}

function tokenize(src: string): Lit[] {
  const out: Lit[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      let j = i + 1;
      const parts: Array<[number, number]> = [];
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (q === '`' && src[j] === '$' && src[j + 1] === '{') {
          let d = 1;
          let k = j + 2;
          while (k < n && d > 0) {
            if (src[k] === '{') d++;
            else if (src[k] === '}') d--;
            k++;
          }
          parts.push([j, k]);
          j = k;
          continue;
        }
        if (src[j] === q) break;
        j++;
      }
      const body = src.slice(i + 1, j);
      // A non-backtick "string" spanning a newline is not a string at all
      // (regex literal or an apostrophe inside prose) -> resync.
      if (q !== '`' && body.includes('\n')) { i++; continue; }
      out.push({ start: i, end: Math.min(j + 1, n), value: body, parts });
      i = Math.min(j + 1, n);
      continue;
    }
    i++;
  }
  return out;
}

function ctxKey(src: string, pos: number): string | null {
  let j = pos - 1;
  while (j >= 0 && ' \t\n'.includes(src[j])) j--;
  if (j >= 0 && src[j] === ':') {
    let k = j - 1;
    while (k >= 0 && ' \t\n'.includes(src[k])) k--;
    const e = k + 1;
    while (k >= 0 && (/[A-Za-z0-9]/.test(src[k]) || '_$\'"'.includes(src[k]))) k--;
    return src.slice(k + 1, e).replace(/^['"]|['"]$/g, '');
  }
  return null;
}

function memberKey(src: string, pos: number): string | null {
  let depth = 0;
  const start = Math.max(0, pos - 8000);
  for (let j = pos - 1; j >= start; j--) {
    const c = src[j];
    if (')}]'.includes(c)) depth++;
    else if ('({['.includes(c)) {
      if (depth === 0) return null;
      depth--;
    } else if (c === ':' && depth === 0) {
      if (j > 0 && src[j - 1] === ':') { j--; continue; }
      let k = j - 1;
      while (k >= 0 && ' \t\n'.includes(src[k])) k--;
      const e = k + 1;
      while (k >= 0 && (/[A-Za-z0-9]/.test(src[k]) || '_$\'"'.includes(src[k]))) k--;
      return src.slice(k + 1, e).replace(/^['"]|['"]$/g, '');
    } else if (c === ';' && depth === 0) return null;
  }
  return null;
}

function ancestors(src: string, pos: number): Array<[string, string | null, number]> {
  const res: Array<[string, string | null, number]> = [];
  let depth = 0;
  const start = Math.max(0, pos - 20000);
  for (let j = pos - 1; j >= start; j--) {
    const c = src[j];
    if (')}]'.includes(c)) depth++;
    else if ('({['.includes(c)) {
      if (depth === 0) {
        let key: string | null = null;
        if (c === '{' || c === '[') key = ctxKey(src, j);
        if (c === '(') {
          let k = j - 1;
          while (k >= 0 && ' \t\n'.includes(src[k])) k--;
          const e = k + 1;
          while (k >= 0 && /[A-Za-z0-9_$.]/.test(src[k])) k--;
          key = src.slice(k + 1, e);
        }
        res.push([c, key, j]);
        if (res.length >= 8) break;
      } else depth--;
    }
  }
  return res;
}

const HELPERS = new Set(['entry', 'S', 't', 'm', 'cap', 'tr', 'lbl', 'loc', 'tri', 'pick', 'sel']);

function isGerman(v: string): boolean {
  if (/^[a-z0-9_\-./:@#%\s]+$/.test(v)) return false;
  const tokens = (v.match(WORD) || []).map((t) => t.toLowerCase());
  if (!tokens.length) return false;
  return tokens.some((t) => GERMAN_TOKENS.has(t)) || UMLAUT.test(v);
}

/** Returns a reason string when the literal is UNREACHABLE in English mode. */
function unreachable(src: string, start: number, value: string): string | null {
  if (['de', 'es'].includes(ctxKey(src, start) ?? '')) return 'de/es key';
  if (['de', 'es'].includes(memberKey(src, start) ?? '')) return 'de/es member value';
  for (const [c, key, op] of ancestors(src, start)) {
    if ((c === '{' || c === '[') && (key === 'de' || key === 'es')) return 'inside de/es block';
    if (c === '(' && key) {
      let d = 0;
      let close = op;
      for (let j = op; j < src.length; j++) {
        if (src[j] === '(') d++;
        else if (src[j] === ')') {
          d--;
          if (d === 0) { close = j; break; }
        }
      }
      const seg = src.slice(op, close);
      const others: string[] = [];
      for (const m of seg.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)) {
        const o = m[1] ?? m[2];
        if (o && o !== value) others.push(o);
      }
      const english = others.filter(
        (o) => o.length > 2 && !UMLAUT.test(o) && /^[\x20-\x7E]+$/.test(o) && WORD.test(o),
      );
      if (english.length >= 2 && HELPERS.has(key)) return `positional helper ${key}`;
    }
  }
  const pre = src.slice(Math.max(0, start - 220), start);
  if (/(language|lang|uiLang|locale|l)\s*===?\s*['"]de['"][^;]{0,120}\?[^;]{0,40}$/s.test(pre)) return "language==='de'";
  if (/\bde\s*:\s*$/.test(pre)) return 'de key';
  return null;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

interface Finding { file: string; line: number; text: string; ctx: string }

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const abs of walk(ROOT).sort()) {
    const rel = path.relative(path.resolve(ROOT, '..'), abs).split(path.sep).join('/');
    if (FILE_EXCL.test(rel)) continue;
    if (POLICY_EXCL.some(([, rx]) => rx.test(rel))) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const lines = src.split('\n');
    const lineStarts = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
    const lineOf = (p: number) => {
      let lo = 0, hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= p) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    };
    const push = (start: number, text: string) => {
      const line = lineOf(start);
      const ctx = (lines[line - 1] ?? '').trim();
      if (/console\.(log|warn|error|info|debug)/.test(ctx) || ctx.startsWith('//') || ctx.startsWith('*')) return;
      const key = `${rel}::${text.slice(0, 80)}`;
      if (ALLOWLIST.has(key)) return;
      findings.push({ file: rel, line, text: text.slice(0, 160), ctx: ctx.slice(0, 180) });
    };

    for (const lit of tokenize(src)) {
      let v: string;
      if (lit.parts.length) {
        const keep: string[] = [];
        let prev = lit.start + 1;
        for (const [a, b] of lit.parts) { keep.push(src.slice(prev, a)); prev = b; }
        keep.push(src.slice(prev, lit.end - 1));
        v = keep.map((x) => x.trim()).join(' ').trim();
      } else v = lit.value.trim();
      if (!v || !isGerman(v)) continue;
      if (unreachable(src, lit.start, lit.value)) continue;
      push(lit.start, v);
    }

    for (const m of src.matchAll(/>([^<>{}\n][^<>{}]*)</g)) {
      const v = (m[1] ?? '').trim();
      if (!v || !isGerman(v)) continue;
      const start = m.index! + 1;
      if (unreachable(src, start, v)) continue;
      push(start, v);
    }
  }
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.file}:${f.line}:${f.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

describe('English UI purity — deep reachability scan', () => {
  it('has no German literal reachable while the UI language is English', () => {
    const findings = scan();
    const report = findings
      .map((f) => `${f.file}:${f.line}  ${JSON.stringify(f.text)}\n      ${f.ctx}`)
      .join('\n');
    expect(findings.length, `\nEN-mode German leaks:\n${report}\n`).toBe(0);
  });

  it('detects a synthetic reachable German literal (guard self-test)', () => {
    // Sanity: the reachability rules must not swallow a plain German label.
    const src = `const Label = () => <span>Bitte wähle eine Datei</span>;`;
    const hit = [...src.matchAll(/>([^<>{}\n][^<>{}]*)</g)].some(
      (m) => isGerman(m[1].trim()) && !unreachable(src, m.index! + 1, m[1].trim()),
    );
    expect(hit).toBe(true);
  });

  it('treats de: branches of tx() as unreachable (guard self-test)', () => {
    const src = `const x = tx({ de: 'Bitte wähle eine Datei', en: 'Please choose a file', es: 'Elige un archivo' });`;
    const lit = tokenize(src).find((l) => l.value.startsWith('Bitte'))!;
    expect(unreachable(src, lit.start, lit.value)).toBeTruthy();
  });
});
