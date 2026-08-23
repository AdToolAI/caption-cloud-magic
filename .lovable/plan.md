# V466 — Gray-Band-Terminalisierung stoppen + echte NOOPs isolieren

## Was der Lauf tatsächlich zeigt (verifiziert, Szene be60d106, 23.08. 22:01 UTC)

Die neue V465-Metrik ist live und misst sauber (`still_source=remotion_lambda`, `authority=v465_mouth_over_frame`):

| Pass | mouth_over_frame | Verdict |
|---|---|---|
| 0 (Sarah) | 1.299 | NOOP |
| 1 (Sarah) | 1.817 | NOOP |
| 2 | 2.950 | MOVED |
| 3 | 2.537 | INDETERMINATE (Grauband) |
| 4 | 3.075 | MOVED |
| 5 | — | canceled_by_scene_failure |

Die Szene ist also **nicht** an der Metrik gescheitert, sondern an der Nachbehandlung:
- Pass 3 lag im Grauband (2.00–2.65) und wurde über den v403-Pfad sofort `ssw:noop_fail` terminalisiert — obwohl der Vertrag lautet: INDETERMINATE darf nicht grün behaupten, aber auch nicht als bewiesener NOOP gelten.
- Pass 0/1 sind echte NOOPs unterhalb der Bandgrenze; sie haben die NOOP-Ladder erschöpft.
- Jede Messung basiert auf nur `frames: 6` Stillpaaren — dünn für ein Verdict nahe der Bandgrenze.

Ergebnis: `v459_terminal_required_pass_failure`, Szene rot, obwohl 2 von 5 Pässen bewiesen bewegt und 1 unentschieden war.

## Umfang V466 (zwei getrennte Teile)

### Teil A — Grauband nicht mehr terminalisieren (Code-Fix, eng)
1. Grauband-INDETERMINATE mit gültiger Messung löst **eine** Re-Messung derselben eingefrorenen Ausgabe mit höherer Stillzahl aus (6 → 16 Frames), statt sofort zu terminalisieren.
2. Bleibt es danach im Grauband: Pass läuft als `motion_unverified` durch (gemuxt, kein Refund, kein Grün-Anspruch in der Telemetrie) — derselbe schmale Gate wie v443/v458, nicht als neuer Erfolgsanspruch.
3. Nur bewiesenes NOOP (< 2.00) bleibt terminal. `measured_ambiguous` außerhalb des Graubands (degenerierter Nenner, zu wenig Frames, fehlende Stills) bleibt unverändert fail-closed.
4. `frames`, `roi_pixels` und `remeasure_count` landen in `syncso_dispatch_log.meta.v465`.

### Teil B — echte NOOPs read-only isolieren
Pass 0/1 (Sarah, 1.30 / 1.82) gegen Pass 2/4 (2.95 / 3.08) derselben Szene und desselben Plates differenzieren: Preclip-Geometrie, Face-Share, Yaw, Audiodauer (Pass 0 = 2.3 s), ASD-Boxbewegung. Kein Code-Fix in diesem Schritt — nur ein Befundbericht unter `docs/v466-noop-vs-moved-same-scene.md`.

## Technische Details
- `supabase/functions/sync-so-webhook/index.ts`: Zweig ab Zeile 1647 (`motionVerdictForMultiSpeaker === "indeterminate"`) bekommt vor dem `ssw:noop_fail`-Apply die Grauband-Unterscheidung; Re-Measure-Zähler analog zum bestehenden v443-`measure_attempts`-Muster.
- `supabase/functions/_shared/v465-verdict.ts`: neues Feld `in_gray_band` im Result, damit der Webhook nicht auf Reason-Strings parsen muss. Band-Grenzen bleiben 2.00 / 2.65 unverändert.
- `supabase/functions/_shared/measure-provider-motion-sync.ts`: Stillzahl parametrierbar (Default 6, Re-Measure 16).
- `supabase/functions/lipsync-watchdog/index.ts`: identische Grauband-Regel im Re-Check, damit Webhook und Watchdog nicht divergieren.
- Regressionstests in `v465-verdict.test.ts`: 2.54 → INDETERMINATE + `in_gray_band=true`; 1.99 → NOOP terminal; degenerierter Nenner → INDETERMINATE ohne Passthrough.

## Nicht in diesem Gate
- Keine Änderung der Bandgrenzen, der ASD-Projektion (V464) oder der Provider-Wahl.
- Kein neuer S01-Lauf ohne dein GO nach Teil A.
