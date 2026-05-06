## Problem

Beim Klick auf "In Mediathek" gibt die Edge Function `save-composer-scene-to-library` den Fehler `DELETE requires a WHERE clause` zurück.

Ursache: Der Insert in `video_creations` triggert die Funktion `enforce_user_video_library_limits`, die zwei Statements ohne WHERE-Klausel enthält:

```sql
DELETE FROM _media_all;
DELETE FROM _media_to_keep;
```

Supabase aktiviert global den `sql_safeupdates`-Schutz, der DELETE/UPDATE ohne WHERE blockiert — auch auf TEMP-Tabellen. Dadurch schlägt jeder Insert in `video_creations` mit `status = 'completed'` fehl (nicht nur unser Composer-Save, sondern alle Saves, die diesen Trigger auslösen).

## Fix

Eine Migration, die `enforce_user_video_library_limits` neu erstellt und die zwei nackten DELETEs durch `TRUNCATE` ersetzt:

```sql
TRUNCATE _media_all;
TRUNCATE _media_to_keep;
```

Rest der Funktion bleibt unverändert. Trigger-Definition bleibt unverändert.

## Verifikation

Nach der Migration nochmal "In Mediathek" klicken — Toast sollte "In Mediathek gespeichert" zeigen, Eintrag erscheint in `/video-management`.

## Out of Scope

- Keine Änderungen an der Edge Function selbst (die ist korrekt)
- Keine Änderungen am Hook oder UI
- Keine Änderung der Limits-Logik (500 Videos / 10 GB bleiben)
