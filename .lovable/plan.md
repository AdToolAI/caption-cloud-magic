

# Fix: Carets entfernen + Lock-Dateien loeschen

## Was passiert ist

Die vorherigen Aenderungen haben die Carets nicht entfernt -- `package.json` zeigt immer noch `^4.0.424` statt `4.0.424`. Ausserdem existieren sowohl `bun.lock` als auch `bun.lockb` weiterhin mit der kaputten `mux-embed` Workspace-Referenz.

## Aenderungen

### 1. package.json -- Carets entfernen (4 Zeilen)

| Zeile | Vorher | Nachher |
|-------|--------|---------|
| 48 | `"@remotion/lottie": "^4.0.424"` | `"@remotion/lottie": "4.0.424"` |
| 49 | `"@remotion/player": "^4.0.424"` | `"@remotion/player": "4.0.424"` |
| 92 | `"remotion": "^4.0.424"` | `"remotion": "4.0.424"` |
| 99 | `"zod": "^3.22.3"` | `"zod": "3.22.3"` |

### 2. Lock-Dateien loeschen

- `bun.lock` -- enthaelt kaputte `mux-embed@workspace:*` Referenz
- `bun.lockb` -- binaeres Pendant, ebenfalls korrupt

Beide werden beim naechsten Build sauber neu generiert -- diesmal ohne die `mux-embed` Referenz, da das Paket nicht in `package.json` steht.

## Erwartetes Ergebnis

- Build-Fehler "mux-embed workspace dependency not found" ist behoben
- Remotion Versions-Mismatch kann nicht mehr auftreten (keine Carets = keine abweichenden Versionen)
