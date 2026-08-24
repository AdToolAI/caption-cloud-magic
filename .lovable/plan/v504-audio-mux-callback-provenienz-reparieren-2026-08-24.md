# V504 — Audio-Mux Callback-Provenienz reparieren

## Verifizierter Befund

Der V503-Mux-Render für Szene `be60d106…` wurde erfolgreich abgeschlossen. Der Abschluss-Webhook durfte die Szene jedoch nicht finalisieren, weil der Mux-Dispatcher eine alte `sync_segment`-Ledger-ID in `pipeline_job_id` übernommen hat. Der Callback erwartet dort zwingend einen Job der Stage `audio_mux` und wurde deshalb korrekt als `wrong_job` abgewiesen. Die Szene blieb folglich trotz fertigem Video in `audio_muxing`.

## Umsetzung

1. **Ledger-ID vor Mux-Dispatch validieren**
   - Eine eingehende `pipeline_job_id` nur übernehmen, wenn sie zur selben Szene, zum aktiven Run und zur Stage `audio_mux` gehört.
   - Eine `sync_segment`-ID niemals in den Mux-Webhook weiterreichen.

2. **Korrekte Mux-Akquise erzwingen**
   - Bei fehlender oder unpassender ID den vorhandenen `audio_mux`-Job verwenden beziehungsweise den regulären atomaren Retry/Replace-Pfad nutzen.
   - Die neue Remotion-Ausführung an genau diesen `audio_mux`-Job binden.

3. **Aktuelle Szene abschließen**
   - Den bereits erfolgreichen Output nicht erneut rendern, sofern er noch erreichbar ist.
   - Den Abschluss über den bestehenden `composer_finalize_lipsync_scene`-Vertrag mit der korrekten Audio-Mux-Ledger-ID ausführen; andernfalls genau einen sauberen Re-Mux dispatchen.

4. **Regressionstest**
   - `sync_segment`-ID im Mux-Request wird verworfen.
   - Valide `audio_mux`-ID bleibt erhalten.
   - Callback mit korrekter ID terminalisiert Szene und Ledger; ein falscher Job bleibt weiterhin fail-closed.

## Grenzen

Keine Änderung an Face-/Mundtracking, ASD, Provider-Payload, Gates, Crop-Geometrie oder Sync.so-Pässen. Kein neuer S01-Lip-Sync-Lauf und keine zusätzlichen Provider-Kosten.
