## Diagnose

Der Backend-Status ist normal. Die Voiceover-Erzeugung läuft ebenfalls normal: Beide Sprecher wurden von ElevenLabs erzeugt.

Der aktuelle Fehler passiert vor dem eigentlichen Sync.so-Lip-Sync:

```text
lipsync engine = sync.so/v2 (direct)
faceMap { faces: 0, source: "heuristic-fallback", anchor: false, clip: true }
Refund ... source_clip_missing_speakers: detected 0/2 faces
```

Das bedeutet: Die Funktion erkennt keinen Anchor und ruft Sync.so gar nicht erst für die Face-Passes auf. Sie refundet vorher.

## Root Cause

In `compose-twoshot-lipsync/index.ts` wurde zwar die richtige Anchor-Logik eingebaut:

```ts
scene.reference_image_url || scene.lock_reference_url
```

Aber die Datenbankabfrage lädt `reference_image_url` nicht mit:

```ts
.select("id, project_id, clip_url, ..., lock_reference_url, ...")
```

Dadurch ist `scene.reference_image_url` in der Edge Function immer `undefined`, obwohl die Datenbank zeigt:

```text
has_anchor: true
has_lock_anchor: false
```

Also fällt die Funktion wieder in den alten kaputten Zustand zurück: kein Anchor, MP4-Clip als Detection-Quelle, Gemini-Video-Detection deaktiviert, Ergebnis `faces: 0`, Abbruch vor Sync.so.

## Plan zur Behebung

1. **Szenenabfrage korrigieren**
   - In `compose-twoshot-lipsync/index.ts` `reference_image_url` zur `.select(...)`-Liste hinzufügen.
   - Damit nutzt der Face-Audit endlich den vorhandenen Anchor aus dem Composer.

2. **Fail-Logik robuster machen**
   - Wenn `reference_image_url` in der DB existiert, aber im geladenen Scene-Objekt fehlt, soll ein klarer Log erscheinen.
   - Die Fehlermeldung soll unterscheiden zwischen:
     - kein Anchor vorhanden
     - Anchor vorhanden, aber Gesichtserkennung fehlgeschlagen
     - echter Sync.so-Providerfehler

3. **MP4-Fallback sauber lassen**
   - MP4s weiterhin nicht direkt an Gemini `image_url` senden.
   - Optional später First-Frame-Extraktion ergänzen; für den aktuellen Bug reicht der Anchor-Fix, weil der Anchor vorhanden ist.

4. **Betroffene Szenen zurücksetzen**
   - Die fehlgeschlagenen Cinematic-Sync-Szenen mit vorhandenem Anchor/Clip zurück auf `pending` setzen.
   - `twoshot_stage`, `clip_error` und alte Prediction-ID löschen.
   - Anchor und Clip bleiben erhalten, damit kein unnötiger Re-Render passiert.

5. **Deploy und Validierung**
   - `compose-twoshot-lipsync` deployen.
   - Danach Logs prüfen: Erwartet wird `faceMap { source: 'anchor', faces: 2+ }`.
   - Erst danach darf der Sync.so-Pass starten; falls Sync.so dann scheitert, sehen wir den echten Providerfehler statt des falschen Preflight-Abbruchs.

## Erwartetes Ergebnis

Die Szene bricht nicht mehr mit `source_clip_missing_speakers: 0/2` ab, sondern läuft in den eigentlichen Sync.so-Multi-Pass. Der zweite Charakter bekommt dadurch wieder seinen eigenen Face-Targeting-Pass.