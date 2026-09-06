# Full Video Model & Provider Parity Upgrade

Ziel: Für jeden integrierten Provider die neueste sinnvolle Modellgeneration, die maximale **native** API-Auflösung und alle professionellen Steuerungen anbieten — mit klarer Trennung von nativer Generierung und nachträglichem Upscaling, ohne stille Clamps, und mit Preisen für jede wählbare Kombination.

Fünf Grundregeln gelten in allen Phasen:
1. Maximale native Auflösung der tatsächlich genutzten API-Route anbieten.
2. Nativ und Enhance/Upscale nie vermischen.
3. Alle stabil verfügbaren API-Funktionen exponieren.
4. Keine stillen Einschränkungen: gilt 4K nur bei 8 s, bietet die UI bei 4K nur 8 s an.
5. Source of Truth ist die Provider-Doku **zur konkret genutzten Route** plus ein bestandener Testlauf — nicht der Modellname.

## Vorbemerkung zur Verifikation

Belegt aus dem Code sind: die vier parallelen Wahrheitsquellen, die Modell-Tabellen in den Edge Functions, die fehlende Auflösungswahl bei Hailuo, Kling 2.5 Turbo mit 720p in der UI und 1080p im Backend, der stille LTX-Clamp ab 10 s, fehlende Seed-/Negativ-Prompt-/Kamera-Felder in der UI und die Katalog-Drift bei `kling-2.6` und `seedance-mini`.

Nicht aus dem Code belegbar sind Existenz und Fähigkeiten der neuen Generationen (LTX 2.5, Wan 3.0, Vidu Q3 Pro/Turbo/Mix/Ad, Grok Imagine 1.5, Runway Gen-4.5 / Aleph 2.0, MiniMax-Direct vs. Runway-hosted, Kling-Topmodell, Pika-Spezialwerkzeuge, HappyHorse-Stand). Für jede dieser Familien ist Schritt 1 ein Routen-Audit: Doku der genutzten Route lesen, Slug und Auflösungsstufen mit einem echten Testlauf bestätigen, erst dann freischalten. Kein 4K wird auf Marketing-Basis aktiviert.

## Phase 1 — Zentrale Video Capability Registry

Neu: `supabase/functions/_shared/videoModelSpecs.ts` als **kanonische, einzig manuell gepflegte** Quelle. `src/config/videoModelSpecs.ts` ist kein zweiter Spiegel, sondern wird per Skript daraus **generiert** (Header „generated — do not edit"), und ein Hash-/Parity-Test im CI schlägt fehl, sobald der generierte Client-Stand vom Server-Stand abweicht.

Modell-Ebene: interne ID, Anzeigename, Familie, Generation, Provider, echter Provider-Slug, **API-Route und Region**, API-Version, Release-Status, `deprecated`, `supersededBy`, `lastVerifiedAt`, `providerDocsVersion`, `verificationSourceUrl`, `verificationNotes`, `verifiedBy`, `available`, `parityStatus`. Damit ist später nachvollziehbar, welche konkrete Provider-Seite oder API-Spezifikation Grundlage einer Fähigkeit war. Ein Modell, das über mehrere Routen erreichbar ist (z. B. MiniMax direkt vs. Runway-hosted), bekommt **pro Route eine eigene Spec** — Fähigkeiten und Auflösungen werden nie routenübergreifend behauptet.

Capability-Ebene **pro Modus** (T2V, I2V, FirstLast, Reference, V2V, Edit, Extend, Reframe, AudioToVideo): Auflösungen inkl. `maxNative`, Dauern, Aspect Ratios, FPS, Audio, max. Referenzbilder/-videos/-audios, First-/Last-Frame, Seed, Negativ-Prompt, Kamera- und Motion-Controls, HDR, Output-Formate, Smart Duration, plus `constraints` als maschinenlesbare Regeln (z. B. „4K ⇒ Dauer = 8 s", „Extension ⇒ 720p").

**Keine Auflösungszahl ohne exakte Definition.** Jeder Eintrag führt `width`, `height`, `resolutionLabel` und `orientationBehavior` (z. B. „long edge" vs. „orientation-aware"), also nicht „4K", sondern 3840×2160 Landscape bzw. 2160×3840 Portrait — und nur, wenn der Provider genau das liefert. Genau hier lag der Topaz-Portrait-Fehler.

Damit lässt sich Veo 3.1 korrekt abbilden: 720p bei 4/6/8 s, 1080p und 4K ausschließlich bei 8 s, Lite ohne 4K.

### Freigabe-Kette (verbindlich für jede Fähigkeit)

```text
Provider-Doku → konkrete API-Route → Capability Spec → Pricing → automatischer Validation-Test
→ echter Max-Quality-Testlauf → Output-Probe → FULL_PARITY → available: true → UI-Badge
```

Vor `available: true` für eine Maximalauflösung ist ein **echter Smoke-Test** Pflicht: Job in maximaler Auflösung starten, Ausgabedatei laden und proben, Pixelmaße, Dauer, FPS und Audio messen, Test-Run-ID plus Messwerte in der Spec bzw. einer Verifikationstabelle speichern. Der Smoke-Test prüft zusätzlich die **Wirtschaftlichkeit**: `estimatedProviderCost`, `actualProviderCost`, `chargedCredits` und `effectiveMargin` werden mitgeschrieben und gegen die Mindestmarge geprüft — so fällt sofort auf, wenn ein Provider Preise oder Abrechnungseinheiten geändert hat. Erst danach darf ein Badge wie „4K Native" erscheinen.


## Phase 2 — Provider-Audit je Familie

Pro Familie: Doku der genutzten Route → Spec → Adapter → Test → Testlauf in Maximalauflösung. Erwartete Ergebnisse laut Vorgabe, jeweils vor Freischaltung zu bestätigen:

- **Seedance**: 2.5 als bestes multimodales Modell (T2V, I2V, First+Last, Bild-/Video-/Audio-Referenzen, Editing, Generate Audio, Smart Duration, bis 30 Referenzbilder), native Obergrenze über die genutzte Route 720p. **Seedance 2.0 bleibt** und wird als Hochauflösungspfad geführt (480p/720p/1080p/4K). Die UI erklärt ausdrücklich: neuer heißt nicht höher aufgelöst.
- **Veo 3.1**: 720p/1080p/4K, I2V, First+Last, bis 3 Referenzbilder, Extension, natives Audio, Seed, 16:9 und 9:16, mit den Dauer-Constraints oben.
- **LTX**: 2.5 Fast und Pro integrieren (720p bis 4K, 24/25/48/50 FPS je Kombination, Audio-to-Video, First+Last, Camera Motion, Auto-Dauer, Multi-Shot). 2.3 bleibt nur als Legacy.
- **Wan**: 3.0 aufnehmen, solange Preview mit Wan 2.7 als stabilem Fallback; 2.5 nicht mehr prominent.
- **Vidu**: Q3 Pro/Turbo/Mix/Ad (optional Drama); Q3 Ad prominent, da für Werbung gebaut. Upscale bis 8K erscheint ausschließlich als Enhance, nie als natives Q3.
- **Grok**: Imagine Video 1.5, Auflösung pro Modus (T2V/I2V bis 1080p, Reference bis 720p).
- **Luma**: Ray 3.2 als Produktionspfad (1080p, V2V bis 20 s, bis 16 Keyframes, HDR, 16-bit EXR, Reframe, Edit) inkl. der bereits vorhandenen, bislang ungenutzten Kamera-Presets; Ray 2 wird Legacy.
- **Runway**: Gen-4.5 und Aleph 2.0 ergänzen, mit ProRes, PNG-Sequence, 10-bit SDR und HDR im eigenen Bereich „Professional Output".
- **MiniMax/Hailuo**: MiniMax-Direct und Runway-hosted als **zwei getrennte Routen** modellieren; Fähigkeiten immer routenbezogen (768p/1080p, 6/10 s je Auflösung, Subject Reference, Kamerakommandos).
- **Kling**: vollständiger Routen-Audit; 4K nur nach bestätigtem Testlauf auf genau unserem Endpoint.
- **Pika**: 720p/1080p prüfen; Spezialwerkzeuge nur bei zuverlässigem Zugang, sonst nicht als Flagship führen.
- **HappyHorse**: Stand und Route gegen unseren Endpoint abgleichen (720p/1080p).

## Phase 3 — Provider-Adapter statt Sonderlogik

Edge Functions verlieren ihr Modellwissen: sie erhalten Modell-ID, Modus und Optionen, validieren gegen die Spec und bauen daraus den Provider-Request. Die Tabellen in `generate-kling-video`, `generate-veo-video`, `generate-wan-video` usw. entfallen. Ungültige Kombinationen werden nicht mehr still korrigiert, sondern mit `400 INVALID_MODEL_CAPABILITY` und verständlicher Begründung abgelehnt; die UI lässt sie gar nicht erst zu.

## Phase 4 — Professionelle UI

Neue Gruppen statt „Recommended/Audio/Fast/Premium":

```text
⭐ Flagship / Best Quality → 🎬 Professional Production → 🔊 Native Audio & Dialogue → ⚡ Fast → 💰 Economy / Draft → Legacy (aufklappbar)
```

Pro Modell direkt sichtbar: `Native: 720p | 1080p | 4K` bzw. `Native max: 1080p · Enhance: 2K | 4K | 8K` — visuell klar getrennt. Ein einklappbarer Bereich „Advanced Controls" rendert rein aus der Spec: Seed, Negativ-Prompt, Kamerabewegung, Motion Strength, Prompt Enhancement, FPS, HDR, Output-Format, Audio, Smart Duration, Referenzstärke, Start-/Endbild, Referenzbilder/-video/-audio. Keine anbieterspezifischen UI-Sonderfälle mehr.

## Phase 5 — Pricing an Auflösung gekoppelt

Jede kostenrelevante Kombination erhält eine eigene `pricingId` (z. B. `veo-3.1-4k`, bei komplexen Providern Modell+Modus+Auflösung+Audio). Implizite Umbiegungen wie in `generate-seedance25-video` entfallen. Vor Aktivierung müssen Einkaufspreis, FX, Marge, Mindestmarge (1,75×) und Endpreis feststehen; sonst bleibt die Capability dokumentiert, aber `available: false`. Die bestehende Drift (`kling-2.6`, `seedance-mini`) wird geschlossen.

## Phase 6 — Output nachmessen

Nach jeder Generierung werden Breite, Höhe, FPS, Dauer, Codec, Bitrate, Dateigröße, Audio-Codec und — wo verfügbar — Farbtiefe und HDR-Metadaten gemessen und als `requestedResolution` vs. `actualResolution` gespeichert. Anzeige „✅ Target matched" oder „⚠ Provider output mismatch"; Abweichungen werden protokolliert, damit Provider-Änderungen sofort auffallen.

## Phase 7 — Harte Tests

Deployment scheitert bei: Registry↔Server-Abweichung, Hash-Abweichung zwischen kanonischer Server-Spec und generiertem Client-Stand, fehlender Preiszeile für eine wählbare Kombination, Auflösung ohne Adapter-Unterstützung, abweichenden Dauern, verletzter Constraint (z. B. Veo 4K + 6 s), Alias ohne Ziel, `deprecated` ohne `supersededBy`, fehlender Pixelangabe (`width`/`height`) an einer Auflösung, `available: true` ohne hinterlegte Smoke-Test-Run-ID, sowie einem Test, der ein stilles Herunterschreiben von 4K auf 1080p ausschließt.

## Phase 8 — Rückwärtskompatibilität

Alte IDs bleiben als Aliase (`oldId → currentId`). Gespeicherte Projekte zeigen weiter ihren historischen Modellnamen; neue Läufe nutzen die neue Spec. Legacy-Modelle bleiben anzeigbar und duplizierbar, auch wenn sie nicht mehr neu wählbar sind. Keine Datenbank-Migration bestehender Generierungen.

## Phase 9 — Rollout

Reihenfolge ist bindend: **Phase 1 und die Tests zuerst**, danach Provider für Provider — sonst wird die Modellarbeit nach dem Registry-Umbau ein zweites Mal fällig. Kein Wave-2/3/4-Eintrag setzt eine ungeprüfte Fähigkeit voraus; jeder beginnt mit dem Routen-Audit und schaltet dann das höchste **bestätigte** native Tier frei.

- **Wave 1 (Architektur):** kanonische Capability Registry + generierter Client-Spiegel, Pricing-Parität, Constraints, kein stilles Clamping, Output-Messung, Flagship-first-UI, harte Tests.
- **Wave 2 (Qualitätssprünge, je Familie: Route Audit → höchstes bestätigtes natives Tier freischalten):** Veo 3.1 · LTX 2.5 Fast/Pro · Seedance 2.0 (bestehendes Hochauflösungs-Tier erhalten) · Seedance 2.5 multimodal · Wan 3.0 (mit 2.7 als Fallback) · Vidu Q3 · Grok Imagine 1.5 · Luma Ray 3.2.
- **Wave 3 (Professional):** Runway Gen-4.5, Aleph 2.0, ProRes, PNG-Sequence, HDR, 10-bit, EXR, V2V, Reframe, Extend, Multi-Keyframes — jeweils nach Routen-Audit.
- **Wave 4:** Kling-Audit, MiniMax/Hailuo als zwei getrennte Routen, Pika, HappyHorse, Legacy-Bereinigung.

## Phase 10 — Nicht wieder veralten

Jede Spec trägt `lastVerifiedAt`, `providerDocsVersion`, `providerModelId`, `releaseStatus`, Route/Region und die letzte Smoke-Test-Run-ID. Ein Admin-Report „Video Provider Health" listet Provider, Modell, Route, bestätigtes natives Maximum und Prüfdatum mit Ampel 🟢 Current / 🟡 Verify / 🔴 Outdated, wenn die Prüfung zu lange zurückliegt.

## Definition of Done je Familie

`FULL_PARITY` wird **nicht pro Modell**, sondern pro Kombination `Modell × API-Route × Region × Modus` vergeben — dasselbe Modell kann über Google, Runway, Replicate oder einen Aggregator unterschiedliche Fähigkeiten haben.

Vergeben erst, wenn für diese Kombination gilt: neueste sinnvolle Generation geprüft, maximale native Auflösung mit exakten Pixelmaßen verfügbar, alle Auflösungsstufen, Modi, Dauern, Ratios, Audio-Fähigkeiten, Referenzen, First/Last, Seed, Negativ-Prompt, Kamera-Controls und HDR/Pro-Outputs abgebildet, jede wählbare Kombination bepreist, Backend und UI mit denselben Regeln, Output-Nachmessung aktiv, und ein echter Testlauf in maximaler Auflösung mit gespeicherter Run-ID und gemessener Ausgabe bestanden. Erst dann erscheint in der UI eine Kennzeichnung wie „⭐ Flagship · 4K Native · Full Parity".

Kundenaussage, die daraus tragfähig wird: *Every resolution and capability shown in AdTool AI is verified against the exact API route we use and confirmed by an actual output test.*

## Betroffene Dateien

Bestehend: `src/config/aiVideoModelRegistry.ts`, alle `src/config/*VideoCredits.ts`, `src/components/ai-video/ModelSelector.tsx`, `src/components/ai-video/ToolkitGenerator.tsx`, `src/lib/cost/videoPricingCatalog.ts`, `supabase/functions/_shared/videoPricingCatalog.ts`, alle `supabase/functions/generate-*-video/index.ts`, `src/lib/video-composer/providerCapabilities.ts`, `src/lib/composer/providerMatrix.ts`, Video-Tests.
Neu: `supabase/functions/_shared/videoModelSpecs.ts`, `src/config/videoModelSpecs.ts`, `docs/ai-video-capability-matrix.md`.
Unangetastet: Lip-Sync-Kette, Wallet-/Abrechnungslogik außerhalb neuer Preiszeilen, Director's Cut, Render-Pipeline. Alle Texte EN/DE/ES.
