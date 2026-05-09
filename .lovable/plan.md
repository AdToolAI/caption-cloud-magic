## Diagnose

Der neue Fehler kommt aus der zuletzt ergänzten Datenbankfunktion `replace_composer_scene_with_children`.

Konkrete Ursache:
- `scene_audio_clips.scene_id` ist in der bestehenden Datenbank als `text` definiert.
- Die neue RPC-Funktion vergleicht dort aber direkt mit `p_parent_scene_id`, einem `uuid`:
  ```sql
  delete from public.scene_audio_clips where scene_id = p_parent_scene_id;
  ```
- PostgreSQL vergleicht `text = uuid` nicht automatisch und bricht mit `operator does not exist: text = uuid` ab.
- Deshalb klappt die Sprecher-Splittung bis zum Einfügen/Ersetzen der Szenen, danach scheitert die Reihenfolge-Aktualisierung.

## Plan

1. **RPC-Funktion per Migration korrigieren**
   - `replace_composer_scene_with_children` neu erstellen.
   - Den fehlerhaften Vergleich ändern zu:
     ```sql
     scene_id = p_parent_scene_id::text
     ```
   - Dadurch bleibt die vorhandene `scene_audio_clips`-Struktur unverändert und der Fix ist risikoarm.

2. **Zusätzliche Robustheit einbauen**
   - In der RPC-Funktion die `p_children`-Eingabe gegen `null` absichern.
   - Leere/ungültige UUID-Strings bei `applied_style_preset_id` weiterhin sauber als `null` behandeln.

3. **Frontend-Fehlertext unverändert lassen**
   - Die UI zeigt den echten Datenbankfehler bereits sichtbar an.
   - Nach dem RPC-Fix sollte diese Toast-Meldung nicht mehr erscheinen.

4. **Verifikation**
   - Prüfen, dass keine weitere Stelle `scene_audio_clips.scene_id` direkt gegen UUID vergleicht.
   - Optional die neue Funktion in der Datenbank über eine sichere Testabfrage validieren, soweit ohne echte Nutzerdaten möglich.

## Ergebnis

Nach Umsetzung sollte der 2-Sprecher-Lip-Sync-Split nicht mehr beim Szenen-Ersetzen abbrechen. Die Sub-Szenen bleiben sichtbar eingefügt und der Fortschritt kann weiterlaufen.