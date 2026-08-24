# V505 — Aktionen und Bewegung im Lip-Sync-Plate freigeben (Tracking-gedeckt)

## Ziel

Die Figuren sollen nicht starr stehen: Aktionen ausführen, sich von A nach B bewegen, miteinander agieren — ohne dass der Lip-Sync verloren geht. Genau dafür existiert seit V452/V477 das Face- und Mund-Tracking (bewegter Crop-Pfad + identische Rückprojektion). Die Bewegungssperre im Plate-Prompt stammt aber noch aus der Zeit **vor** dem Tracking und wurde nie zurückgenommen.

## Befund (belegt durch Code-Lesung)

Der Plate-Prompt einer Lip-Sync-Szene wird serverseitig neu gebaut, nicht aus den Motion-Studio-Layern übernommen:

- `compose-video-clips/index.ts` → `buildCinematicSyncMasterPrompt()` nimmt nur `scene.aiPrompt`, entfernt Dialogzeilen, gesichtsverdeckende Phrasen und **alle Bewegungs-/Kamera-Token** (`stripCameraMotionForPlate`) und packt den Rest in die feste Vorlage `neutralTwoShotPrompt()`.
- Diese Vorlage erzwingt „LOCKED static camera … no reframing" und bei 2+ Sprechern zusätzlich „heads stay steady — no nodding, no head bobbing".
- `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` hängt zusätzlich einen Negativ-Prompt an, der Kopf- und Körperbewegung mitverbietet.
- Die pro-Charakter-Aktionsfelder (`characterShots[].actionEn`) werden als `[CastActions]`-Block eingefügt — landen aber hinter den Sperrklauseln und werden dadurch praktisch wieder aufgehoben. In den Screenshots sind diese Felder außerdem leer (nur Platzhalter), die Bewegung steht nur in der Szenenbeschreibung.
- Per-Turn-Regie (`shotDirection`) wird für das Plate überhaupt nicht gelesen.

Konkret: „Samuel … geht während der Szene natürlich nach rechts" und „Kay … dreht sich zur Gruppe zurück" werden gestrippt bzw. durch die Stille-Klausel neutralisiert.

## Umsetzung

1. **Read-only Beweisschritt**
   - Für die letzte Szene den tatsächlich versendeten Plate-Prompt und Negativ-Prompt ausgeben und auflisten, welche Bewegungsanweisungen der Nutzer verloren gegangen sind (Beschreibung + Aktionsfelder).
   - Damit ist belegt, welcher der drei Blocker (Vorlage, Negativ-Prompt, Stripper) wie viel Anteil hat.

2. **Bewegungsbudget statt Bewegungsverbot**
   - `neutralTwoShotPrompt()`: Körper-/Kopf-Stille-Klausel für 2+ Sprecher entfernen; stattdessen positive Regieanweisung, dass die angeforderten Aktionen ausgeführt werden (Gehen, Gestik, Zuwendung, Kopfdrehung, Interaktion untereinander).
   - Bewegung wird an das Trackingbudget gebunden: Figuren bleiben im Bild, Gesicht bleibt sichtbar, kein Verlassen des Rahmens, keine Verdeckung des Gesichts durch andere Figuren oder Requisiten. Das ist die Grenze, innerhalb der der bewegte Crop-Pfad den Mund sicher verfolgen kann.
   - Kamera-Lock bleibt bestehen (eine durchgehende Einstellung); Bewegung erzeugen die Figuren, nicht die Kamera.
   - Mundstille im Plate bleibt bestehen — sonst kämpft der Plate-Mund gegen den Lip-Sync-Mund.

3. **Negativ-Prompt entschärfen**
   - Aus `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` genau die Einträge entfernen, die Körper- und Kopfbewegung unterdrücken; Kadrierungs-, Schnitt- und Mund-Einträge unverändert lassen.
   - Neu aufnehmen: Gesicht verlassen des Bildes / vollständige Verdeckung / Rückenansicht während des eigenen Dialogfensters — also genau die Fälle, die das Tracking bricht.

4. **Aktionen verbindlich durchreichen**
   - `[CastActions]` als verbindliche Regieanweisung an eine wirksame Prompt-Position setzen, nicht als Restsatz.
   - Aktionen aus der Szenenbeschreibung, die einer Figur zugeordnet sind, in denselben Block übernehmen, wenn die pro-Charakter-Felder leer sind (das ist der Fall in den Screenshots).
   - Bewegungs-Stripper präzisieren: er darf nur **Kamera**bewegung entfernen („dolly, pan, zoom, push-in"), nicht Figurenbewegung („geht nach rechts", „dreht sich zur Gruppe").
   - Per-Turn-`shotDirection` als reine Handlungsanweisung (ohne Kamerabegriffe) in den Plate-Prompt aufnehmen.

5. **Absicherung**
   - Test: Plate-Prompt einer 4-Sprecher-Szene enthält die angeforderten Aktionen, keine Körper-Stille-Klausel, aber weiterhin Kamera-Lock, Mundstille und die Sichtbarkeits-Auflagen.
   - Test: Kamerabewegungs-Token werden weiterhin restlos entfernt, Figurenbewegungs-Token nachweislich nicht.
   - Test: bewegte Vorlage erzeugt `moving=true`-Pfad und identische Rückprojektion (bestehende V452-Tests bleiben grün).

6. **Ein kontrollierter S01-Lauf**
   - Szene mit klarer A-nach-B-Bewegung und Interaktion erzeugen.
   - Freigabe nur wenn gleichzeitig: sichtbare Figurenbewegung, unveränderte Kadrierung, sitzender Lip-Sync in allen Sprecherfenstern, kein NOOP-Verdikt.
   - Danach das gemessene Bewegungsbudget dokumentieren (wie viel Travel das Tracking real trägt).

## Technische Leitplanken

- Kein Eingriff in die eingefrorene Kette T8–T13, in das Verdikt oder in die NOOP-Leiter.
- Kamera bleibt gelockt; keine Kamerafahrten im Plate.
- Änderungen ausschließlich in `buildCinematicSyncMasterPrompt`, `neutralTwoShotPrompt`, dem Bewegungs-Stripper und dem Negativ-Prompt-Block.
- Fehlerpfade bleiben an die bestehende idempotente Rückerstattung gebunden.
