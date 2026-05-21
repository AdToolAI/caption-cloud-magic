## Befund

Das aktuelle Problem hat zwei echte Ursachen, beide im aktuellen Payload sichtbar:

1. **Unskriptierter Audio-Anhang**
   - `compose-twoshot-audio` hängt an jede nicht-letzte Dialogzeile literal ` ... ` an.
   - Bei kurzen Zeilen wie `Was denn? ...` kann die TTS-Stimme daraus ein hörbares Murmeln/Atmen/„Punkt Punkt“-ähnliches Extra erzeugen.
   - Das erklärt den Teil „irgendwas Unverständliches mit dran, was nicht im Skript steht“.

2. **Falsches Lip-Sync-Fenster bei Charakteren mit mehreren Turns**
   - Samuel hat Zeile 1 und Zeile 3.
   - Aktuell wird daraus ein einziges `voicedRange` von `0.000s → 6.362s` gebaut.
   - Dieses Fenster enthält aber auch Matthews Zeile 2 dazwischen.
   - Pass 2 reanimiert dadurch den ersten Charakter über den kompletten Bereich inklusive der zweiten Sprecherzeile — daher wirkt es so, als würde ein Charakter fremde/folgende Zeilen mitsprechen.

Aktueller betroffener Scene-State bestätigt das:

```text
Zeile 1 Samuel:  0.000s - 2.322s
Zeile 2 Matthew: 2.322s - 3.854s
Zeile 3 Samuel:  3.854s - 6.362s

Samuel-Pass aktuell: segments_secs = [[0.000, 6.362]]  ← falsch, enthält Matthew
Matthew-Pass aktuell: segments_secs = [[2.322, 3.854]] ← korrekt
```

## Plan

1. **TTS darf den Skripttext nicht mehr verändern**
   - In `compose-twoshot-audio` wird `utterance = block.text` verwendet.
   - Das literal angehängte ` ... ` wird entfernt.
   - Falls Pausen zwischen Sprechern nötig sind, werden sie als echte PCM-Silence zwischen den Audio-Samples eingefügt, nicht als Text an die TTS gesendet.

2. **Per-Turn statt Union-Fenster für Lip-Sync**
   - Für jeden Sprecher werden die bestehenden `turns[]` als eigene Sync.so-Fenster genutzt.
   - Beispiel Samuel wird künftig:

```text
segments_secs = [[0.000, 2.322], [3.854, 6.362]]
```

   - Matthew bleibt:

```text
segments_secs = [[2.322, 3.854]]
```

   - Damit wird nie wieder ein anderer Sprecher innerhalb eines fremden Lip-Sync-Passes überschrieben.

3. **Sync.so Payload-Typ erweitern**
   - `segmentSecs` wird intern von einem einzelnen `[start,end]` auf mehrere Fenster `[[start,end], ...]` erweitert.
   - Die Fenster bleiben weiterhin ausschließlich am Video-Input, Audio bleibt die merged WAV.

4. **Retry-/Fallback-Metadaten härten**
   - Jobs speichern die tatsächlich verwendete `mergedAudioUrl` und die exakten Segment-Windows.
   - Transient retries übernehmen dieselben Segment-Windows statt versehentlich ohne Fenster oder mit falschem Debug-Audio neu zu starten.
   - Der gefährliche Auto-Detect-Fallback wird so eingeschränkt, dass er nicht mit kompletter merged WAV ohne Fenster fremde Zeilen auf ein Gesicht mappen kann.

5. **Betroffene Szene sauber neu aufsetzen**
   - Szene `88d3a20f-f177-47a9-a84f-8fca1e58e51b` wird auf den ursprünglichen Quellclip zurückgesetzt.
   - Bestehende Two-Shot-Audio-Clips der Szene werden regeneriert, damit die `...`-Artefakte verschwinden.
   - Lip-Sync wird wieder auf `pending` gesetzt; der nächste Lauf nutzt die korrigierten Segment-Fenster.

6. **Memory aktualisieren**
   - Dokumentieren: keine TTS-Textmutation, Pausen nur als Silence-Samples, und Multi-Turn-Speaker müssen disjunkte `segments_secs` pro Turn nutzen.

## Erwartetes Ergebnis

- Zeile 1 wird nur vom ersten Charakter gelip-synct.
- Zeile 2 wird nur vom zweiten Charakter gelip-synct.
- Zeile 3 wird wieder nur vom ersten Charakter gelip-synct.
- Keine hörbaren Extra-Laute mehr durch angehängte Ellipsen im TTS-Input.