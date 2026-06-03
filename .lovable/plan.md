## Befund

Ja — der Fehler ist jetzt deutlich genauer isoliert.

Der aktuelle fehlgeschlagene Run ist Szene `24998e98-b53f-4b52-aed6-95ce26ee7ffa`.

Was wir sicher sehen:

1. **Sync.so bricht weiterhin mit einem Provider-Fehler ohne Fehlercode ab**
   - Webhook und GET-Fallback melden weiter nur:
     - `error: "An unknown error occurred."`
     - `error_code: null`
   - Das ist kein normaler Validierungsfehler mit offizieller Fehlernummer, sondern ein interner/undurchsichtiger Sync.so-Fehler.

2. **Das Problem tritt bei `lipsync-2-pro` + manueller Sprecher-Auswahl auf**
   - Payload nutzt:
     - Modell: `lipsync-2-pro`
     - `active_speaker_detection.auto_detect=false`
     - feste Koordinaten pro Sprecher
   - Sync.so-Doku bestätigt: manuelle Sprecher-Auswahl erfolgt über `frame_number + coordinates` oder alternativ über `bounding_boxes`.

3. **Audio-Reparatur wurde tatsächlich benutzt, aber löst den Provider-Fehler nicht zuverlässig**
   - Die fehlgeschlagenen Payloads verwenden bereits `*-trim.wav`.
   - Damit ist „zu viel Lead-In-Silence im WAV“ nicht mehr die Hauptursache.

4. **Unser Circuit Breaker hat danach weitere Versuche blockiert**
   - Nach mehreren `provider_unknown_error`-Fehlern wurde der Sync.so-Circuit geöffnet:
     - `CIRCUIT_OPEN state=open reason=rolling_threshold`
     - danach `syncso_circuit_open:circuit_open`
   - Der UI-Abbruch ist daher aktuell nicht nur der Provider-Fehler selbst, sondern auch unser Schutzmechanismus, der nach der Fehlerserie korrekt „zumacht“.

5. **Ein Pass hat funktioniert, zwei nicht**
   - Aktueller State:
     - Samuel: `failed`, `retry_count=2`
     - Matthew: `done`
     - Kailee: `retrying`, aber wegen Circuit Open nicht weiter dispatchbar
   - Das spricht gegen ein generelles Auth/API/Storage-Problem. Es ist spezifisch für einzelne Sprecher-Zielpunkte/Frames/Face-Targeting in dieser 3-Personen-Plate.

## Wahrscheinliche Root Cause

Der eigentliche technische Kern ist jetzt:

**Sync.so `lipsync-2-pro` scheitert auf dieser 3-Personen-Scene-Plate bei manueller Face-Koordinaten-Auswahl für bestimmte Sprecher mit einem undokumentierten Provider-Fehler.**

Unsere bisherigen Fixes haben Nebenprobleme verbessert:

- Webhook-Race wurde entschärft.
- Audio-Trim/Re-Encode wurde angewendet.
- Retries laufen merge-sicherer.

Aber der externe Provider lehnt bestimmte `coords-pro`-Jobs weiterhin ab, ohne einen offiziellen Fehlercode zu liefern.

## Nächster gezielter Fix

Statt weiter blind Audio-Retries zu machen, würde ich den Fallback auf eine provider-kompatiblere Sprecher-Auswahl umbauen:

### 1. Für 3+ Sprecher `bounding_boxes` statt nur `coordinates` testen

In `compose-dialog-segments`:

- Für jeden Sprecher aus vorhandener Face-Map/Koordinaten eine kleine Bounding Box um das Zielgesicht ableiten.
- Sync.so-Payload für `coords-pro` ändern von:

```json
"active_speaker_detection": {
  "auto_detect": false,
  "frame_number": 27,
  "coordinates": [284, 232]
}
```

zu einer stabileren Variante:

```json
"active_speaker_detection": {
  "auto_detect": false,
  "bounding_boxes": [null, null, [x1, y1, x2, y2], null, ...]
}
```

bzw. mit einer kompakten per-frame Box-Liste an den relevanten Frames, sofern Sync.so die Liste clipweit verlangt.

Ziel: Sync.so bekommt nicht nur einen Punkt, sondern eine echte Face-Region. Das reduziert Fehlinterpretation bei mehreren Gesichtern.

### 2. Retry-Ladder anpassen

Für 3-Personen-Szenen:

- Versuch 1: `coords-pro` mit Koordinate
- Versuch 2: `coords-pro` mit Audio-Reparatur
- Versuch 3: `coords-pro-box` mit Bounding Box
- Erst danach optional `auto-pro`, aber nur wenn der Nutzer Face-Swap-Risiko akzeptiert oder als interner Notfall-Fallback für nur einen Sprecher-Pass.

### 3. Circuit Breaker differenzieren

Der Circuit Breaker darf nicht eine einzelne problematische 3-Sprecher-Szene so behandeln, als wäre der gesamte Sync.so-Dienst down.

Anpassung:

- `provider_unknown_error` bei `coords-pro` + 3+ Sprecher nicht sofort in den globalen Circuit-Breaker zählen lassen.
- Stattdessen scene/pass-spezifisch zählen.
- So blockiert ein kaputter Multi-Speaker-Run nicht weitere Reparaturpfade oder andere Szenen.

### 4. Szene sauber terminieren statt „running + circuit_open“ hängen lassen

Wenn der Circuit offen ist und keine Reparatur mehr möglich ist:

- Scene final auf `failed` setzen.
- Refund idempotent ausführen.
- UI-Meldung präzise:
  - „Sync.so hat bei manueller Sprecher-Zielauswahl auf einer 3-Personen-Plate ohne Fehlercode abgebrochen.“
  - „Audio-Reparatur wurde versucht; nächster stabiler Pfad ist Bounding-Box-Targeting oder Scene neu rendern mit klareren Gesichtern.“

### 5. Validierung

Nach Implementierung:

- Edge Functions deployen:
  - `compose-dialog-segments`
  - `sync-so-webhook`
- Neuen Test-Run starten.
- Prüfen:
  - keine `not in passes[]`-Drops
  - keine unnötige globale Circuit-Blockade
  - Payload enthält `bounding_boxes` beim neuen Fallback
  - bei finalem Fehlschlag wird sauber failed/refunded statt endlos running/circuit_open

## Kurzantwort

Ja: Wir wissen jetzt, dass es sehr wahrscheinlich **kein Audio-Problem mehr** ist, sondern ein **Sync.so-Providerproblem mit `lipsync-2-pro` + manueller Face-Koordinaten-Auswahl auf einer 3-Sprecher-Plate**. Der nächste sinnvolle Fix ist nicht noch mehr Audio-Repair, sondern **Bounding-Box-Targeting + scene-spezifischer Circuit Breaker**.