**Kurz gesagt: nein, noch nicht — der Plan ist die Behebung, umgesetzt ist er noch nicht.** Und ich will ehrlich sein, warum ich diesmal zuversichtlicher bin als bei den letzten Anläufen: Bisher haben wir immer an den *Symptomen* nachgeschärft (Trust-Ausnahmen, Floor-Werte, Probe-Timeouts). Die Datenbank zeigt jetzt zum ersten Mal die *Ursache* schwarz auf weiß, und die ist banal: das System weiß gar nicht, wo die Münder sind — und rendert die Plate ohne bestätigten Anchor.

## Zuerst: Seedance 2.5

ByteDance hat Seedance 2.5 **heute (31.07.2026)** offiziell vorgestellt. Verfügbar ist es aktuell nur in den Endnutzer-Produkten **Jimeng AI** und **Doubao Pro**. Im Blog-Post steht wörtlich: API-Zugang kommt "coming soon" über **BytePlus ModelArk**. Es gibt also noch **keinen direkten ByteDance-API-Endpunkt** — auch nicht an Replicate vorbei. Sobald ModelArk live ist, ist die Anbindung ein kleiner Adapter im bestehenden Model-Registry.

## Befund zur Szene (verifiziert in der Datenbank)

Szene `69d56a49…`, 4 Sprecher, alle aus Cast & World (Samuel, Matthew, Sarah, Kailee — alle vier haben ein Referenzbild hinterlegt):

1. **Kein einziger Preclip hatte echte Gesichts-Landmarks.** Alle vier Dispatches loggen `detector_used = face-fallback`. Die Crops wurden geometrisch geraten, nicht am Gesicht gemessen.
2. **Face-Share liegt exakt auf dem Boden**: 0.2404 / 0.2425 / 0.2470 — die 24-%-Untergrenze. Der Crop wurde bis ans Limit aufgezogen, der Mund sitzt nicht zuverlässig in der Mitte.
3. **Der Sprecher-Punkt fehlt in der Payload**: `asd_has_coordinates: false`, `asd_frame_number: null`. sync-3 bekommt keinen Hinweis, welchen Mund es animieren soll.
4. **Die Motion-Probe hat trotzdem "bestanden"** (yavg 827–2032 gegen Schwelle 4.0). Diese Varianz stammt aus Kopf-/Körperbewegung im weiten Crop, nicht aus dem Mund — das Gate ist blind für genau den Fehler, den es abfangen soll.
5. **Ähnlichkeit zu Cast & World**: `preview_anchor_url` leer, `anchor_confirmed_at` = `NULL`, Log nennt `v251_anchor_missing`. Die Plate wurde **ohne bestätigten Anchor** gerendert. Zusätzlich tragen die `dialog_turns` zwar die `characterId`, aber keine `reference_image_url`.

## Plan v340

**A. Landmarks verpflichtend statt Fallback**
- `face-fallback` ist bei N≥2 **kein Dispatch-Grund** mehr. Liefert AWS Rekognition nicht N unterschiedliche Gesichter mit Mund-Landmarks, wird die Plate einmal automatisch neu erzeugt; scheitert das erneut, bricht der Lauf sauber mit Erstattung ab, statt blind an Sync.so zu gehen.
- Detector-Ergebnis (Gesichter, Mundpunkte, Konfidenz) wird pro Pass persistiert und in der UI sichtbar.

**B. Mund-zentrierter Crop statt Floor-Crop**
- Crop wird um den erkannten Mundpunkt gebaut, Ziel-Face-Share **0.35–0.45** statt "gerade noch 0.24". Ohne Landmarks kein Crop (folgt aus A).

**C. Sprecher-Punkt in die Payload**
- `active_speaker_detection` bekommt echte `coordinates: [cx, cy]` und `frame_number` aus den Landmarks. Dispatch ohne Koordinaten wird bei N≥2 abgelehnt.

**D. Motion-Gate schärfen**
- Probe misst nur noch das enge Mundband um den erkannten Mundpunkt und vergleicht gegen die Varianz des Wangen-/Stirnbereichs. Kopf bewegt sich, Mund nicht → NOOP. Die Absolutschwelle 4.0 entfällt.

**E. Anchor-Pflicht für Cast-&-World-Treue**
- Kein Plate-Render ohne `anchor_confirmed_at`. Fehlt der Anchor, wird er aus den Cast-&-World-Referenzbildern erzeugt und bestätigt, bevor ein Video-Provider startet.
- `dialog_turns` bekommen die `reference_image_url` des Charakters mitgeschrieben.
- Gesicht↔Sprecher wird per Rekognition-Vergleich gegen das Referenzbild zugeordnet, nicht mehr über Bildposition.

**F. Verifikation statt Vermutung**
- Die Szene wird mit dem neuen Pfad einmal frisch gestartet (Credits sind erstattet). Erst wenn der Log echte Landmarks, Koordinaten in der Payload und ein bestandenes Mundband-Differenz-Gate zeigt — und das Ergebnis visuell gegen die Cast-&-World-Bilder standhält — gilt das Problem als behoben. Ich melde nichts als "gelöst", bevor das geprüft ist.

### Technische Details
Betroffen: `supabase/functions/compose-dialog-segments/index.ts`, `_shared/preclip-geometry.ts`, `_shared/preclip-trust.ts`, `_shared/syncso-face-gate.ts`, `plateFaceSlotRouter.ts`, `compose-scene-anchor`, `report-lipsync-motion-probe`, `lipsync-watchdog`, clientseitig `src/lib/composer/lipsync/computeMouthYavg.ts` und `src/hooks/useMouthYavgProbe.ts`.

Die v336/v338-„Trust ohne Probe"-Ausnahme wird durch A ersetzt: Vertrauen entsteht künftig aus echten Landmarks, nicht aus konstruktiver Isolation.
