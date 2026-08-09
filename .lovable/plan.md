# Sprachprüfung Runde 7 — letzte deutsche Reste in der englischen UI

Der letzte Durchlauf ist grün (Build, Typecheck, i18n-Guard). Ein erneuter Vollscan über `src/` und `supabase/functions/` findet noch 217 verdächtige Stellen in 91 Dateien. Sie fallen in vier klar getrennte Gruppen.

## Gruppe A — Sichtbare UI-Strings im Frontend (30 Stellen, 25 Dateien)

Reine Toasts, Labels und Leerzustände, die noch hart auf Deutsch stehen. Beispiele:

- Upload-Fehler: "Datei zu groß" (`LogoAnalyzer`, `LocationEditor`, `SceneAvatarMode`, `SceneMediaUpload`, `SceneReferenceImageUpload`)
- Timeline/Composer-Toasts: "… zur Timeline hinzugefügt" (`CapCutSidebar`, `TimelineScriptEditor`), "… Datei(en) hinzugefügt" (`CampaignMediaUploader`)
- Leerzustände: "Keine Presets verfügbar", "Keine Beschreibung verfügbar", "Kein Anker-Frame verfügbar", "Keine freien AI-Slots verfügbar"
- Hinweise/Strategie: `StrategyContextPanel`, `Autopilot` (2), `ProfileTab`, `SupportWizard`, `SlashCommandHandler`, `ToolkitGenerator`, `storylineContent`, `sceneEngineRouter`, `ProductionPlanSheet` (2), `useNLEExport` (2), `useRenderQueue`, `SceneClipProgress`, `StudioMode`

Alle werden auf das bestehende `tx({ de, en, es })` umgestellt.

## Gruppe B — Backend-Meldungen, die im UI landen

Fehler- und Statustexte aus Edge Functions, die als Toast oder `clip_error` beim Nutzer ankommen und noch einsprachig sind — u. a. `compose-dialog-segments` (Lip-Sync-Fehler, Credit-Hinweise), `director-cut-transitions`, `director-cut-interpolation`, `director-cut-smart-crop`, `generate-post-v2`, `render-with-remotion`, `companion-diagnose`, `calculate-cost-savings`, `select-optimal-engine`, `ai-companion`.

Diese Dateien nutzen bereits den `tl({ de, en, es })`-Helper; die verbliebenen Stellen werden nachgezogen. Rein interne Log-Zeilen bleiben unverändert.

## Gruppe C — Mail-Templates

`process-activation-emails`, `process-winback-emails`, `process-verify-reminders`, `send-verification-email`, `_shared/lifecycle-emails`, `_shared/drip-templates` haben bereits eine `lang`-Struktur. Geprüft wird, ob jeder Baustein (Betreff, Body, CTA, Unsubscribe) auch in `en`/`es` vollständig ist; fehlende Slots werden ergänzt.

## Gruppe D — KI-Prompts (bewusst separat)

`generate-universal-script`, `autopilot-treatment`, `autopilot-analyze-asset`, `universal-video-consultant`, `analyze-script-for-video`, `_shared/generate-script-inline` enthalten deutschsprachige Prompt-Anweisungen (Pacing-Guides, Rollenbeschreibungen). Risiko: das Modell antwortet für EN-Nutzer teilweise auf Deutsch. Diese Anweisungstexte werden auf Englisch umgestellt, während die Zielsprache weiterhin über die vorhandene `language`-Variable gesteuert wird. Visuelle Prompts bleiben wie festgelegt Englisch.

Testdateien und Code-Kommentare bleiben unangetastet.

## Technische Details

- Frontend: `tx()` aus `@/lib/i18nText`, Imports werden mitgeführt.
- Backend: vorhandener `tl()`-Helper.
- Nach jeder Gruppe: `bunx tsgo --noEmit`, `node scripts/check-i18n-consistency.mjs`, abschließend `bun run build:dev` und `brand-consistency.test.ts`.
- Der i18n-Guard wird um eine Regel erweitert, die neue hart kodierte deutsche Strings in `src/` meldet, damit Runde 8 nicht nötig wird.
