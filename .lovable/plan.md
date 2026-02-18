

# Fix: Carets endgueltig per Datei-Editor entfernen

## Ursache des Kreislaufs

Lovable's `lov-add-dependency` Tool fuegt bei jeder Nutzung automatisch ein `^` (Caret) vor die Versionsnummer. Deshalb kamen die Carets nach jedem "Fix" sofort zurueck. Die Loesung ist, das Dependency-Tool komplett zu umgehen und stattdessen die Datei direkt zu editieren.

## Aenderungen

### package.json -- 4 Zeilen direkt editieren (ohne Dependency-Tool)

| Zeile | Vorher | Nachher |
|-------|--------|---------|
| 48 | `"@remotion/lottie": "^4.0.424"` | `"@remotion/lottie": "4.0.424"` |
| 49 | `"@remotion/player": "^4.0.424"` | `"@remotion/player": "4.0.424"` |
| 92 | `"remotion": "^4.0.424"` | `"remotion": "4.0.424"` |
| 99 | `"zod": "^3.22.3"` | `"zod": "3.22.3"` |

Diesmal wird ausschliesslich der `lov-line-replace` Editor verwendet -- kein `lov-add-dependency`.

## Warum es diesmal funktioniert

- Vorherige Versuche nutzten `lov-add-dependency`, das automatisch `^` einfuegt
- Jetzt wird die Datei direkt bearbeitet -- das Caret wird physisch aus dem Text entfernt
- Solange niemand erneut `lov-add-dependency` fuer diese Pakete aufruft, bleibt die Version exakt gepinnt

## Risiko

Falls in Zukunft eine andere Aenderung `lov-add-dependency` fuer Remotion-Pakete nutzt, koennte das Caret zurueckkommen. Dagegen schuetzt der Memory-Eintrag, der bereits existiert und darauf hinweist, dass diese Pakete exakt gepinnt bleiben muessen.
