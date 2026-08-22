# Remotion-Ordner sauber zusammenführen

## Ausgangslage

- **Neu (behalten):** `C:\Users\dusat\caption-cloud-magic\remotion\` — 10 Einträge, kam gerade per `git pull`. Das ist die versionierte, gültige Fassung.
- **Alt (Backup):** `...\Desktop\AdTool AI Markenrechte\remotion\` — 16 Einträge. Enthält zusätzlich `node_modules`, `build`, `nvm`, `.env`, `package-lock.json`, `.prettierrc`, `eslint.config.mjs`, `check-env.cjs`, `remotion.config.ts`.

## Regel

Den Backup-Ordner **nicht** zurückkopieren. Aus dem Backup wird nur übernommen, was Git bewusst nicht enthält.

| Datei/Ordner | Aktion |
|---|---|
| `node_modules`, `build`, `nvm` | Nicht kopieren — werden neu erzeugt |
| `package-lock.json` | Nicht kopieren — Repo nutzt `bun.lock` |
| `.env` | **Ja, kopieren.** Enthält Remotion-GCP-Schlüssel, die im neuen Ordner fehlen. Sie ist per `.gitignore` geschützt und landet nicht im Repo. |
| `remotion.config.ts`, `eslint.config.mjs`, `.prettierrc`, `check-env.cjs` | Erst öffnen und prüfen; nur kopieren, wenn sie noch gebraucht werden und im neuen Ordner fehlen |
| Rest (`src`, `public`, `package.json`, `tsconfig.json`, `index.ts`, `README.md`) | Nicht kopieren — neue Version ist maßgeblich |

## Schritte

1. Backup-Ordner unangetastet auf dem Desktop liegen lassen (Sicherheitsnetz).
2. **`.env` aus dem Backup in `caption-cloud-magic\remotion\` kopieren.**
3. Sicherstellen, dass die neue `remotion\.gitignore` `.env` enthält. Falls nicht, `.env` hinzufügen.
4. Die vier optionalen Konfigdateien aus der Tabelle öffnen und mit dem neuen Ordner vergleichen. Nur kopieren, was fehlt und inhaltlich noch passt.
5. Im Projekt-Terminal Abhängigkeiten neu installieren:
   ```bat
   cd C:\Users\dusat\caption-cloud-magic\remotion
   bun install
   ```
   (falls kein Bun vorhanden: `npm install`)
6. `git status` prüfen — es sollten keine unerwarteten neuen Dateien auftauchen außer ggf. `.env` (ignoriert).
7. Wenn alles läuft, das Desktop-Backup nach ein paar Tagen löschen.

## Hinweis

Falls `git stash pop` noch aussteht: erst das ausführen und `git status` prüfen, bevor Schritt 2 startet.
