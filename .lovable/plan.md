# Zwei Fehler: Ladebalken rot beim Re-Render + Lip-Sync ohne Mundbewegung

## Problem 1 — Ladebalken bleibt rot, Zeit verschwindet

Verifiziert im Code (`src/hooks/usePipelineProgress.ts:1077`):

```
const hasFailure = phases.some((p) => p.status === 'failed') || isStalled;
```

`hasFailure` wird über **alle** Szenen des Projekts gebildet, nicht über die Szenen des laufenden Runs. Sobald irgendeine ältere Szene den Status `failed` trägt (im Screenshot S05 „Scene failed"), gilt:

- `PipelineProgressBar.tsx:152` → Balken rot,
- `:183` → statt Prozent steht „Fehler",
- `:186` → statt Restzeit steht „Lip-Sync abgebrochen",
- `:189` → „Sauber neu starten"-Button erscheint.

Ein frisch gestarteter Re-Render (S04 „Scene is being built") wird dadurch von Anfang an als fehlgeschlagen dargestellt, obwohl er normal läuft.

**Lösung (nur Frontend/Anzeige):**

1. Fehlerzustand auf den aktuellen Run scopen: Ein `failed` einer Szene außerhalb von `clipScope` bzw. aus einer früheren Epoche (der bereits vorhandene `clipsEpochRef`-Mechanismus) färbt die Leiste nicht mehr rot.
2. Solange der aktuelle Run aktiv ist (`isActive`), hat der Laufzustand Vorrang: Prozent + Zeit/ETA werden angezeigt, der Fehlerbanner erst, wenn der aktive Run selbst terminal fehlschlägt.
3. Beim Epochen-Reset (`clips:start`) werden geerbte `failed`-Phasen der Vorgänger-Epoche verworfen, damit der Balken bei ~0 % beginnt statt sofort rot.
4. Der „Sauber neu starten"-Button bleibt erhalten, erscheint aber nur zum Fehler des aktuellen Runs.

## Problem 2 — Szene fertig, Voiceover da, aber keine Lippenbewegung

Verifiziert an den Produktionsdaten der Szene `ecb95d2b…` (fertig 15:40 UTC, 4 Turns, HappyHorse, `lip_sync_status=done`):

- Alle vier Pässe wurden erfolgreich an den Provider gegeben (`DISPATCHED`, HTTP 201).
- **Jeder** Pass endete danach mit `MOTION_UNVERIFIED / motion_probe_infra_error`, Meldung `v500_noop_unverified_anchor: anchor=face_ratio mouth_over_frame=…`.
- Die Re-Messung (`MOTION_RECHECKED`) lieferte dasselbe Ergebnis.
- Der Face-Gate vor dem Dispatch meldete zusätzlich `frame_probe_unavailable: v251_anchor_missing_probe_unavailable: no_cache_no_server_extract; source=none — dispatch will proceed unchecked`.

Damit ist die Lage eindeutig: Der **Anker-Referenzwert (face_ratio)** steht der Messung nicht zur Verfügung, weil weder Cache noch Server-Frame-Extraktion einen Frame liefern. Nach der v443-Regel gilt ein Messfehler aus Infrastruktur nicht als Verdikt — der Pass läuft „als Erfolg" durch. Ergebnis: Ein Provider-Output ohne Mundbewegung (NOOP) wird gemuxt, die Szene wird `done` gemeldet, im Video bewegt sich kein Mund. Die NOOP-Erkennung ist derzeit also **blind**, nicht falsch-negativ.

**Lösung in dieser Reihenfolge:**

1. **Anker wiederherstellen (Kernfix):** Die Frame-/Anker-Beschaffung für Probe und Face-Gate erhält denselben serverseitigen Extraktionspfad, der in der Identitätskette bereits funktioniert (Remotion-Lambda-Stills). Ziel: `face_ratio` ist zur Messzeit immer vorhanden, `no_cache_no_server_extract` verschwindet.
2. **Ursache der Extraktion prüfen:** Vor dem Umbau wird read-only festgestellt, warum die Extraktion „source=none" liefert (fehlende Eingangs-URL, Raster, oder Lambda-Aufruf) — der Fix richtet sich nach diesem Befund und wird nicht geraten.
3. **Verdikt scharf schalten:** Erst wenn der Anker verlässlich vorliegt, wird `noop` wieder ein echtes Verdikt: NOOP → gebundener Retry desselben Passes, danach klarer Fehler mit Credit-Refund — statt stiller „done"-Meldung.
4. **Sichtbarkeit:** Solange ein Pass unverifiziert bleibt, wird die Szene nicht mehr als sauber „fertig" ausgewiesen, sondern mit dem bestehenden Hinweiszustand („Re-Render empfohlen") markiert, damit kein stummes Ergebnis mehr als Erfolg erscheint.

Nicht angefasst: Provider-Vertrag (HappyHorse/Hailuo), Preise, Dispatch-Logik, V523–V538-Identitätskette, Schema.

## Technische Details

- `src/hooks/usePipelineProgress.ts` — Run-Scoping von `hasFailure`, Epochen-Reset geerbter Fehlerphasen.
- `src/components/video-composer/PipelineProgressBar.tsx` — nur Anzeige-Bedingungen (Zeit/Prozent vs. Fehlertext).
- `supabase/functions/sync-so-webhook/index.ts` — Anker-Beschaffung für die Messung, Verdikt-Schärfung nach erfolgreichem Anker.
- `supabase/functions/_shared/` (Frame-/Anker-Extraktion, Face-Gate) — gemeinsamer Extraktionspfad.

## Verifikation

- Unit-Tests: Ladebalken zeigt bei aktivem Run trotz alter fehlgeschlagener Szene Prozent + Zeit; Fehlerzustand nur für den aktiven Run.
- Backend-Tests: Anker vorhanden → Verdikt wird ausgewertet; Anker fehlt → unveränderter v443-Pass-through mit Telemetrie.
- Produktion: ein 2-Sprecher-Lauf; erwartet werden Logzeilen ohne `no_cache_no_server_extract` und ein `MOTION` Verdikt mit Score statt `MOTION_UNVERIFIED`.
