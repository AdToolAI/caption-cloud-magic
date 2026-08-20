import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Strict English-UI purity companion guard.
 *
 * The original `english-ui-purity` test used a 60-line lookback window when
 * deciding whether a German literal sits inside an explicit language branch.
 * That window is far too generous: German display values inside config arrays
 * (`tags`, `tagline`, `category`), toast titles, template-literal fragments and
 * raw `.labelDe` / `.hintDe` renders all slipped through because *some* nearby
 * line happened to contain a `tx(` call.
 *
 * This guard is deliberately line-local: a banned German word is an offender
 * unless the very same line performs a language selection.
 */

const SRC = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = [
  path.join(SRC, 'components', 'admin'),
  path.join(SRC, 'pages', 'admin'),
  path.join(SRC, 'test'),
];

const EXCLUDED_FILES = new Set(
  [
    // Translation dictionaries and i18n plumbing.
    'lib/translations.ts',
    'lib/translationsFill.ts',
    'lib/eventTranslations.ts',
    'lib/i18nText.ts',
    'lib/uiLocale.ts',
    // Explicit single-language template / prompt resources.
    'lib/video-composer/briefingTemplate.ts',
    // Dev-only demo surface, not ordinary creator UI.
    'pages/FeatureFlagDemo.tsx',
  ].map((p) => path.join(SRC, p)),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.some((d) => full === d || full.startsWith(d + path.sep))) continue;
      if (entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      if (EXCLUDED_FILES.has(full)) continue;
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);

/** Same-line language selection — the only accepted escape hatch. */
const LANG_SELECT =
  /(\btx\(|\buseTx\b|pickText\(|\bde:\s|\bes:\s|language\s*===|lang\s*===|locale\s*===|\bt\(\s*['"]|TriText)/;

/** Non-UI lines: comments, logging, imports. */
function isIgnorableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (/^\{\s*\/\*.*\*\/\s*\}$/.test(trimmed)) return true; // JSX comment, never rendered
  if (/\bconsole\.(log|debug|info|warn|error)\b/.test(trimmed)) return true;
  if (/^import\s|^export\s+\*|^export\s+\{/.test(trimmed)) return true;
  return false;
}

/**
 * Vocabulary of German words confirmed to have leaked into the English UI as
 * bare display literals (status labels, template tags, step hints, taglines,
 * interpolated fragments, badge categories).
 */
const BANNED_WORDS = [
  'Aktiv',
  'Inaktiv',
  'ausgewählt',
  'Rückgängig',
  'hinzugefügt',
  'Schnell',
  'Schneller',
  'Schnellster',
  'Energetisch',
  'Elegant',
  'Professionell',
  'Authentisch',
  'Rhythmisch',
  'Intensiv',
  'Kreativ',
  'Informativ',
  'Ruhig',
  'Fokussiert',
  'Geplant',
  'Entwurf',
  'Erweitert',
  'Stil',
  'Feintuning',
  'Störer',
  'Schild',
  'Marke',
  'Zitat',
  'Versionen',
  'Prüfung',
  'fehlend',
  'doppelt',
  'Übergang',
  'übersprungen',
  'Ziel',
  'Zielgruppe',
  'Tonalität',
  'Bewegungen',
  'Gesichter',
  'natives',
  'nachgeladen',
  'übernommen',
  'Charaktere',
  'ältere',
  'Ältere',
];

const BANNED = new RegExp(`(?<![\\w-])(${BANNED_WORDS.join('|')})(?![\\w-])`);

/**
 * Out-of-gate residuals, keyed by `relativePath::trimmedLineText` (line-number
 * independent). These are pre-existing German literals in surfaces NOT part of
 * the "auth-gated English UI cleanup" gate. They are enumerated explicitly so
 * the guard stays green for the surfaces already cleaned while making it
 * impossible to add a NEW bare German literal anywhere. Entries must be
 * removed — never added — as follow-up localization gates land.
 */
const OUT_OF_GATE_RESIDUALS = new Set<string>([
  "components/ai-companion/CompanionSettings.tsx::{ value: 'professional', label: '💼 Professionell' },",
  "components/ai-video/AIVideoDisclaimer.tsx::'Für mittelbare Schäden, entgangenen Gewinn, Reputationsverluste oder Folgeschäden jeglicher Art wird keine Haftung übernommen.',",
  "components/ai-video/AIVideoDisclaimer.tsx::'KI-generierte Inhalte können unbeabsichtigt geschütztes Material reproduzieren. Vor kommerzieller Nutzung ist eine rechtliche Prüfung empfo",
  "components/ai-video/MultiReferenceUploader.tsx::? `${brandCharacterName ?? 'Brand Character'} hinzugefügt`",
  "components/ai-video/ToolkitGenerator.tsx::? 'Kling Omni erlaubt max. 2 sprechende Charaktere pro Clip.'",
  "components/analytics/EngineComparison.tsx::<p className=\"text-sm text-muted-foreground mb-1\">🏃 Schnellster</p>",
  "components/audio-studio/AudioBeforeAfterComparison.tsx::🔊 Aktiv",
  "components/autopilot/AutopilotIdeaLauncher.tsx::<p className=\"text-xs text-muted-foreground\">Charaktere sprechen sichtbar</p>",
  "components/autopilot/AutopilotStudio.tsx::`Tonalität: ${round.strategy.tone}`,",
  "components/autopilot/AutopilotStudio.tsx::`Zielgruppe: ${round.strategy.audience}`,",
  "components/brand/BrandVoiceAnalyzer.tsx::<p className=\"text-sm font-medium text-muted-foreground\">Stil</p>",
  "components/brand/MultiBrandManager.tsx::Aktiv",
  "components/brand/OnboardingWizard.tsx::{ value: \"elegant\", label: \"Elegant\", emoji: \"💎\" }",
  "components/calendar/PostComposerPanel.tsx::{ id: \"professional\", label: \"Professionell\" },",
  "components/content-studio/CoachPanel.tsx::message: `${question}\\n\\n--- Aktueller Entwurf ---\\n${draftContext()}`,",
  "components/directors-cut/features/AIColorGrading.tsx::<Badge className=\"absolute top-1 right-1 h-4 px-1 text-[8px]\">Aktiv</Badge>",
  "components/directors-cut/studio/CapCutSidebar.tsx::<summary className=\"text-[10px] text-white/30 cursor-pointer hover:text-white/50\">Erweitert</summary>",
  "components/directors-cut/ui/MotionIntensityOverlay.tsx::<span className=\"text-[9px] text-muted-foreground\">Intensiv</span>",
  "components/directors-cut/ui/MotionIntensityOverlay.tsx::<span className=\"text-[9px] text-muted-foreground\">Ruhig</span>",
  "components/landing/BlackTieHero.tsx::{/* Headline - Elegant Serif with Gold Gradient */}",
  "components/landing/ai-arsenal/arsenalCatalog.ts::\"Flaggschiff-Motion-Modell — natives Lip-Sync und Pro-Charakterausdruck.\",",
  "components/landing/ai-arsenal/arsenalCatalog.ts::\"Persistente Charaktere über alle Studios hinweg.\",",
  "components/landing/ai-arsenal/arsenalCatalog.ts::\"Sprechende Charaktere direkt im Modell, pro Sprecher.\",",
  "components/landing/ai-arsenal/arsenalCatalog.ts::\"xAIs ausdrucksstarkes Video-Modell mit unverkennbarem Stil.\",",
  "components/landing/ai-arsenal/arsenalCatalog.ts::const FAST = cap(\"Fast\", \"Schnell\", \"Rápido\");",
  "components/landing/storylines/storylineContent.ts::[\"Ein Hook. Eine Marke. In Minuten.\", \"One hook. One brand. In minutes.\", \"Un gancho. Una marca. En minutos.\"],",
  "components/motion-studio/DirectorPresetPicker.tsx::Aktiv",
  "components/performance/TokenStatusBadge.tsx::Aktiv",
  "components/picture-studio/PromptHelperDialog.tsx::const MOODS = ['Episch', 'Ruhig', 'Dramatisch', 'Hell', 'Düster', 'Verspielt'];",
  "components/planner/MiniCalendar.tsx::<span>Geplant</span>",
  "components/post-designer/VariantGallery.tsx::const STAGES = [\"Motiv\", \"Typografie\", \"Marke\", \"Feinschliff\"];",
  "components/support/SupportWizard.tsx::pastedDesc: \"Aus Zwischenablage übernommen ✓\",",
  "components/template-analytics/ABTestManager.tsx::<Label htmlFor=\"sampleSize\">Ziel Sample Size</Label>",
  "components/universal-video-creator/ConceptReviewEditor.tsx::<FieldLabel>Stil</FieldLabel>",
  "components/universal-video-creator/ConceptReviewEditor.tsx::<FieldLabel>Zielgruppe</FieldLabel>",
  "components/video-composer/AdComplianceDisclaimer.tsx::body: 'Du erstellst einen KI-generierten Werbespot. Bitte verwende keine geschützten Markennamen, Logos oder Tonalitäten Dritter (z. B. konk",
  "components/video-composer/AdDirectorWizard.tsx::<Label htmlFor=\"ad-audience\">Zielgruppe</Label>",
  "components/video-composer/AdDirectorWizard.tsx::<span className=\"text-foreground\">Ziel:</span>{' '}",
  "components/video-composer/AdDirectorWizard.tsx::Format & Ziel",
  "components/video-composer/BriefingTab.tsx::{uiLang === 'de' ? 'Visueller Stil' : uiLang === 'es' ? 'Estilo Visual' : 'Visual Style'}",
  "components/video-composer/CharacterManager.tsx::'Beschreibe markante Kleidung & Objekte ausführlich (Mantel, Krone, Waffe). Die KI wiederholt diese viel zuverlässiger als Gesichter — der Z",
  "components/video-composer/CharacterManager.tsx::empty: 'Keine Charaktere definiert.',",
  "components/video-composer/CharacterManager.tsx::pickerEmpty: 'Noch keine Charaktere in Cast & World.',",
  "components/video-composer/CharacterManager.tsx::title: 'Charaktere (optional)',",
  "components/video-composer/ExportPresetPanel.tsx::{selectedKeys.size} Formate ausgewählt",
  "components/video-composer/ExportPresetPanel.tsx::{selectedKeys.size} Versionen exportieren",
  "components/video-composer/SceneCard.tsx::replaces the former Erweitert toggle + inline Multi-Engine",
  "components/video-composer/SceneDialogStudio.tsx::srsLabel: 'Erweitert: Stattdessen als Voiceover über eine gemeinsame Szene legen',",
  "components/video-composer/ScenePerformancePanel.tsx::none: 'Kein Cast in dieser Szene — weise zuerst im Cast-Tab Charaktere zu.',",
  "components/video-composer/ScenePerformancePanel.tsx::still: 'Ruhig',",
  "components/video-composer/SceneStudioTabBar.tsx::advanced: 'Erweitert',",
  "components/video-composer/SceneStudioTabBar.tsx::advanced: { title: 'Erweitert', sub: 'Final-Prompt, Negative-Prompt und Engine-Vergleich' },",
  "components/video-composer/SceneStudioTabBar.tsx::cast: { title: 'Cast', sub: 'Charaktere in dieser Szene + Face-Lock-Anker' },",
  "components/video-composer/SceneStyleMode.tsx::active: 'Aktiv',",
  "components/video-composer/SceneStyleMode.tsx::activeNone: 'Noch kein Stil gesetzt — wähle einen Look oder feinjustiere unten.',",
  "components/video-composer/SceneStyleMode.tsx::fine: 'Feintuning',",
  "components/video-composer/SceneStyleSheet.tsx::active: 'Aktiv',",
  "components/video-composer/SceneStyleSheet.tsx::activeNone: 'Noch kein Stil gesetzt — wähle einen Look oder feinjustiere unten.',",
  "components/video-composer/SceneStyleSheet.tsx::fine: 'Feintuning',",
  "components/video-composer/SceneStyleSheet.tsx::title: \"Stil ändern\",",
  "components/video-composer/StoryboardTab.tsx::{/* Left: 3-mode editor pane (Editor / Stil / Avatar) */}",
  "components/video-composer/stage/StageStoryboardError.tsx::\"Das Briefing enthält evtl. zu wenig Substanz für ein vollständiges Storyboard. Mehr Kontext (USPs, Zielgruppe, Tonalität) hilft deutlich.\",",
  "components/video-composer/stage/StageStoryboardError.tsx::\"Sehr viele Charaktere oder sehr lange Skripte können Timeouts auslösen — reduziere ggf. die Cast-Größe oder die Video-Länge.\",",
  "components/video-composer/stage/StageStoryboardLoader.tsx::\"Jede Szene kann ein eigenes KI-Modell nutzen — Hailuo für günstige Realfilm-Looks, Kling für komplexe Choreografien, Vidu Q2 wenn mehrere C",
  "components/video-composer/voice-studio/ScriptTagToolbar.tsx::{ label: 'Calm', icon: Leaf, insert: '[soft]', wraps: true, tooltip: 'Ruhig / weich' },",
  "components/video/AIMusicSuggester.tsx::<SelectItem value=\"calm\">Ruhig / Entspannt</SelectItem>",
  "components/video/AIMusicSuggester.tsx::<SelectItem value=\"upbeat\">Upbeat / Energetisch</SelectItem>",
  "components/video/AdvancedVoiceSettings.tsx::Professionell",
  "components/video/ExportOptionsEditor.tsx::<Badge variant=\"secondary\" className=\"ml-2\">Schnell</Badge>",
  "components/video/VersionAnalytics.tsx::Versionen",
  "components/video/VoiceOverEditor.tsx::<span>Schneller (2.0x)</span>",
  "components/voices/UniversalVoiceLibraryPicker.tsx::<SelectItem value=\"characters\">Charaktere</SelectItem>",
  "components/white-label/ColorPresetPalettes.tsx::{ name: 'Elegant', primary: '#f5c76a', secondary: '#d4a853', accent: '#a855f7' },",
  "config/defaultOutfitPresets.ts::en: 'Evening / Elegant',",
  "config/voiceTrainingScripts.ts::hint: \"Sprich in normalem Tempo, natürlich und ruhig. Ziel: 60–90 Sekunden. Ersetze {NAME} durch deinen eigenen Namen.\",",
  "config/wanVideoCredits.ts::EUR: '27B MoE · natives Audio · 1080p',",
  "config/wanVideoCredits.ts::EUR: '27B MoE · natives Audio · 720p',",
  "features/onboarding/Stepper.tsx::label: 'Ziel festlegen',",
  "hooks/useAICoPilot.ts::• 1-6 - Schnell Übergang wählen`,",
  "hooks/useAICoPilot.ts::• T - Übergang bearbeiten",
  "hooks/useFirstVideoPrompts.ts::{ prompt: \"Elegant product shot of a perfume bottle with soft gold light\", prompt_en: \"Elegant product shot of a perfume bottle with soft go",
  "hooks/useFirstVideoPrompts.ts::{ prompt: \"Eleganter Produkt-Shot eines Parfüm-Flakons mit weichem Goldlicht\", prompt_en: \"Elegant product shot of a perfume bottle with sof",
  "hooks/useFirstVideoPrompts.ts::{ prompt: \"Toma elegante de un frasco de perfume con luz dorada suave\", prompt_en: \"Elegant product shot of a perfume bottle with soft gold ",
  "lib/companion/triggerRegistry.ts::body: '5 Charaktere im Ensemble — Zeit für ein Ensemble-Spot mit mehreren Sprechern.',",
  "lib/companion/triggerRegistry.ts::body: 'Hier lebt dein Ensemble. Lege Charaktere, Locations und Requisiten an — sie werden dann in jedem Studio wiederverwendet.',",
  "lib/directors-cut/overlayPresets.ts::category: 'Lower Third' | 'Banner' | 'Störer' | 'Schild' | 'CTA' | 'Ticker' | 'Marke' | 'Callout' | 'Zitat' | 'Info' | 'Text';",
  "lib/directors-cut/overlayPresets.ts::category: 'Marke',",
  "lib/directors-cut/overlayPresets.ts::category: 'Schild',",
  "lib/directors-cut/overlayPresets.ts::category: 'Störer',",
  "lib/directors-cut/overlayPresets.ts::category: 'Zitat',",
  "lib/motion-studio/qualityScore.ts::dialog: { pass: 'Dialog gelockt', warn: 'Dialog Entwurf', fail: 'Voiceover-Timing fehlt' },",
  "lib/post-design/templates.ts::\"Zitat\", \"Zitat\",",
  "lib/video-composer/catalog/index.ts::entry('delivery', 'calm',         'Ruhig',         'Calm',         'calm measured delivery',         ['gelassen','measured']),",
  "lib/video-composer/catalog/index.ts::entry('delivery', 'energetic',    'Energetisch',   'Energetic',    'energetic upbeat delivery',      ['upbeat','schwungvoll']),",
  "lib/video-composer/catalog/index.ts::entry('energy', 'low',       'Ruhig',      'Low',       'calm low energy',             ['2','niedrig']),",
  "lib/video-composer/catalog/index.ts::entry('gestik', 'still',            'Ruhig / still',     'Still',            'still upper body, hands at rest'),",
  "pages/Billing.tsx::active: \"Aktiv\",",
  "pages/BrandKit.tsx::<Label htmlFor=\"audience\">Zielgruppe</Label>",
  "pages/BrandKit.tsx::Aktiv",
  "pages/Carousel.tsx::<SelectItem value=\"elegant\">Elegant</SelectItem>",
  "pages/EmailDirector.tsx::<Label className=\"text-xs\">Ziel</Label>",
  "pages/EmailDirector.tsx::placeholder=\"Worum geht's? Zielgruppe, Angebot, Kontext…\"",
  "pages/MotionStudio/Library.tsx::<title>Motion Studio Library | Charaktere & Locations</title>",
  "pages/MotionStudio/Library.tsx::Charaktere",
  "pages/MotionStudio/Library.tsx::{characters.length} Charaktere · {locations.length} Locations",
  "pages/Onboarding.tsx::{/* Schritt 4: Look & Marke */}",
  "pages/Welcome.tsx::\"Cast & World: eigene Charaktere mit fester Identität\",",
  "pages/Welcome.tsx::sub: \"Ein Creator. Ein ganzes Studio. Ab jetzt läuft alles auf deinem Konto — Skript, Stimmen, Charaktere, Schnitt und Export.\",",
  "types/directors-cut.ts::isFromOriginalVideo?: boolean; // false = neu hinzugefügt",
]);

function key(rel: string, line: string): string {
  return `${rel}::${line.trim().slice(0, 140)}`;
}

function scan(predicate: (line: string) => boolean): string[] {
  const offenders: string[] = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    src.split('\n').forEach((line, idx) => {
      if (isIgnorableLine(line)) return;
      if (!predicate(line)) return;
      const rel = path.relative(SRC, file);
      if (OUT_OF_GATE_RESIDUALS.has(key(rel, line))) return;
      offenders.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  return offenders;
}

describe('English UI purity (strict, line-local)', () => {
  it('has no bare German display literals outside same-line language selection', () => {
    const offenders = scan((line) => BANNED.test(line) && !LANG_SELECT.test(line));
    expect(
      offenders,
      `bare German UI literals — wrap in tx({ de, en, es }):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('never renders raw .labelDe / .hintDe / .descriptionDe in ordinary UI', () => {
    const offenders = scan((line) => /\.(labelDe|hintDe|descriptionDe|titleDe|textDe)\b/.test(line));
    expect(
      offenders,
      `raw German-only display fields rendered without language selection:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('has no German values in non-language display config fields', () => {
    // `tagline`, `tags`, `category`, `label`, `hint` assigned a bare German
    // string literal (no tx()/de:/es: on the same line).
    const configField =
      /\b(tagline|tags|category|label|hint|title|description)\s*:\s*(\[[^\]]*)?['"`][^'"`]*['"`]/;
    const offenders = scan(
      (line) => configField.test(line) && BANNED.test(line) && !LANG_SELECT.test(line),
    );
    expect(
      offenders,
      `German display config values must be localized:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('has no German fragments in variables interpolated into all tx() variants', () => {
    // Pattern: `const x = cond ? ` … German … ` : ''` assigned outside tx().
    const offenders = scan(
      (line) =>
        /^\s*(const|let)\s+\w+\s*=/.test(line) &&
        /[`'"][^`'"]*\$\{/.test(line) &&
        BANNED.test(line) &&
        !LANG_SELECT.test(line),
    );
    expect(
      offenders,
      `localize the fragment before interpolating it into every language variant:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
