## Befund

Ja, wir wissen jetzt deutlich mehr als vorher:

1. **Der aktuelle Loop ist nicht mehr ein „normal laufender“ Lip-Sync.**
   - Aktuelle Szene: `9e72cae4-1f0e-45a3-abd7-c9201a95b9d5`
   - Status in der Datenbank: `lip_sync_status = pending`, `twoshot_stage = circuit_open`
   - Die UI zeigt dadurch weiter „Wartet auf Sync.so-Slot…“, obwohl kein echter Sync.so-Job mehr läuft.

2. **Der 10-Minuten-Watchdog greift deshalb nicht.**
   - `lipsync-watchdog` scannt aktuell nur `running` und `audio_muxing`.
   - `compose-dialog-segments` setzt Circuit-Open aber auf `pending`.
   - Ergebnis: die Szene fällt aus dem Watchdog-Radar und bleibt als „wartend“ sichtbar.

3. **Der Circuit-Breaker öffnet fälschlich wegen des 3-Sprecher-Providerfehlers.**
   - Im Webhook wurde `provider_unknown_error` zwar vom direkten Circuit-Tick ausgenommen.
   - Aber die DB-Funktion `syncso_recent_failure_count()` zählt `provider_unknown_error` weiterhin mit.
   - Nach 5 solchen Provider-Fehlern öffnet der globale Sync.so-Circuit trotzdem.

4. **Der Client startet den Loop wieder selbst.**
   - `useTwoShotAutoTrigger` behandelt `pending + circuit_open` als advanceable.
   - Dadurch wird `compose-dialog-segments` alle paar Sekunden erneut aufgerufen.
   - Die Funktion sieht den offenen Circuit, setzt wieder `pending + circuit_open`, und der Kreislauf beginnt von vorn.

5. **Die eigentliche Sync.so-Ursache ist weiterhin: providerseitiger `FAILED` ohne `error_code`.**
   - Matthew und Kailee schlagen bei 3-Personen-Plate mit manueller Face-Targeting-ASD fehl.
   - Sync.so liefert nur `An unknown error occurred.` und keinen `error_code`, auch nach GET-Fallback.
   - Der neue `coords-pro-box`-Retry wurde für Kailee nicht mehr sauber erreicht, weil der Circuit vorher geöffnet hat.

## Plan

### 1. Circuit-Breaker korrigieren

- Migration für `syncso_recent_failure_count()`:
  - `provider_unknown_error` wird nicht mehr als globaler Circuit-Breaker-Fehler gezählt.
  - Der globale Circuit soll nur echte Provider-/Infrastruktur-Probleme zählen: `timeout`, `rate_limited`, `http_5xx`, `auth`, ggf. offizielle Sync.so-Infrastruktur-`error_code`s.
- Dadurch kann eine einzelne problematische 3-Sprecher-Szene nicht mehr den ganzen Sync.so-Dispatch blockieren.

### 2. Circuit-Open darf keine laufende Szene auf `pending` zurückwerfen

In `supabase/functions/compose-dialog-segments/index.ts`:

- Wenn `evaluateCircuit()` blockiert:
  - Bei frischem Start ohne bestehendes v5-State: sauber `pending/deferred` lassen.
  - Bei aktivem Retry/Advance mit bestehendem `dialog_shots.version === 5`: **nicht** auf `pending` setzen.
  - Stattdessen `lip_sync_status = running` behalten und `twoshot_stage = circuit_open` nur als Warte-Marker setzen.
- Dadurch scannt der `lipsync-watchdog` die Szene weiterhin.

### 3. Watchdog auf Circuit-/Deferred-Stuck erweitern

In `supabase/functions/lipsync-watchdog/index.ts`:

- Scan zusätzlich auf v5-Szenen mit:
  - `twoshot_stage = circuit_open`
  - `twoshot_stage = deferred`
  - oder `dialog_shots.status in ('retrying', 'rendering')`, auch wenn `lip_sync_status` versehentlich `pending` ist.
- Timeout nicht nur über `updated_at` berechnen, weil der Loop `updated_at` ständig auffrischt.
- Stattdessen harte Laufzeit über `dialog_shots.first_started_at` / `started_at` / Pass-`started_at` berechnen.
- Wenn >10 Minuten seit Start und kein echter Fortschritt:
  - `failLipSync()` ausführen
  - Credits idempotent refundieren
  - Inflight-Jobs löschen
  - `clip_error` mit der echten Ursache setzen, z. B. `syncso_provider_unknown_no_code_after_retries` statt generischem „wartet“.

### 4. Client-Autoloop stoppen

In `src/hooks/useTwoShotAutoTrigger.ts`:

- `circuit_open` aus den automatisch startbaren Stages entfernen.
- `syncso_circuit_open` nicht mehr als Auto-Retry-Regex behandeln.
- Circuit-Open ist ein Backend-Warte-/Fehlerzustand, kein Client-Startsignal.
- Der User soll nicht im Hintergrund alle paar Sekunden denselben blockierten Dispatch starten.

### 5. Echte Providerdiagnose sichtbar machen

In `sync-so-webhook` / Dispatch-Logik:

- Wenn alle safe Retries für einen Pass erschöpft sind:
  - Szene terminal failen, sobald keine echten Geschwister-Pässe mehr laufen.
  - `clip_error` mit passgenauer Diagnose setzen:
    - Sprechername
    - Pass-Index
    - Retry-Variante
    - `provider_unknown_no_code`
    - Hinweis: Sync.so hat keinen `error_code` geliefert.
- Nicht mehr als „Wartet auf Slot“ darstellen, wenn die Ursache ein Provider-Fail ist.

### 6. Einmalige Datenreparatur für die aktuelle Szene

Migration/Datensatzkorrektur:

- Szene `9e72cae4-1f0e-45a3-abd7-c9201a95b9d5` aus dem falschen `pending + circuit_open`-Loop holen.
- Entweder:
  - sauber terminal auf `failed` mit Refund setzen, wenn Retry-Budget erschöpft ist, oder
  - auf `running` zurücksetzen, damit der Watchdog sie nach der neuen Logik korrekt finalisiert.
- Veraltete Sync.so-Inflight-Jobs aus alten Szenen löschen, damit Slot-Anzeige und Registry sauber bleiben.

## Technische Details

Betroffene Dateien:

- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/lipsync-watchdog/index.ts`
- `src/hooks/useTwoShotAutoTrigger.ts`
- Migration für `syncso_recent_failure_count()` und aktuelle stuck scene

Warum das den Loop beendet:

```text
Vorher:
Provider-Fail → Retry → Circuit öffnet → status pending/circuit_open
→ Client triggert wieder → Circuit offen → wieder pending/circuit_open
→ Watchdog scannt nicht → Endlosschleife

Nachher:
Provider-Fail → Retry → Circuit blockt ggf. ohne pending-reset
→ Watchdog sieht v5/circuit_open weiter
→ nach TTL terminal fail + Refund + klare Ursache
→ Client triggert nicht automatisch neu
```

## Validierung nach Umsetzung

- Datenbank prüfen: Szene darf nicht mehr in `pending + circuit_open` hängen.
- Logs prüfen: kein erneuter `CIRCUIT_BLOCKED`-Spam alle ~30 Sekunden.
- `lipsync-watchdog` prüfen: scannt die Szene oder finalisiert sie.
- UI prüfen: kein 95%-Loop; stattdessen terminaler Fehler mit Reset-/Neu-rendern-Option.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>