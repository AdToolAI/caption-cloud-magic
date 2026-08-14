# v430 Schritt 6.3 — Kundensprache (nur Darstellung)

Erst 6.2-Nachzug (Contract-Kommentar), dann 6.3. Keine Backend-Semantik, keine DB-Felder, keine Lip-Sync-Writer, keine internen Umbenennungen.

## Teil 0 — 6.2-Nachzug (klein)

- **Build-Blocker zuerst**: `VideoComposerDashboard.tsx:857` liest `s.cutStyle` auf einer
  `TemplateSceneSuggestion` — dieses Feld heißt dort `transitionType` (TS2339). Genau die
  Template-Grenze, die du beschreibst: explizite Überführung
  `cutStyle: (s.transitionType ?? 'crossfade')` mit Grenz-Kommentar.
- `src/types/motion-studio-templates.ts`: Contract-Kommentar über `transitionType`:
  externes Template-Schema, kein Composer-Domain-Feld; Überführung in eine `ComposerScene`
  ausschließlich explizit an der Template-Grenze bzw. über die `cutStyle`-Mapper.
- Test in `cutStyle.test.ts`: kein Consumer spreadet ein Template-Objekt in ein Scene-Literal
  bzw. schleppt `transitionType` in Composer-Domain-Dateien ein (Scanner-Erweiterung).

## Teil 1 — Zentraler Fehler-Presenter (reine Darstellung)

Neu: `src/lib/composer/errors/sceneErrorPresenter.ts` (pure, keine Imports aus UI/DB).

```text
presentSceneError(rawClipError, ctx) -> {
  kind: 'known' | 'unknown' | 'none',
  code: string | null,      // exakt extrahierter Code, nur für Debug/Badge
  headline: string,         // lokalisiert, kundentauglich
  hint?: string,            // konkrete Handlung, falls definiert
  autoRetryHint: boolean,   // nur Anzeige, steuert keine Logik
  raw: string               // ungekürzter Rohtext für Debug/Details
}
```

Regeln:
- Erkennung ausschließlich über eine explizite Code-Tabelle: exakte Codes und definierte
  Präfixe (`anchor_*`, `source_clip_missing_speakers`, `syncso_*`, `lipsync_pass_N_failed`,
  `twoshot_audio_prep_failed`, `dialog_too_long_for_plate`, `watchdog_*`, `auto-retry:` …)
  sowie der offizielle Provider-Code aus `[code]`. Keine Freitext-/Substring-Heuristik, die
  einen Backend-Fehler semantisch umdeutet; alles, was nicht in der Tabelle steht, ist `unknown`.
- `unknown` → neutraler Fallback („Diese Szene konnte nicht fertiggestellt werden. Bitte erneut
  rendern." / EN / ES) + Rohtext nur im Details-Bereich.
- `autoRetryHint` übernimmt exakt die heutigen Bedingungen aus `ComposerSequencePreview`;
  keine Aktion, kein Gate und kein Trigger hängt daran.
- Codes/Rohtexte werden nie umbenannt oder normalisiert — sie werden nur nicht mehr als
  Hauptbotschaft angezeigt.

Umbau der Leser (nur Anzeige):
- `ComposerSequencePreview.tsx`: Inline-Tabelle (Zeilen ~1255–1310) entfällt, Badge nutzt
  `headline`; Code-Chip und `title`-Tooltip bleiben als Debug-Detail.
- `SceneInlinePlayer.tsx`, `SceneCard.tsx`, `SceneClipProgress.tsx`, `ClipsTab.tsx`,
  `RenderPreFlightDialog.tsx`, `AnchorPreviewGate.tsx`, `usePipelineProgress.ts`:
  Fehlertexte kommen aus dem Presenter statt aus lokalen Ternär-Ketten.

## Teil 2 — Begriffs-Sweep in der normalen UI

Nur sichtbare Strings (`tx({…})`, `t(…)`, JSX-Text, Toasts, Tooltips):

| intern (bleibt) | Kundensprache |
| --- | --- |
| Plate / Master Plate | Basis-Clip |
| Two-Shot / Dialog-Shot-Pipeline | Dialogszene |
| Cinematic-Sync | Lippensynchronisation (Lip-Sync) |
| Sync.so / Hailuo / HappyHorse in Fehlermeldungen | Lip-Sync-Dienst |
| `twoshot_stage`, `syncso_*`, `plate_*` als Text | ersetzt durch Statusklartext |

Betroffen u. a.: `StageStoryboardLoader.tsx`, `ProductionWarRoom.tsx`, `SceneDialogStudio.tsx`
(Kosten-/Modus-Labels), `ClipsTab.tsx` (Toasts), `RenderPreFlightDialog.tsx`, `SceneCard.tsx`
(Sprecher-Tooltip), `useTwoShotAutoTrigger.ts` (Toast-Titel).

Nicht angefasst: Variablen, Hooks, Dateinamen, DB-Spalten, Edge-Functions, Log-Strings,
`DebugLipsync.tsx`, `RenderQueue.tsx`, Details-/Debug-Bereiche und Tooltips mit Rohcode.

## Teil 3 — Guard

Erweiterung des bestehenden Contract-Scanners: verbotene Begriffe in sichtbaren Strings der
Composer-UI-Dateien (Allowlist für Debug-Seiten und Detail-Panels, zeilenbezogener Marker
`// customer-language-exempt:` für begründete Ausnahmen).

## Technische Details

- Presenter ist pure und getestet: Known-Code-Tabelle vollständig, Unknown-Fallback,
  Provider-Code-Extraktion, `raw` bleibt unverändert, Lokalisierung DE/EN/ES.
- Keine Änderung an `sceneState.ts`, `resolveSceneOutput.ts`, Continuity, Writer-Allowlist.
- Abschluss: neue Presenter-Tests + Begriffs-Guard + volle Vitest-Suite + `tsgo` + UI-Smoke,
  danach STOP mit Bericht (Liste aller geänderten sichtbaren Strings, verbleibende Rohcode-Stellen).
