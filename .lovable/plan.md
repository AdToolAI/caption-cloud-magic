## Ziel

Der Autopilot endet heute mit einzelnen Clips (`stage: scenes_ready`). Diese Stufe schließt die Lücke bis zum fertigen Spot: Ton drunter, Logo drauf, ein Video raus — und die Kosten werden echt verrechnet statt nur angezeigt.

---

## 1. Credits: von der Vorschau zur Abbuchung

Heute zeigt `costEstimate.ts` eine Summe, die niemand einzieht. Der Lauf bekommt dieselbe Reserve-/Commit-/Refund-Mechanik wie der Rest der Plattform (`credit-preflight`, `credit-reserve`, `credit-commit`, `credit-refund`).

- Vor dem Start: Preflight gegen die Kostenvorschau, Reservierung über die geschätzte Summe. Reicht das Guthaben nicht, startet der Lauf gar nicht erst.
- Nach jeder Stufe (Anchor, Motion, VO, Lip-Sync, Render) wird der tatsächliche Verbrauch committed.
- Jede fehlgeschlagene Szene und jeder Provider-Abbruch löst eine idempotente Rückerstattung aus — nach dem bestehenden Refund-Muster, Schlüssel ist `production_id` + Szenenindex, damit ein Watchdog-Retry nicht doppelt zurückbucht.
- Bricht der Lauf komplett ab, wird die Reservierung vollständig aufgelöst.

## 2. Ton: Voiceover, Musik, Foley

Die Optionen sind in der UI wählbar, im Lauf passiert damit bisher nichts.

- **Voiceover**: pro Szene aus dem Treatment-Text, über `generate-video-voiceover` mit der Sprache aus den Launcher-Optionen und harter Sprach-Sperre. Die Stimme kommt aus der Voice-Bibliothek (Charakterzuordnung, sonst Erzählerstimme). Start-Offsets werden aus den Szenenlängen berechnet, nie über die Filmlänge hinaus.
- **Musik**: ein Bett passend zur `musicMood` aus dem Treatment, gesucht über die vorhandene Musik-Strecke; Lautstärke unter Sprache abgesenkt.
- **Foley/Ambience**: `soundDesign.ts` liefert bereits die Cues — sie werden als leise Zusatzspuren gelegt.

## 3. Lip-Sync im Autopilot-Pfad

Szenen, die das Treatment als Sprechszene markiert hat, laufen nach dem Motion-Schritt über die bestehende Kling-Omni-Strecke mit Deutsch-Hard-Lock und den etablierten Schutzmechanismen (Face-Share-Floor, Motion-Probe-Watchdog, Refund bei Nichttreffer). Szenen ohne Sprecher überspringen den Schritt komplett.

## 4. Endschnitt `autopilot-finalize`

Neue Edge Function, die nach `scenes_ready` übernimmt:

- Clips in Szenenreihenfolge aneinandersetzen, Schnittpunkte nach dem Rhythmus-Plan aus `rhythm.ts` (Kapitel-Modus ab 90 s).
- Tonspuren (VO, Musik, Foley) mit korrekten Offsets darunterlegen.
- Logo-Assets als sauberes Overlay einblenden — nie generiert, wie in `assetRoles.ts` festgelegt.
- Render über die bestehende Remotion-Lambda-Strecke; `rawMediaMode` bleibt aktiv, keine cinematischen Filter.
- Ergebnis nach `autopilot_productions.final_video_url`, Stufe wird `final_cut` → `completed`.
- Fehlgeschlagene Szenen werden ausgelassen statt den Film zu blockieren; der Regie-Log nennt sie beim Namen.

## 5. UI

- `ProductionStage.tsx` bekommt die neuen Stufen (Ton, Lip-Sync, Endschnitt) in der Fortschrittsanzeige.
- Ein Freigabe-Dialog vor dem Start zeigt die Kostenvorschau und bucht erst nach Bestätigung.
- Am Ende: Player mit dem fertigen Spot, Download, und Übergabe in die Mediathek.

---

## Technische Details

- Neu: `supabase/functions/autopilot-finalize/index.ts`
- Neu: `supabase/functions/_shared/autopilotCredits.ts` (Reserve/Commit/Refund-Wrapper mit Idempotenzschlüssel)
- Erweitert: `autopilot-orchestrate` — Credit-Klammer, VO-/Musik-/Foley-Erzeugung, Lip-Sync-Abzweig für Sprechszenen, Aufruf von `autopilot-finalize`, neue Stufen `audio` · `lipsync` · `final_cut`
- Erweitert: `autopilot-treatment` — markiert Sprechszenen und Sprecherzuordnung explizit pro Szene
- Erweitert: `ProductionStage.tsx`, `DirectorsTable.tsx` (Freigabe-Dialog), `useAutopilotProduction.ts` (neue Stufen)
- Migration: Spalten für Audio-URLs und Credit-Ledger-Referenz auf `autopilot_productions` / `autopilot_production_scenes`
- Wiederverwendet, nicht neu gebaut: `generate-video-voiceover`, Musik-Suche, Kling-Omni-Lip-Sync, `lipsync-watchdog`, `render-with-remotion`, `credit-*`
