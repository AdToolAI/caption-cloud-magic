# Gekürztes Skript wirkt nicht: Sprecherzeit bleibt bei 19 s

## Befund (im Code belegt)

Im Szenen-Skript-Panel (`SceneDialogStudio.tsx`) ist der Kopf („6 Blöcke · 4 Sprecher · ~19s")
nicht aus deinem Textfeld gerechnet, sondern aus den gespeicherten Dialog-Turns der Szene:

- `idBlocks` (Zeile 833–849): Sobald kanonische `dialogTurns` existieren, werden **immer alle
  Turns** als Blöcke gerendert. Der Text aus dem Editor wird nur übernommen, wenn die Zeilenzahl
  **exakt** der Turn-Zahl entspricht (`hasAlignedEditorText`). Bei 4 Zeilen gegen 6 Turns greift
  das nicht — es bleiben die alten 6 Turn-Texte stehen.
- Die Sekunden (`Zeile 997–998`) rechnen `Zeichen / 18` über genau diese Blöcke. Deshalb bleibt
  die Anzeige auf ~19 s hängen.
- Der Speicher-Effekt (Zeile 702–724) schreibt aus demselben Grund nur dann neue Turn-Texte,
  wenn die Zeilenzahl passt. Ein gekürztes Skript wird also **nie** in die Turns übernommen —
  die Kürzung geht auch in die Produktion nicht ein.

## Umsetzung

1. **Editor ist die Wahrheit für Textmenge** (`SceneDialogStudio.tsx`)
   - `idBlocks`: Statt „nur bei exakter Übereinstimmung" wird die Turn-Liste an der Anzahl der
     sichtbaren Skriptzeilen ausgerichtet: weniger Zeilen → überzählige Turns entfallen,
     Reihenfolge und `characterId` der verbleibenden Turns bleiben erhalten. Mehr Zeilen → die
     zusätzlichen Zeilen laufen wie bisher über den Namens-Parser bzw. `looseBlocks`, damit neue
     Sprecher weiterhin erkannt werden.
   - Fällt der Sprecher einer Zeile per Namensprefix auf eine andere Figur, gewinnt der Name aus
     der Zeile — die Turn-ID wird über den Cast neu aufgelöst statt stur nach Position vergeben.

2. **Persistenz mitziehen**
   - Der debouncte Speicher-Effekt schreibt `dialogTurns` künftig auch bei abweichender
     Zeilenzahl: gekürzt heißt gekürzt, Turn-IDs der beibehaltenen Zeilen bleiben stabil
     (wichtig für die Lip-Sync-Zuordnung, siehe unten).

3. **Anzeige konsistent**
   - Blöcke, Sprecherzahl und Sekundenschätzung ergeben sich damit automatisch aus dem
     aktuellen Skript. Keine Änderung an der Schätzformel selbst.

4. **Tests**
   - Neue Unit-Tests unter `src/lib/composer/__tests__/`: 6 Turns + 4 Skriptzeilen ⇒ 4 Blöcke,
     korrekte Sprecher, kürzere Sekundenschätzung; 6 Turns + 6 Zeilen ⇒ unverändertes Verhalten
     (Regression); zusätzliche Zeile ⇒ neuer Block mit aufgelöstem Sprecher.

## Lip-Sync-Sicherheit

Die kanonische ID-Zuordnung (v201: `dialog_turns` als UUID-Quelle) bleibt erhalten — es werden
keine IDs neu erfunden, nur überzählige Turns entfernt. An der Lip-Sync-Kette selbst
(v400-Freeze) wird nichts geändert.
