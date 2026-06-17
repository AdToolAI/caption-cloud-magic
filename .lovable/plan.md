## Befund aus dem Forensik-Screenshot

Preflight v129.8 zeigt für Scene `85e38890…` Pass 0:
- 5/6 Checks **PASS** (Video URL, Audio URL, Audio Format, Video Codec, Dauer)
- **`Gesicht am ASD-Frame` = SKIP** mit `frame=—` (kein frame_number)
- Coord ist `[256, 221]` — Production-Logs zeigen aber `frame_number=50, coord=[360, 363]` an Sync.so

Damit ist die Diagnose eindeutig: Die Face-Targeting-Daten, die an Sync.so geschickt werden, stammen aus **stale State** (alter Hailuo-Take, anderer Plate, andere Auflösung) und passen nicht zum Frame, der gerade gerendert wurde → Sync.so antwortet mit `generation_unknown_error`, weil an `frame_number=50 / x=360 / y=363` schlicht kein Gesicht ist.

Das ist Klasse 5 der 6 dokumentierten Ursachen — und gleichzeitig die einzige, die Preflight aktuell nicht prüfen konnte, weil der Dispatch-Row gar kein `frame_number` enthielt.

## Ziel

1. Preflight darf nicht mehr SKIP geben — `frame_number` und `coord` müssen IMMER mitkommen.
2. Produktion darf vor dem Sync.so-Call **nicht mehr blind alte ASD-Werte verwenden** — sie muss auf dem tatsächlich frisch gerenderten Plate-Video eine Face-Probe machen und `active_speaker_detection` aus dem Resultat ableiten.
3. Wenn Gemini sagt „no_face / multiple_faces / yes_but_not_at_coord", muss der Pass **mit klarem Fehler** abgebrochen werden (kein Sync.so-Call, automatischer Refund) — nicht erst auf `generation_unknown_error` warten.

## Scope (was angefasst wird)

### A) `syncso-preflight` — Face-Probe nie mehr SKIP
- Wenn `dispatch.frame_number` fehlt, **selbst** einen Default berechnen: `Math.floor(plate_duration * 30 / 2)` (Mitte) und `coord = [video_width/2, video_height/2]` aus ffprobe-Header.
- Skip nur noch wenn `LOVABLE_API_KEY` fehlt oder Video nicht fetchbar — sonst immer echte Antwort.
- Neues Feld `face_probe.was_inferred: true` damit UI „inferred (no dispatch coord)" anzeigen kann.

### B) `compose-dialog-scene` — Live-Face-Detect statt stale ASD
Genau ein neuer Schritt direkt vor jedem Sync.so-Call (auch in `poll-dialog-shots`, das die Sync.so-Generierung tatsächlich auslöst):

1. Plate-URL aus dem gerade abgeschlossenen Hailuo-Job lesen.
2. Aufruf `detect-face-for-lipsync` (neue interne Helper-Funktion, kein neuer User-Endpoint):
   - lädt Frame `Math.floor(plate_duration*30 / 2)` via ffmpeg→PNG aus dem Plate
   - schickt PNG an Gemini Vision (`google/gemini-2.5-flash`) mit Frage „Wo ist das Gesicht des Hauptsprechers? Antworte mit JSON `{x,y,confidence}` normiert 0–1."
   - mapped Ergebnis auf Pixel-Koordinaten der Plate-Auflösung
3. Resultat:
   - `confidence ≥ 0.6` → `active_speaker_detection: { frame_number, coord }` mit den **frischen** Werten an Sync.so
   - `confidence < 0.6` oder „no_face" → Sync.so-Call **wird übersprungen**, Pass wird als `failed` mit `provider_error_code = "no_face_pre_sync"` markiert, Wallet refundiert via bestehende `syncso-refund` Helper-Logik
4. Cache: Ergebnis pro `plate_url` in `plate_face_cache` (Tabelle existiert bereits) speichern, damit Retries denselben Wert nehmen.

### C) `dialog_shots` / `syncso_dispatch_log` — Persistenz
- `syncso_dispatch_log` bekommt die finalen, live-detektierten `frame_number` und `coords` (statt der stale Werte) — Preflight liest dann automatisch das Richtige.
- Kein Schema-Change nötig, die Spalten existieren.

### D) `SyncsoForensicsSheet` — UI-Klarheit
- Wenn `face_probe.was_inferred` → kleine Notiz „Coord aus Video-Mitte abgeleitet (kein Dispatch-Frame vorhanden)".
- Wenn neuer `provider_error_code = "no_face_pre_sync"` → roter Banner „Kein Sync.so-Call gemacht — Gemini hat kein Gesicht im Plate-Frame gefunden. Credits wurden refundiert."

## Explizit NICHT in Scope

- Keine Änderung an Sync.so-Payload-Format außer `active_speaker_detection.frame_number/coord`-Werten
- Kein Wechsel auf `bounding_boxes_url`, kein `auto_detect: true` (verboten laut Memory `sync-3-doc-strict-options-v106`)
- Keine Änderung an Hailuo-Plate-Generierung, Refund-Logik, Watchdog-Intervallen
- Keine neuen Replay-Presets — Preflight reicht jetzt
- Keine Sync.so-API-Version-Migration

## Erwartetes Ergebnis

- Forensik zeigt für `85e38890…` entweder „PASS" mit echten Koordinaten → Sync.so akzeptiert den Call,
- oder „FAIL: no_face" → Pass scheitert sauber **bevor** Geld bei Sync.so verbrannt wird, mit klarer Fehlermeldung im UI.
- `generation_unknown_error` verschwindet als „mysteriöse" Klasse vollständig — entweder ist Preflight rot (= unsere Schuld, klar diagnostiziert), oder Preflight ist grün und der seltene Restfall ist eindeutig ein Sync.so-Bug, den wir mit Bundle melden können.
