# Sprachprüfung Runde 8: letzte deutsche Reste in der englischen UI

Der Konsistenz-Check (`scripts/check-i18n-consistency.mjs`) meldet aktuell "OK" — es gibt also keine kaputten Übersetzungsblöcke mehr. Ein neuer, strengerer Scan über `src/**` findet aber weiterhin fest verdrahtete deutsche Texte, die unabhängig von der Sprachwahl angezeigt werden.

## Befund

Der Scan meldet 110 Dateien. Davon sind zwei Gruppen unkritisch:

- `src/lib/translations.ts` (937 Treffer) — das ist der deutsche Wörterbuchzweig, korrekt.
- Test-Dateien (`__tests__/*`) — landen nie im UI.

Übrig bleiben rund 60 Dateien mit echten, immer deutsch gerenderten Texten, unter anderem:

- Landing/Storylines: `outcomeContent.ts`, `storylineContent.ts`
- Autopilot: `AutopilotBriefWizard`, `AutopilotIdeaLauncher`, `AutopilotStudio`
- Seiten: `InstagramPublishing`, `MusicStudio`, `SocialMediaSettings`
- Dashboard/Planner: `PlatformRingDialog`, `AIRecommendationsOverlay`, `InlineEditor`
- Composer/Studios: `ClipsTab`, `TalkingHeadDialog`, `AutoDirectorWizard`, `StockSearchModal`, `OriginalAudioMixPanel`, `CrossPostMagicPanel`, `LayoutStep`
- Configs: `universal-video-interviews.ts`, `adTonalityProfiles.ts`, `voiceTrainingScripts.ts`, `universal-video-creator.ts`
- Admin: `ProviderHealth`, `Alerts`, `CostMonitor`, `QACockpit`, `SuppressionManager`
- Sonstige: `useCloudStorage`, `consent.ts`, `SaveAsAssetMenu`, `ComingSoonScreen`, `BugReporter`, `ProfileTab`

## Vorgehen

1. **Inventar erstellen**: Scan-Ergebnis um Wörterbuch und Tests bereinigen, Restliste nach Klickpfad priorisieren (öffentlich → Studios → Konto → Admin).
2. **Parallele Pakete**: Die Restdateien in Gruppen abarbeiten; jede Fundstelle bekommt DE/EN/ES über den bestehenden `tx()`-Helfer bzw. das vorhandene `t(language, …)`-Muster. Keine neue i18n-Bibliothek, keine Logikänderung.
3. **Sonderfälle prüfen**:
   - Wörterbuch: `en`- und `es`-Zweige von `translations.ts`/`translationsFill.ts` gegen deutschen Resttext prüfen (vertauschte Sprachfelder).
   - Interview-/Prompt-Configs: nur die dem Nutzer angezeigten Fragen übersetzen, an Modelle gehende Prompts bleiben englisch.
4. **Sichtprüfung**: Hauptrouten mit erzwungener Sprache `en` im Browser aufrufen (Landing, Dashboard, Autopilot, Video Composer, Music/Motion Studio, Planner, Instagram Publishing, Konto, Admin) und die sichtbaren Texte gegenlesen.
5. **Abschluss**: erneuter Scan (Ziel: nur noch Wörterbuch- und Test-Treffer), `scripts/check-i18n-consistency.mjs`, Typecheck und Build müssen grün sein.

## Technische Details

- Helfer bleibt `src/lib/i18nText.ts` (`tx` / `useTx`); vorhandene lokale `t(language, en, de, es)`-Muster werden beibehalten, nicht umgeschrieben.
- Reine Konsolen-Logs, Kommentare, Doku- und Memory-Dateien werden nicht angefasst.
- Visuelle/Modell-Prompts bleiben bewusst englisch.
- Verifikation: `node scripts/check-i18n-consistency.mjs`, `bunx tsgo --noEmit`, `bun run build:dev`.
