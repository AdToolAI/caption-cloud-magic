# Änderung 2: Full-Shot-Zeitbasis reparieren (oder Full-Shot verwerfen)

## Was der Lauf gezeigt hat (gemessen, nicht geraten)

Szene `a0b2a6f1…`, Generation 2, 4 Turns / 2 Sprecher, 21:18–21:19 UTC:

- Alle 4 Pässe wurden im **neuen Full-Shot-Pfad** dispatcht
  (`dispatch_video_kind: "full_plate"`, `preclip_used: false`,
  `asd_mode: bounding_boxes_url`, `asd_auto_detect: false`, Modell `sync-3`).
- Alle 4 Pässe wurden von Sync.so **abgelehnt**, nicht als noop geliefert:
  `syncso_segments_REJECTED: [generation_input_face_selection_invalid]`
  „We could not use the selected speaker face for this video."
- Damit ist der V543-Versuch beantwortet: Full-Shot + explizite Box wird in
  der jetzigen Form vom Provider gar nicht erst angenommen. Genau davor warnt
  auch der alte Kommentar im Code (`v187_preclip_required_no_fullplate_fallback`),
  der exakt diesen Fehlercode als Grund nennt.

## Warum die Ablehnung kommt — zwei belegte Zeitbasis-Brüche

Im Full-Shot-Pfad passen Video, Audio und Box-Array zeitlich nicht zusammen:

1. **Audio ≠ Video-Zeitbasis.** Gesendet wird das *enge* Turn-Audio
   (Pass 0: 2,249 s, beginnt bei t=0), aber das *ganze* Plate-Video (15 s).
   Die Boxen werden im Full-Shot-Pfad in **Plate-Zeit** gebaut
   (`v124VoicedWindows = speakerWindowsSecs`, ungeschoben), alle Frames
   ausserhalb der Sprechfenster sind `null`. Mit `sync_mode: cut_off` schneidet
   Sync.so das Video auf die Audiolänge — im verwendeten Bereich steht dann
   für spätere Turns überhaupt keine Box, nur `null`. Ergebnis: „keine
   verwendbare Sprecher-Fläche".
2. **Framezahl ist geschätzt, nicht gemessen.** Ohne Preclip gilt
   `dispatchFps = ASSUMED_FPS = 24` und
   `frameCount = ceil(Plate-Dauer × 24)`. Die echte Plate-FPS wird nicht
   geprüft. Weicht sie ab (25/30), hat das Box-Array eine andere Länge als
   das Video Frames hat — dieselbe Fehlerklasse, die der Code bei Preclips
   schon einmal hart abgesichert hat (v163).

## Änderung 2 (zweite von maximal vier)

Ziel: den Full-Shot-Pfad genau einmal zeitlich sauber machen und dann
messen — nicht weiter Varianten raten.

1. **Audio plate-aligniert senden.** Im Full-Shot-Pfad wird das Turn-Audio auf
   die volle Plate-Länge gelegt: Stille bis zum Turn-Start, Turn-Audio an
   seiner echten Plate-Position, Stille danach. Damit teilen Video, Audio und
   Box-Array eine Zeitachse. Alternative, falls die Audioaufbereitung zu tief
   greift: `sync_mode` im Full-Shot-Pfad auf einen nicht-schneidenden Modus
   setzen — aber nur eine der beiden Varianten, nicht beide.
2. **Framezahl und FPS aus dem tatsächlich versendeten Video messen** (dieselbe
   Probe wie beim Preclip), statt `ASSUMED_FPS = 24` anzunehmen. Weicht die
   Messung fehl, wird Full-Shot für diesen Pass **nicht** dispatcht, sondern
   der Preclip-Pfad genommen — kein Provider-Call auf Verdacht.
3. **Boxen im verwendeten Bereich nie leer.** Enthält das Box-Array für den
   gesendeten Zeitraum null gültige Boxen, wird Full-Shot verworfen und der
   Preclip-Pfad benutzt, bevor irgendein Provider-Call passiert.
4. **Ablehnung ist kein stiller Fehlschlag.** `generation_input_face_selection_invalid`
   aus dem Full-Shot-Pfad führt automatisch zu genau einem Retry über den
   bestehenden Preclip-Pfad, statt den ganzen Pass terminal zu killen.
   Refund-Logik bleibt unverändert idempotent.

Ausdrücklich **nicht** Teil: Provider- oder Modellwechsel, Preise, Refund-
Beträge, Identitäts-Lock (V524/V530), FA-4, V537, Retry-Zähler, Watchdog-
Timings, Schema/Migrationen, Frontend.

## Verifikation

- Fokus-Tests auf Zeitbasis (Audio-Länge = Video-Länge = Box-Array-Länge/FPS),
  `deno check` auf den geänderten Dateien.
- Deploy ausschliesslich `compose-dialog-segments`.
- Danach **ein** kontrollierter 2-Sprecher-Lauf. Bewertung: (a) wird der Pass
  vom Provider überhaupt angenommen, (b) ist der gemessene Verdikt `moved`
  statt `noop`, (c) sichtbarer Lip-Sync im Clip.

## Abbruchkriterium

Wird der Full-Shot-Pfad auch nach Änderung 2 abgelehnt oder liefert erneut
`noop`, wird Full-Shot verworfen und die verbleibenden zwei Änderungen gehen
zurück auf den Preclip-Pfad mit der gemessenen v400-Geometrie. Bleibt es auch
dort ohne sichtbaren Lip-Sync, wird Lip-Sync per Feature-Flag stillgelegt.
