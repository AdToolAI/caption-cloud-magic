# Victoria-Feedback: Status und Rest-Plan

## Bereits erledigt (deployed)
- Kostenvorschau stimmt jetzt mit der Abrechnung überein (ein zentraler Preiskatalog für Frontend und alle 13 Generierungs-Funktionen, gleiche Rundung, keine unbestätigten Platzhalterpreise).
- Provider-Überlast (Veo `code: 8`): bis zu 3 automatische Wiederholungen mit Backoff, danach klare Meldung und genau eine Rückerstattung.
- Guthaben ist über das Wallet-Badge in der Kopfzeile sichtbar.

## Noch offen
1. **Daten gehen beim Tab-Wechsel verloren** — Entwürfe (besonders Video-Setup) werden nicht zuverlässig gehalten, wenn der Nutzer den Browser-Tab wechselt und zurückkommt.
2. **Buttons reagieren erst beim zweiten Klick / Seitenleiste unscharf** — die ersten beiden Einträge der linken Leiste zeigen keinen Text, erst nach mehrfachem Klicken oder Neuladen.
3. **Profil speichern schlägt fehl** — Fehlermeldung beim Ausfüllen der persönlichen Daten.
4. **Generierung klappt nicht immer beim ersten Versuch** — Felder müssen teils neu ausgefüllt werden (hängt teilweise an Punkt 1).

Nicht enthalten: UI-Vereinfachung/Minimalismus und alle Lip-Sync-/V5xx-Pfade.

## Umsetzung
- **Entwurfs-Persistenz**: Speichern des Composer-/Generator-Zustands beim Verlassen des Tabs und beim Wiederkommen wiederherstellen; kein Überschreiben des gespeicherten Entwurfs, solange die Session kurzzeitig `null` ist. Betrifft `useComposerPersistence.ts` und den Sichtbarkeits-Handler in `VideoComposerDashboard.tsx` sowie den Formularzustand in `ToolkitGenerator.tsx`.
- **Seitenleiste/erster Klick**: Ursache in der Sidebar-Komponente eingrenzen (Schriftladen/Backdrop-Blur vs. verzögertes Hydrieren), Text-Rendering unabhängig vom Glass-Effekt machen und Klick-Handler ohne Warten auf verzögerte Daten auslösen.
- **Profil speichern**: exakten Fehler beim Speichern reproduzieren (Feldvalidierung, fehlende Profilzeile, Rechte), fehlende Zeile automatisch anlegen und verständliche Fehlermeldung statt generischem Abbruch.
- **Generierung**: nach Fehlschlag bleiben die Eingaben erhalten und ein „Erneut versuchen“ startet ohne Neueingabe.

## Prüfung
- Manuelle Durchläufe: Tab wechseln und zurück, Profil speichern, Sidebar-Erstklick, Generierung mit simuliertem Fehler.
- Automatisierte Tests für Entwurfs-Wiederherstellung und Profil-Speicherpfad; bestehende Preis-Paritätstests bleiben grün.
