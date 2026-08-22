# Sicherer Git-Pull trotz untracker remotion/-Dateien

## Problem
`git pull origin main` bricht ab, weil im lokalen Ordner `remotion/` untracked Dateien liegen, die auf dem Remote-Branch jetzt ebenfalls existieren. Git überschreibt unversionierte Dateien nicht automatisch.

## Ziel
Sichern der lokalen remotion/-Dateien, den Pull sauber durchführen und anschließend entscheiden, ob die gesicherten Dateien wiederhergestellt werden müssen.

## Schritte

1. **Sicherheits-Backup erstellen**
   - Kopiere den gesamten lokalen `remotion/`-Ordner an einen Ort außerhalb des Repositories, z. B. `C:\Users\dusat\Desktop\remotion-backup-<datum>`.
   - Damit ist garantiert nichts verloren, egal was danach passiert.

2. **Den lokalen Ordner aus dem Repository verschieben**
   - `git clean -fd remotion/` hat nichts entfernt, sehr wahrscheinlich weil `remotion/` durch eine Ignore-Regel geschützt ist.
   - Im aktuell geöffneten Ordner `C:\Users\dusat\caption-cloud-magic` exakt ausführen:
     ```bat
     move remotion ..\remotion-backup
     ```
   - Das verschiebt ihn sicher nach `C:\Users\dusat\remotion-backup`; es wird nichts gelöscht.
   - Falls Windows meldet, dass `remotion-backup` bereits existiert, stattdessen einen neuen Namen verwenden:
     ```bat
     move remotion ..\remotion-backup-2
     ```

3. **Pull durchführen**
   - Danach ausführen:
     ```bat
     git pull origin main
     ```
   - Der Pull sollte nun durchlaufen, weil der störende lokale Ordner nicht mehr im Repository liegt.

4. **Erst danach den Stash zurückholen**
   - Wenn der Pull erfolgreich war:
     ```bat
     git stash pop
     ```
   - Falls dabei Konflikte gemeldet werden, nichts löschen und die Meldung prüfen.

5. **Vergleichen und ggf. wiederherstellen**
   - Nach dem Pull den neuen `remotion/`-Stand mit `C:\Users\dusat\remotion-backup` vergleichen.
   - Falls die lokalen Dateien wichtige eigene Änderungen enthielten, diese manuell übertragen oder wieder einspielen.
   - Falls der Remote-Stand identisch oder besser ist, Backup verwerfen.

6. **Abschluss prüfen**
   - `git status` sollte keinen unerwarteten Datenverlust zeigen.
   - Projekt lokal starten/builden, um sicherzustellen, dass alles funktioniert.

## Risiken
- Ohne Backup besteht die Gefahr, lokal erstellte Remotion-Kompositionen, Assets oder Konfigurationen zu verlieren.
- Nicht `git clean -fdx` verwenden: Das würde auch ignorierte Dateien endgültig löschen.
