# Motion Studio — Final Acceptance (FA)

Ziel: eine einzige, klar begrenzte Abnahmerunde mit festen P0/P1-Kriterien. Kein
neuer Architektur-Audit, keine neue Entwicklungsphase. Ergebnis ist entweder
`MOTION STUDIO DONE / FROZEN` oder eine kurze P0/P1-Fixliste.

Scope-Grenze: keine Änderung an G3.2.2-, RS3-, F1-, Ledger- oder Gate-Semantik.
Diese Verträge sind frozen. Fixes in dieser Runde nur für P0/P1-Findings und nur
in der Ebene, in der das Finding entsteht (UI/Copy/Presenter), nicht in der
Pipeline-Semantik.

## Ablauf

Zehn Blöcke, in dieser Reihenfolge. Jeder Block liefert Evidenz (Screenshot,
SQL-Snapshot oder Ledger-Auszug) und ein Verdikt. Bei jedem P0 gilt STOP, Fix,
Wiederholung genau dieses Blocks — die vorherigen Blöcke werden nicht neu
gefahren.

### FA-1 — C1 Browser-Smoke (kostenfrei)
- Stale-Draft-Fall: Draft mit `lipSyncWithVoiceover: true` + Legacy-Draft ohne
  `scenePersistenceState`, DB steht auf `false`. Nach Reload darf der Toggle
  nicht irreführend ON zeigen; erwartet ist zuerst unresolved/disabled, nach
  Hydration OFF.
- Echter Write: Toggle ON, Persistenz bestätigen, Reload → bleibt ON, Marker in
  localStorage ist verschwunden.
- Verwaister Marker: Marker mit altem `setAt` ohne DB-Write → DB gewinnt.
- P0 wenn: UI zeigt ON während DB OFF, oder Renderstart wird still blockiert.

### FA-2 — Standard-Render ohne Lip-Sync (kostenpflichtig, 1 Szene)
Happy Path bis `complete`. Nachweis ist der finale Resolver-Output:
`resolveSceneOutput()` liefert einen finalen Output, `base_video_url` /
`processed_video_url` entsprechen der jeweiligen Intent-Semantik (ohne
Lip-Sync-Intent ist `base_video_url` der korrekte finale Output), die
`clip_url`-Compatibility ist korrekt. Dazu: ein Ledger-Job pro Stage, keine
Legacy-Wrapper-Completion.

### FA-3 — 1 Sprecher Lip-Sync (kostenpflichtig, kurzer Regressions-Smoke)
Plate → sync_segment → audio_mux → Stitch → complete, Finalisierung via
`composer_finalize_lipsync_scene` mit `_write_id = stitch:done`.

### FA-4 — 4 deutsche Sprecher (kostenpflichtig, Kern-Stresstest)
Kontrollierte Szene: vier deutsche Sprecher, vier unterschiedliche Voice-IDs,
mehrere Turns mit Sprecherwechseln.

Nachweispflicht:
- genau vier stabile Sprecheridentitäten, `speaker_idx = 0..3`, ohne
  Doppelbelegung und ohne Lücke
- Pass-/Ledger-Kardinalität = Anzahl **kanonischer Dialog-Turns**, nicht Anzahl
  Sprecher (v400-Invariante: `speaker_idx` ist Identitäts-/Geometriezuordnung,
  keine Job-Kardinalität; bei 4 Sprechern und 6 Turns also 6 `sync_segment`-
  Attempts)
- jeder `sync_segment`-Attempt ist genau einem Turn zugeordnet und trägt dessen
  korrekten `speaker_idx`
- kein Turn fehlt, kein Turn wird doppelt verarbeitet
- danach genau **ein** `audio_mux`, ein Stitch, ein `complete`
- Preclip-Pflicht (v331) greift: Face-Share-Floor, gesichtsproportionale Maske
- Geometrie-Anker ist `reference_image_url` (v400), kein `lock_reference_url`
- Provider ausschliesslich HappyHorse oder Hailuo (v425), kein stiller Fallback

Visuelle Abnahme am fertigen Clip (P0 bei Verstoss): kein Mund bewegt sich beim
falschen Sprecher, keine springende Geometrie-Zuordnung, keine Stimme auf der
falschen Figur.

### FA-5 — Frame-First + Continuity (kostenpflichtig, 2 Szenen)
Previous Final Frame und Character Anchor. Kette über
`composer_continuity_queue`: Nachfolger wartet auf Vorgänger-Clip, die Kette
schreibt nie `reference_image_url` (v426). Anker belegt bei Seedance 2.5 den
exklusiven Slot (v422), rohe Cast-Porträts gehen nicht an ModelArk.

### FA-6 — Reset / Retry (kostenpflichtig, 1 Wiederholung)
Lip-Sync-Reset real auslösen (`composer_reset_lipsync_full`), RS3-Marker und
Epoch-Fence prüfen, danach frischer Lauf ohne alten Ledger-Blocker. Stale
Callbacks des alten Attempts müssen abgewiesen werden, ohne die Szene zu
mutieren.

### FA-7 — Provider/Engine-Routing (kostenfrei)
Capability-Matrix gegen die wichtigsten Engines: Auto-Wahl Seedance 2.5 ab
>15 s, Lip-Sync-Zertifizierung nur HappyHorse/Hailuo, Slot-Topologie pro
Provider, Referenz-Limits. Reine UI-/Resolver-Prüfung ohne Render.

### FA-8 — EN UI vollständig (kostenfrei)
### FA-9 — ES UI vollständig (kostenfrei)
Beide Sprachen über dieselbe Checkliste, Oberflächen:
Hauptnavigation, Scene Editor, Dialog Studio, Render-Dialog, Lip-Sync/Reset,
Continuity/Frame-First, Provider-/Engine-Auswahl, Fehler/Toasts, Empty States,
Bestätigungsdialoge, Statusmeldungen.

Kriterien: kein deutscher String in EN/ES, keine rohen/kaputten Keys, keine
abgeschnittenen Labels, keine Sprache, die nach Reload oder Navigation
zurückspringt. Zusätzlich statischer Scan auf verbliebene deutsche Literale in
`src/components/video-composer` und auf `tx({...})`-Einträge ohne `es`-Wert
(ES fällt heute auf EN zurück — akzeptabel, aber zu inventarisieren).

### FA-10 — Final Output + Error/Recovery-Sanity (kostenfrei)
- Output: `processed_video_url`, Compatibility Output, Download und Preview
  funktionieren, Szene bleibt nach Reload korrekt.
- Ein kontrollierter, kostenfreier Guard-/Validation-Fehler (z. B.
  `dialog_too_long_for_plate` oder unresolved Intent) muss sichtbar und
  verständlich sein — kein stilles No-op.

## Findings-Klassifikation

- **P0** — blockiert Abschluss: falscher Sprecher/Mund, Datenverlust, stiller
  No-op, UI/DB-Divergenz, deutscher String in EN/ES an prominenter Stelle.
- **P1** — blockiert Abschluss: fehlende Terminalisierung, doppelter
  `audio_mux`, Legacy-Wrapper-Completion, unverständliche Fehlermeldung.
- **P2/P3** — dokumentieren, Backlog, kein Blocker (z. B. fehlende ES-Feinheit
  mit EN-Fallback, kosmetische Labels).

## Abschluss

Bei grün: Status `MOTION STUDIO DONE / FROZEN` und Abschlussreport in
`docs/v433-motion-studio-final-acceptance.md` mit
bewiesenen Kernpfaden, unterstützten Sprachen, bewiesenem
Multi-Speaker-Maximum, bekannten nicht-blockierenden Schulden und der Liste der
frozen Architekturverträge (v283-Baseline, v400, v422, v425, v426, RS3,
G3.2.2/F1, C1).

## Technische Notizen

- Alle Render-Blöcke laufen im bestehenden Resmoke-Projekt
  `035273d7-…` mit frischen Szenen ohne Ledger-Historie; historische Szenen
  bleiben unangetastet.
- Verfolgung read-only über `composer_scenes`, `composer_pipeline_jobs`,
  `composer_scene_runs` und Edge-Function-Logs. Keine manuellen DB-Mutationen an
  Szenen während eines Laufs.
- Kostenpflichtig sind FA-2 bis FA-6; jeder dieser Starts wird vorher einzeln
  zur Freigabe angekündigt.
- i18n-Basis ist `src/lib/i18nText.ts` (`tx` / `useTx`, `de|en|es`, ES-Fallback
  auf EN) plus `src/lib/translations.ts`.
