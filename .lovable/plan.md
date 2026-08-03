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

## Die dauerhafte Lösung: ein Lauf hat eine Identität

Aufräumen allein schließt den Fehler nicht für immer aus — es bleibt ein
Wettlauf, wenn eine alte Antwort spät eintrifft. Sauber und dauerhaft wird es
nur, wenn jedes Ergebnis beweisen muss, zu welchem Lauf es gehört. Das ist der
Punkt, der die Klasse „Überlappung" restlos beseitigt.

Die Datenbank hat die dafür nötigen Felder bereits: `active_run_id`,
`active_run_started_at`, `plate_generation`. Sie stammen aus dem
Post-Juli-Umbau, sind seit dem Rollback aber ungenutzt. Wir aktivieren sie
**nur als Stempel und Türsteher** — nicht als neue Ablauflogik.

**Regel 1 — genau ein Stempel je Neustart.** Beim Start wird `active_run_id`
neu gesetzt und `plate_generation` erhöht; dies geschieht in derselben
Datenbank-Operation, die den Vorlauf leert (Abschnitt 1). Damit gibt es keinen
Moment, in dem eine Szene geleert, aber noch nicht neu gestempelt ist.

**Regel 2 — jeder Auftrag trägt den Stempel mit.** Plate-Render, Audio-Aufbau,
Sync.so-Pässe und Mux bekommen die `run_id` als Beigabe im Auftrag mitgegeben.
Die Fachlogik dieser Schritte bleibt Zeile für Zeile unverändert; es kommt nur
ein Feld hinzu, das durchgereicht wird.

**Regel 3 — Schreibrechte nur für den aktuellen Lauf.** Alle Rückläufe
(`compose-clip-webhook`, `sync-so-webhook`, `remotion-webhook`,
Mux-Abschluss) prüfen als Erstes: Stempel gleich? Wenn nein, wird das Ergebnis
protokolliert und verworfen — es kann weder den Zustand noch das Video des
neuen Laufs berühren. Fehlt der Stempel (Aufträge, die vor der Umstellung
losgeschickt wurden), gilt das Ergebnis wie bisher als gültig; so bleibt der
Übergang bruchfrei.

**Warum das die Pipeline nicht beschädigt.** Der Unterschied zum
fehlgeschlagenen v377-Ansatz ist bewusst: damals wurde der *Start* durch eine
neue serverseitige Orchestrierung ersetzt, die Aufträge ablehnen konnte und
damit Läufe blockiert hat. Hier bleibt der Startweg exakt der Juli-Weg. Die
Lauf-Identität ist rein additiv und wirkt ausschließlich am Rand, beim
Zurückschreiben. Ein Stempelfehler kann höchstens dazu führen, dass ein
Ergebnis verworfen wird — nie dazu, dass ein Lauf nicht startet.

**Absicherung.** Zwei Schutzschichten begleiten das:
- ein Datenbank-Trigger, der Schreibversuche mit fremdem Stempel in
  `composer_state_guard_violations` protokolliert (zunächst nur beobachtend,
  damit wir vor dem Scharfschalten Belege haben),
- der bestehende `lipsync-watchdog` räumt verwaiste Aufträge alter Läufe ab,
  statt sie hängen zu lassen.

## Nicht Teil dieser Änderung

Die Lip-Sync-Kette selbst (v400 Anker/Plate-Kohärenz, Preclip-Geometrie,
Sync.so-Dispatch, Mux-Overlay) bleibt inhaltlich unangetastet. Kein Schritt
ändert Zuschnitt, Masken, Modelle oder Timing.

## Technische Details

- `supabase/functions/_shared/scene-run.ts` — `beginSceneRun()`: Purge +
  `active_run_id`/`plate_generation`-Stempel in einer Operation; `assertRun()`
  als Türsteher für Rückläufe
- `supabase/functions/compose-video-clips/index.ts` — die 14
  `clip_status: 'generating'`-Schreibstellen auf `beginSceneRun()` umstellen,
  `run_id` in die Auftrags-Payloads durchreichen
- `compose-dialog-segments`, `render-sync-segments-audio-mux` — `run_id`
  durchreichen (keine Logikänderung)
- `compose-clip-webhook`, `sync-so-webhook`, `remotion-webhook` — `assertRun()`
  vor jedem Schreibvorgang
- Migration — Trigger für Protokollierung von Fremd-Stempel-Schreibversuchen
- `src/components/video-composer/ClipsTab.tsx`,
  `SceneInlinePlayer.tsx` — optimistische Bereinigung, Videoausgabe an
  `isWorking` koppeln

## Umsetzung in zwei Etappen

1. **Sofort spürbar:** Purge + Sichtbarkeit (Abschnitte 1, 3, 4). Behebt das
   gemeldete Verhalten.
2. **Dauerhaft dicht:** Lauf-Identität mit beobachtendem Trigger, danach
   Scharfschalten des Türstehers, sobald die Protokolle einen sauberen Lauf
   zeigen.

## Prüfung nach der Umsetzung

- Szene neu rendern: Kachel wechselt sofort auf „Wird gebaut", das alte Video
  verschwindet, `clip_url` und `dialog_shots` sind während des Laufs leer.
- Neustart mitten in einem laufenden Sync.so-Pass: das späte Ergebnis taucht im
  Protokoll als verworfen auf und der neue Lauf läuft unbeeinflusst durch.
- Vier-Sprecher-Referenzszene: Lip-Sync-Ergebnis identisch zum Stand vor der
  Änderung.
