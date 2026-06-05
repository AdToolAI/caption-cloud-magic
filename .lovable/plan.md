## Befund

Do I know what the issue is? Yes.

Der neue Fehler ist eine direkte Nebenwirkung des letzten Schutzes:

- Szene `ac044e0a-e72a-4aac-9153-25e3e82bdcfd` scheitert bei Sync.so mit `sync-3` und `An unknown error occurred.`
- Der erste v56-Run nutzt `segments[]` + `audioInput` Master-Audio-Crop + manuelle `active_speaker_detection` Punkte.
- v57 verhindert bei 3 Sprechern korrekt den `auto_asd_fallback`, damit nicht wieder Matthew Kailees Text spricht.
- Aber: Der allgemeine Transient-Retry läuft trotzdem weiter und sendet denselben manuellen Sync-3-Payload ein zweites Mal. Deshalb schlägt es erneut fehl und refunded.
- Wichtigster technischer Hinweis aus der Sync.so-Anleitung: `segments[]` ist offiziell dokumentiert, aber alle Beispiele sind `lipsync-2`; Sync-3 + `segments[]` + per-segment manual ASD scheint bei Multi-Speaker weiterhin instabil/undokumentiert und produziert den Provider-Unknown-Error.

## Plan

1. **Retry-Bug schließen**
   - In `sync-so-webhook` für Multi-Speaker v56/v57 nicht mehr denselben manuellen Payload als Retry erneut senden.
   - Wenn Multi-Speaker + manual ASD + `provider_unknown_error`, sofort in einen echten Fallback wechseln statt No-op-Retry.

2. **Robusten Multi-Speaker-Fallback bauen**
   - Für 3-Speaker-Szenen bei Sync-3-Manual-ASD-Fehler auf die bereits bewährte Dialog-Shot-Pipeline wechseln:
     - pro Sprecher-Turn eigener Hailuo-Plate/Shot,
     - pro Turn dedizierter Sync.so-Lip-Sync,
     - am Ende Stitching zur Szene.
   - Das vermeidet sowohl falsche Auto-ASD-Zuordnung als auch den instabilen Sync-3-Segments-Payload.

3. **Sync.so-Payload sauber versionieren**
   - Neue Version `v58` / Engine z. B. `sync-multispeaker-turn-shots-v58` für diesen Fallback markieren.
   - `dialog_shots` bekommt klare Diagnosefelder: `fallback_reason`, `failed_payload_mode`, `next_pipeline`.

4. **UI-Reset wirklich zum richtigen Pfad führen**
   - Beim Button „Sauber neu starten“ sicherstellen, dass die Szene nicht wieder denselben v56/v57 Segments-Pfad triggert, sondern nach dem Fehler direkt den v58-Fallback bzw. Dialog-Shot-Pipeline nutzt.

5. **Konkrete Szene zurücksetzen**
   - Szene `ac044e0a-e72a-4aac-9153-25e3e82bdcfd` nach dem Code-Fix auf einen sauberen Pending-Zustand setzen, damit der nächste Run nicht auf dem kaputten Sync-3-Segments-Status hängt.

## Erwartetes Ergebnis

- Kein falscher Auto-ASD-Fallback mehr bei mehreren Sprechern.
- Kein wiederholtes Senden desselben scheiternden Sync-3-Segments-Payloads.
- Multi-Speaker Dialoge laufen über den stabileren Turn/Shot-basierten Pfad, damit jeder Sprecher seine eigene sichtbare Plate und seinen eigenen Lip-Sync bekommt.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>