---
name: V447 Final Contract Reconciliation
description: Preclip-Reuse an Run-Identität gebunden, Dialog-TTS mit Sprach-Hardlock, Split-Screen-Erkennung auch bei N=2, Anti-Panel-Prompt als reine Topologie-Korrektur
type: architecture
---

# V447 (22.08.2026)

- **Preclip-Reuse fail-closed**: `_shared/pass-face-preclip.ts` verwendet einen
  fertigen Preclip nur bei exakt identischer `v447_signature`
  (`run_id | plate_generation | plate_key | crop x/y/size/outputSize | bbox |
  Renderfenster`). Ohne Run-Identität kein Reuse. Alt-Renders ohne Signatur sind
  grundsätzlich nicht wiederverwendbar. Aufrufer in `compose-dialog-segments`
  reichen `active_run_id` + `plate_generation` durch.
- **Dialog-TTS Sprach-Lock**: `compose-twoshot-audio` liest
  `composer_projects.language` und schickt jede ElevenLabs-Anfrage durch
  `withTtsLanguage` (statt hartkodiert `eleven_multilingual_v2`) — beendet die
  DE→EN-Aussprache-Drift im Lip-Sync-Pfad.
- **Split-Screen N=2**: `_shared/split-screen-layout.ts` erkennt zusätzlich
  Zweispalter über die Spaltenmitten-Regel (cx ≈ W/4 und 3W/4, Toleranz 6 %,
  gleiche Baseline, gleiche Höhen). Für N=2 ist `gapSpread` kein Signal.
- **Anti-Panel-Prompt**: V446-Suffix und Anchor-Retry sind reine
  Topologie-Korrekturen — Aktion, Pose, Position und Setting bleiben erhalten,
  nur die Collage-Struktur wird verboten (kein "alle in einen Raum").
- **Nicht umgesetzt (bewusst)**: T9-Hardgates (face-share 0.24 / 144 px) bleiben
  Telemetrie — sie widersprechen dem v356-Vertrag; `motion_unverified` läuft
  weiter als Erfolg durch (v443-Vertrag), V447 ergänzt nur Telemetrie, wenn die
  Watchdog-Terminalisierung eines Proven-Noop fehlschlägt
  (`recheck_terminalization_failed`).
