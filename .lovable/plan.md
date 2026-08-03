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

**1. Server räumt beim Neustart auf (Kern der Korrektur)**

In `compose-video-clips`: eine gemeinsame Hilfsfunktion für den Übergang
„Szene startet neu". Sie schreibt zusätzlich zu `clip_status: 'generating'`
konsequent:

- `clip_url: null`, `first_frame_url: null`, `last_frame_url: null`
- `clip_error: null`, `lip_sync_applied_at: null`, `lip_sync_source_clip_url: null`

Alle bestehenden `clip_status: 'generating'`-Schreibstellen werden auf diese
Hilfsfunktion umgestellt, damit es genau eine Definition von „neuer Lauf" gibt.

**2. Frontend zeigt sofort den Neustart**

- `ClipsTab.handleGenerateSingle` und der Cinematic-Sync-Start setzen im
  optimistischen Update zusätzlich `clipUrl: undefined` und
  `lipSyncAppliedAt: null` (wie es die SceneCard-Variante bereits tut).
- `SceneInlinePlayer`: solange der Zustand in Arbeit ist (`isWorking`), wird das
  Video-Element nicht gerendert, sondern die „Wird gebaut"-Fläche — auch wenn
  noch eine `clipUrl` im Zustand steht. Damit kann ein alter Clip nie mehr einen
  laufenden Re-Render überdecken.

**3. Kein Zurückschreiben durch den verzögerten Speichervorgang**

Der Re-Roll-Pfad nutzt — wie der Cinematic-Sync-Pfad — den lokal-only-Updater,
damit der gebündelte Projekt-Speichervorgang den gerade geleerten Clip nicht
600 ms später aus einem alten Abbild zurückschreibt.

## Nicht Teil dieser Änderung

Die Lip-Sync-Kette selbst (v400 Anker/Plate-Kohärenz, Preclip, Sync.so-Dispatch,
Mux) bleibt unangetastet. Hier geht es ausschließlich darum, dass ein Neustart
sichtbar ist und nicht durch das Ergebnis des Vorlaufs verdeckt wird.

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
