# V460 — Refund geht in die falsche Kasse (RCA bestätigt)

## Befund (gemessen, nicht vermutet)

Der Rerender scheitert nicht an der Lip-Sync-Kette. Er scheitert am Geld.

- Das AI-Video-Guthaben des Accounts steht auf **0,88 €**. Ein S01-Lauf kostet **4,50 €**.
  `compose-video-clips` antwortet deshalb korrekt mit `402 / INSUFFICIENT_CREDITS`.
  Das Frontend zeigt davon nur „Edge Function returned a non-2xx status code".
- Im Kontoauszug stehen seit dem 22.08. **14 Abbuchungen à 4,50 €** und **eine einzige
  Rückerstattung**. Die fehlgeschlagenen Lip-Sync-Läufe der letzten zwei Tage wurden alle
  belastet und nie erstattet.
- Ursache: Belastet wird `ai_video_wallets.balance_euros` (Euro-Ledger). Der Fehlerpfad
  `failLipSync` schreibt die Erstattung aber in `wallets.balance` (Credit-Ledger, hier
  Enterprise mit ~1 Mrd. Credits). Die Rückbuchung landet also in einer Kasse, aus der nie
  abgebucht wurde — der Euro-Ledger blutet bei jedem Fehllauf aus.

Damit ist die Kern-Invariante „automatischer, idempotenter Refund bei Fehllauf" faktisch
seit Einführung des Euro-Ledgers wirkungslos.

## Was V460 tut

1. **Refund in die richtige Kasse.** `failLipSync` erstattet gegen denselben Ledger, aus
   dem belastet wurde: `ai_video_wallets.balance_euros` plus eine `ai_video_transactions`-
   Zeile vom Typ `refund`. Der Betrag kommt aus der belasteten Run-Buchung, nicht aus einer
   Credit-Zahl.
2. **Idempotenz bleibt hart.** Ein Refund je (Szene, Run): Marker im Szenen-Zustand plus
   eindeutige Referenz auf die zugehörige Belastung. Zwei Aufrufe erzeugen eine Buchung.
3. **Belastung wird zuordenbar.** Die Deduction-Buchung bekommt `scene_id` und `run_id` in
   `metadata` — heute steht dort nichts, deshalb war die Zuordnung nur über Zeitstempel
   möglich.
4. **Ehrliche Fehlermeldung im UI.** 402 mit `code: INSUFFICIENT_CREDITS` wird als
   „Guthaben reicht nicht: 4,50 € nötig, 0,88 € verfügbar" angezeigt (EN/DE/ES), mit
   Verweis aufs Aufladen — statt der generischen Edge-Function-Meldung.
5. **Einmalige Wiedergutschrift.** Die nicht erstatteten Fehlläufe seit 22.08. werden
   nachträglich gutgeschrieben, als klar gekennzeichnete `refund`-Buchungen mit Begründung.

## Technisches

- `supabase/functions/_shared/lipsync-fail.ts`: Refund-Block auf `ai_video_wallets` +
  `ai_video_transactions` umstellen, Betrag aus der Run-Belastung ableiten, Marker
  `dialog_shots.refunded` und Transaktions-Referenz gemeinsam prüfen.
- `supabase/functions/compose-video-clips/index.ts`: Deduction-Buchung mit
  `metadata.scene_id` / `metadata.run_id` schreiben; 402-Payload unverändert lassen.
- Frontend: `startSceneGeneration` liest den 402-Body aus (`extractFunctionsErrorDetails`)
  und mappt `INSUFFICIENT_CREDITS` auf eine lokalisierte Meldung; Aufrufer zeigen sie an.
- Tests: neuer Vitest-Fall für Ledger-Wahl, Betrag und doppelten Aufruf.
- Der Lip-Sync-Freeze bleibt unberührt: keine Gates, Schwellen, Provider oder
  Zustandsübergänge werden angefasst. Refund-Korrekturen sind im Freeze ausdrücklich erlaubt.

## Danach

STOP vor S01. Erst Kontostand und Buchungen verifizieren, dann genau ein kontrollierter Lauf.
