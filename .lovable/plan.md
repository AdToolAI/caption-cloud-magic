## Befund

Der aktuell fehlgeschlagene Lip-Sync ist Scene `b4b40acc-c293-40fe-a40a-46b3ccd18242`.

Was passiert ist:
- v51 wurde korrekt dispatcht: `engine=sync-official-segments-v51`, `version=51`.
- Die neue Plate-Face-Erkennung wurde aber nicht wirklich genutzt.
- Grund: `_shared/plate-face-detect.ts` ruft Replicate direkt über `lucataco/ffmpeg-extract-frame` auf; dieser Endpoint liefert aktuell `404`.
- Dadurch fällt v51 zurück auf alte Anchor-Boxen (`plate_detect=fallback-anchor`). Genau dieser Fallback war der Grund für die vorherigen Motionless-Lips-/Unknown-Error-Probleme.
- Sync.so hat danach zweimal mit `An unknown error occurred.` abgebrochen. Die 81 Credits wurden bereits automatisch refundiert.

## Plan

1. **Frame-Extraction in v51 reparieren**
   - Den kaputten direkten Replicate-Endpoint in `_shared/plate-face-detect.ts` ersetzen.
   - Stattdessen den stabileren Replicate SDK/Model-Flow verwenden, analog zu den vorhandenen Frame-Extractor-Funktionen.
   - Zusätzlich beide Secret-Namen unterstützen: `REPLICATE_API_TOKEN` und `REPLICATE_API_KEY`.
   - Wenn das alte `ffmpeg-extract-frame` nicht verfügbar ist, auf das verfügbare `lucataco/frame-extractor` ausweichen.

2. **v51 nicht mehr blind auf Anchor-Boxen zurückfallen lassen**
   - Für 3+ Sprecher soll ein fehlgeschlagener Plate-Detect nicht automatisch mit alten Anchor-Boxen an Sync.so gehen.
   - Besser: sauberer Preflight-Fail mit Refund und klarer Fehlermeldung, oder gezielter Fallback auf eine robustere Pipeline.
   - Damit vermeiden wir „Sync.so unknown error“ und verbrannte Wartezeit.

3. **Payload-Diagnostik verbessern**
   - In `dialog_shots` speichern, ob Boxen wirklich `plate-detected` oder nur `anchor-*` waren.
   - Den Log-Marker von `v50_official_segments_payload` auf v51 aktualisieren, damit Fehlersuche nicht mehr irreführend ist.
   - Fehlertexte im UI verständlicher machen: z. B. „Gesichter konnten im fertigen Clip nicht zuverlässig erkannt werden“ statt nur „Lip-Sync abgebrochen“.

4. **Fehlgeschlagene Scene neu starten**
   - Scene `b4b40acc-c293-40fe-a40a-46b3ccd18242` nach dem Fix zurücksetzen.
   - `lip_sync_status` wieder auf pending/running-ready setzen, alte `dialog_shots` bereinigen, ohne doppelt Credits zu ziehen.
   - Danach den v51-Dispatch erneut starten.

5. **Pipeline-Test durchführen**
   - Edge-Function deployen.
   - `compose-dialog-segments` direkt gegen die Scene testen.
   - Logs prüfen auf:
     - `plate_detect=ok`
     - `plate_faces=3 expected=3`
     - `source=plate-detected`
     - Sync.so job accepted
   - Danach Webhook/DB-Status prüfen, bis `lip_sync_status='applied'` oder ein sauberer, refundeter Fail-Fast-Grund vorliegt.

## Erwartetes Ergebnis

Nach dem Fix darf v51 nicht mehr mit alten Anchor-Boxen in den Sync.so-Unknown-Error laufen. Entweder:
- die Szene läuft mit echten Plate-Face-Boxen erfolgreich durch, oder
- sie bricht vor Sync.so sauber ab, refundet automatisch und zeigt einen verständlichen Grund an.