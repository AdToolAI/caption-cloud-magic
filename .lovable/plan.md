# Phase 3a — Seedance 2.5 an die Lip-Sync-Kette hängen

## Ausgangslage (geprüft)

- Seedance 2.5 rendert bereits produktiv über ModelArk (`compose-video-clips` → `createSeedance25Task` → `modelark-poll` → `compose-clip-webhook`). Der Poller schickt eine Replicate-förmige Nutzlast, d. h. die komplette Downstream-Logik inklusive Cinematic-Sync-Handoff greift bereits heute.
- Blockiert wird Lip-Sync nur an einer Stelle: `ai-seedance25` fehlt in der Allowlist `LIPSYNC_PROVIDERS` → HTTP 400 `invalid_provider_for_lipsync`.
- Der ModelArk-Adapter sendet `generate_audio` nur, wenn es explizit gesetzt wird; im Composer-Zweig wird es nicht gesetzt, die Platte ist also heute schon stumm. Das bleibt künftig eine erzwungene Invariante statt eines Zufalls.
- Der VisualInputResolver liefert für Szenen mit Lip-Sync-Absicht byte-identisch den Anker (`reference_image_url`) und erzwingt `match-cut` — die eingefrorene Kette T3/T5/T6 sieht keine Änderung.

Es geht also nicht um Umbau der Lip-Sync-Pipeline, sondern um **Zertifizierung eines weiteren Plate-Providers** plus die Absicherung der Dinge, die bei 30-Sekunden-Platten anders sind als bei 6–15 Sekunden.

## Was gebaut wird

### 1. Zertifizierung (Allowlist)
- `ai-seedance25` in `LIPSYNC_PROVIDERS` (`compose-video-clips`) aufnehmen und die lokalisierte Fehlermeldung (DE/EN/ES) um Seedance 2.5 mit seinem Längenfenster ergänzen.
- Spiegel-Liste in `supabase/functions/_shared/visual-inputs.ts` (zertifizierte Plate-Provider) mitziehen, damit Resolver und Dispatcher nicht auseinanderlaufen.
- Beide Listen werden per Test aneinander gebunden.

### 2. Tonhoheit: stumme Stimmspur, optional native Atmosphäre (Hybrid)
Die Stimme kommt immer von uns, der Provider darf höchstens die Umgebung liefern. Zwei Zustände pro Szene:

- **Standard (stumme Platte):** `generate_audio: false`, Referenz-Audio unterdrückt. Ton komplett aus dem Studio-Track (v415).
- **Hybrid „Atmo nativ":** `generate_audio: true`, aber der Prompt-Layer verbietet Sprache explizit (englisch: no speech, no dialogue, no voices, ambience and foley only). Genutzt wird die Tonspur nur als Atmosphären-Bett unter unserer VO.

Regeln für den Hybrid-Fall, damit er nicht zur Fehlerquelle wird:
- **Sync.so sieht die Atmo nie.** Lip-Sync läuft auf der Platte plus unserer VO; das Atmo-Bett wird erst beim Mux zurückgemischt. Sonst driftet der Mund gegen zwei konkurrierende Tonquellen.
- **Sprach-Gate nach dem Render:** die Plattentonspur wird transkribiert. Ist Sprache erkennbar (nicht-leeres Transkript / Sprachenergie), wird die Tonspur verworfen und die Szene läuft stumm weiter — fail-closed, kein Renderfehler, nur Telemetrie und ein Hinweis in der Szene.
- **Mix-Deckel:** Atmo als eigener Layer unterhalb der Sprache, mit Pegeldeckel und Ducking unter der VO; Lautstärken bleiben hart auf [0, 1] geclampt (bekannter Browser-Crash-Pfad).
- **Kosten:** natives Audio ist Teil des Seedance-Preises, verursacht also keine Zusatzkosten — das Sprach-Gate (STT auf wenige Sekunden) schon, aber im Cent-Bereich.

Guard-Tests: Standardfall darf niemals `generate_audio: true` senden; Hybrid-Fall darf niemals eine Tonspur an Sync.so weiterreichen; ein nicht bestandenes Sprach-Gate muss zwingend zu „stumm" führen.


### 3. Längen- und Zeitfenster
- Lip-Sync-Platten von Seedance 2.5: 4–30 s erlaubt, keine Snap-Werte (ModelArk akzeptiert ganze Sekunden).
- Neuer Duration-Guard analog zu Hailuo/HappyHorse: Platte muss mindestens so lang sein wie das Sprachfenster der Szene; sonst 400 mit klarer, lokalisierter Meldung statt stiller Kürzung.
- `maxSecondsForClipSource` bleibt die einzige Quelle für die UI-Obergrenze.

### 4. Lange Platten sicher durch die bestehende Kette
- Face-Gate / Motion-Probe: geclampte Sample-Timestamps auf die tatsächliche Plattenlänge beziehen (v346/v347 bleiben gültig, AWS-only), damit ein 30-s-Clip nicht weiter an 6-s-Annahmen gemessen wird.
- Preclip-Pflicht bei mehreren Sprechern (v331) bleibt unverändert bestehen.
- Watchdogs prüfen: `modelark-poll` läuft mit 25 min Task-Timeout; die Composer-Watchdogs dürfen eine 30-s-Generierung nicht vorzeitig als hängend markieren. Wo nötig, wird die Schwelle an die Plattenlänge gekoppelt.

### 5. Kosten und Rückerstattung
- Lip-Sync auf Seedance 2.5 = Plattenpreis (19,90 € / 30 s) plus Sync.so-Kosten. Die Reservierung muss beide Teile abdecken, sonst rutscht die Szene in eine halb bezahlte Fehlerlage.
- Bestehende, idempotente Refund-Automatik auf den ModelArk-Fehlerpfad anwenden (Task failed / timeout / Sync.so failed).

### 6. UI
- Lip-Sync-Schalter in der SceneCard für Seedance 2.5 freigeben, mit Hinweistext zum Längenfenster.
- Neue Szenen-Option „Umgebungston vom Modell" (Standard: aus). Aktiv bedeutet: Atmosphäre nativ, Stimme weiterhin von uns; der Hinweistext sagt das genau so.
- Registry-Fähigkeit `lipSyncCertified` für Seedance 2.5 setzen, damit Modellauswahl und Auto-Provider-Wahl (>15 s → Seedance 2.5) nicht mehr in eine gesperrte Kombination laufen.

### 7. Rollout mit Bremse
- Feature-Flag `composer.feature.seedance25_lipsync`, Standard aus.
- Erst für den Owner-Account einschalten, drei echte Tests: Einzelsprecher 20 s stumm, Zweisprecher-Dialog 25 s stumm, ein Durchlauf mit Hybrid-Atmo. Erst wenn alle drei sauber sind (Sync sitzt, keine Doppelstimme, Kosten korrekt), wird das Flag global aktiviert.


## Technische Notizen

- Änderungsumfang an der eingefrorenen Kette: ausschließlich Allowlist + Flag. T3 (Anker), T5 (Geometrie), T6 (Assignment-Lock) und der Mux-Gate bleiben unangetastet; Geometrie-Anker bleibt `reference_image_url` (v400).
- Neue Tests: Allowlist-Spiegel Dispatcher ↔ Resolver, stumme Platte, Resolver liefert für Lip-Sync-Szene auf Seedance 2.5 `inputMode: "first-frame"` mit dem Anker (nie `references`, nie Clip-Referenz).
- Berührte Dateien: `supabase/functions/compose-video-clips/index.ts`, `supabase/functions/_shared/visual-inputs.ts`, `supabase/functions/_shared/modelark.ts` (nur Aufrufparameter), `src/lib/aiVideoModelRegistry.ts`, `src/components/video-composer/SceneCard.tsx`, neue Tests unter `src/lib/composer/__tests__/`.

## Offene Entscheidung

Die Lip-Sync-Kette steht seit dem chirurgischen Rollback unter Freeze. Dieser Schritt öffnet sie nur an der Provider-Allowlist — ich setze das erst um, wenn du das ausdrücklich freigibst.
