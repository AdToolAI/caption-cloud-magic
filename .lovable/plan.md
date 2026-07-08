# Briefing/Storyboard-Audit — Vorschlag

Kurze Antwort: **Nein, nicht garantiert fehlerfrei.** Die letzten Fixes (Cast-Dedup, Outfit-Merge, Ensemble-Guarantee, Location-Resolver) adressieren bekannte Symptome, aber es gibt weiterhin Ecken, die ich noch nicht end-to-end verifiziert habe. Bevor ich weitere Änderungen mache, schlage ich ein systematisches Audit mit klar definierten Prüfpunkten vor.

## Was ich prüfen will

### 1. ID-Kanonisierung (End-to-End)
- `characterId`, `outfitLookId`, `locationId`, `voiceId` durch alle 6 Stufen: Pass A → Pass B → Local-Fill → Scene-Count-Guard → Ensemble-Repair → `useApplyProductionPlan` → Composer-Scene.
- Testfälle: (a) reine Slug-Mentions, (b) Catalog-UUIDs, (c) Freitext-Namen, (d) Mixed.

### 2. Scene-Count-Guard vs. Ensemble-Repair Interaktion
- Padded Szenen erben Template-Cast → dedupePlanSceneCast greift → Ensemble-Repair prüft Coverage → mögliche Race, wenn Padding schon alle 3 Avatare enthält aber ohne `outfitLookId`.
- Verify: durationSec-Neuverteilung überschreibt keine benutzerdefinierten Dauern.

### 3. Lip-Sync-Schutzfilter (Apply-Hook)
- Bestätigen, dass `dedupePlanSceneCast` NICHT auf bereits gerenderte Szenen angewendet wird (sonst Datenverlust).
- 6-Kriterien-Filter greift vor Dedup-Aufruf.

### 4. Outfit-Fallback-Kette
- Wenn `outfitLookId` fehlt: nutzt `prepareSceneAnchor` Default-Portrait oder erste verfügbare Look?
- `avatar_outfit_looks`-DB-Fallback in ProductionPlanSheet: greift bei quick-create, aber was bei Löschung?

### 5. Nicht-Determinismus des Parsers
- Gemini-Pass-A ist stochastisch — gleicher Input, unterschiedliche Outputs. Schutz durch Scene-Count-Guard + Local-Fill + Ensemble-Repair, aber Performance-Auto-Fill und Anchor-Prompt-Text bleiben variabel.
- Kein server-seitiges Seeding/Temperature-Locking.

### 6. Persistenz & Versionierung
- `composer_production_plans` (versioniert) vs. flüchtiger Client-State: Race beim Speichern während Apply?

### 7. Telemetrie-Blindspots
- `parser_meta.location_resolution` existiert, aber kein `cast_resolution` / `outfit_resolution` / `dedup_stats` — schwer zu debuggen wenn User „manchmal falsch" meldet.

## Vorgehen

**Phase 1 — Read-Only Audit** (kein Code-Change):
- Trace alle 4 ID-Typen durch die 6 Stufen anhand der aktuellen Files.
- Report: Liste konkreter Bugs mit File:Line + Reproduktionsbedingung + Severity (blocker / edge-case / cosmetic).

**Phase 2 — Fix-Batch** (nach deiner Freigabe):
- Nur Bugs mit Severity blocker/edge-case fixen.
- Zusätzlich: `parser_meta`-Telemetrie erweitern (`cast_resolution`, `outfit_resolution`, `dedup_stats`) damit „manchmal fehlerhaft"-Reports diagnostizierbar werden.
- Optional: Gemini-Temperatur auf 0.2 senken für deterministischere Outputs.

**Phase 3 — Validierung**:
- Manueller Test-Durchlauf mit dem 3-Avatar-Briefing das du zuletzt genutzt hast.
- Screenshot-Vergleich Production Plan Sheet vs. Storyboard-Szenen.

## Was nicht angefasst wird
Lip-Sync-Pipeline (v190-v211), Render-Payload, `compose-video-clips`, `scene_assets`, `dialog_shots`.

## Frage vor Start

Soll ich mit **Phase 1 (Read-Only Audit)** beginnen und dir einen Bug-Report liefern, bevor irgendetwas geändert wird? Oder willst du direkt Telemetrie + Determinismus-Fixes ohne vorheriges Audit?
