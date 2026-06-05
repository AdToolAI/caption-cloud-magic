## Befund

Der neue Fehlversuch ist nicht durch die gerade behobenen `segments_secs`-/Silent-Audio-Probleme gelaufen.

Was die Logs zeigen:
- Szene: `234e9192-0b8b-4fad-80c4-b76a6da900c9`
- Aktiver Engine-Pfad: `sync-official-segments-v52`
- Modell: `lipsync-2-pro`
- 2 Sync.so-Jobs wurden dispatcht und beide kamen nach ca. 18–20s mit `An unknown error occurred.` zurück.
- Der Sync.so-GET-Payload enthält **kein** `segments_secs` mehr.
- Audio wurde sauber erzeugt: Samuel ~2.276s, Matthew ~0.882s, Kailee ~2.972s.
- Refund wurde ausgelöst: `refunded=true`, 81 Credits.

Wichtig: Der v53-Fix saß primär im alten Fan-Out-/Per-Pass-Pfad. Diese 3-Sprecher-Szene nahm aber vorher den `v52 official segments` Single-Call-Pfad. Deshalb konnte der neue Test trotz v53 weiterhin failen.

## Wahrscheinlichste Ursache

Der aktive v52-Pfad verwendet zwar Sync.so `segments[]`, aber weiterhin `lipsync-2-pro` auf einer weitgehend statischen/posed 3-Personen-Hailuo-Szene.

Die offizielle Sync.so-Doku sagt dazu:
- `lipsync-2`/`lipsync-2-pro` brauchen natürliche Sprechbewegung im Inputvideo.
- Bei statischen/stillen Lippen funktioniert es schlecht oder gar nicht.
- `sync-3` kann stille Lippen öffnen und ist für komplexe Shots/Obstructions/mehrere Personen robuster.

Außerdem ist unser Codekommentar an der Stelle veraltet/wahrscheinlich falsch: Er behauptet, `sync-3` ignoriere `segments[]`. Die aktuelle Doku listet `active_speaker_detection` für `sync-3`, und Segments sind als Generate-API-Feature dokumentiert, nicht als `lipsync-2-pro`-only.

## Plan zur Behebung

1. **v52 Official-Segments-Pfad auf `sync-3` umstellen**
   - In `compose-dialog-segments/index.ts` den 3+ Sprecher `sync-official-segments-v52` Dispatch von `lipsync-2-pro` auf `sync-3` ändern.
   - Veraltete Kommentare entfernen/aktualisieren, damit wir nicht erneut gegen die Doku arbeiten.
   - Payload bleibt weiter doc-strict: `input[]`, `segments[]`, `options.sync_mode`, `optionsOverride.active_speaker_detection`.

2. **sync-3-kompatible Optionen bereinigen**
   - Keine `temperature`, keine `occlusion_detection_enabled`, kein unsupported Sonderkram im `sync-3`-Segments-Pfad.
   - `active_speaker_detection` bleibt pro Segment erhalten, weil laut Sync.so-Modellvergleich auf allen LipSync-Modellen unterstützt.

3. **Failure-Ladder korrigieren**
   - Wenn der offizielle Segments-Pfad bereits `sync-3` nutzt und erneut mit Provider-Unknown failed, nicht denselben `lipsync-2-pro`-Retry wiederholen.
   - Stattdessen klar failen/refunden oder nur einen sauberen `sync-3` Retry erlauben.
   - Ziel: keine sinnlosen 2 identischen `lipsync-2-pro` Versuche mehr.

4. **Diagnostik sichtbar machen**
   - Logzeile eindeutig ändern auf z. B. `v54_official_segments_payload model=sync-3`.
   - Dispatch-Log-Meta soll `model: sync-3`, `segments_count`, `point_sources`, `plate_detected` zeigen.

5. **Deploy + erneuter Test**
   - Nur die betroffenen Edge Functions deployen: voraussichtlich `compose-dialog-segments` und ggf. `sync-so-webhook`.
   - Danach dieselbe 3-Sprecher-Szene sauber neu starten.
   - Erwartung in Logs: `segments_secs` weiterhin absent, aber `model=sync-3` im Sync.so Payload.

## Nicht Teil dieses Fixes

- Kein Zurück zu `segments_secs`.
- Kein Face-Crop-Preclip aktivieren.
- Keine Änderung an der UI.
- Keine DB-Migration.
- Kein Wechsel auf Single-Call ohne Segments.