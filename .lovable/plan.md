Do I know what the issue is? Ja.

Der aktuelle Fehler ist diesmal kein Sync.so-Key-/Poller-Problem und auch nicht der v3-Multi-Window-Pass selbst. Die betroffene aktuelle Szene `60562d55-e95b-4746-a242-5e8a90475b52` bricht bereits im Anchor-Schritt ab:

```text
anchor_extra_person_detected: human count 5 > expected 2
clip_status = failed
lip_sync_status = pending
twoshot_stage = anchor
```

Das heißt: Das System wollte einen sauberen Two-Shot mit genau Samuel + Matthew erzeugen, aber der Anchor-Audit erkennt 5 menschliche Darstellungen. Dadurch wird der Clip absichtlich vor Hailuo/Sync.so gestoppt, damit kein Geld/Credits für einen falschen Lip-Sync verbrannt werden.

## Warum das passiert

Die Szene enthält widersprüchliche bzw. riskante Anchor-Hinweise:

- Der Prompt nennt einen sichtbaren Laptop-Screen mit AdTool-AI-Interface / Social-Media-Calendar. Solche Screens, Poster oder UI-Vorschauen können Mini-Menschen/Profilbilder erzeugen, die der Audit korrekt als zusätzliche Menschen zählt.
- Der bestehende Sanitizer entfernt zwar den `[Dialog]`-Block und den `Featuring ...:`-Prefix, aber es bleibt eine potenziell verwirrende Charakterbeschreibung übrig, z. B. eine Zeile, die Matthew-Slot und Samuel-Name vermischt.
- `compose-scene-anchor` und `compose-video-clips` verlangen schon exakt 2 Personen, aber der konkrete Szenenprompt fordert gleichzeitig visuelle Screen-Inhalte, die das Exact-Count-Audit triggern.

Ich habe zusätzlich die Sync.so-Dokumentation geprüft: Für Multi-Person-Clips ist manuelle Speaker Selection mit Pixelkoordinaten korrekt; Segments sind für präzise Timing-Fenster gedacht. Der aktuelle Fehler liegt vor dieser Phase, beim Bild-/Anchor-Gate.

## Plan zur Reparatur

1. **Anchor-Sanitizer für Cinematic-Sync härten**
   - In `compose-video-clips/index.ts` die Anchor-spezifische Prompt-Reinigung erweitern.
   - Screen-/Poster-/Mirror-/Photo-/Calendar-/Interface-Phrasen für den Anchor neutralisieren, z. B. zu: Laptop ist vorhanden, aber der Screen ist abgewandt/unscharf/ohne erkennbare Personen oder UI.
   - Namen aus übrig gebliebenen Charakterbeschreibungen entfernen, wenn sie nach `Featuring ...:` noch kollidieren und extra Personen triggern können.

2. **Anchor-Prompt priorisieren: Personenanzahl schlägt Szenendetail**
   - Für Cinematic-Sync-Anchors explizit machen: Wenn ein Szenendetail zusätzliche Menschen verursachen würde, muss das Detail weggelassen werden.
   - Laptop/Cafe/Office bleiben erlaubt, aber keine sichtbaren Screens mit Menschen, keine Poster, keine Fotos, keine Background-Personen.

3. **Audit robuster, aber nicht unsicher machen**
   - Den harten Stop bei echten Extra-Personen beibehalten.
   - Nur die Ursache vermeiden, statt den Audit abzuschwächen. Das schützt weiter vor „falscher Charakter spricht“.

4. **Bestehende fehlgeschlagene Szene sauber resetten**
   - Für `60562d55-e95b-4746-a242-5e8a90475b52` den kaputten Anchor-State löschen:
     - `reference_image_url`
     - `audio_plan.twoshot.anchor_face_audit`
     - abgeleitete FaceMap/Heartbeat/Sync-Jobs
     - `dialog_shots`
     - passenden Eintrag in `scene_anchor_cache`
   - Szene wieder auf `pending` / `anchor` bzw. renderbereit setzen, damit ein frischer, sauberer Anchor erzeugt wird.

5. **Deploy und Validierung**
   - `compose-video-clips`, `compose-scene-anchor` und falls nötig `compose-dialog-scene` deployen.
   - Szene neu anstoßen.
   - Prüfen, dass der neue Anchor-Audit `faces=2/2` und `humans=2/2` meldet.
   - Danach prüfen, dass `compose-dialog-scene` v3 mit 2 Speaker-Shots startet und `poll-dialog-shots` die Sync.so-Jobs dispatcht.

## Erwartetes Ergebnis

- Kein `anchor_extra_person_detected` mehr für diese Szene.
- Der Anchor zeigt genau Samuel + Matthew, keine dritten Menschen auf Laptop/Postern/Hintergrund.
- Danach kann die bestehende v3-Lip-Sync-Pipeline normal laufen.
- Der zweite Satz von Samuel bleibt weiterhin durch die v3-per-speaker-Multi-Window-Logik abgedeckt.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>