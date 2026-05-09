Ich sehe zwei wichtige Signale:

1. Die sichtbare Toast-Meldung im Screenshot ist noch die alte Meldung. Im aktuellen Code existiert sie nicht mehr. Das spricht dafür, dass im Browser noch ein altes Frontend-Bundle läuft oder der betroffene Flow an einer alten, nicht aktualisierten Callback-Instanz hängt.
2. Der technische Kern bleibt trotzdem die gleiche Stelle: `insertScenesAfter` ersetzt die Parent-Szene über mehrere Client-Requests. Das ist nicht wirklich atomar. Bei eindeutiger Szenen-Reihenfolge (`project_id + order_index`) kann ein Zwischenzustand scheitern, und die UI klappt den Studio-Bereich weg, bevor klar sichtbar ist, ob die Sub-Szenen angelegt wurden.

Plan:

1. **Client-Reorder durch echte atomare Datenbankfunktion ersetzen**
   - Eine Backend-RPC für „Parent-Szene durch Dialog-Sub-Szenen ersetzen“ erstellen.
   - Alles in einer Transaktion ausführen: Parent laden, Tail-Szenen temporär verschieben, Parent + Audio löschen, Sub-Szenen einfügen, Tail final verschieben, neue IDs zurückgeben.
   - Vorteil: Kein halb fertiger Zustand mehr durch mehrere einzelne Browser-Requests.

2. **`VideoComposerDashboard.tsx` auf RPC umstellen**
   - `insertScenesAfter` ruft nur noch die RPC auf und refetcht danach die Szenen aus der DB.
   - Keine stillen `undefined`-Rückgaben mehr: Fehler werden klar geworfen und landen sichtbar in der Toast-Meldung.

3. **`SceneDialogStudio.tsx` stabilisieren**
   - Während „Splitten & Lip Sync generieren“ läuft, bleibt die Fortschrittsanzeige sichtbar.
   - Falls das Ersetzen der Szene scheitert, wird der Prozess vor HeyGen gestoppt und zeigt die echte Ursache.
   - Falls nur HeyGen/Lip-Sync scheitert, bleiben die neu erzeugten Sprecher-Szenen sichtbar und werden als fehlgeschlagen markiert.

4. **Alte Bundle-/Cache-Symptome abfangen**
   - Eine kleine Frontend-Version/Cache-Guard-Logik ergänzen, damit nach Deploy nicht mehr sichtbar altes Code-Bundle weiterläuft.
   - Zusätzlich die alte Fehlermeldung vollständig entfernen/ersetzen, damit wir sofort erkennen, ob der aktuelle Code wirklich aktiv ist.

5. **Verifikation**
   - DB prüfen: Sub-Szenen mit `dialog-srs:*` müssen nach dem Klick entstehen.
   - Logs prüfen: Der `generate-talking-head` Aufruf darf erst nach erfolgreicher Sub-Szenen-Erstellung starten.
   - Fehlerfall prüfen: Es darf nicht mehr „Dialog-Szene konnte nicht ersetzt werden“ erscheinen; stattdessen kommt entweder die echte DB-Ursache oder ein HeyGen-spezifischer Fehler.

Technische Details:
- Betroffene Dateien: `src/components/video-composer/VideoComposerDashboard.tsx`, `src/components/video-composer/SceneDialogStudio.tsx`.
- Neue Migration: RPC/Funktion in der Datenbank für atomisches Ersetzen der Szene.
- Kein Wechsel des Video-/Lip-Sync-Providers; es geht nur um robuste Szenen-Ersetzung und Debug-Sichtbarkeit.