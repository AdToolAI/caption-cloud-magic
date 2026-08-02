## Befund

Nein — **der tatsächlich laufende Produktionspfad ist noch nicht vollständig 1:1 konsistent**, obwohl die zurückgesetzten Backend-Dateien bis auf Versionsmarker/Adapter dem Commit `58060cffe` entsprechen.

Der letzte Lauf `8370ede5…` zeigt den konkreten Bruch:

```text
Clip-Provider erfolgreich
  → permanenter Clip gespeichert
  → clip_status = ready
  → clip_url ist weiterhin vorhanden
  → compose-dialog-segments startet
  → audio_plan.twoshot.url fehlt
  → audio_plan_not_ready_self_heal
  → Lip-Sync bleibt pending / pipeline_state bleibt plate_ready
```

Der Clip wurde also **nicht gelöscht**. Er liegt weiterhin in der Datenbank und im Storage. Der Abbruch passiert vor dem ersten Sync.so-Aufruf, weil die zusammengeführte Dialog-Audiospur noch nicht erzeugt wurde.

Zusätzlich läuft der Screenshot auf `useadtool.ai`. Diese veröffentlichte Version lädt ein anderes Frontend-Bundle als die aktuelle Preview. Damit treffen der zurückgesetzte Backend-Pfad und ein älterer veröffentlichter Auto-Trigger aufeinander. Das erklärt, warum die UI den Recovery-Zustand so darstellt, als sei nie ein Clip erstellt worden.

Der 500-Fehler von `extract-video-last-frame` ist separat und laut Webhook nicht terminal; er ist nicht die Ursache des Lip-Sync-Abbruchs.

## Umsetzung

1. **Audio-Hand-off auf v283 atomar machen**
   - Nach erfolgreichem Master-Clip für Dialogszenen `compose-twoshot-audio` zuverlässig auslösen.
   - `compose-dialog-segments` erst starten, wenn `audio_plan.twoshot.url` vorhanden ist.
   - Kein clientabhängiges Zwischenfenster mehr zwischen Clip, Audio und Lip-Sync.

2. **Recovery ohne optischen Clip-Verlust**
   - Bei fehlendem Audio-Plan `clip_url` und `clip_status=ready` unverändert lassen.
   - Nur den Audio-Schritt erneut anstoßen; Preview und erzeugten Clip nicht zurücksetzen.
   - Recovery-Marker nicht als fehlgeschlagene oder leere Szene darstellen.

3. **Frontend und Backend auf denselben Stand bringen**
   - Auto-Trigger und Statusauswertung exakt an die v283-Zustände `pending → audio → master_clip → running → done` binden.
   - Post-Juli-Self-Heals entfernen, die Clipfelder leeren oder einen v283-Zwischenzustand falsch interpretieren können.
   - Preview gegen den echten Produktionsdatensatz testen; die veröffentlichte Domain benötigt danach einen separaten Publish-Schritt.

4. **End-to-End-Verifikation**
   - Neue 4-Sprecher-Szene auslösen.
   - In den Logs belegen: Clip gespeichert → Audio-URL vorhanden → erster Sync.so-Job angelegt → alle vier Pässe → finaler Clip.
   - Prüfen, dass die Vorschau während Audio-/Lip-Sync-Vorbereitung sichtbar bleibt und kein schwarzer/leerer Zustand entsteht.