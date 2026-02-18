

# Zwei Probleme beheben

## Problem 1: Build-Fehler "mux-embed workspace dependency not found"

Das Paket `mux-embed` (Zeile 76 in `package.json`) wird nirgends im Quellcode importiert oder verwendet. Bun interpretiert es faelschlicherweise als Workspace-Dependency und bricht ab.

**Loesung:** `mux-embed` aus `package.json` entfernen (Zeile 76 loeschen).

## Problem 2: Lokaler Remotion Lambda Deploy schlaegt fehl

Der Befehl `npx remotion lambda sites create` funktioniert nicht, weil `@remotion/lambda` nicht installiert ist.

**Loesung:** Nach dem Fix von Problem 1 lokal installieren:

```bash
npm install --save-dev @remotion/lambda@4.0.392
```

Danach den Deploy-Befehl erneut ausfuehren:

```bash
npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1
```

## Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `package.json` | `mux-embed` Dependency entfernen (Zeile 76) |
| Lokal (Terminal) | `@remotion/lambda@4.0.392` als devDependency installieren |

