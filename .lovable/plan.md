

# Aktueller Stand und naechste Schritte

## Status: Carets sind immer noch da

Die `package.json` zeigt nach wie vor Carets bei allen 4 Paketen:
- Zeile 48: `"@remotion/lottie": "^4.0.424"`
- Zeile 49: `"@remotion/player": "^4.0.424"`
- Zeile 92: `"remotion": "^4.0.424"`
- Zeile 99: `"zod": "^3.22.3"`

## Was jetzt gemacht wird

### Schritt 1: Carets entfernen (direkte Datei-Bearbeitung)

Vier einzelne Zeilen-Edits in `package.json` mit dem Line-Replace-Tool -- kein Dependency-Tool:

| Zeile | Vorher | Nachher |
|-------|--------|---------|
| 48 | `"@remotion/lottie": "^4.0.424"` | `"@remotion/lottie": "4.0.424"` |
| 49 | `"@remotion/player": "^4.0.424"` | `"@remotion/player": "4.0.424"` |
| 92 | `"remotion": "^4.0.424"` | `"remotion": "4.0.424"` |
| 99 | `"zod": "^3.22.3"` | `"zod": "3.22.3"` |

### Schritt 2: Was du lokal tun musst (nach dem Approve)

1. **Git pullen** um die Aenderungen zu uebernehmen
2. **`npm install`** ausfuehren damit der Lockfile sauber neu generiert wird
3. **`@remotion/lambda` installieren** (wird nur lokal fuer Deployments benoetigt):
   ```
   npm install @remotion/lambda@4.0.424 --save-dev --save-exact
   ```
4. **Bundle deployen**:
   ```
   npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1
   ```
5. **REMOTION_SERVE_URL Secret aktualisieren** mit der neuen URL aus Schritt 4

## Technische Details

- Es wird ausschliesslich `lov-line-replace` verwendet, nicht `lov-add-dependency`
- `lov-add-dependency` fuegt automatisch Carets hinzu -- das ist die Ursache des bisherigen Kreislaufs
- Der Memory-Eintrag existiert bereits und warnt davor, diese Pakete jemals ueber das Dependency-Tool zu aendern

