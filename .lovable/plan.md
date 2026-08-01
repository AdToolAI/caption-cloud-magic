## Plan v369 — HappyHorse-Prompt-Rejection sauber abfangen

### Bestätigter Ist-Zustand (verifiziert)
- Der Fehler im Screenshot lautet `Happy Horse I2V failed: InvalidParameter - Could not process with this prompt.` Das ist eine **Prompt-Ablehnung von Alibaba/HappyHorse beim Erzeugen der Master-Plate** — also **vor** Sync.so. Lip-Sync wurde in diesem Lauf gar nicht erreicht.
- `supabase/functions/_shared/happyhorse-green-net.ts` erkennt Ablehnungen nur über das Muster `DataInspectionFailed|Green net|inappropriate content` (Zeile 362-365). `InvalidParameter` / `Could not process with this prompt` fällt **nicht** darunter.
- Folge in `compose-clip-webhook`: Der Lauf wird weder als `green_net_rejected` getaggt noch über den Prompt-Repair-Pfad wiederholt. Der Transient-Auto-Retry greift ebenfalls nicht (kein Netzwerk-/Blip-Muster), daher direkt Fail + Refund (€0,00 im Screenshot bestätigt den Refund).
- `compose-video-clips` (Zeile ~4634) wendet beim ersten Versuch nur `sanitizeForHappyHorse` an; die stärkere `compressLipReadyPlate(..., hard=true)` wird auf diesem Pfad nicht als Repair-Stufe genutzt.

### Umsetzung

1. **Rejection-Erkennung erweitern**
   - `isGreenNetRejection` um die Muster `InvalidParameter`, `Could not process with this prompt`, `content policy`, `risk control` erweitern.
   - Rückgabe auf eine Klassifikation umstellen (`none | greennet | invalid_prompt`), damit Logs und UI unterscheidbar bleiben.

2. **Auto-Repair-Retry statt Sofort-Fail**
   - In `compose-clip-webhook`: Bei erkannter Prompt-Rejection und `retry_count < 1` den Prompt durch `sanitizeForHappyHorse` + `compressLipReadyPlate(hard=true)` schicken und **einmalig** neu dispatchen, statt sofort zu refunden.
   - Nur wenn auch der reparierte Prompt abgelehnt wird → Fail + Refund (bestehende idempotente Refund-Logik unverändert).

3. **Prompt-Härtung beim Erstversuch für Dialog-Plates**
   - In `compose-video-clips`: Für HappyHorse mit `engine_override='cinematic-sync'` bzw. ≥2 Sprechern zusätzlich zur Sanitisierung die Lip-Ready-Kompression anwenden (kürzerer, neutralerer Plate-Prompt), damit die Ablehnung seltener überhaupt entsteht.

4. **Verständliche Fehlermeldung in der UI**
   - Statt des rohen Provider-Strings eine klare deutsche Meldung: „HappyHorse hat den Szenen-Prompt abgelehnt (Inhaltsfilter). Prompt wurde automatisch entschärft und erneut versucht." bzw. bei endgültigem Fehlschlag ein Hinweis mit Handlungsempfehlung (Prompt kürzen / Provider wechseln) plus Refund-Bestätigung.

5. **Regressionstest**
   - Unit-Test für die erweiterte Klassifikation (`InvalidParameter`, `DataInspectionFailed`, transienter Netzwerkfehler, echter Fehler) und ein Test, der sicherstellt, dass der Repair-Retry genau einmal ausgelöst wird.

### Erwartetes Ergebnis
Eine Prompt-Ablehnung von HappyHorse führt nicht mehr zum stillen Szenen-Fail, sondern zu einem automatischen Repair-Versuch mit entschärftem Prompt. Erst danach greift der Fehlerfall mit klarer Meldung und Credit-Rückerstattung. Am Lip-Sync-Pfad (Sync.so, v368-Reprojektion) ändert sich nichts.
