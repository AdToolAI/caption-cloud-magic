## Antwort vorab: Nein — noch nicht alle Fehler bereinigt.

Der **422 "unknown refId"** ist behoben (camelCase `refId` wird jetzt korrekt verwendet). Der letzte Run ist aber wieder **FAILED** — diesmal mit `An unknown error occurred.` von Sync.so direkt nach dem Dispatch (Job `5dc21163…` und Retry `55ef5688…`).

### Was ich gefunden habe

Logs zeigen: Payload geht durch, Sync.so akzeptiert ihn (200 OK beim POST `/v2/generate`), bricht aber dann beim Rendern ab. Im Webhook-Echo fehlt das `segments`-Feld komplett — also hat Sync.so unsere Segments-Struktur entweder verworfen oder beim Verarbeiten verworfen.

**Root cause laut Sync.so-Doku (Speaker Selection Guide, Zeilen 30 + 48):**

> `bounding_boxes` ist eine **per-frame array über das gesamte Video**. Jeder Eintrag entspricht **exakt einem Frame** der Quelle. "The number of entries must match the total frame count."

Wir bauen den Array aber mit einer **hardcodierten Annahme** `ASSUMED_FPS_V41 = 24` (Zeile 808 von `compose-dialog-segments/index.ts`). Wenn die Talking-Head-Plate nicht exakt 24 fps hat (Hailuo/HeyGen liefern oft 25 oder 30 fps), stimmt die Array-Länge nicht mit der echten Frame-Anzahl überein → Sync.so wirft "unknown error".

Zusätzlich füllen wir aktuell den **gesamten Array** (auch außerhalb des Segment-Bereichs) mit derselben Speaker-Bbox — laut Doku sollten Frames ohne Speaker `null` sein.

### Sync.so's eigener Vorschlag für Multi-Speaker-Segments

Im offiziellen Segments-Guide (Zeile 251 ff. "Target Different Speakers Per Segment") verwendet Sync.so **nicht** `bounding_boxes`, sondern **`frame_number + coordinates`** pro Segment:

```json
"optionsOverride": {
  "active_speaker_detection": {
    "frame_number": 0,
    "coordinates": [200, 300]
  }
}
```

Das ist genau unser Use-Case (3 Sprecher, je ein Segment pro Turn) — und es umgeht die fps/Frame-Count-Falle komplett.

### Plan (v44)

**1. `compose-dialog-segments/index.ts` — ASD-Variante wechseln**

Im v43-Block (Zeilen 929–965) den `optionsOverride.active_speaker_detection` so umbauen:

```ts
optionsOverride: {
  active_speaker_detection: {
    frame_number: Math.max(0, Math.round(((s + e) / 2) * fpsHint)),
    coordinates: [cx, cy],   // Gesichtsmittelpunkt aus faceMap
  },
},
```

- `cx, cy` aus der bereits resolvten `speakerCoords` (Log Zeile 5: `coords=[[261,257],[477,257],[653,288]]`) — die haben wir schon.
- `frame_number` muss nur auf einem Frame des Segments liegen, nicht exakt; Mittelpunkt ist robust.
- `fpsHint` aus dem mp4-Probe (`plateDims`), Fallback 24 — Genauigkeit ist hier nicht kritisch, da nur **ein** Frame referenziert wird.
- `ASSUMED_FPS_V41`-Array komplett entfernen, ebenso `boundingBoxes`-Generierung und den Collision-Shift (für coordinates irrelevant).

**2. Logging & Memory**

- Log-Zeile umstellen: `asd=coords frame=… coords=[x,y]` statt `asd=bbox pad=…`.
- `mem/architecture/lipsync/v43-bounding-boxes-asd.md` umbenennen/aktualisieren → `v44-coordinates-asd.md` mit Begründung (Sync.so-Beispiel + fps-Frame-Count-Problem).
- `mem/index.md` Eintrag entsprechend updaten.

**3. Optional Hardening (gleicher Edit)**

- Pad-Escalation (0.08→0.18→0.28) entfernen — bei Punkt-ASD irrelevant.
- Bbox-Collision-Shift entfernen — für coordinates nicht nötig.
- `bounding_boxes_url`-Pfad **nicht** bauen — wir brauchen ihn nicht, coords reicht.

**4. Failed Scene zurücksetzen**

- Scene `4992cff4-e351-461c-aaae-a765696acf12`: `lip_sync_status='pending'`, `clip_error=null`, `dialog_shots='{}'::jsonb` → erlaubt Re-Dispatch ohne weiteren Credit-Abzug (Refund war bereits = true).

**5. Deploy & Verify**

- `compose-dialog-segments` deployen.
- Scene manuell triggern.
- Erwartete Log-Zeile:
  `v44_official_segments_payload model=lipsync-2-pro asd=coords speakers=3 segments=3`
- Webhook-Echo muss `status=COMPLETED` und ein gültiges `outputUrl` liefern.

### Was bleibt unverändert

- Top-Level-Struktur: `model: lipsync-2-pro`, `input[]` mit `refId` (camelCase), Top-Level `segments[]`, `options.sync_mode: "loop"`, async Webhook.
- v5 Fan-out für 1–2-Sprecher-Szenen — nicht angefasst.
- Credit-Refund-Logik und Idempotency-Guard (`version: 43` → wird auf `44` gebumpt).

### Restrisiko

Sollte auch `frame_number + coordinates` an **dieser** Plate fehlschlagen, bleibt als Fallback Variante 1 (`auto_detect: true`) — würde aber bei 3 nahe stehenden Sprechern wahrscheinlich den falschen erwischen. Erst nach v44-Failure einbauen.
