# Nächste Schritte nach Backup & git stash

## Aktueller Stand
- Remotion-Ordner wurde in `C:\Users\dusat\remotion-backup` verschoben.
- `git pull origin main` war erfolgreich.
- `git stash` wurde ausgeführt (lokale Änderungen sind jetzt im Stash).
- AWS-Credentials (`AKIA53QALNUGCHM6ZX63` und Secret) wurden im CMD-Fenster als Klartext gesetzt — diese müssen rotiert werden.

## WICHTIG: AWS-Credentials rotieren

Die Keys sind in einem Screenshot sichtbar. In der AWS-Konsole:

1. IAM → Users → deinen User → Security credentials.
2. Alten Access Key deaktivieren und löschen.
3. Neuen Access Key erstellen.
4. Neues Secret in Remotion `.env` eintragen (nicht im Terminal als Screenshot sichtbar machen).

## Schritt 1: Neues CMD-Fenster öffnen

Das aktuelle Fenster kennt den Bun-Pfad noch nicht.

```bat
exit
```

Danach über das Startmenü ein **neues CMD-Fenster** öffnen.

## Schritt 2: Bun prüfen

```bat
bun --version
```

Sollte `1.4.0` oder ähnlich erscheinen.

## Schritt 3: Root-Dependencies installieren

```bat
cd C:\Users\dusat\caption-cloud-magic
bun install
```

## Schritt 4: Remotion-Dependencies installieren

```bat
cd C:\Users\dusat\caption-cloud-magic\remotion
bun install
```

## Schritt 5: Stash wieder anwenden

Falls du vorher lokale Änderungen hattest, die du behalten möchtest:

```bat
cd C:\Users\dusat\caption-cloud-magic
git stash pop
```

## Schritt 6: Backup vergleichen (nur selektiv zurückholen)

Nicht den ganzen Backup-Ordner kopieren — das würde die frischen Remote-Updates überschreiben.

Falls nötig, nur diese Dateien aus `C:\Users\dusat\remotion-backup` in den neuen `remotion`-Ordner übertragen:

- `.env` (nur nach Key-Rotation mit neuen Werten)
- eigene Skripte/Assets, die nicht im Repo sind

## Schritt 7: Test-Build

```bat
cd C:\Users\dusat\caption-cloud-magic\remotion
bun run index.ts
```

Oder falls ein Bundle-Upload geplant ist:

```bat
npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1
```

## Reihenfolge

1. AWS-Keys rotieren (sofort).
2. Neues CMD-Fenster → `bun --version` prüfen.
3. `bun install` im Root.
4. `bun install` in `remotion/`.
5. `git stash pop`.
6. Nur nötige Dateien aus Backup übertragen.
7. Test-Build oder Lambda-Upload.
