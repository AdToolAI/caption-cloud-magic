# Re-Render zeigt weiterhin die alte Szene

## Was tatsächlich passiert

Der Re-Render startet — er ist nur unsichtbar.

Nachgeprüft an der zuletzt neu gestarteten Szene (`c934a823…`, Stand 21:09 UTC):

- `clip_status = generating`, `twoshot_stage = master_clip`, `lip_sync_status = pending`
- eine frische Provider-Job-ID ist gesetzt, `dialog_shots` wurde geleert → der neue Lauf läuft wirklich
- **aber `clip_url` zeigt weiterhin auf das Video des vorherigen Laufs**

Ursache im Code: keine der Render-Startstellen in `compose-video-clips` setzt beim
Neustart `clip_url` (und das Standbild) zurück — an 14 Stellen wird nur
`clip_status: 'generating'` geschrieben. Die Kachel `SceneInlinePlayer` rendert
aber weiterhin `scene.clipUrl` als Video, sobald dieses Feld gefüllt ist.
Ergebnis: das alte Video läuft unverändert weiter, während im Hintergrund der
neue Lauf arbeitet.

Zusätzlich räumt nur ein einziger Einstiegspunkt (SceneCard „Clip + Lip-Sync neu
rendern") den alten Clip optimistisch weg. Die anderen Wege — Re-Roll in der
Clips-Übersicht (`handleGenerateSingle`), Cinematic-Sync-Start und der
Generieren-Button auf der Kachel — tun das nicht.

## Was geändert wird

**1. Neustart leert die Lip-Sync-Pipeline vollständig (Kern der Korrektur)**

Heute schreiben die Startstellen in `compose-video-clips` nur
`clip_status: 'generating'` + `clip_error: null`. Alles andere aus dem
Vorlauf bleibt stehen — genau die Grundlage für Überlappungen: ein noch
laufender Sync.so-Pass des alten Laufs schreibt sein Ergebnis später in
dieselbe Zeile, belegt weiter einen Slot und kann den neuen Clip überdecken.

Neu: eine gemeinsame Serverfunktion „Szene startet neu", die vor dem Dispatch
in dieser Reihenfolge arbeitet:

1. Laufende Provider-Jobs der Szene beenden und Slots freigeben — über den
   bestehenden Weg `reset-lipsync-scene` (kündigt Sync.so-Jobs, gibt Slots
   frei, erstattet Credits). Nur wenn tatsächlich aktive Pässe existieren.
2. Lip-Sync-Zustand hart leeren: `dialog_shots`, `lip_sync_status`,
   `twoshot_stage`, `lip_sync_applied_at`, `lip_sync_source_clip_url`,
   `dialog_audio`-/Preclip-Referenzen des Vorlaufs, plus die Sperren in
   `dialog_dispatch_locks`.
3. Sichtbares Ergebnis des Vorlaufs leeren: `clip_url`, `first_frame_url`,
   `last_frame_url`, `clip_error`.
4. Erst danach `clip_status: 'generating'` und der eigentliche Dispatch.

Alle bestehenden `clip_status: 'generating'`-Schreibstellen werden auf diese
eine Funktion umgestellt, damit es genau eine Definition von „neuer Lauf" gibt.

**2. Späte Ergebnisse des alten Laufs werden abgewiesen**

Damit ein Ergebnis, das trotz Kündigung noch eintrifft, den neuen Lauf nicht
überschreibt: `sync-so-webhook` und der Mux-Pfad verwerfen ein Resultat, dessen
Job-ID nicht mehr in den aktuellen `dialog_shots` der Szene steht — mit
Protokolleintrag statt stiller Übernahme.

**3. Frontend zeigt sofort den Neustart**

- `ClipsTab.handleGenerateSingle` und der Cinematic-Sync-Start setzen im
  optimistischen Update zusätzlich `clipUrl: undefined` und
  `lipSyncAppliedAt: null` (wie es die SceneCard-Variante bereits tut).
- `SceneInlinePlayer`: solange der Zustand in Arbeit ist (`isWorking`), wird das
  Video-Element nicht gerendert, sondern die „Wird gebaut"-Fläche — auch wenn
  noch eine `clipUrl` im Zustand steht. Damit kann ein alter Clip nie mehr einen
  laufenden Re-Render überdecken.

**4. Kein Zurückschreiben durch den verzögerten Speichervorgang**

Der Re-Roll-Pfad nutzt — wie der Cinematic-Sync-Pfad — den lokal-only-Updater,
damit der gebündelte Projekt-Speichervorgang den gerade geleerten Clip nicht
600 ms später aus einem alten Abbild zurückschreibt.

## Nicht Teil dieser Änderung

Die Lip-Sync-Kette selbst (v400 Anker/Plate-Kohärenz, Preclip-Geometrie,
Sync.so-Dispatch, Mux-Overlay) bleibt inhaltlich unangetastet. Hier geht es
ausschließlich darum, dass ein Neustart sauber bei null beginnt und sichtbar
ist.

## Technische Details

- `supabase/functions/compose-video-clips/index.ts` — neue `beginSceneRunUpdate()`;
  Umstellung der 14 `clip_status: 'generating'`-Schreibstellen
- `src/components/video-composer/ClipsTab.tsx` — optimistische Bereinigung in
  beiden Startpfaden, lokal-only-Updater
- `src/components/video-composer/SceneInlinePlayer.tsx` — Videoausgabe an
  `isWorking` koppeln

## Prüfung nach der Umsetzung

Szene neu rendern und beobachten: Kachel wechselt sofort auf „Wird gebaut",
das alte Video verschwindet, `clip_url` ist in der Datenbank während des Laufs
leer und wird erst durch das Ergebnis des neuen Laufs wieder gesetzt.
