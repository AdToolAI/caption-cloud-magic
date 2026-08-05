# Content Studio — Feinschliff-Audit (v410)

Der Fluss steht und ist typsicher, aber ein Durchgang durch Zustand, Navigation und Randfälle zeigt sechs echte Brüche. Sie sind alle klein, treffen aber genau die Momente, in denen sich ein Werkzeug "fertig" anfühlt.

## Was heute nicht sauber ist

1. **Wiederhergestellter Entwurf verliert die Schritt-Historie.** Beim Neuladen wird der Inhalt zurückgeholt, aber die Liste der erreichten Schritte startet wieder bei "Briefing". Ergebnis: Die Schritt-Leiste ist ausgegraut, obwohl Copy und Layout vorhanden sind — der Nutzer muss sich künstlich erneut durchklicken.
2. **Kampagnen-Einstieg läuft ins Leere.** Der alte Punkt "Kampagnen" landet auf `step=deliver&mode=series`. Da "Ausspielen" ein fertiges Design verlangt, wirft der Schritt-Wächter den Nutzer wortlos zurück auf "Briefing" — der Serien-Modus ist unsichtbar. Eine Serie braucht aber nur ein Briefing, kein Layout.
3. **"Neu" räumt die URL nicht auf.** Nach dem Zurücksetzen bleiben `mode=series`, `coach=1` und `templates=1` in der Adresse stehen.
4. **Kein Rückweg in den Schritten.** Copy, Motiv und Layout haben nur "Weiter". Zurück geht nur über die Leiste — auf dem Handy die kleinste Trefferfläche der Seite.
5. **Entwurf kann den Speicher sprengen.** Gesichert werden auch alle Layout-Varianten; bei eigenen Bildern als Data-URL läuft der lokale Speicher voll und das Sichern scheitert stillschweigend.
6. **Leerer Copy-Schritt ist eine Sackgasse.** Der Hinweis "Zurück zum Briefing" ist reiner Text ohne Knopf.

Zusätzlich zwei Sauberkeits-Punkte: der Schritt-Wächter läuft bei jedem Render statt nur bei Schrittwechsel, und beim Zurücksetzen bleibt der Serien-Schalter lokal aktiv.

## Was gebaut wird

### Zustand (`ContentStudioContext.tsx`)
- `reached` in den Entwurf aufnehmen und beim Wiederherstellen mitsetzen, abgeleitet aus dem tatsächlichen Stand (Copy vorhanden → bis "Layout", Design vorhanden → bis "Ausspielen").
- `furthestAllowed` um den Serien-Fall erweitern: Ist `mode=series` gesetzt und ein Briefing vorhanden, ist "Ausspielen" erreichbar, auch ohne Design.
- Entwurf verschlanken: Varianten nicht mitsichern (sie sind aus Copy + Motiv reproduzierbar), Data-URL-Bilder auslassen und ab ~2 MB Nutzlast still auf reine In-Memory-Haltung zurückfallen.
- `reset` löscht zusätzlich die Studio-Parameter aus der URL.
- Eine `back()`-Funktion bereitstellen (ein Schritt zurück, nie unter "Briefing").

### Seite (`ContentStudio.tsx`)
- Schritt-Wächter nur auf Schritt- und Standwechsel reagieren lassen statt auf jeden Render.
- Serien-Modus aus der URL an den Provider durchreichen, damit der Wächter ihn kennt.

### Schritte
- `CopyStep`, `MotifStep`, `LayoutStep`, `DeliverStep`: dezenter "Zurück"-Knopf links neben der Hauptaktion.
- `CopyStep`: leerer Zustand bekommt einen echten Knopf zurück ins Briefing.
- `DeliverStep`: Im Serien-Modus ohne Design wird nur die Serien-Karte gezeigt (Export- und Vorlagen-Leiste ausgeblendet, statt leer zu laufen); nach erfolgreicher Serie ein Knopf "Im Kalender ansehen" zum Command Center.

## Technische Details

- Entwurfs-Version auf `2` heben, damit alte Einträge einmalig verworfen werden statt inkonsistent zu laden.
- Serien-Modus bleibt Quelle der Wahrheit in der URL (`mode=series`); der Provider liest ihn als Prop, kein zweiter Zustand.
- Keine Änderungen an Post-Designer-Kern, Export-Pfad oder `ExportActionBar` — nur Studio-Hülle, Kontext und Schritt-Komponenten.
