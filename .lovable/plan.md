# Sicherer Git-Pull trotz untracker remotion/-Dateien

## Problem
`git pull origin main` bricht ab, weil im lokalen Ordner `remotion/` untracked Dateien liegen, die auf dem Remote-Branch jetzt ebenfalls existieren. Git überschreibt unversionierte Dateien nicht automatisch.

## Ziel
Sichern der lokalen remotion/-Dateien, den Pull sauber durchführen und anschließend entscheiden, ob die gesicherten Dateien wiederhergestellt werden müssen.

## Schritte

1. **Sicherheits-Backup erstellen**
   - Kopiere den gesamten lokalen `remotion/`-Ordner an einen Ort außerhalb des Repositories, z. B. `C:\Users\dusat\Desktop\remotion-backup-<datum>`.
   - Damit ist garantiert nichts verloren, egal was danach passiert.

2. **Stash wiederherstellen**
   - Führe `git stash pop` aus, um die zuvor gesicherten Änderungen zurückzuholen.

3. **Untracked remotion/-Dateien entfernen**
   - Da ein Backup existiert, können die untracked Dateien im Repo-Ordner `remotion/` gelöscht werden.
   - Alternativ: `git clean -fd remotion/` (löscht alle untracked Dateien/Ordner unter `remotion/`).

4. **Pull durchführen**
   - `git pull origin main` erneut ausführen.
   - Jetzt sollte der Merge durchlaufen, weil keine überschreibbaren untracked Dateien mehr im Weg sind.

5. **Vergleichen und ggf. wiederherstellen**
   - Nach dem Pull den neuen `remotion/`-Stand mit dem Backup vergleichen.
   - Falls die lokalen Dateien wichtige eigene Änderungen enthielten, diese manuell übertragen oder wieder einspielen.
   - Falls der Remote-Stand identisch oder besser ist, Backup verwerfen.

6. **Abschluss prüfen**
   - `git status` sollte keinen unerwarteten Datenverlust zeigen.
   - Projekt lokal starten/builden, um sicherzustellen, dass alles funktioniert.

## Risiken
- Ohne Backup besteht die Gefahr, lokal erstellte Remotion-Kompositionen, Assets oder Konfigurationen zu verlieren.
- `git clean -fd` ist nicht rückgängig machbar; daher Schritt 1 zuerst.
