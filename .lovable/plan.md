# Messdurchgang: zwei Meta-Profile sauber gegeneinander stellen

## Warum ein erneutes Verbinden nötig ist

Die Diagnose-Zeilen (`meta_oauth_diagnostics`) entstehen ausschließlich beim Start und beim Callback eines Verbindungsversuchs. Bereits gespeicherte Verbindungen liefern die neuen Felder (Meta-Profil-ID, gefundene Seitenzahl, granulare Scopes) nicht nachträglich. Ohne frischen Connect pro Profil gibt es also keine vergleichbare A- und B-Seite.

Zusätzlich entscheidend: Welches Facebook-Profil verbunden wird, bestimmt die Facebook-Browser-Session, nicht das AdTool-Konto. Die letzten Messungen zeigten deshalb für beide AdTool-Konten dieselbe Meta-User-ID.

## Ablauf (du)

1. Durchgang A
   - In AdTool mit Konto A anmelden.
   - Unter Verbindungen „Mit anderem Facebook-Konto verbinden" nutzen und im Meta-Fenster ausdrücklich Profil A wählen.
   - Nach dem Rücksprung prüfen: die Karte zeigt Name + maskierte Meta-Profil-ID + Anzahl gefundener Seiten.
2. Durchgang B
   - Privates Browserfenster öffnen (zuverlässigster Weg gegen Meta-Cookies).
   - Mit Konto B in AdTool anmelden, erneut „Mit anderem Facebook-Konto verbinden", diesmal Profil B wählen.
   - Wieder Meta-Profil-ID und Seitenzahl auf der Karte ablesen.
3. Abnahme
   - „Vergleich laden" im Diff-Panel drücken. Erwartung: zwei **unterschiedliche** Meta-User-IDs.
   - Zeigt die Karte in beiden Durchgängen dieselbe ID, war der Profilwechsel bei Meta nicht wirksam — dann Durchgang B im privaten Fenster wiederholen.

## Auswertung danach

- Unterschiedliche Meta-IDs, Profil B mit 0 Seiten und leeren `granular_scopes.target_ids` → Meta bindet diesem Profil keine Seiten-Assets an den Token; die Spur liegt auf Asset-/Portfolio-Ebene, nicht im Code.
- Profil B mit `target_ids`, aber `/me/accounts` leer → Fehler in unserer Seitenerkennung; Fix: IDs aus dem Token-Debug direkt hydrieren.
- Beide Profile identisch und funktionierend → der ursprüngliche Fehlerfall war ein Session-Verwechsler, kein Plattformfehler.

## Technische Details

- Keine Code-Änderung in diesem Schritt; die Messung nutzt die bereits deployten Funktionen `facebook-oauth-start`, `oauth-callback` und `meta-oauth-diff`.
- Der Fix folgt erst nach dem Befund und richtet sich nach genau einem der drei Auswertungsfälle.
