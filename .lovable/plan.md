# Plan: Remotion-Lambda-Bundle wieder hochladbar machen

## Bestätigte Ursache

- `src/lib/directors-cut/overlayModel.ts` ist im aktuellen `main` vorhanden und versioniert.
- `OverlayGraphic.tsx` importiert die Datei über `@/lib/directors-cut/overlayModel`.
- Der Alias `@` ist nur in der Vite-Konfiguration hinterlegt; die Remotion-Konfiguration enthält keine entsprechende Webpack-Alias-Konfiguration.
- Deshalb sucht der Remotion-Lambda-Bundler fälschlich nach einem Paket unter `node_modules/@/lib/...` und meldet „Module not found“, obwohl die Quelldatei existiert.

## Umsetzung

1. In den Remotion-Dateien alle zur Laufzeit benötigten `@/`-Importe auf robuste relative Pfade umstellen, insbesondere den Import von `overlayModel` in `OverlayGraphic.tsx` und `TextOverlayRenderer.tsx`.
2. Weitere Laufzeit-Aliasimporte innerhalb von `src/remotion` im selben Zug bereinigen, damit nach dem ersten Fix nicht direkt der nächste identische Bundlefehler erscheint. Reine TypeScript-Typimporte werden nur angepasst, wenn dies für einen einheitlichen Remotion-Build nötig ist.
3. Den Remotion-Bundleprozess prüfen und sicherstellen, dass `src/remotion/index.ts` ohne „Module not found“-Fehler gebündelt wird.

## Danach lokal ausführen

Nach Übernahme des Fixes im lokalen Projekt:

```text
git stash pop
git pull --rebase origin main
npm install
npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1
```

Falls `git stash pop` Konflikte meldet, nicht weiter deployen, bis diese Konflikte aufgelöst sind. Bei erfolgreichem Upload gibt Remotion am Ende eine neue Serve-URL aus; diese muss anschließend mit der für den Director's-Cut-Export konfigurierten Bundle-URL übereinstimmen.