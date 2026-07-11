# Diagnose-Plan — Einzelsprecher bewegt Lippen nicht (Szene `9267e69b`)

**Ziel:** Bevor wir Code anfassen, empirisch klären, ob Sync.so einen Noop geliefert hat, ob der Preclip wirklich 720p war, und ob der Tail-Hold der Grund für die Wahrnehmung „keine Lippenbewegung" ist. Erst dann Fix.

## Verdachts-Matrix

| # | Hypothese | Verifikation |
|---|---|---|
| H1 | Sync.so-Output ist ein Near-Noop (sizeRatio 1.24, v150 hat's unterdrückt) | Mean-Diff / Frame-Diff zwischen Preclip-Input und Sync-Output |
| H2 | Preclip real < 720p (v113-Fallschutz greift nicht bei N=1) | `ffprobe` auf `p1-preclip-98a242fffd59b408.mp4` |
| H3 | Voiced-Window (0–1.35 s) ist so kurz gegen 5 s Master, dass die restlichen 3.65 s Tail-Hold als „keine Bewegung" wahrgenommen werden | Frames aus finalem Mux bei t=0.5 s vs t=3 s extrahieren |
| H4 | Retry-Ladder hat bei `bbox-url-pro` ein stilles `done` geschrieben (kein Refund, kein weiterer Retry) | `_v106_probe` + Sync-so-webhook Logs für _v104..v106 lesen |

## Vorgehen (nur Read/Probe, keine Deploys)

### Schritt 1 — Dateien empirisch messen
- `ffprobe` auf `p1-preclip-98a242fffd59b408.mp4` → reale Breite/Höhe (H2).
- `ffprobe` auf `9267e69b-lipsync-pass-1.mp4` (Sync.so-Output) → Dauer, Breite/Höhe.
- Frame-Diff (SSIM/mean-diff) über gleich viele Sample-Frames zwischen Input-Preclip und Output → H1 quantifizieren.

### Schritt 2 — Finaler Mux inspizieren
- Frame-Extraktion aus dem finalen `dialog-stitch-muxed-…mp4` bei t=0.3 s, t=0.8 s, t=1.2 s, t=3 s.
- Vergleich: bewegt sich der Mund in 0.3–1.2 s? Steht er ab 1.4 s still?

### Schritt 3 — Logs aggregieren
- `sync-so-webhook` mit Filter `9267e69b` (ganze Historie inkl. _v104/_v105/_v106) — schauen ob die ersten Dispatches als „failed" oder „retrying" markiert wurden.
- `compose-dialog-segments` Logs für die Szene, insb. `retry_variant`-Übergänge.

### Schritt 4 — Auswertung & Fix-Empfehlung
Basierend auf H1–H4 exakt eine der folgenden Empfehlungen (in separater Plan-Runde):

- **Wenn H1 (Noop)**: `sync-so-webhook` bekommt einen N=1-Zweig, der die v113-Dimension-Probe + optionale Mean-Diff-Prüfung auch für Single-Speaker fährt und bei Noop-Verdacht einen weiteren Retry (statt still `done`) auslöst.
- **Wenn H2 (Preclip < 720)**: Fix im Preclip-Renderer wie v113 für N=1 nachziehen, plus ffprobe-Guard vor Dispatch.
- **Wenn H3 (nur Wahrnehmung)**: Tail-Hold entfernen bzw. Master-Platte im Mund-Bereich für den Sprecher trotz v230-Dämpfung minimal atmen lassen — dokumentieren, nicht als Bug behandeln.
- **Wenn H4 (Retry-Ladder-Loch)**: Retry-Ladder bekommt einen Terminal-Failure-Zweig, der bei ausbleibender Motion refundiert statt „done" zu schreiben.

## Was ich NICHT jetzt anfasse
- Keine Code-Änderungen in dieser Runde.
- Keine neuen Retries oder Refunds vor Diagnose.
- v230 Idle-Motion-Damping bleibt aktiv (Multi-Speaker-Regression sonst).

## Nächster Schritt
Nach deiner Freigabe: Ich starte Schritt 1–3 (nur Probes/Logs), poste die Zahlen (Preclip-Real-Res, Sync-Output-Res, SSIM/mean-diff, Frame-Screenshots) und **erst dann** kommt ein zweiter Plan mit dem exakten Fix.
