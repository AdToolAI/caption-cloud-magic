# Motion Studio: 12 Videos pro Szene — Ursache und Bereinigung

## Befund (gemessen in der Datenbank)

Zwei getrennte Ursachen, keine davon ist ein Lip-Sync-Fehler:

1. **Interne Zwischen-Renders landen in der Mediathek.**
   266 von 286 Einträgen mit Quelle „Universal Creator" sind `dialog-pass-preclip-…mp4` —
   also die pro Sprecher gerenderten Gesichts-Ausschnitte aus der Lip-Sync-Kette.
   Bei einer 4-Sprecher-Szene entstehen pro Lauf 4 solche Dateien; nach drei Läufen
   sind es 12. Sie erscheinen im UI als „Universal Creator Video".

2. **Jede Neugenerierung einer Szene legt zusätzlich einen Szenen-Eintrag an.**
   Das ist bewusst so gebaut (bezahlte Clips sollen erhalten bleiben), die alten werden
   als „Vorgängerversion" markiert — aber flach neben dem aktuellen Clip angezeigt.
   Zwei Szenen haben so je 12 Einträge.

## Kein Risiko für die Lip-Sync-Pipeline

Geprüft: keine Funktion der Kette liest die Mediathek. Der Preclip-Schritt wartet auf
`video_renders`, der Szenenzustand liegt in `composer_scenes` / `dialog_shots` /
`plate_attempts`. In `compose-dialog-segments`, `compose-video-clips`, `sync-so-webhook`
und allen `_shared`-Dateien gibt es keinen Lesezugriff auf `video_creations`;
`compose-clip-webhook` schreibt dort nur das Archiv. Die Mediathek ist reine
Anzeige-Schicht — ein fehlender oder gelöschter Eintrag kann keinen Schritt blockieren.

## Umsetzung

1. **Interne Artefakte gar nicht erst speichern**
   - Im Remotion-Webhook den automatischen Mediathek-Eintrag nur für echte
     Nutzer-Renders anlegen. Preclips, Dialog-Stitch-Zwischenschritte und andere
     Pipeline-Renders werden am Render-Zweck erkannt und übersprungen.
   - Der Render selbst, das Polling und die Lip-Sync-Kette bleiben unverändert —
     es entfällt ausschließlich der Bibliothekseintrag. (Der Lip-Sync-Freeze bleibt
     damit gewahrt: keine Gates, keine Geometrie, keine Zustandsübergänge berührt.)

2. **Bestehende Artefakte aufräumen**
   - Die 266 Preclip-Einträge aus der Mediathek entfernen. Die Dateien selbst bleiben
     unangetastet, nur die Bibliotheks-Zeilen verschwinden.

3. **Szenenversionen bündeln statt auflisten**
   - In der Mediathek pro Szene nur die aktuelle Version zeigen.
   - Ältere Versionen bleiben erhalten und werden über einen dezenten Hinweis
     („3 ältere Versionen") am Eintrag aufklappbar — kein Datenverlust, aber eine
     ruhige Liste.
   - Bei einer 4-Sprecher-Szene mit drei Anläufen sieht der Kunde damit 1 Eintrag
     statt 12.

4. **Nachweis**
   - Nach der Bereinigung Zählung pro Quelle erneut prüfen und in der Mediathek
     sichtbar bestätigen, dass nur noch fertige Clips gelistet sind.

## Technische Details

- `supabase/functions/remotion-webhook/index.ts`: Mediathek-Insert im
  „Universal Creator"-Zweig hinter eine Prüfung auf interne Render-Zwecke legen
  (Erkennung über `out_name` / `customData`, u. a. `dialog-pass-preclip`, `dialog-stitch`).
- Datenbereinigung per Datenmanipulation (kein Schemawechsel):
  `video_creations` mit `output_url like '%dialog-pass-preclip%'` löschen.
- `src/pages/MediaLibrary.tsx`: Einträge mit `metadata.source = 'motion-studio-clip'`
  nach `metadata.scene_id` gruppieren, neueste als Hauptkarte, `superseded`-Einträge
  als aufklappbare Versionsliste.
- Kein Eingriff in `compose-clip-webhook` (Archivierungslogik bleibt), kein Eingriff
  in gefrorene Lip-Sync-Dateien.
