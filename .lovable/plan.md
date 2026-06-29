## Bug
Beim "Plan anwenden" bricht der DB-Insert mit `invalid input syntax for type uuid: "catalog:location:ecfe38b1-..."` ab. Die Cast & World-Bibliothek liefert Locations als Mention-IDs im Format `catalog:location:<uuid>` (drei Segmente), aber `useApplyProductionPlan.ts` strippt nur einsegmentige Prefixe (`outfit:` / `catalog:`) und nutzt für `location.locationId` gar keinen Stripper.

Ergebnis: Der gepräfixte String wird 1:1 in das `uuid[]`-Feld `composer_scenes.mentioned_location_ids` geschrieben → Postgres lehnt ab → keine einzige Plan-Szene wird gespeichert.

Cast funktioniert teilweise nur, weil `outfit:` / `catalog:` einsegmentig sind; mehrsegmentige Cast-IDs (`catalog:character:<uuid>`) würden denselben Fehler werfen.

## Fix (frontend-only, 1 Datei)

`src/hooks/useApplyProductionPlan.ts`:

1. **`stripPrefix` (Z. 187-188) härten**, sodass mehrsegmentige Mention-IDs auf die Trailing-UUID reduziert werden:
   - Wenn die ID auf eine UUID endet → diese UUID zurückgeben.
   - Sonst Legacy-Verhalten beibehalten (`lib:` / einsegmentig `outfit:` / `catalog:` entfernen).
   - Greift automatisch für Cast (Z. 194, 262, 356, 429) UND wird neu für Locations verwendet.

2. **`mentionedLocationIds` (Z. 360-362) durch `stripPrefix` schicken** und nur valide UUIDs durchlassen — Catalog-Previews-UUIDs aus `location_catalog_previews` sind echte UUIDs, das Feld ist `uuid[]` ohne FK, also wird der bare UUID akzeptiert.

3. **Optionaler safety net**: vor dem Insert `mentionedLocationIds` mit einem UUID-Regex filtern, damit zukünftige Mention-Formate nie wieder am DB-Insert scheitern.

## Acceptance
- "Plan anwenden" mit einer Location aus dem World-Katalog (`@home-office`) speichert die Szenen erfolgreich.
- Bestehende Brand-Locations (nicht-gepräfixte UUIDs) funktionieren weiter unverändert.
- Lip-Sync-Schutzpfade und Cast-Resolver bleiben unberührt — nur der Mention-ID-Stripper wird robuster.

## Files
- `src/hooks/useApplyProductionPlan.ts` (1 Helper + 1 Aufrufstelle)
