# Schritt 3 — Persistierte Visual-Input-Intention (Antworten auf die vier Punkte)

Vorab: `transitionType → cutStyle` wird **nicht** in Schritt 3 gezogen. Die Arbitration liest dieses Feld heute nicht (`transition_type` ist reines Render-/Übergangs-Styling in Remotion/Director's Cut). Bleibt Schritt 6.

## 1. Was `visual_source` exakt bedeutet

`visual_source` beschreibt **ausschließlich die Nutzerstrategie (requested intent)**, nie das tatsächliche Asset und nie die aufgelöste Herkunft. Damit fällt `manual` als überlappender Wert weg. Werteliste:

| Wert | Bedeutung (Strategie) |
| --- | --- |
| `auto` | Kein Nutzerwille. Der Resolver entscheidet nach heutiger Logik (Szenenklasse, Anker, Provider-Slots). |
| `character_anchor` | Identität hat Vorrang. Anker gewinnt den Slot, Übergang darf zum Match-Cut degradieren. |
| `previous_final_frame` | Nahtlos an die Vorgängerszene. Frame-Chain bzw. Clip-Reference, wenn Provider und Vertrag es erlauben. |
| `uploaded_reference` | Ein vom Nutzer hochgeladenes Bild ist die Bildbasis dieser Szene. |
| `generated_still` | Ein in der App erzeugtes Still ist die Bildbasis dieser Szene. |

Genau eine Achse: „Welche Strategie hat der Nutzer gewählt?“. Herkunft und Auflösung liegen ausschließlich im Resolver-Ergebnis (`effective_source`), das nicht persistiert wird.

## 2. Trennung Strategie ↔ Asset (bestätigt)

`visual_source` ersetzt **keine URL**. Alle Assetfelder bleiben unverändert und bleiben Wahrheit:

- `character_anchor` → weiterhin `reference_image_url` (Lip-Sync-Geometrie hängt genau daran, unverändert).
- `previous_final_frame` → weiterhin `continuity_source_scene_id` + der zur Laufzeit extrahierte Frame bzw. Clip der Vorgängerszene.
- `uploaded_reference` / `generated_still` → weiterhin die bestehenden Bild-/Upload-Felder der Szene.

Schritt 3 legt **kein** neues URL-Feld an und schreibt in keines der bestehenden Assetfelder.

## 3. Migration bestehender Szenen

Harte Regel: **keine bestehende Szene rendert nach der Migration anders.** Deshalb kein ratender Backfill.

- **Backfill: keiner.** Die neue Spalte wird mit `DEFAULT NULL` angelegt; alle bestehenden Zeilen bleiben `NULL`.
- **`visual_source = NULL` bedeutet exakt: „Legacy — bisherige Arbitration unverändert anwenden.“** Es bedeutet nicht „neu raten“. Der Resolver behandelt `NULL` byte-gleich zum heutigen Verhalten (identisch zu `auto` im heutigen Codepfad, aber ohne Nutzerwillen-Semantik).
- **Alte Projekte bleiben auf der bisherigen Arbitration**, bis die Szene ausdrücklich überführt wird. Überführung passiert nur durch eine explizite Nutzeraktion in der UI (Auswahl der Strategie an der Szene) — nie durch Öffnen, Speichern, Rendern oder einen Batch-Job.
- Ein Migrations-Paritätstest fixiert: für jede Fixture mit `visual_source = NULL` ist der Resolver-Output feldgleich zum heutigen Output.

## 4. Ungültige Kombinationen (z. B. Lip-Sync + `previous_final_frame`)

Variante 2, wie vom Nutzer präferiert: **deterministische Auflösung, kein stilles Überschreiben.**

- Die gespeicherte Nutzerwahl bleibt unverändert in der DB (`requested_source`).
- Der Resolver liefert zusätzlich `effective_source` plus `sourceOverride: { requested, effective, reason }`.
- Für Lip-Sync-Szenen gilt weiter der v425/v428-Vertrag hart: `effective_source = character_anchor`, Reason `lipsync_continuity_disabled`. Fail-closed bleibt nur dort, wo es heute schon fail-closed ist (fehlender Anker → Abbruch), nicht neu für die Strategiewahl.
- Die UI zeigt an der Szene einen Override-Hinweis: „Gewählt: Nahtloser Übergang — verwendet: Charakter-Anker (Lip-Sync)“.
- Genauso für Provider-Slot-Konflikte (Seedance 2.5 exklusiver Slot): requested bleibt stehen, effective folgt der Provider-Matrix aus Schritt 2.

## Umfang Schritt 3 (bewusst eng)

1. Migration: `composer_scenes.visual_source text NULL` + CHECK auf die fünf erlaubten Werte, kein Backfill, keine Änderung an bestehenden Spalten.
2. Reiner Resolver-Layer: `requested → effective` inkl. `sourceOverride`, angedockt an den vorhandenen `resolveVisualInputs`/`slotArbitration`-Pfad. Keine Änderung der Lip-Sync- oder Continuity-Engine-Semantik.
3. Provider-Slot-Validierung gegen die Schritt-2-Matrix (welche Strategie ein Provider überhaupt bedienen kann).
4. UI: Strategieauswahl pro Szene + Override-Anzeige (nur lesend gegenüber der Engine).
5. Tests: Legacy-Parität (`NULL`), Override-Matrix (jede Strategie × Lip-Sync an/aus × exklusiver/Slot-Provider), Client/Server-Parity des Resolvers, plus die bestehenden 118 Anchor-Tests unverändert grün.

Nicht enthalten: `cutStyle`-Umbenennung, State/Legacy-Aufräumen, Änderungen an `reference_image_url`, `lock_reference_url` oder der Continuity-Queue.

## Zusätzliche Implementierungsregeln

- **Resolver bleibt strikt pure.** Er persistiert nichts und schreibt in kein DB-Feld. Rückgabe: `requested_source`, `effective_source`, `sourceOverride` und die daraus abgeleiteten Inputs. Geschrieben wird `visual_source` ausschließlich durch die explizite Nutzeraktion in der UI.
- **`NULL` ≠ `auto`.** Ergebnisgleich, semantisch getrennt: `NULL` = legacy/unmigriert, `auto` = explizit gewählte Automatik. Der Typ ist `VisualSourceStrategy | null` (kein Defaulting auf `auto` beim Laden), `sourceOverride.requested` gibt `null` als `null` zurück, und eigene Tests fixieren beide Fälle separat.
