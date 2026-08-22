# V444 — Read-only Typecheck-Baseline für die 7 Deno-Fehler

Ziel: beweisen (oder widerlegen), dass alle 7 strikten Deno-Typecheck-Fehler in `sync-so-webhook` und `lipsync-watchdog` schon vor dem V443-Diff bestanden. Nur dann darf V443 als change-clean freigegeben werden.

Dieses Gate ist strikt read-only: keine Code-Änderung, kein Deploy, kein Provider-Lauf, kein S11-Rerender.

## Vorgehen

1. **Ist-Aufnahme**: strikter Deno-Typecheck auf beiden Funktionen am aktuellen HEAD. Alle 7 Fehler exakt erfassen (Datei, Zeile, Code, Meldung).
2. **Baseline-Aufnahme**: denselben Typecheck auf dem Vor-V443-Stand ausführen — über eine schreibgeschützte Kopie des Vor-V443-Zustands der betroffenen Dateien in einem temporären Verzeichnis ausserhalb des Projekts (`/tmp`). Kein Checkout, kein Branch-Wechsel, kein Git-State-Eingriff im Projekt.
3. **Differenz**: 1:1-Zuordnung Ist ↔ Baseline. Ein Fehler gilt nur dann als vorbestehend, wenn er in der Baseline mit gleicher Datei/gleichem Fehlercode/gleicher Ursache auftritt; reine Zeilenverschiebung durch den V443-Diff ist zulässig.
4. **Klassifikation je Fehler**: `pre-existing` oder `introduced-by-v443`.

## Verdikt

- Alle 7 `pre-existing` → `V443 = CHANGE-CLEAN` und Freigabe für genau einen S11-Owner-Rerender im nächsten Gate.
- Mindestens einer `introduced-by-v443` → BLOCKED, mit exakter Fehlerliste; der Fix wäre dann ein eigenes, minimales Folge-Gate.

## Report

Eine Tabelle mit den 7 Einträgen (Datei, Zeile Ist, Zeile Baseline, TS-Code, Meldung, Klassifikation) plus die beiden vollständigen Typecheck-Ausgaben.

## Ausdrücklich nicht in diesem Gate

Keine Typecheck-Fixes, kein erneutes Deploy, kein S11-Rerender, keine Änderung an Freeze-Invarianten, Motion-Schwellen, Provider-Vertrag oder Credits.
