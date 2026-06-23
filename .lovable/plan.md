Ich habe die Ursache eingegrenzt: Die nervige Anfangssequenz ist sehr wahrscheinlich die automatische Product-Tour auf `/home`. Aktuell wird sie erneut gestartet, wenn der serverseitige Abschlusswert `tour_completed_at` nicht gesetzt ist; zusätzlich verhindert `sessionStorage` das nur innerhalb derselben Browser-Session, nicht zuverlässig nach Wechseln zwischen Lovable und Plattform.

Plan:

1. Product-Tour-Persistenz härten
   - In `useProductTour` zusätzlich einen dauerhaften lokalen Marker in `localStorage` setzen, sobald die Tour startet, übersprungen oder beendet wird.
   - Beim Laden zuerst diesen lokalen Marker prüfen, damit die Tour auch dann nicht wieder anspringt, wenn die Datenbank-Spalte `tour_completed_at` noch leer ist oder das Update fehlgeschlagen ist.

2. Auto-Start weniger aggressiv machen
   - Die Tour soll nicht bei jedem Besuch von `/home` automatisch starten.
   - Auto-Start nur erlauben, wenn weder lokaler Marker noch serverseitiger Abschluss vorhanden ist.

3. Abschluss/Skip robust speichern
   - Bei `markCompleted` und `skipTour` sofort lokal als erledigt markieren, bevor der Backend-Write passiert.
   - Dadurch bleibt die UI ruhig, selbst wenn der Backend-Write verzögert ist oder kurz fehlschlägt.

4. Manuelles Wiederanzeigen weiterhin möglich lassen
   - Die bestehende `startTour`-Funktion bleibt erhalten, damit die Tour später über Hilfe/Onboarding manuell gestartet werden kann, falls irgendwo ein Button dafür existiert oder später ergänzt wird.

5. Kurzer Funktionstest
   - Prüfen, dass `/home` nach erneutem Öffnen/Tab-Wechsel keine Tour mehr automatisch zeigt.
   - Prüfen, dass ein expliziter Tour-Start weiterhin funktionieren würde.