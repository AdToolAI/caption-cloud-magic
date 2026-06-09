## Befund

Die betroffene Szene `94c42a63…` ist technisch “fertig”, aber die Lip-Sync-Ziele wurden aus der Anchor-Still-FaceMap auf die finale Video-Plate skaliert. Bei dieser Szene ist die finale Plate gegenüber dem Anchor sichtbar verschoben, besonders bei Sarah/Matthew. Weil die Pipeline bei “identity matched” den echten Plate-Check weich überspringt, wurden die Face-Crops trotzdem an falschen/zu weit versetzten Stellen gerendert.

## Plan

1. **Kaputte Szene sofort sauber zurücksetzen**
   - Die aktuelle falsche Lip-Sync-Ausgabe wird nicht als fertiges Ergebnis behalten.
   - Die Szene wird auf die ursprüngliche Video-Plate zurückgesetzt, `dialog_shots`/Lip-Sync-Status werden bereinigt.
   - Die dafür abgezogenen Lip-Sync-Credits werden idempotent zurückerstattet, damit kein Fehlversuch berechnet bleibt.

2. **Plate-native Speaker Targets einführen**
   - Vor jedem Multi-Person-Lip-Sync wird ein echter Frame aus der finalen Video-Plate analysiert, nicht nur der Anchor.
   - Die Backend-Logik erkennt dort alle sichtbaren Gesichter und matcht sie gegen die Charakter-Portraits.
   - Speaker-Ziele werden danach aus der finalen Plate abgeleitet: `character_id → echtes Plate-Gesicht → coords + bbox`.

3. **Anchor-FaceMap nur noch als Fallback verwenden**
   - Für 3–4 Personen darf die Anchor-FaceMap nicht mehr automatisch als “sicher” gelten.
   - Wenn Plate-Erkennung/Identity-Match nicht alle Sprecher eindeutig findet, wird der Lip-Sync vor Provider-Kosten blockiert und die Szene zeigt eine klare Fehlermeldung statt ein falsches Ergebnis zu rendern.

4. **Preclip-Qualitätsgate ergänzen**
   - Nach dem Rendern jedes Single-Face-Preclips wird geprüft, ob wirklich genau ein gut sichtbares Gesicht im Crop liegt.
   - Wenn der Crop leer ist, mehrere Gesichter enthält oder am Rand abschneidet, wird der Lauf gestoppt/refundet statt einen falschen Avatar zu animieren.

5. **Mux/Diagnose robuster machen**
   - In `dialog_shots.passes[]` werden die verwendeten Plate-Ziele, FaceMap-Quelle und Crop-Validierung gespeichert.
   - Logs zeigen künftig das tatsächlich an Sync gesendete Preclip-Video statt irreführend die Master-Plate.

6. **Dokumentation/Memo aktualisieren**
   - Neue Regel: Multi-Person-Lip-Sync darf erst starten, wenn Plate-native Face Targets für alle Sprecher validiert sind; Anchor-Koordinaten allein reichen nicht mehr.

## Technische Änderungen

- `supabase/functions/compose-dialog-segments/index.ts`
  - Plate-native Speaker-Target-Auflösung vor `builtPasses`.
  - Entfernen des Soft-Pass bei `allIdentityMatched` für 3+ Sprecher.
  - Preclip-Face-Gate vor Sync-Dispatch.

- `supabase/functions/_shared/twoshot-face-map.ts` oder neuer Shared Helper
  - Plate-Frame Identity Matching gegen Charakter-Portraits.
  - Rückgabe von `coords`, `bbox`, `source`, `confidence` pro `character_id`.

- `supabase/functions/_shared/plate-face-detect.ts`
  - Erweiterung um Identity Assignments, nicht nur left-to-right Slots.

- Daten-Korrektur
  - Betroffene Szene `94c42a63…` zurücksetzen und Credits idempotent erstatten.

- Memo
  - Architekturregel für “Plate-native face targeting required for multi-speaker Lip-Sync” speichern.