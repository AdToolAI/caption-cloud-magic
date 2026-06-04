Ja. Bevor wir nochmal generieren, sollten wir die Lip-Sync-Schicht auf **eine einzige relevante Pipeline** reduzieren. Der Fehler ist inzwischen nicht mehr nur „Sync.so Payload falsch“, sondern dass zu viele alte Fallbacks, Versionen und Nebenpfade aktiv sind und sich gegenseitig überstimmen.

## Ziel

Eine klare, wartbare Pipeline:

```text
3+ Sprecher
  → Sync.so Official Segments Single-Call
  → Sync.so Webhook
  → Szene fertig oder sauber fehlgeschlagen

1–2 Sprecher
  → bewährter einfacher Pfad
  → keine 3-Speaker-Fallback-Vermischung
```

Keine alten v41–v47 Experimente, kein stiller Fan-Out-Fallback, kein kaputtes Partial-Muxing, kein `sync-3`-Fallback in einer Segments-Pipeline.

## Cleanup-Plan

### 1. Relevante Ziel-Pipeline festlegen
Für 3+ Sprecher bleibt nur noch:

```json
{
  "model": "lipsync-2-pro",
  "input": [
    { "type": "video", "url": "..." },
    { "type": "audio", "url": "...", "refId": "speaker_1" },
    { "type": "audio", "url": "...", "refId": "speaker_2" },
    { "type": "audio", "url": "...", "refId": "speaker_3" }
  ],
  "segments": [
    {
      "startTime": 0,
      "endTime": 2.3,
      "audioInput": { "refId": "speaker_1" },
      "optionsOverride": {
        "active_speaker_detection": {
          "frame_number": 12,
          "coordinates": [385, 171]
        }
      }
    }
  ],
  "options": { "sync_mode": "cut_off" },
  "webhookUrl": "..."
}
```

Das ist die Sync.so-Dokumentation. Daran richten wir den Code aus.

### 2. Alte 3+ Sprecher-Pfade deaktivieren/entfernen
Aus `compose-dialog-segments` werden für 3+ Sprecher entfernt oder hart blockiert:

- v5 Fan-Out-Fallback für 3+ Sprecher
- `coords-pro-box` Bounding-Box-Retry
- `sync3-coords` Retry
- `auto-pro` / `auto-standard` Fallbacks für 3+ Sprecher
- `segments_secs` für 3+ Sprecher
- alte Version-Kommentare und Branches v41–v47, soweit sie die Zielpipeline verwirren

Wichtig: Wenn die Official-Segments-Pipeline nicht sicher gebaut werden kann, soll sie **vor dem Sync.so-Call klar fehlschlagen**, statt in einen alten Pfad auszuweichen.

### 3. Einen neuen kanonischen State einführen
Für die bereinigte Pipeline verwenden wir z. B.:

```json
{
  "version": 48,
  "engine": "sync-official-segments",
  "status": "rendering",
  "model": "lipsync-2-pro",
  "sync_job_id": "...",
  "segments": [...],
  "speaker_refs": [...],
  "asd_mode": "coordinates",
  "source_clip_url": "..."
}
```

Webhook und Watchdog akzeptieren dann gezielt diese neue Version, statt viele historische Versionen gleich zu behandeln.

### 4. Webhook vereinfachen und absichern
In `sync-so-webhook`:

- v48 Official Segments bekommt einen eigenen, kleinen Handler.
- `COMPLETED` setzt nur dann final auf fertig, wenn `outputUrl` vorhanden ist.
- `FAILED` macht maximal einen sauberen Retry, danach klarer Fail + Refund.
- Keine Vermischung mit v5/Fan-Out-Logik.
- Alte v41–v47 Retry-Ladder wird entfernt oder nur noch legacy-lesend behandelt.

### 5. Partial-Muxing endgültig verhindern
Der aktuell konkrete Freeze entstand, weil bei 3 Sprechern nur 1 Pass fertig war, aber trotzdem der Mux gestartet wurde.

Daher:

- `render-sync-segments-audio-mux` darf bei Multi-Speaker nie mit unvollständigen Passes starten.
- Wenn `expected_speakers >= 3`, aber weniger als alle Outputs vorhanden sind: sofort fail, kein `single-audio-swap`.
- Kein finaler `done`-Status bei Teilresultaten.

### 6. Alte Legacy-Funktionen markieren oder stilllegen
Wir prüfen und bereinigen diese Funktionsfamilie:

- `compose-dialog-scene`
- `compose-dialog-segments`
- `poll-dialog-shots`
- `sync-so-webhook`
- `render-sync-segments-audio-mux`
- `lipsync-watchdog`, falls vorhanden
- `_shared/syncso-preflight.ts`
- `_shared/twoshot-face-map.ts`

Nicht blind löschen: Nur entfernen, wenn keine aktive Pipeline mehr darauf angewiesen ist. Wo Löschen zu riskant ist, wird ein harter Guard eingebaut: „nicht für 3+ Sprecher“.

### 7. Datenbank-State der kaputten Szene bereinigen
Für die betroffene Szene `61edb887-10c7-432d-b777-600707bf7d9a`:

- falsches `lip_sync_applied_at` entfernen
- falschen finalen Mux-Output entfernen
- `dialog_shots` zurücksetzen
- stale Sync.so Inflight-Jobs bereinigen
- Szene wieder auf `pending` setzen

Damit der nächste Trigger wirklich frisch startet.

### 8. Memory/Plan aktualisieren
Die Architektur-Memory bekommt eine neue Regel:

```text
3+ Speaker Lip-Sync uses only Sync.so Official Segments v48.
No v5 fan-out, no sync-3 fallback, no bounding-box retry, no partial mux.
```

Damit wir später nicht wieder alte Pfade reaktivieren.

## Was danach anders ist

- Es gibt für 3 Sprecher nur noch eine Pipeline.
- Wenn Sync.so fehlschlägt, sieht man einen klaren Fehler statt ein eingefrorenes „fertiges“ Video.
- Kein alter Fallback kann mehr heimlich ein falsches Resultat als erfolgreich markieren.
- Die nächste Generierung ist sauber messbar: entweder `v48_official_segments_payload` → `COMPLETED`, oder ein eindeutiger Fail mit Refund.