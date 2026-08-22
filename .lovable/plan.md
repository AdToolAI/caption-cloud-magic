# Bun in CMD installieren

## Genau diese Befehle im aktuellen CMD-Fenster ausführen

1. Bun herunterladen und installieren:
   ```bat
   powershell -Command "irm bun.sh/install.ps1 | iex"
   ```

2. **Das aktuelle CMD-Fenster vollständig schließen** (`exit` eingeben) und danach über das Startmenü ein neues CMD-Fenster öffnen. Die Installation war bereits erfolgreich; nur das alte Fenster kennt den neuen Pfad noch nicht.

3. Installation prüfen:
   ```bat
   bun --version
   ```

4. Wenn eine Versionsnummer erscheint, in den Remotion-Ordner wechseln und Abhängigkeiten installieren:
   ```bat
   cd C:\Users\dusat\caption-cloud-magic\remotion
   bun install
   ```

## Falls powershell nicht gefunden wird

Dann Bun manuell installieren:

1. Download-Link im Browser öffnen oder mit curl/wget speichern:
   ```bat
   curl -fsSL https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip -o %TEMP%\bun.zip
   ```

2. Entpacken nach `C:\Users\dusat\.bun\bin`:
   ```bat
   mkdir C:\Users\dusat\.bun\bin
   tar -xf %TEMP%\bun.zip -C C:\Users\dusat\.bun\bin
   ```

3. Pfad zur Umgebungsvariable `Path` hinzufügen:
   ```bat
   setx PATH "%PATH%;C:\Users\dusat\.bun\bin"
   ```

4. CMD neu starten und `bun --version` prüfen.
