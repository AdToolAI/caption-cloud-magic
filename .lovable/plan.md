## Befund

**Do I know what the issue is?** Ja — diesmal deutlich genauer.

Der sichtbare Abbruch „sync_so_timeout_8min“ ist sehr wahrscheinlich **nicht der eigentliche Providerfehler**, sondern ein **falscher Legacy-Watchdog**, der die neue Dialog-Pass-Pipeline nachträglich als Timeout markiert hat.

Was tatsächlich passiert ist:

- Die neue Bounding-Box-Fallback-Stufe wurde erreicht und an Sync.so gesendet.
- Sync.so hat für Samuel und Kailee trotzdem wieder geantwortet mit:
  - `An unknown error occurred.`
  - kein `error_code`
- Matthew war erfolgreich.
- Danach hat ein alter Watchdog die Szene 8 Minuten später mit `sync_so_timeout_8min` überschrieben, obwohl die echten Terminal-Fehler schon vorher bekannt waren.

## Exaktes Problem

Es sind zwei Dinge gleichzeitig kaputt:

1. **Legacy-Watchdog kollidiert mit der neuen Pass-Pipeline**
   - Die Szene nutzt `dialog_shots.version = 5` mit `passes[]`.
   - Der Watchdog erkennt aktuell nur alte `version=4`-Dialog-Shots korrekt.
   - Dadurch fällt die Szene in eine alte Sync.so-Timeout-Logik und wird falsch als „8-Minuten-Timeout“ abgebrochen.

2. **Bounding-Box-Fallback ist noch nicht präzise genug**
   - Die gesendeten `bounding_boxes` wurden synthetisch um den Mittelpunkt gebaut.
   - In der vorhandenen FaceMap gibt es aber echte, engere Face-Bounding-Boxes pro Sprecher.
   - Für 3-Personen-Plates sollte Sync.so die echte FaceMap-BBox bekommen, nicht eine große generierte Box.

## Plan

### 1. Watchdog für `dialog_shots.version=5 + passes[]` absichern

- `twoshot-lipsync-watchdog` so ändern, dass v5-Pass-Szenen nicht mehr in die alte `sync_so_timeout_8min`-Logik fallen.
- Wenn `dialog_shots.version === 5` und `passes[]` existiert:
  - keine Legacy-Timeout-Markierung setzen,
  - keine alte `audio_plan.twoshot.syncJobs`-Refund-Logik benutzen,
  - stattdessen den bestehenden v5-State respektieren.

### 2. Echte FaceMap-Bounding-Boxes verwenden

- In `compose-dialog-segments` für `coords-pro-box` zuerst die vorhandene `audio_plan.twoshot.faceMap.faces[].bbox` pro `characterId` nutzen.
- Die Box auf die tatsächlichen Video-Dimensionen skalieren.
- Nur wenn keine FaceMap-BBox existiert, auf die synthetische Box zurückfallen.

### 3. Fehlerstatus nicht mehr überschreiben

- Wenn ein Pass bereits terminal mit `provider_unknown_error` fehlgeschlagen ist, darf der Watchdog den Fehler nicht mehr zu `sync_so_timeout_8min` umschreiben.
- Die UI soll den echten Grund zeigen: Sync.so Providerfehler ohne Fehlercode bei manueller Sprecher-Zielauswahl.

### 4. Stuck Scene sauber reparieren

- Die aktuell betroffene Szene wieder in einen konsistenten Zustand bringen:
  - falschen Watchdog-Timeout entfernen,
  - vorhandene Pass-Diagnostik behalten,
  - Refund-Status nicht doppelt ausführen,
  - Szene für einen neuen sauberen Retry vorbereiten.

### 5. Validierung

- Prüfen, dass beim nächsten Versuch:
  - `coords-pro-box` echte FaceMap-BBoxes sendet,
  - kein Legacy-Timeout mehr zuschlägt,
  - echte Providerfehler nicht überschrieben werden,
  - Credits weiterhin nur idempotent refundiert werden.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>