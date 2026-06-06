## Diagnose

Der v66-Fix ist aktiv: die Logs zeigen bei der 4-Personen-Szene `sync_mode=cut_off`. Der aktuelle Fehler ist deshalb **nicht mehr Sync.so loop/provider_unknown_error**, sondern passiert früher:

- Szene: `7a430ebd-00c3-4c6f-a3d6-c58a43b2903c`
- Fehler: `prepare_failed_no_tight_audio`
- Pass: `3/4` / Sprecher `Kailee`
- Log: `v39_tight_audio_failed: offset is out of bounds`
- Window: `[[3.717, 6.71]]`

Warum es vorher funktioniert hat: Die Pipeline kommt jetzt bis zum Tight-Audio-Schnitt. Dort hat der WAV-Slicer einen Rundungsfehler: Er berechnet die Ausgabedauer mit `Math.round((end-start)*sampleRate)`, kopiert aber später Samples mit `floor(start*sampleRate)` bis `floor(end*sampleRate)`. Bei bestimmten Zeitfenstern — wie `3.717 → 6.71` — kann die Kopierlänge um 1 Frame größer sein als der vorher allokierte Output-Buffer. Dann wirft JavaScript `offset is out of bounds` und die Szene stoppt vor Sync.so.

## Plan

1. **WAV-Slicer frame-genau machen**
   - In `supabase/functions/_shared/syncso-preflight.ts` `sliceWavToWindows()` so ändern, dass Output-Länge und Copy-Länge aus denselben Frame-Grenzen berechnet werden.
   - Keine Duration-Rundung mehr als Basis für Buffer-Größe.
   - Zusätzlich defensive Bounds setzen, damit `out.set()` nie über das Zielarray hinaus schreiben kann.

2. **Lip-sync Dispatch unverändert lassen**
   - `compose-dialog-segments` bleibt bei `tightAudioInfo ? "cut_off" : "loop"`.
   - Keine Änderung an Face-Map, Sync.so Payload, Audio-Mux, Refund oder Retry-Ladder.

3. **Dokumentation aktualisieren**
   - Neue Memory für v67: „frame-exact tight WAV slicing“.
   - Frozen invariant ergänzen: Tight-Slice muss frame-exakt sein; `outFrames` muss aus denselben `startFrame/endFrame`-Werten kommen wie der Copy-Schritt.

4. **Validierung nach Implementierung**
   - Edge function Tests bzw. gezielter Slicer-Test mit dem konkreten Fenster `3.717–6.71`.
   - Funktion deployen.
   - Danach dieselbe 4-Personen-Szene erneut triggern oder neu rendern und prüfen: Pass 3 erzeugt `v39_tight_audio dur≈2.99s`, Sync.so Dispatch startet, danach Audio-Mux Fan-In.