Do I know what the issue is? Ja.

Das Problem ist nicht AWS und nicht dein Account. Der Fehler sitzt in der aktuellen Lip-Sync-Logik: Der kurzfristige Chaining-Workaround schickt bei jedem einzelnen Sprecher-Turn weiterhin die komplette gemischte Voiceover-WAV an Sync.so und nutzt nur ein Video-Zeitfenster. Sync.so empfiehlt für sauberes Lip-Sync aber klare, einzelne Sprecher-Audios. Dadurch bekommt Turn 2 zwar das Videofenster von Matthew, aber die Audiospur enthält weiterhin Samuel + Matthew + Samuel. Zusätzlich wird der letzte Sync.so-Output direkt als finales Video übernommen, inklusive der von Sync.so neu erzeugten/embedded Audioartefakte. Genau deshalb entstehen falsche Sprecherzuordnung, fehlende Mundbewegung und „dazugedichtetes“ unverständliches Audio.

Technisch auffällig in den Logs:
- Turn 1 Matthew wurde mit `segments_secs=[2.308,5.060]` gestartet, aber als Audio kam die volle 8s Master-WAV.
- Turn 2 Samuel wurde danach auf den Output von Turn 1 gekettet, wieder mit voller Master-WAV.
- `target_coords` werden im Auto-Modus nur geloggt, aber nicht deterministisch genutzt, weil `auto_detect: true` aktiv ist.
- Der finale `clip_url` ist der letzte Sync.so-Result-Link, nicht ein sauberer Remux gegen die originale Master-WAV.

Plan:

1. Broken Chaining abschalten
   - `poll-dialog-shots` darf nicht mehr Shot K auf Shot K-1 ausführen.
   - Jeder Turn wird wieder gegen die originale Master-Plate gerechnet, damit kein Fehler von vorherigen Sync.so-Outputs weitervererbt wird.

2. Pro Turn echtes Einzelsatz-Audio verwenden
   - Für jeden Sprecher-Turn wird ein eigenes WAV-Segment genutzt bzw. erzeugt, das nur diesen Satz enthält.
   - Kein Sync.so-Job bekommt mehr die komplette gemischte Dialogspur als Input.
   - Pausen und Gesamtaudio bleiben nur für Preview/Final-Remux relevant, nicht für die einzelnen Lip-Sync-Jobs.

3. Deterministisches Face Targeting erzwingen
   - Für Multi-Speaker-Turns `auto_detect: false` verwenden.
   - `coordinates` + `frame_number` aus der FaceMap nutzen, damit Matthew nur Matthew und Samuel nur Samuel bekommt.
   - Auto-Detect bleibt nur Fallback für Single-Speaker oder explizite Retry-Fälle.

4. Finalisierung ohne AWS-Login ermöglichen
   - Kurzfristig: den letzten Sync.so-Output nicht mehr als finales Video mit Audio verwenden.
   - Saubere Zwischenlösung: finaler Clip bleibt stumm/lip-synced und die App spielt/übergibt weiterhin `audio_plan.twoshot.url` als externe Master-Audioquelle, sodass kein Sync.so-Murmel-Audio im fertigen Dialog landet.
   - Sobald AWS wieder verfügbar ist: Remotion-Stitching aktivieren, damit pro Turn die richtigen visuellen Fenster zusammengesetzt und mit der Master-WAV gerendert werden.

5. Debug- und Schutzlogik ergänzen
   - In `dialog_shots` speichern: welcher Audio-URL pro Turn verwendet wurde, ob Face-Coords deterministisch genutzt wurden, und ob der finale Clip embedded Audio enthält.
   - Bei Multi-Speaker + fehlendem Turn-Audio hart abbrechen und Credits idempotent zurückerstatten statt einen unsauberen Fallback zu verwenden.

6. Bestehende fehlerhafte Szene behandeln
   - Die aktuelle Szene nicht blind erneut auf derselben kaputten Chaining-Pipeline laufen lassen.
   - Nach dem Fix kann sie gezielt zurückgesetzt werden, aber nur wenn du bestätigst, dass dafür neue Sync.so-Kosten/Credits anfallen dürfen.

Betroffene Dateien:
- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/compose-dialog-scene/index.ts`
- optional: `supabase/functions/compose-twoshot-audio/index.ts` oder die Audio-Erzeugungsfunktion, falls Turn-WAVs dort noch nicht sauber einzeln persistiert werden
- Projekt-Memory aktualisieren, weil die aktuelle Memory noch den alten/inkonsistenten Ansatz beschreibt

Erwartetes Ergebnis:
- Kein zweiter Charakter spricht mehr fremde Zeilen.
- Kein unverständliches Sync.so-Audio wird als finale Audiospur übernommen.
- Mundbewegung wird pro Satz und pro Gesicht gezielt erzeugt.
- Der Fix funktioniert ohne deinen AWS-Login; AWS ist nur für den späteren perfekten finalen Stitch/Export nötig.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>