# Auto Collections in der Mediathek

Jedes im Picture Studio erzeugte Bild wird weiterhin automatisch gespeichert und bekommt zusätzlich eine Workflow-Kennung. Die Mediathek zeigt dann zwei getrennte Bereiche: **Meine Alben** (manuell, unverändert) und **Auto Collections** (automatisch befüllt).

## Collections

| Collection | wird befüllt durch |
|---|---|
| Generated | Bildgenerierung (Text zu Bild, Batch, Referenz) |
| Edited | Magic Edit, Inpaint, Outpaint, Restyle, Mix |
| Enhanced | Topaz Image Upscale, Clarity Pro, Legacy-Upscale |
| Background | Hintergrund entfernen/ersetzen |
| Restored | Topaz Dust & Scratch |
| Colorized | Topaz Colorization |
| Uploads | selbst hochgeladene Bilder |

Regeln:
- Jede Version ist ein eigenes Bild und landet genau in einer Collection — nichts wird aus einer alten Collection entfernt.
- Collections sind Filter, keine Ordner: ein Bild kann gleichzeitig in „Enhanced" und im eigenen Album „Nike Kampagne" liegen.
- Manuelle Alben bleiben komplett unberührt; Zuordnung zu einem eigenen Album ändert die Collection nicht.
- Collections sind nicht umbenennbar, nicht löschbar, und leere Collections werden ausgeblendet.

## Darstellung in der Mediathek

- Kopfzeile mit Filterleiste: Alle Medien · Generated · Edited · Enhanced · Background · Restored · Colorized · Uploads, jeweils mit Anzahl.
- Darunter zwei Abschnitte: „Meine Alben" (wie heute, inkl. Anlegen/Löschen) und „Auto Collections" (Karten mit Cover aus dem neuesten Bild, nicht editierbar).
- Auf jeder Bildkachel ein kleines Badge mit dem echten Modellnamen (Topaz Image Upscale, Clarity Pro, Seedream 4, Imagen 4 Ultra …) plus ein Workflow-Badge.
- Alles dreisprachig (EN/DE/ES).

Im Picture Studio ändert sich nichts am Ablauf: Download bleibt direkt möglich, das Speichern passiert automatisch im Hintergrund. Der bestehende Dialog „In Album speichern" bleibt für eigene Alben erhalten.

## Technische Umsetzung

1. **Migration**: Spalte `workflow_type text` auf `public.studio_images` (mit Check-Constraint auf die sieben Werte, Index auf `(user_id, workflow_type, created_at desc)`). Backfill der bestehenden 491 Zeilen aus `source` + `model_used` (`source='upload'` → `uploaded`; `topaz-dust-scratch` → `restored`; `topaz-colorization` → `colorized`; `topaz-image-upscale`/Clarity → `enhanced`; Rest `generated`). Keine neuen Tabellen, keine neuen Grants nötig.
2. **Edge Functions** schreiben `workflow_type` beim Insert mit: `generate-image-replicate` (generated), `generate-studio-image` (generated), `magic-edit-image` (edited), `enhance-image` (abgeleitet aus `spec.id`: enhanced/restored/colorized), `upscale-image` (enhanced), `BackgroundReplacer`-Insert (background). Fehlt der Wert, greift ein Server-Default statt eines Fehlers.
3. **Frontend**: neue Konstante `src/config/mediaCollections.ts` (id, Label EN/DE/ES, Icon, Workflow-Mapping). `MediaAlbumManager.tsx` bekommt den Abschnitt „Auto Collections" und einen Collection-Detailmodus, der nach `workflow_type` statt `album_id` lädt. `MediaLibrary.tsx` bekommt die Filterleiste. Unsortierte-Bilder-Logik bleibt wie bisher an `album_id`.
4. **Kein Eingriff** in Pricing, Wallet, Refunds, Rate Cards, Lip-Sync oder Video-Pfade.
5. Danach: Typecheck, die bestehenden Picture-Studio-Tests plus ein neuer Unit-Test für das Workflow-Mapping.
