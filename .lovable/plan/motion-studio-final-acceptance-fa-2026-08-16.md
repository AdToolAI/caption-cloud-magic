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
`resolveSceneOutput()` liefert den finalen Output; ohne intentionalen Lip-Sync
darf `base_video_url` der Finaloutput sein, mit intentionalem Lip-Sync ist
`processed_video_url` erforderlich. Die `clip_url`-Compatibility ist korrekt.
Dazu: genau ein Attempt je tatsächlich durchlaufener Stage, keine
Doppel-Dispatches, keine Legacy-Wrapper-Completion.

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
- Provider entspricht der frozen Provider Capability Matrix (Lip-Sync-
  Zertifizierung), kein stiller Fallback

Visuelle Abnahme am fertigen Clip (P0 bei Verstoss): kein Mund bewegt sich beim
falschen Sprecher, keine springende Geometrie-Zuordnung, keine Stimme auf der
falschen Figur.

### FA-5 — Frame-First + Continuity (kostenpflichtig, 2 Szenen)
Previous Final Frame und Character Anchor. Kette über
`composer_continuity_queue`: Nachfolger wartet auf Vorgänger-Clip, die Kette
schreibt nie `reference_image_url` (v426). Anker belegt bei Seedance 2.5 den
exklusiven Slot (v422), rohe Cast-Porträts gehen nicht an ModelArk.

### FA-6 — Reset / Retry über den RS3-Pfad (kostenpflichtig, 1 Wiederholung)
Lip-Sync-Reset **ausschliesslich über den normalen UI-Produktpfad** auslösen,
kein direkter Full-Reset-RPC. Nachzuweisen ist, dass der UI-Pfad auf den
RS3-Resetvertrag (`composer_reset_lipsync_with_attempt_cancellation`) führt:

- Run/Generation gemäss RS3 erhalten (Same-Run/Same-Generation-Rearm)
- offene alte Attempts `cancelled` / `user_reset`
- neuer `reset_id` / Epoch-Marker gesetzt
- alter Callback wird als `pre_reset_attempt` / No-op abgewiesen, ohne
  Scene-Mutation
- neuer On-Demand-Attempt N+1 ohne `predecessor_exists`
- vollständiger neuer Lauf bis `complete`

### FA-7 — Provider/Engine-Routing (kostenfrei)
Zuerst die aktuelle frozen Provider Capability Matrix als Ist-Stand lesen, dann
UI und Resolver ausschliesslich gegen diese Matrix prüfen: Auto-Provider-Wahl
nach Szenenlänge, Lip-Sync-Zertifizierung, Slot-Topologie pro Provider,
Referenz-Limits. Bei Abweichung zwischen Erwartung und Matrix gewinnt die
Matrix. Reine UI-/Resolver-Prüfung ohne Render.

### FA-8 — EN UI vollständig (kostenfrei)
### FA-9 — ES UI vollständig (kostenfrei)
Beide Sprachen über dieselbe Checkliste, Oberflächen:
Hauptnavigation, Scene Editor, Dialog Studio, Render-Dialog, Lip-Sync/Reset,
Continuity/Frame-First, Provider-/Engine-Auswahl, Fehler/Toasts, Empty States,
Bestätigungsdialoge, Statusmeldungen.

Kriterien: kein deutscher String in EN/ES, keine rohen/kaputten Keys, keine
abgeschnittenen Labels, keine Sprache, die nach Reload oder Navigation
zurückspringt.

Ausführungsregel für den statischen Scan: nur **user-visible** Strings zählen
als Finding. Kommentare, Logs, Test-Fixtures, Provider-/Modellnamen und interne
Debugtexte machen den Scan nicht rot. `tx({...})`-Einträge ohne `es` sind
dokumentierter EN-Fallback und damit P2/P3, solange die UI korrekt und
verständlich bleibt — sie werden inventarisiert, nicht als Blocker gewertet.

### FA-10 — Final Output + Error/Recovery-Sanity (kostenfrei)
- Output: finaler Output gemäss `resolveSceneOutput()`, Compatibility Output,
  Download und Preview funktionieren, Szene bleibt nach Reload korrekt.
  `processed_video_url` wird zusätzlich dort verlangt, wo Lip-Sync intentional
  war.
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
`docs/v433-motion-studio-final-acceptance.md` mit bewiesenen Kernpfaden,
unterstützten Sprachen, bekannten nicht-blockierenden Schulden und der Liste der
frozen Architekturverträge (v283-Baseline, v400, v422, v425, v426, RS3,
G3.2.2/F1, C1).

Für FA-4 werden im Bericht zwei Kennzahlen **getrennt** ausgewiesen:
„4 Sprecher erfolgreich bewiesen" und „maximale getestete Turn-Anzahl". Damit
wird „Multi-Speaker-Maximum = 4" nicht fälschlich als Turn-Limit gelesen.

EN/ES-Abnahmedefinition: beide Sprachen müssen funktional vollständig und
verständlich sein. Fehlendes spanisches Feintuning mit sauberem EN-Fallback
bleibt P2/P3; rohe Keys, prominente deutsche UI-Texte und Sprach-Rücksprünge
sind Abschlussblocker.

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
