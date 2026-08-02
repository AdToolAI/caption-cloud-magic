## Warum das trotz der bisherigen Absicherung passieren konnte

Die bisherigen Reparaturen sichern die **Video-/Lip-Sync-Artefakte** bereits nach Lauf und Generation ab: Plate, Anchor, Preclips, Sync.so-Jobs, Locks, Storage-Dateien und `audio_plan.twoshot` werden beim harten Neustart entwertet oder gelöscht.

Es blieb jedoch ein zweiter Verweis auf den Ton außerhalb dieses Vertrags bestehen:

```text
scene_audio_clips (Datenbankzeile)
  └── URL zur alten Voiceover-Datei
```

Der Reset entfernt zwar die Datei unter `voiceover-audio/.../twoshot-vo` und löscht `audio_plan.twoshot`, aber **nicht die Zeile in `scene_audio_clips`**. `compose-twoshot-audio` sucht später nur nach einer Voiceover-Zeile derselben `scene_id`. Es prüft weder `active_run_id` noch `plate_generation` und akzeptiert deshalb die alte Zeile als „bereits fertig“.

Im letzten Lauf ist das konkret belegt:

- aktueller Szenenlauf: Generation 3, gestartet gegen 17:05 Uhr
- gefundene `scene_audio_clips`-Zeile: erstellt um 15:37 Uhr
- der Reuse-Zweig setzt trotzdem `audio_ready`
- er schreibt aber keinen neuen `audio_plan.twoshot`
- der Lip-Sync-Dispatcher erkennt den fehlenden Plan und fällt auf `plate_ready` zurück
- anschließend beginnt derselbe Kreislauf erneut

Das ist daher kein Versagen des bestehenden Plate-Generationsvertrags, sondern eine bislang nicht einbezogene **Audio-Nebenquelle**. Die Szene wird dabei nicht wirklich gelöscht; ihre UUID bleibt absichtlich bestehen. Genau deshalb konnte die alte, nur über `scene_id` verknüpfte Audiozeile wiedergefunden werden.

## Umsetzung

### 1. Audio in den Generationsvertrag aufnehmen

Neue Voiceover-Zeilen erhalten in `metadata` zwingend:

- `active_run_id`
- `plate_generation`
- `audio_plan_version`
- optional einen Hash aus Dialog, Stimmen und Timing

Wiederverwendung ist nur erlaubt, wenn Lauf, Generation und Hash zur aktuellen Szene passen. Alte Zeilen ohne diese Angaben gelten als Legacy und werden niemals in einem neu gestarteten Lauf wiederverwendet.

### 2. Hard-Reset vollständig machen

`scene-hard-reset.ts` löscht neben den Storage-Dateien auch alle `scene_audio_clips` der Szene mit `kind='voiceover'`. Dieser Schritt wird Teil des Reset-Ergebnisses und bei einem Fehler als Reset-Warnung beziehungsweise harter Reset-Fehler behandelt, damit kein neuer Lauf auf unvollständig bereinigtem Zustand startet.

### 3. Sicheren Audio-Reuse-Pfad bauen

Wenn ein gültiger Audio-Clip desselben Laufs gefunden wird, rekonstruiert `compose-twoshot-audio` vollständig:

- `character_audio_url`
- `audio_plan.twoshot.url`
- `speakers`
- `segments`
- `totalSec` / `spokenSec`
- External-/Embedded-Audio-Flags

Erst nach erfolgreichem Speichern darf der Zustand auf `audio_ready` wechseln. Fehlen Metadaten, wird der Ton neu erzeugt statt unvollständig wiederverwendet.

### 4. Zustandstransition an persistierte Daten koppeln

Vor `audio_ready` wird serverseitig geprüft:

- Voiceover-URL vorhanden
- Audio-Plan vollständig
- Run-ID und Generation aktuell
- mindestens ein Sprecher und positive Dauer

Damit kann der Zustandsautomat künftig nicht mehr „Audio fertig“ melden, wenn das dafür erforderliche Datenpaket fehlt.

### 5. Endlosschleife absichern

`audio_plan_not_ready_self_heal` wird pro Lauf gezählt. Nach maximal drei Rückfällen endet die Szene sichtbar in `failed`, mit klarer Meldung und idempotenter Erstattung. Damit führt selbst ein zukünftiger unbekannter Audiofehler nicht mehr zu einem schwarzen Clip ohne Fehlermeldung.

### 6. Regressionstests

Automatische Tests decken ab:

1. Hard-Reset entfernt Storage-Artefakt **und** `scene_audio_clips`-Zeile.
2. Eine Zeile aus Generation 2 darf in Generation 3 nicht wiederverwendet werden.
3. Legacy-Zeile ohne Generation wird nicht wiederverwendet.
4. Gültiger Same-Run-Reuse schreibt den vollständigen `audio_plan.twoshot`.
5. `audio_ready` ist ohne vollständigen Audio-Plan unmöglich.
6. Nach drei fehlgeschlagenen Self-Heals entsteht ein sichtbarer Terminalzustand statt einer Schleife.
7. Der bestehende Scene-State-Schreibvertrag bleibt grün und `composer_state_guard_violations` bleibt leer.

## Betroffene Bereiche

- `supabase/functions/_shared/scene-hard-reset.ts`
- `supabase/functions/compose-twoshot-audio/index.ts`
- `supabase/functions/compose-dialog-segments/index.ts`
- zugehörige Reset-, Audio- und Zustandsvertragstests

Keine UI-Änderung ist nötig: Nach der Korrektur läuft der echte neue Clip weiter in den Lip-Sync oder endet sichtbar mit einem eindeutigen Fehler; der schwarze Scheinzustand verschwindet.