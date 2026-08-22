# Remotion-Ordner sauber zusammenführen

## Ausgangslage

- **Neu (behalten):** `C:\Users\dusat\caption-cloud-magic\remotion\` — 10 Einträge, kam per `git pull`. Versionierte, gültige Fassung.
- **Alt (Backup):** `...\Desktop\AdTool AI Markenrechte\remotion\` — 16 Einträge, enthält zusätzlich `node_modules`, `build`, `nvm`, `.env`, `package-lock.json`, `.prettierrc`, `eslint.config.mjs`, `check-env.cjs`, `remotion.config.ts`.
- `git pull` und `git stash pop` sind erledigt. Offen: `bun` ist auf dem Rechner nicht installiert (`Der Befehl "bun" ... konnte nicht gefunden werden`).

## Regel

Den Backup-Ordner **nicht** zurückkopieren. Aus dem Backup wird nur übernommen, was Git bewusst nicht enthält.

| Datei/Ordner | Aktion |
|---|---|
| `node_modules`, `build`, `nvm` | Nicht kopieren — werden neu erzeugt |
| `package-lock.json` | Nicht kopieren — Repo nutzt `bun.lock` |
| `.env` | **Ja, kopieren.** Enthält die Remotion-GCP-Zugangsdaten, die im neuen Ordner fehlen. Per `.gitignore` geschützt. |
| `remotion.config.ts`, `eslint.config.mjs`, `.prettierrc`, `check-env.cjs` | Erst öffnen und prüfen; nur kopieren, wenn im neuen Ordner nicht vorhanden und noch gebraucht |
| Rest (`src`, `public`, `package.json`, `tsconfig.json`, `index.ts`, `README.md`) | Nicht kopieren — neue Version ist maßgeblich |

## Schritte

1. Desktop-Backup unangetastet liegen lassen (Sicherheitsnetz).
2. `.env` aus dem Backup nach `caption-cloud-magic\remotion\` kopieren.
3. Prüfen, dass `remotion\.gitignore` den Eintrag `.env` enthält; sonst ergänzen.
4. Optionale Konfigdateien aus der Tabelle vergleichen und nur bei Bedarf kopieren.
5. **Bun installieren** (fehlt aktuell). In PowerShell:
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```
   Danach das Terminal neu öffnen und `bun --version` prüfen.
6. Abhängigkeiten installieren:
   ```bat
   cd C:\Users\dusat\caption-cloud-magic\remotion
   bun install
   ```
   Alternative ohne Bun: `npm install` — erzeugt allerdings ein zusätzliches `package-lock.json`, das nicht committet werden sollte.
7. `git status` prüfen — außer der ignorierten `.env` sollten keine unerwarteten Dateien auftauchen. Der bereits sichtbare untracked Ordner `npx` und die geänderte `package-lock.json` im Projektstamm gehören nicht ins Repo.
8. Wenn alles läuft, Desktop-Backup nach ein paar Tagen löschen.

## Sicherheitshinweis

Der private GCP-Service-Account-Key aus `remotion/.env` war im Screenshot vollständig sichtbar. Empfehlung: den Key in der Google Cloud Console für den Service Account `remotion-sa@captiongenie-integration...` löschen, einen neuen erzeugen und die `.env` damit aktualisieren.
