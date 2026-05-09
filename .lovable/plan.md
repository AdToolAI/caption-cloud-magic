Ich habe den Ablauf geprüft: Der Fehler entsteht sehr wahrscheinlich nicht mehr beim HeyGen-Render selbst, sondern bereits beim Ersetzen der Parent-Szene durch die zwei Sprecher-Szenen. Die Tabelle hat eine eindeutige Reihenfolge pro Projekt (`project_id + order_index`). Beim aktuellen Ablauf werden Tail-Szenen verschoben und danach werden neue Szenen an dieselben Order-Indizes eingefügt. Wenn das Verschieben wegen Constraint/Race/State-Mismatch nicht sauber durchläuft, schluckt `insertScenesAfter` den echten Datenbankfehler und liefert `undefined`; dadurch erscheint nur „Dialog-Szene konnte nicht ersetzt werden“. Außerdem wird der Studio-Bereich beim Start weggeklappt, weil die Parent-Szene sofort ersetzt/gelöscht werden soll, bevor sichtbarer Fortschritt stabil angezeigt wird.

Plan:

1. **Szenen-Ersetzung atomar und robust machen**
   - In `VideoComposerDashboard.tsx` die aktuelle `insertScenesAfter`-Logik ersetzen durch eine sichere Reihenfolge:
     - Parent-Szene in der DB anhand der echten ID laden (`project_id`, `order_index`).
     - Tail-Szenen zuerst in einen temporären hohen Indexbereich verschieben.
     - Parent samt Audio-Clips löschen.
     - Neue Sprecher-Szenen einfügen.
     - Tail-Szenen final zurückschieben.
   - Fehler nicht mehr schlucken: Insert-/Shift-/Delete-Fehler werden sichtbar geloggt und als klarer Fehler zurückgegeben.

2. **Lokalen State nach DB-Operation als Source of Truth neu laden**
   - Nach erfolgreichem Insert nicht mehr nur lokal „splicen“, sondern die Szenenliste aus der DB refetchen bzw. in exakt derselben Reihenfolge spiegeln.
   - Dadurch verschwinden stale IDs und die UI zeigt die zwei neuen Sprecher-Szenen direkt an der richtigen Position.

3. **Fortschritt beim 2-Sprecher-Split sichtbar halten**
   - In `SceneDialogStudio.tsx` während des SRS-Flows einen kleinen Status setzen: TTS wird erstellt, Szenen werden eingesetzt, Matthew/Sarah Lip-Sync wird gestartet.
   - Die Auto-Split-UI soll nicht einfach „zuklappen“, ohne dass der Nutzer sieht, was passiert.

4. **Bessere Fehlermeldung statt Sammel-Toast ohne Ursache**
   - Wenn das Einsetzen der Sub-Szenen fehlschlägt, die echte Ursache anzeigen, z. B. „Szenen-Reihenfolge konnte nicht aktualisiert werden“ statt pro Sprecher dieselbe generische Meldung.
   - Wenn nur HeyGen fehlschlägt, bleiben die erzeugten Sprecher-Szenen sichtbar und werden einzeln als fehlgeschlagen markiert.

5. **Aktuellen defekten Projektzustand bereinigen**
   - Die alte Parent-Szene bleibt aktuell noch bei Order 0 stehen und es wurden keine `dialog-srs:*` Sub-Szenen erzeugt.
   - Nach dem Code-Fix wird ein erneutes „Splitten & generieren“ diese Szene sauber ersetzen; optional kann ich zusätzlich stale `dialog-srs:*` Reste im betroffenen Projekt entfernen, falls vorhanden.

Technische Details:
- Betroffene Dateien: `src/components/video-composer/VideoComposerDashboard.tsx`, `src/components/video-composer/SceneDialogStudio.tsx`.
- Root Cause: `insertScenesAfter` arbeitet nicht transaktional, nutzt lokalen State als Anchor und fängt DB-Fehler ab. Durch die eindeutige `composer_scenes_project_order_unique`-Constraint kann das Einfügen der zwei Sprecher-Szenen scheitern, ohne dass die echte Ursache bis zur UI gelangt.
- Kein neues Backend-Feature nötig; nur robustere DB-Schreibreihenfolge und bessere UI-Statusanzeige.