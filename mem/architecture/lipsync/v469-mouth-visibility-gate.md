---
name: V469 Mouth-Visibility / Pose-Suitability Gate
description: Pre-dispatch lip-sync gate blocks only unusable/occluded mouths; yaw is telemetry, never a hard cut
type: feature
---

**VERBINDLICH.** Vor jedem Sync.so-Dispatch prüft `_shared/v469-mouth-visibility-gate.ts`,
ob der Mund über genügend Frames sichtbar und bearbeitbar ist (Face-Track-Box,
Mund-Landmark, Face-Aspect ≥ 0.45, Mund nicht auf Silhouetten-Kante,
usable-frame-rate ≥ 0.35). Verstoß → `preclip_mouth_not_visible` →
`lipsync_input_contract_violation`, KEIN Provider-Call, kanonischer V459-Refund.

- **Kein Yaw-Hard-Cut.** V463 belegte MOVED bei ~75° Yaw. Yaw ist nur Risikosignal/Telemetrie.
- **Fail-open** bei fehlender Evidenz (<6 getrackte Frames) → `unevaluated`, Dispatch wie bisher.
- **Nicht im Scope:** Pass-1-Fall (frontal, `mouth_over_frame` 1.817) bleibt bewusst ungelöst;
  Input-mouth/frame-Ratio (P0 0.60, P1 0.51 vs P2 1.41, P4 1.06) ist nur dokumentiert, nie gating.
- V465-Verdict-Autorität, V466-Gray-Band, ASD-Projektion, Payload und Refund-Logik unverändert.
- Nächster kontrollierter Test: P1↔P2 Cross-Swap (2 Provider-Calls), noch NICHT ausgeführt.
- Doku: `docs/v469-mouth-visibility-gate.md`, Regression: `v469-mouth-visibility-gate.test.ts` (11/11).
