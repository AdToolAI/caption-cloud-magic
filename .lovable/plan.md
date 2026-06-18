## Antwort auf "ist das korrekt?"

**Ja — die Daten sind korrekt, aber widersprüchlich präsentiert.** Die zwei Blöcke beschreiben zwei verschiedene Zeitpunkte:

1. **"Gesicht am ASD-Frame" (grün, PASS)** — das ist die **Live-Probe jetzt**. AWS Rekognition findet 1 Face bei `[364,621]`, Snap von `[152,144]` (Δ522px) funktioniert sauber. v129.22.3 würde einen frischen Dispatch korrekt durchlassen.

2. **"Preclip nicht dispatcht" (rot)** — das beschreibt den **historischen Pass-Record** (job `bc8ca39a…`). Der wurde *vor* v129.22.3 mit `status: face_gate_blocked` markiert und hat nie einen Preclip an Sync.so gesendet. `dispatch_never_happened: true` ist für diesen alten Record technisch korrekt.

Das Problem ist nicht das Backend — Snap & Gate stimmen. Das Problem ist die **UI-Logik im Forensics-Sheet**: sie zeigt den roten Crop-Bug-Banner auch dann noch, wenn die Live-Probe bereits beweist, dass v129.22.3 self-healed hat. Der Banner sollte sich in einen klaren "Re-Dispatch jetzt möglich"-Zustand wandeln.

## Plan: Banner-Status an Snap-Realität koppeln

### Änderung 1 — `src/components/admin/SyncsoForensicsSheet.tsx` (Zeilen 848–857)

Bedingung `result.resolved.dispatch_never_happened` aufsplitten in zwei UI-Zustände:

- **Wenn `face_probe.verdict === "yes_one_face_at_coord_after_snap"`** (oder generell `face_probe.status === "pass"` mit `snapped_coord` vorhanden):
  → **Grüner Banner** "✅ Self-healed — Re-Dispatch jetzt möglich" mit Hinweis, dass der historische Pass blockiert war, die Snap-Logik aber jetzt greift. Inkl. Delta-Anzeige `[152,144] → [364,621]`.

- **Sonst (alter Zustand)**:
  → Bisheriger roter "Crop-Bug vor Versand"-Banner bleibt wie er ist.

### Änderung 2 — optional, gleicher File

Im resolved-Footer `coord=[152,144]` zusätzlich `→ snapped=[364,621]` einblenden, wenn `face_probe.snapped_coord` vorhanden ist, damit auf einen Blick klar ist, welche Koord beim nächsten Dispatch fliegen wird.

## Was NICHT geändert wird

- Keine Edge-Function-Änderungen (`syncso-preflight`, `compose-dialog-segments` bleiben v129.22.3).
- Keine DB-Migrationen, keine Pass-Record-Rewrites — der historische `face_gate_blocked`-Status bleibt für Audit-Zwecke erhalten.
- Kein Auto-Re-Dispatch — der User triggert Re-Render bewusst über den existierenden "Replay"-Button unten rechts.

## Verifikation nach Build

1. Forensics-Sheet auf derselben Szene öffnen → roter Crop-Bug-Banner ist weg, stattdessen grüner "Self-healed"-Banner mit Delta-Vector.
2. Replay-Button drücken → neuer Pass-Record entsteht mit `coords_snapped_at` / `coords_snap_origin` gesetzt, `video_source_kind: "preclip"`, kein `dispatch_never_happened`.
