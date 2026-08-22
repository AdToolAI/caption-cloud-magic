# V451 — Read-Only Motion Geometry Diagnosis (Diagnose, kein Fix)

Szene `be60d106-…`, Run `05b3b97a-…`, Generation 2, Pass 0 (Sarah Dusatko), Sync.so-Job `91b3ac81-844d-44fe-acbb-1f8d3baa5698`.
Keine Edits, kein Deploy, kein Render, kein Provider-Call, keine DB-/Storage-Writes. Medien wurden ausschließlich lokal (/tmp) aus bereits existierenden öffentlichen V434-Pins gelesen.

## 1. Immutable Artefakte (persistiert, `v434_artifact_pins`)

| Rolle | Key / URL | Bytes | sha256 |
|---|---|---|---|
| Preclip (Provider-Input) | `…/v434/be60d106…/run-05b3b97a…/gen-2/pass-0/preclip-a0.mp4` | 492.501 | `da97deee23dc68f9…e223ed6cd` |
| Provider-Output | `…/v434/be60d106…/run-05b3b97a…/gen-2/pass-0/provider-output-a0.mp4` (Quelle: `api.sync.so/v2/generations/91b3ac81…/result`) | 998.446 | `d95b18daa95d2a77…f916071a` |

Beide Pins: gleicher run_id, gen 2, pass 0, attempt 0, `status: written`. Lokal geprüft (ffprobe):
**beide 720×720, 30 fps, 69 Frames, 2,300 s** → kein Skalierungs-, Crop- oder Letterbox-Transform zwischen Input und Output. Der Output-Pin liegt unter Prefix `unknown/` (fehlende user_id im Pin-Pfad) — Kosmetik, kein Integritätsproblem.

## 2. Messfenster (rekonstruiert aus dem eingefrorenen v404-Vertrag)

Dauer = `preclip_duration_sec` 2,296 s, N = 6, 5 % Padding, 30 fps:
Zeiten 0,1148 / 0,5281 / 0,9414 / 1,3546 / 1,7679 / 2,1812 s → **Frames 3, 16, 28, 41, 53, 65**.

## 3. Persistierte v404-Werte

Nur das Verdikt ist persistiert (`syncso_dispatch_log`, `NOOP_ESCALATING`, `error_class: sync_completed_noop`):
`motion_verdict: noop`, `motion_delta_mean: -63.38981563028693`, `motion_delta_peak: -1751.2384640000018`,
`noop_reason: noop:delta_mean=-63.3898…<=noop_threshold=3.682671115501879`, `size_ratio 2.0273`, Ladder `bbox-url-pro → coords-pro-box`.
**Fehlende Evidenz:** preclip-/provider-Mean und -Peak einzeln, ROI-Rechteck, Still-Dimensionen und Sample-Frames werden nirgends persistiert.

## 4. V434-Telemetrie

**Nicht persistiert.** Sie wird im `sync-so-webhook` ausschließlich als Konsolenzeile `v434_telemetry …` ausgegeben; die Edge-Function-Logs für 22.08. 21:05 UTC sind nicht mehr abrufbar (Log-Tool liefert nichts, `function_edge_logs` leer). Damit ist **nicht belegbar**, ob V434 für diesen Pass eine geometriegekoppelte ROI erzeugt hat oder auf die Legacy-ROI zurückgefallen ist — ich nehme es ausdrücklich nicht an. Sicher ist nur aus dem Code: `roi_applied_to_verdict` ist per Default `false`, das Verdikt kam in jedem Fall aus der eingefrorenen v404-ROI.

## 5. Exakte Nachrechnung aus den Pins (Recomputation, klar getrennt von persistierter Evidenz)

Frozen ROI (centerX 0,5 / centerY 0,6 / w 0,28 / h 0,12) in Quellkoordinaten = x 259, y 389, 202×86 px:

| Metrik | Preclip | Provider-Output |
|---|---|---|
| v404 mean (Varianz im ROI) | 427,34 | 363,40 |
| v404 peak | 16.581,8 | 14.507,4 |
| **deltaMean** | — | **−63,94** |
| MAD (Frame-zu-Frame, mean / median) | 13,20 / 5,78 | **14,44 / 7,00** |

Die Nachrechnung reproduziert den persistierten Wert (−63,94 vs. −63,39; Restdifferenz = Remotion-Still-Resampling auf 1280×720 vs. native Quellauflösung). **Die Messung ist deterministisch und korrekt — sie misst nur das Falsche.**

## 6. Visuelle Prüfung der sechs Samples

- Die ausgeschnittenen ROI-Bänder zeigen an allen sechs Samples **überwiegend Nase und Oberlippe**; der Mund liegt am unteren Rand bzw. teilweise außerhalb. Die feste ROI bei centerY 0,6 trifft in diesem 720×720-Preclip nicht das Mundband.
- Der **Preclip bewegt bereits die Lippen** (die HappyHorse-Platte spricht schon) und der Kopf skaliert/driftet über die 2,3 s spürbar. Die v404-Grundannahme „Input = statischer Mund“ ist hier verletzt.
- Der **Provider-Output bewegt die Lippen sichtbar** und zeigt in denselben Samples andere Mundformen als der Input. Ein echter NOOP liegt nicht vor.
- Konsistenz: MAD des Outputs ist **höher** als die des Inputs (Ratio ≈ 1,09) — also mehr Bewegung im Output, während die Varianzdifferenz stark negativ ist.

## 7. Warum das Vorzeichen kippt

Kein Crop-/Skalen-Transform zwischen Input und Output (identische 720×720). Der negative deltaMean entsteht aus zwei Effekten:
1. **Anatomie-Mismatch:** die feste ROI misst Nase/Oberlippe, also eine Region, deren Varianz vor allem von Kopfdrift und Hintergrund stammt, nicht von Mundöffnung.
2. **Baseline-Inversion:** der bereits sprechende, kontrastreichere Preclip liefert eine hohe Ausgangs-Varianz; der leicht geglättete, re-encodierte Provider-Output liegt darunter — obwohl er mehr echte Frame-zu-Frame-Bewegung enthält.

## 8. Entscheidungsmatrix

- **A – echter Provider-NOOP: ausgeschlossen** (Lippenbewegung im Output visuell belegt, MAD höher als Input).
- **B – ROI-/Messdrift, falscher NOOP: JA, primäre Ursache.** Konfidenz **hoch** (~0,9): Nachrechnung reproduziert den Wert, ROI trifft belegbar Nase statt Mund.
- **C – Klassifikator ungeeignet trotz sichtbarer Bewegung: JA, mitursächlich.** Varianz-Differenz gegen eine bereits sprechende, bewegte Platte ist als NOOP-Kriterium strukturell untauglich; MAD-Ratio hätte korrekt „Bewegung vorhanden“ gemeldet. Konfidenz **hoch**.
- **D – unzureichende Evidenz:** gilt nur für den Teilaspekt V434-ROI-Herkunft (Punkt 4).

**V451 = PASS (READ-ONLY) — Befund: B + C, kein Provider-NOOP. Wir haben kein Lip-Sync-Problem, sondern ein Outcome-Messproblem bei bewegter Geometrie.**

## 9. Nächste Entscheidung (nichts davon in diesem Gate)

Zur Auswahl, jeweils als eigenes Gate:
1. **V452a — Mess-Evidenz persistieren:** preclip/provider mean+peak, ROI-Rechteck, Still-Dims, Sample-Frames, V434-ROI-Quelle und MAD-Summary in `syncso_dispatch_log` schreiben. Reine Telemetrie, kein Verdikt-Eingriff. Ohne das ist jede weitere Diagnose wieder auf verlorene Konsolenlogs angewiesen.
2. **V452b — NOOP-Kriterium auf MAD-Ratio umstellen** (Verdikt-Änderung, berührt den v404-Freeze; braucht Kalibrierung gegen bekannte echte NOOPs).
3. **V452c — ROI geometriegekoppelt fürs Verdikt aktivieren** (`useGeometryRoiForVerdict`), damit das Band tatsächlich auf dem Mund liegt.

Empfehlung: 1 zuerst (risikofrei), dann 2 oder 3 entscheiden — nicht beides gleichzeitig.
