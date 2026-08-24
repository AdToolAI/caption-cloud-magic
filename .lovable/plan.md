# V505 — Figurenbewegung im Lip-Sync-Plate wiederherstellen

## Befund (belegt durch Code-Lesung)

Der Lip-Sync-Plate-Prompt wird **nicht** aus den Motion-Studio-Prompt-Layern gebaut, sondern serverseitig neu zusammengesetzt:

- `supabase/functions/compose-video-clips/index.ts` → `buildCinematicSyncMasterPrompt()` nimmt nur `scene.aiPrompt`, entfernt Dialogzeilen, gesichtsverdeckende Phrasen und **alle Kamera-Bewegungs-Token** (`stripCameraMotionForPlate`) und packt den Rest in eine feste Vorlage `neutralTwoShotPrompt()`.
- Diese Vorlage erzwingt „LOCKED static camera … no reframing" und bei 2+ Sprechern zusätzlich „heads stay steady — no nodding, no head bobbing".
- Zusätzlich hängt `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` einen Negativ-Prompt an, der Kopf- und Körperbewegung sowie jede Kadrierungsänderung verbietet.
- Per-Turn-Regieanweisungen (`shotDirection`, Dialog-Director) werden im Plate-Prompt überhaupt nicht gelesen — sie gehen für das Plate verloren.
- `characterShots[].actionEn` landet als `[CastActions]`-Block im Prompt, wird aber danach von den beiden genannten Sperrklauseln praktisch wieder aufgehoben.

Ergebnis: Die Figuren stehen bewusst still. Konkret am Beispiel der Szenenbeschreibung („Samuel … geht während der Szene natürlich nach rechts", „Kay … dreht sich zur Gruppe zurück"): Die Gehbewegung wird vom Kamera-Stripper bzw. der Stille-Klausel neutralisiert, das Zurückdrehen von „heads stay steady — no nodding" aufgehoben. Das war die Absicht der alten Statik-Kette (statischer Crop). Seit V452 verfolgt der Preclip das Gesicht dynamisch und die Rückprojektion nutzt denselben Pfad — die harte Körper-/Kopf-Stille ist damit nicht mehr nötig.

## Umsetzung

1. **Bewegungsbudget statt Bewegungsverbot (Schritt 1, read-only)**
   - Für die letzten erfolgreichen Szenen den tatsächlich versendeten Plate-Prompt und Negativ-Prompt protokollieren und auflisten, welche Nutzer-Bewegungsanweisungen weggestrippt wurden.
   - Nur damit ist belegt, ob die fehlende Bewegung aus der Vorlage, dem Negativ-Prompt oder dem Stripper kommt. Ergebnis entscheidet über Punkt 2/3.

2. **Vorlage lockern: Figuren dürfen sich bewegen, Kamera bleibt fest**
   - `neutralTwoShotPrompt()`: „heads stay steady / no nodding" für 2+ Sprecher entfernen und durch eine positive Klausel ersetzen, die die angeforderten Handlungen ausdrücklich verlangt (Gehen, Gestik, Zuwendung, Kopfdrehung im Rahmen).
   - Die Kamera-Lock-Klausel bleibt bestehen: sie ist Voraussetzung dafür, dass Preclip und Rückprojektion geometrisch übereinstimmen.
   - Mundstille im Plate bleibt bestehen (sonst kämpft Plate-Mund gegen Lip-Sync-Mund).

3. **Negativ-Prompt entschärfen**
   - Aus `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` genau die Einträge entfernen, die Körper-/Kopfbewegung unterdrücken (nodding, head bobbing, body motion), Kadrierungs- und Mund-Einträge unverändert lassen.
   - Der Block ist als „frozen" markiert; die Änderung wird deshalb minimal und namentlich dokumentiert.

4. **Angeforderte Handlung sichtbar durchreichen**
   - `[CastActions]` im Plate-Prompt an eine Position bringen, an der die Handlungen als verbindliche Regieanweisung stehen, nicht als Restsatz.
   - Per-Turn-`shotDirection` als reine Körper-/Handlungsanweisung (ohne Kamerabegriffe) in den Plate-Prompt aufnehmen; Kamerabegriffe weiterhin strippen.

5. **Absicherung**
   - Test: Plate-Prompt einer 4-Sprecher-Lip-Sync-Szene enthält die angeforderten Handlungen und keine Körper-Stille-Klausel, aber weiterhin Kamera-Lock und Mundstille.
   - Test: Kamera-Bewegungs-Token werden weiterhin restlos entfernt.

6. **Ein kontrollierter S01-Lauf**
   - Eine Szene mit klarer Bewegungsanforderung erzeugen und prüfen: sichtbare Figurenbewegung, Kadrierung unverändert, Lip-Sync weiterhin sitzend, kein NOOP-Verdikt.
   - Freigabe nur, wenn Bewegung **und** Lip-Sync gleichzeitig stimmen.

## Technische Leitplanken

- Kein Eingriff in die eingefrorene Kette T8–T13, in das Verdikt oder in die NOOP-Leiter.
- Kamera bleibt gelockt; keine Reaktivierung von Kamerafahrten im Plate.
- Änderungen ausschließlich in `buildCinematicSyncMasterPrompt`, `neutralTwoShotPrompt` und dem Negativ-Prompt-Block.
- Fehlerpfade bleiben an die bestehende idempotente Rückerstattung gebunden.
