# V461 — Stufe 0 (Wallet-Vorbedingung) + genau ein kontrollierter S01-Lauf

Die Bedingung war richtig gesetzt. Die Vorprüfung zeigt: der V459-Euro-Refund ist **teilweise** live, und ausgerechnet der neue V461-Face-Gate-Pfad bucht noch in die falsche Kasse. Deshalb zuerst eine sehr kleine Stufe 0, dann der eine Lauf.

## Was die Vorprüfung belegt

- Beide V459-RPCs existieren in der Datenbank: `v459_refund_lipsync_euros` und `v459_deduct_ai_video_credits`.
- `failLipSync` (`_shared/lipsync-fail.ts`) ruft den Euro-Refund korrekt auf und ist mit dem gestrigen Deploy von `compose-dialog-segments` live.
- **Aber:** Der Pfad, den das V461-Face-Gate benutzt (`failBeforeProviderDispatch` in `compose-dialog-segments`), schreibt weiterhin direkt auf den Credit-Ledger (`wallets.balance`) statt auf das Euro-Wallet. Genau der Fehler, der beim Run `a3b5541b` 960 Credits gegen eine 4,50-Euro-Belastung gestellt hat, würde also bei einem Gate-Block erneut passieren.
- In der Transaktionshistorie gibt es bisher **keinen einzigen automatischen** Euro-Refund — nur die manuelle Reconciliation von 18:12 Uhr. Der Automatikpfad ist also noch nie unter Last gelaufen.
- Die letzten Belastungen tragen keine `scene_id`/`run_id` in den Metadaten. Ohne diese Verknüpfung findet ein Refund seine Quell-Buchung nicht. Der Code dafür steht in `compose-video-clips`, ist aber offenbar noch nicht in der laufenden Version aktiv.

## Stufe 0 — Wallet-Vorbedingung (klein, eng begrenzt)

1. `failBeforeProviderDispatch` bucht nicht mehr selbst auf `wallets.balance`, sondern erstattet über denselben V459-Euro-Pfad wie jeder andere Lip-Sync-Fehlschlag, verknüpft mit der Quell-Belastung. Ein Gate-Block ist damit finanziell identisch zu einem Provider-Fehlschlag: eine Belastung, eine Erstattung, dieselbe Kasse.
2. `compose-video-clips` neu deployen, damit jede Belastung `scene_id` und `run_id` trägt. Ohne diesen Schritt ist der Refund des Laufs nicht verknüpfbar und die Auswertung danach unscharf.
3. Verifikation vor dem Lauf, rein lesend: Euro-Saldo des Testkontos notieren, und nach der ersten Belastung prüfen, dass die neue Buchung Szene und Run enthält.

Kein weiterer Code in Stufe 0. Motion-Detektor, Schwellen und die Kette bleiben eingefroren.

## Der eine S01-Lauf

Start erst, wenn Stufe 0 verifiziert ist. Genau ein Lauf, danach STOP — unabhängig vom Ausgang.

Bewertet wird nicht "6/6 grün", sondern ob die Pipeline ehrlich entscheidet. Für jeden Turn ist genau eines der drei Ergebnisse zulässig:

```text
ungültiger Preclip        -> Face-Gate stoppt VOR dem Provider, kein Job, keine Ladder
gültiger Preclip + Sync   -> Motion moving -> done
gültiger Preclip + NOOP   -> einmal messen -> terminal, kein semantisch gleicher zweiter Call
```

Erwartungshaltung, damit der Lauf nicht falsch gelesen wird: Turn 0 und Turn 5 dürfen weiterhin echte NOOPs liefern — das wäre kein V461-Fehler. Turn 4 ist der eigentliche Gate-Test: Liegt sein neuer Crop wieder bei rund 0.218, muss er vor Sync.so blocken; erreicht der neue Crop 0.24 oder mehr, darf er normal laufen.

## Sofortprüfung beim ersten NOOP

Der Dedup ist bewusst fail-open, wenn kein Fingerprint vorliegt. Deshalb wird beim allerersten NOOP dieses Laufs unmittelbar geprüft, ob `semantic_input_fingerprint` am Pass vorhanden und vollständig ist (Video- und Audio-Objekt, Box-Hash, Framecount, Modell, Sprecher). Fehlt er oder ist er unvollständig, wird der Lauf ausgewertet und danach STOP gesetzt — kein weiterer Run.

## Auswertung nach dem Lauf (read-only)

1. **Attempt-Matrix** aus `syncso_dispatch_log`: pro Turn jeder Versuch mit Variante, Verdikt, `delta_mean`, Transport, Fingerprint.
2. **Gate-Nachweis**: für jeden geblockten Turn `face_share`, `face_size_provider_px`, ROI-Prüfung, Identität — und der Beleg, dass kein Provider-Job existiert.
3. **Dedup-Nachweis**: kein zweiter kostenpflichtiger Versuch mit identischem semantischem Fingerprint; Transportwechsel allein rechtfertigt keinen neuen Versuch.
4. **Telemetrie-Nachweis**: bei Preclip-Dispatches echte 720x720-Werte, echte Bytes, passender `content_type` und `dims_source`. Die Plate-Werte 1284x718 / 4.808.741 B dürfen nirgends mehr auftauchen.
5. **Wallet-Nachweis**: Belastungen und Erstattungen dieses Runs im Euro-Ledger gegenüberstellen, Saldo vorher/nachher, keine Credit-Fehlbuchung.

Ergebnis ist ein kurzer schriftlicher Befund mit Verdikt je Turn und einer klaren Empfehlung, was als Nächstes zu tun ist.

## Technische Details

- Stufe 0 berührt genau zwei Stellen: den Refund-Block in `failBeforeProviderDispatch` (`supabase/functions/compose-dialog-segments/index.ts`, ab Zeile 6761) und einen Redeploy von `supabase/functions/compose-video-clips`.
- Refund läuft über `v459_refund_lipsync_euros` mit `source_transaction_id` der ursprünglichen `ai_video_transactions`-Belastung; Idempotenzschlüssel bleibt `lipsync_refund:<run_id>:<source_transaction_id>`.
- Auswertungsquellen: `syncso_dispatch_log` inkl. `meta.provider_input_fingerprint`, `composer_scenes.dialog_shots->'passes'` (`v461_face_gate`, `semantic_input_fingerprint`, `preclip_dims`), `ai_video_transactions`, `ai_video_wallets`.
- Eingefroren und nicht Teil dieses Gates: Motion-Detektor und alle Motion-Schwellen, Provider-Zertifizierung, Preclip-Geometrie, Maske und Mux.
