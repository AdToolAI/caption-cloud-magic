# Atlantis-Briefing: Abweichungen beheben + Auto-Provider für Lang-Szenen

## Kurzantwort: nein, noch nicht vollständig korrekt

Das Briefing wurde inhaltlich gut geparst (2 Szenen × 30 s, 9:16, Kamera, Negative Prompt, Sound-Design, Storytelling 90 %), aber fünf Punkte widersprechen dem Briefing bzw. sind technisch nicht ausführbar.

## Gefundene Abweichungen (im Code verifiziert)

1. **30-s-Szenen laufen auf ein 10-s-Modell.**
   Der Apply-Hook setzt für jede Nicht-Dialog-Szene fest `clipSource: 'ai-hailuo'`. Hailuo kann keine 30 s. Zusätzlich deckelt `MAX_SCENE_SECONDS = 15` den Dauer-Slider im Storyboard — 30 s lassen sich dort gar nicht halten.
2. **Cast wird erfunden, obwohl „Cast: keiner“.**
   Das Plan-Sheet legt pro Szene automatisch einen Slot `S01 Sprecher` / `S02 Sprecher` an, auch wenn die Szene keinen Cast hat.
3. **Untertitel-Block bleibt sichtbar mit „Burn-In: an“.**
   Der Server schaltet `captions.enabled = false` (kein Voiceover + „keine Untertitel“ im Negative Prompt), das Sheet rendert den Caption-Block aber unverändert inkl. „Burn-In an“ — die Anzeige widerspricht dem tatsächlich angewendeten Zustand.
4. **Ton: „Ton im Studio (stummer Clip)“ statt Provider-Ambience.**
   Es gibt keine Sprache, nur Umgebungsgeräusche. Aktuell wird auf `studio` gefallen, sobald `soundDesign` gefüllt ist. Bei einem Modell mit nativem Audio (Seedance 2.5) ist `provider` hier die richtige Wahl.
5. **Negative Prompt bleibt deutsch.**
   Visuelle Prompts an die Modelle müssen englisch sein; der Negative Prompt wird 1:1 deutsch übernommen.

Nicht als Fehler zu werten: `@atlantis` als „nicht zugeordnet“ — der Ort steht nicht in Cast & World. Der „Anlegen“-Button ist dafür der vorgesehene Weg; er wird nur prominenter.

## Was gebaut wird

### A. Auto-Provider nach Szenendauer (Kern deiner Anforderung)
- Neue Helper-Datei, die aus `durationSeconds` (+ Sprache/Dialog ja/nein) die günstigste Clip-Quelle wählt, die die Dauer tatsächlich kann — Datenquelle ist ausschließlich `aiVideoModelRegistry` (`durations`), kein zweiter Hardcode.
- Regel: > 15 s → `ai-seedance25` (einziges Modell bis 30 s). ≤ 15 s → bisheriges Verhalten (Hailuo/HappyHorse).
- `useApplyProductionPlan` nutzt diesen Helper statt des festen `ai-hailuo`.
- Szenen-Dauer-Cap wird quellenabhängig: `MAX_SCENE_SECONDS` bleibt 15 als Default, für `ai-seedance25` gilt 30. Der Slider im Storyboard liest das Modell-Maximum, damit 30-s-Szenen erhalten bleiben.
- Wechselt der Nutzer eine 30-s-Szene auf ein kürzeres Modell, wird die Dauer sichtbar auf dessen Maximum geklemmt (mit Hinweis-Toast), statt still zu scheitern.

### B. Kein erfundener Cast
- Der Auto-Slot `S0x Sprecher` entsteht nur noch, wenn die Szene Sprache hat (Voiceover, Dialogzeilen oder Lip-Sync) oder das Briefing Cast nennt. Cast-lose B-Roll-Szenen zeigen keinen leeren Sprecher-Slot mehr.

### C. Untertitel ehrlich anzeigen
- Der Caption-Block im Plan-Sheet zeigt bei `captions.enabled === false` einen klaren Status „Untertitel aus (keine Sprache / im Briefing ausgeschlossen)“ statt Font/Burn-In-Werten, die nicht angewendet werden.

### D. Ton-Eigentum nach Modell
- Ohne Sprache und mit vorhandenem Sound-Design: `provider`, wenn die gewählte Clip-Quelle nativen Ton kann (Seedance 2.5, Veo, Kling Omni), sonst `studio`.
- Reihenfolge im Apply wird gedreht: erst Clip-Quelle bestimmen, dann Audio-Eigentum darauf auflösen (heute umgekehrt). Lip-Sync-/Sprachszenen bleiben unverändert zwingend `studio` (stummer Plate) — die Lip-Sync-Kette wird nicht angefasst.

### E. Negative Prompt auf Englisch
- Der Deep-Parse-Prompt fordert den Negative Prompt explizit auf Englisch an (wie die Anchor-Prompts); vorhandene deutsche Pläne bleiben gültig, werden aber beim Apply nicht mehr erzeugt.

## Technische Details

- `src/lib/composer/pickClipSourceForDuration.ts` (neu): Registry-getriebene Auswahl inkl. `maxSceneSecondsForSource()`.
- `src/hooks/useApplyProductionPlan.ts`: Clip-Quelle vor Audio-Auflösung, `resolveSceneAudioSource` mit echter `clipSource`.
- `src/lib/composer/budget.ts`: `maxDurationForScene(scenes, sceneId, clipSource)`; Aufrufer im Storyboard/Scene-Editor mitziehen.
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: Cast-Auto-Slot bedingt, Caption-Block statusabhängig.
- `supabase/functions/_shared/briefing/deep/index.ts`: Prompt-Regel „negativePrompt in English“, `normalizeAudioAndCaptions` bleibt sonst unverändert.
- Tests: Erweiterung von `useApplyProductionPlan.test.ts` (30 s → `ai-seedance25`, kein Cast-Slot ohne Sprache, `audioSource === 'provider'`) plus Unit-Test für die Dauer→Modell-Auswahl.

## Nicht Teil dieses Plans
Lip-Sync-Kette, Render-/Stitch-Pipeline, Preise und Margen bleiben unverändert.
