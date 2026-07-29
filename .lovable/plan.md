## Ziel
Universal Content Creator (UCC) liefert **immer** Raw-Media — sowohl im Preview (Stufe 4) als auch im finalen Export. Cinematic-Post (Mood-Filter, Grain, Vignette, KenBurns, Parallax, Style-Overlays, Scene-FX, Floating-Icons, Transitions, DrawOn) bleibt exklusiv dem Director's Cut vorbehalten und wird dort nur auf ausdrücklichen Kundenwunsch aktiviert.

## Befund (verifiziert)
- `src/lib/universalCreatorRenderPayload.ts:159` setzt bereits `rawMediaMode: true` für den **Export-Payload** — der finale MP4-Render aus dem UCC läuft also faktisch schon ohne Cinematic-Post.
- `src/components/universal-creator/RemotionPreviewPlayer.tsx:155` setzt `rawMediaMode: true` für das **Preview** (Stufe 4).
- `src/remotion/templates/UniversalCreatorVideo.tsx` schaltet bei `rawMediaMode` alle FX-Pfade konsistent ab (Zeilen 1789–3096).

Ergebnis: Die vom Kunden geäußerte Sorge („Export wird schlechter als das, was ich in Stufe 3 sehe") ist **bereits gelöst**. Es gibt keinen Pfad im UCC, der Cinematic-Post in den finalen Export einschleust.

## Änderungen — minimal, nur zur Absicherung

### 1) UCC-Export-Payload gegen Regressionen sperren
`src/lib/universalCreatorRenderPayload.ts`
- `rawMediaMode: true` wird zur **Konstanten** (nicht mehr überschreibbar via optionalem Input). Kommentar präzisieren: „UCC ist ein Clean-Media-Assembler. Cinematic-Post lebt ausschließlich im Director's Cut und nur wenn dort vom Kunden aktiviert."

### 2) Template-Default hart machen
`src/remotion/templates/UniversalCreatorVideo.tsx`
- Zod-Schema (Zeile 233): `rawMediaMode: z.boolean().default(true)` (bisher `.default(false)`). Damit ist der Default für jeden UCC-Aufruf raw, auch wenn ein zukünftiger Call-Site das Feld vergisst.
- Kommentar oben am Schema: „Nur der Director's Cut darf explizit `rawMediaMode: false` setzen."

### 3) Sanity-Test
- Kurzer Vitest-Check, der `buildUniversalCreatorRenderPayload(...)` mit typischen Inputs aufruft und asserted, dass `rawMediaMode === true` bleibt (verhindert versehentliche Regression durch spätere Refactors).

### 4) Was NICHT geändert wird
- **Director's Cut bleibt unangetastet.** Filter, Grain, KenBurns, Parallax, Overlays, Transitions, DrawOn stehen dort weiter zur Verfügung — nur, wenn der Kunde sie im DC-UI explizit einschaltet.
- Kein neuer UI-Toggle im UCC. UCC = 1:1 raw, keine versteckten Regler.
- Keine Änderung am Preview (läuft bereits raw + Loop + Mute-Toggle).

## Verifikation
- Stufe-3-Preview, Stufe-4-Preview und finaler MP4-Download aus dem UCC sind visuell identisch (gleiche Schärfe, keine Mood-Verschiebung, keine Vignette, keine Zoom-Bewegung auf Standbildern).
- Director's Cut mit aktivierten Filtern rendert weiterhin mit voller Cinematic-Post-Kette.
- Vitest grün: Payload-Builder liefert `rawMediaMode: true` für alle geprüften UCC-Inputs.
