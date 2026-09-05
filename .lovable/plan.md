# Auto Collections in der Mediathek

Jedes im Picture Studio erzeugte Bild wird weiterhin automatisch gespeichert und bekommt zusätzlich eine feste Workflow-Kennung. Die Mediathek zeigt dann zwei getrennte Bereiche: **Meine Alben** (manuell, unverändert) und **Auto Collections** (automatisch befüllt).

## Collections

Datenwert → sichtbares Label:

| Wert | Label (EN/DE/ES) | entsteht durch |
|---|---|---|
| generated | Generated / Generiert / Generado | Bildgenerierung (Text zu Bild, Batch) |
| edited | Edited / Bearbeitet / Editado | Magic Edit, Inpaint, Outpaint, Restyle, Mix, Referenz-Edits |
| enhanced | Enhanced / Verbessert / Mejorado | Topaz Image Upscale, Clarity Pro, Legacy-Upscale |
| background | Background / Hintergrund / Fondo | Hintergrund entfernen/ersetzen |
| restored | Restored / Restauriert / Restaurado | Topaz Dust & Scratch |
| colorized | Colorized / Koloriert / Coloreado | Topaz Colorization |
| uploaded | Uploads / Uploads / Subidas | selbst hochgeladene Bilder |

Regeln:
- Jedes Asset gehört zu genau einer Collection — „Wie wurde es erzeugt?". Herkunft steckt weiterhin in `parent_id`, Organisation in `album_id`, Modell in `model_used`.
- Nichts wird umsortiert, wenn eine neue Version entsteht: aus einem Generate-Bild wird ein zweites, eigenständiges Edit-Bild.
- Collections sind nicht umbenennbar, nicht löschbar; leere Collections werden ausgeblendet.
- Manuelle Alben bleiben komplett unberührt; ein Bild kann gleichzeitig in „Enhanced" und im eigenen Album „Nike Kampagne" liegen.

## Darstellung

Klar getrennte Rollen, keine doppelte Anzeige:

- **Hauptansicht Mediathek**: eine Filterleiste (All · Generated · Edited · Enhanced · Background · Restored · Colorized · Uploads) mit Anzahl, direkt darunter die Bilder.
- **Album-Bereich**: Abschnitt „Meine Alben" wie heute, darunter Abschnitt „Auto Collections" als Einstiegskarten mit Cover und Anzahl. Nicht editierbar.
- Jede Kachel zeigt ein dezentes Badge-Paar in einer Zeile, z. B. „Topaz · Enhanced" oder „Imagen 4 · Generated"; der vollständige Modellname erscheint beim Hover bzw. in der Detailinfo. Bei Uploads nur „Uploaded", kein Modell-Badge.
- Alle Zählungen kommen aus einer gruppierten Datenbankabfrage, nicht aus im Browser gezählten Listen.

Im Picture Studio ändert sich am Ablauf nichts: Download bleibt direkt möglich, Speichern passiert automatisch, der Dialog „In Album speichern" bleibt für eigene Alben erhalten.

## Dry Run – Ist-Zustand der 491 Bestandsbilder

Bereits geprüft; das Feld `source` ist historisch irreführend (Referenz-Edits stehen als „upload" drin), deshalb entscheidet die Kombination aus `metadata_json` und `model_used`:

| Bedingung | Ziel | Anzahl |
|---|---|---|
| `metadata_json->>'editMode' = 'true'` (steht heute als source „upload") | edited | 244 |
| `editMode = 'false'` | generated | 240 |
| `model_used = 'topaz-image-upscale'` | enhanced | 3 |
| `model_used = 'topaz-dust-scratch'` | restored | 1 |
| `model_used = 'topaz-colorization'` | colorized | 1 |
| `model_used` leer, kein editMode | vor dem Backfill einzeln prüfen | 2 |

Kein Datensatz wird pauschal zu „generated" erklärt; die zwei Restfälle werden vorher angesehen und explizit zugeordnet.

## Technische Umsetzung

1. **Migration in dieser Reihenfolge**: (a) `workflow_type text` nullable ergänzen, (b) Backfill nach obiger Tabelle, (c) Kontrollabfrage auf NULL/ungültige Werte, (d) CHECK-Constraint auf die sieben Werte, (e) `SET NOT NULL`, (f) Index `(user_id, workflow_type, created_at desc)`. Kein Datenbank-Default — ein vergessener Wert soll auffallen, nicht stillschweigend als „generated" landen. Keine neue Tabelle, keine neuen Grants.
2. **Endpoints setzen den Wert deterministisch, ohne stillen Fallback**: ein gemeinsamer Helfer `persistStudioImage({ …, workflowType })` verlangt den Wert und schlägt ohne ihn hart fehl — kein `?? 'generated'`.
   `generate-image-replicate` → generated · `generate-studio-image` → generated · `magic-edit-image` → edited · `upscale-image` → enhanced · Background-Flow (`BackgroundReplacer`) → background · Uploads → uploaded.
   Einzige Mapping-Stelle ist `enhance-image` über eine zentrale Funktion `getWorkflowTypeForEnhanceModel(modelId)` (topaz-image-upscale/clarity-pro → enhanced, topaz-dust-scratch → restored, topaz-colorization → colorized; unbekannt → `UNSUPPORTED_MODEL`). Diese Funktion wird nirgends im Frontend dupliziert.
3. **Lifecycle-Regel (wirtschaftlich korrekt)**: Jeder erfolgreiche Picture-Output erzeugt genau eine `studio_images`-Zeile mit `workflow_type`, `model_used` und Parent-Referenz. Fehlt `workflow_type`, gilt das Asset nicht als erfolgreich persistiert. Unterscheidung:
   - Provider war noch **nicht** erfolgreich → Lauf endet ohne Belastung.
   - Provider war **bereits** erfolgreich → Output wird gesichert, der Lauf bekommt `asset_persist_failed`, und die Persistierung wird idempotent wiederholt. Kein zweiter Provider-Run, keine doppelte Abbuchung, keine automatische Erstattung bei einem temporären Persistence-Fehler.
4. **Rückverfolgbarkeit**: `parent_id` bleibt die Herkunft. Für Enhance-Läufe existiert die Verknüpfung bereits über `picture_enhance_runs.studio_image_id`; zusätzlich bekommt `studio_images` eine nullable Spalte `source_run_id`, die die Enhance-Läufe direkt am Asset referenzieren. Für Workflows ohne eigene Run-Tabelle bleibt das Feld leer — es wird keine neue Run-Infrastruktur erfunden.
5. **Zentrale Registry** `src/config/mediaCollections.ts` mit `{ id, workflowType, icon, labels {en,de,es}, sortOrder }`. `MediaLibrary.tsx`, `MediaAlbumManager.tsx`, Filterleiste und Count-Anzeige lesen ausschließlich daraus — keine verstreuten Arrays.
6. **Counts serverseitig** über eine nach `workflow_type` gruppierte Abfrage, weiterhin streng auf den angemeldeten Nutzer beschränkt (RLS unverändert).
7. **Kein Eingriff** in Pricing, Wallet, Refunds, Rate Cards, Lip-Sync oder Video-Pfade.
8. **Tests**: Modell→Workflow-Mapping; jeder Persistenzpfad schreibt `workflow_type`; Persistenzaufruf ohne gültigen Workflow schlägt fehl; Counts eines Nutzers werden nie von Daten anderer Nutzer beeinflusst; ein `enhanced`-Asset bleibt `enhanced`, auch wenn es einem manuellen Album zugeordnet oder daraus entfernt wird. Dazu Typecheck und die bestehenden Picture-Studio-Tests.
