## Analyse: was heute kaputt gegangen ist

**Do I know what the issue is? Yes.** Der aktuelle Fehler ist sehr wahrscheinlich **nicht primär das JSON-Format**, sondern die Kombination aus zwei Regressionen:

1. **Sprecher→Gesicht-Mapping ist falsch geworden**
   - In der aktuellen Szene `0b0b7f78...` ist die Script-Reihenfolge:
     1. Samuel
     2. Matthew
     3. Kailee
     4. Sarah
   - Die visuelle Gesichtsreihenfolge im Plate ist aber nicht identisch mit der Script-Reihenfolge.
   - Die vorhandene Anchor-FaceMap kennt die Identitäten, aber `plate_identity` wurde mit `resolvedCount: 0` und `characterId: null` gespeichert.
   - Danach wurden die plate-native BBoxes blind per Index auf die Script-Reihenfolge gelegt. Ergebnis: Pass 1/3 können das falsche Gesicht croppen/animieren. Das passt exakt zu „Sprecher 3 wurde von Sprecher 1 gesprochen“ und jetzt zu „kein Lip Sync funktioniert sauber“.

2. **v164/v165 `silentSlots` verschlimmern das sichtbare Ergebnis**
   - Diese Freeze-Overlays frieren andere Gesichter aus dem Master-Plate ein.
   - Das führt zu Morphs/Geisterflächen und kostet massiv Renderzeit, ohne den eigentlichen Mapping-Fehler zu lösen.
   - Die Screenshot-Symptome passen: sichtbare Morphs, sehr langer finaler Stitch, als würde der Clip insgesamt „komisch“ überlagert.

**JSON-Befund:** Das Sync.so-Format selbst entspricht der Doku: `active_speaker_detection: { auto_detect:false, bounding_boxes_url }` und die JSON-Datei muss `{ "bounding_boxes": [...] }` enthalten. Der Fehler liegt eher darin, **welche Box** pro Sprecher in diese JSON geschrieben wird, nicht in der äußeren JSON-Struktur.

## Plan v166

### 1. Silent-Face Freeze vollständig deaktivieren
- `render-sync-segments-audio-mux` soll keine `silentSlots` mehr erzeugen oder an Remotion geben.
- `DialogStitchVideo.tsx` soll `SilentFaceFreeze` nicht mehr rendern.
- Dadurch verschwinden die Morph-/Ghost-Overlays und die finale Lambda-Renderzeit sinkt deutlich.

### 2. Sprecher-Mapping reparieren: Anchor-Identität vor Slot-Index
- In `compose-dialog-segments` wird die plate-native Face-Erkennung weiterhin genutzt, aber nicht mehr blind nach Script-Index zugeordnet, wenn `plate_identity.resolvedCount === 0`.
- Wenn die Anchor-FaceMap vollständige `characterId`s enthält, wird gemappt als:

```text
speaker.character_id
  -> anchor faceMap slotIndex
  -> plate-native face with same visual slot
  -> speakerPlateBboxes[speaker_idx]
```

- Nur wenn dieses Mapping eindeutig ist, wird dispatched.
- Wenn nicht eindeutig: fail-fast + Credit-Refund statt falscher Lip-Sync.

### 3. Bounding-Boxes-Pfad behalten, aber absichern
- `bbox-url-pro` bleibt der richtige Weg.
- Pro Pass wird validiert und geloggt:
  - speaker name / character_id
  - anchor slot
  - plate bbox
  - transformed clip bbox
  - bbox JSON frame count
  - non-null voiced frames
- Keine Rückkehr zu `auto_detect:true` auf Multi-Speaker-Fullplate.

### 4. Preclip-Crop nur aus korrekt gemappter Box
- `renderPassFacePreclip` bekommt nur noch eine Box, die zu `speaker.character_id` passt.
- Wenn die Box nicht zur Speaker-Koordinate passt, wird der Preclip verworfen und nicht still weiterverwendet.

### 5. Szene sauber zurücksetzen und neu laufen lassen
- Nach Code-Änderung die aktuelle Szene `0b0b7f78-1b52-4210-9640-03124cf91fec` resetten:
  - `lip_sync_status`
  - `dialog_shots`
  - `twoshot_stage`
  - `clip_error`
- Edge Functions deployen.
- Remotion-Bundle neu deployen, weil `DialogStitchVideo.tsx` beteiligt ist.

### 6. Verifikation
- Logs müssen zeigen:

```text
v166_anchor_identity_slot_bridge speaker=Samuel ... character_id=samuel-dusatko anchor_slot=... plate_slot=...
v166_bbox_json speaker=... frames=... voiced_frames=... box=...
v166_no_silent_slots shots=4
```

- Erwartung im Ergebnis:
  - keine Freeze-Morphs mehr
  - nur die korrekte Speaker-Region wird pro Turn überlagert
  - Sarah bleibt korrekt
  - Pass 3 darf nicht mehr auf Sprecher 1/anderen Slot fallen

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>