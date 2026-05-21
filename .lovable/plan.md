## Ursache (verifiziert in der DB)

Szene `e3df41ad-…` hat:

- `character_shots = [matthew (idx 0), samuel (idx 1)]`
- `faceMap.faces = [left @ x=385, right @ x=991]` (Gemini-Detection nach x sortiert)
- Jobs: Pass 1 = Matthew → **left** face, Pass 2 = Samuel → **right** face

Die Annahme „character_shots[0] = linkes Gesicht" ist falsch. `character_shots` ist nur die Reihenfolge, in der die Casting-Slots in der UI hinzugefügt wurden — sie sagt **nichts darüber aus, auf welcher Seite Nano Banana 2 den Charakter im Anker-Frame tatsächlich gerendert hat**. In dieser Szene steht Matthew rechts und Samuel links, also bekommt Matthews Stimme Samuels Mund und umgekehrt → genau das vom User beschriebene Symptom.

Der zusätzliche Lipsync-Drift entsteht zum Teil dadurch, dass der Sync.so-Pass auf das falsche Gesicht trifft: Sync.so versucht trotzdem, Lippen zu synchronisieren, das Ergebnis sieht „fast richtig, aber leicht daneben" aus, weil der Track nicht zu den Mundbewegungen passt.

## Plan: Identity-basiertes Face↔Character-Matching

### 1. Gemini-Vision-Matching im Anchor-Schritt

`compose-scene-anchor` (oder direkt nach Anchor-Erzeugung in `compose-twoshot-lipsync`) bekommt einen zusätzlichen Schritt:

- Pro detektiertem Gesicht im Anker-Frame wird ein Crop (bbox + kleines Padding) an Gemini 2.5 Flash geschickt.
- Zusammen mit den Reference-Portraits aller cast-Charaktere der Szene (max. 4) wird Gemini gefragt:
  „Welche `characterId` aus der folgenden Liste passt am besten zu diesem Gesicht? Antworte ausschließlich mit der ID oder `unknown`."
- Resultat: Jeder Eintrag in `faceMap.faces` bekommt ein neues Feld `characterId: string | null` und `matchConfidence: number`.

Cache: Das Ergebnis wird in `audio_plan.twoshot.faceMap.faces[].characterId` persistiert (idempotent, kein erneuter Gemini-Call bei Retry).

### 2. Mapping nutzt characterId statt Position

`pickTargetCoordinates` in `compose-twoshot-lipsync` + `poll-twoshot-lipsync`:

- **Primary**: Face wird über `faceMap.faces[].characterId === speaker.character_id` gewählt. `mappingSource = "identity_match"`.
- **Secondary**: Wenn beide Faces kein Identity-Match haben, aber genau eines matched, bekommt das andere automatisch den verbleibenden Speaker (`mappingSource = "identity_match_inferred"`).
- **Letzter Fallback**: Falls Gemini-Matching komplett scheitert, harter Stopp mit `clip_error = "speaker_face_mapping_failed"` + Refund + UI-CTA „Quellclip neu rendern" — kein blindes Position-Mapping mehr, weil das genau zu diesem Bug geführt hat.

### 3. Speaker-Mismatch-Detection als Pre-Flight

Vor dem ersten Sync.so-Call wird geprüft:

- Anzahl unique `characterId`s in `faceMap.faces` ≥ Anzahl distinkter Sprecher in `audio_plan.twoshot.speakers`.
- Wenn nicht: gleicher harter Stopp wie oben, bevor Credits an Sync.so gehen.

### 4. Szene `e3df41ad-…` reparieren

- `clip_url` zurück auf Quellclip
- `lip_sync_status = pending`, `twoshot_stage = null`, `replicate_prediction_id = null`
- `audio_plan.twoshot.faceMap` löschen (damit Identity-Match frisch läuft)
- 144 Credits für den falsch synchronisierten Render erstatten

### 5. Lipsync-Qualität (Sekundärfix)

Sobald Mapping korrekt ist, ist Sync.so `lipsync-2-pro` mit `coordinates`-Payload bereits das beste verfügbare Modell — kein weiterer Modellwechsel nötig. Der Drift sollte verschwinden, weil die Mundregion stimmt. Falls nach diesem Fix immer noch sichtbarer Drift bleibt, schauen wir uns Audio-Offset (`segments_secs` vs. master start) als Folge-Issue an.

## Erwartetes Ergebnis

- Matthew spricht **immer** den Matthew-Mund, unabhängig davon, ob Nano Banana 2 ihn links oder rechts platziert.
- Lip-Sync wirkt korrekt, weil Mundregion und Audiotrack zusammenpassen.
- Kein stiller Output mit falscher Zuordnung mehr möglich — schlägt im Pre-Flight kontrolliert mit Refund fehl.

## Technische Dateien

- `supabase/functions/compose-twoshot-lipsync/index.ts` — Identity-Match nach `detectFacesInMaster`, neues `pickTargetCoordinates` mit `characterId`-Lookup, Pre-Flight-Guard.
- `supabase/functions/poll-twoshot-lipsync/index.ts` — gleiches `pickTargetCoordinates`-Update für Pass 2.
- Memory-Update: `mem://architecture/lipsync/sync-so-pro-model-policy` um „Identity-Match statt Position-Mapping" ergänzen.
