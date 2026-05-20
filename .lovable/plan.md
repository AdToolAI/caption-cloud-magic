## Befund

Ja, das Problem kann weiterhin bestehen – aber nicht mehr wegen Sync.so. In der aktuellen Szene ist der Lip-Sync erfolgreich, jedoch basiert er auf einem bereits falschen Master-Clip/Anchor: Im gespeicherten `faceMap` wurden nur 2 Gesichter erkannt, obwohl visuell 3 Personen im Bild sind. Außerdem fehlt bei der sichtbaren Szene die neue `anchor_face_audit`-Metadatenmarkierung, d. h. sie ist sehr wahrscheinlich vor bzw. außerhalb der neuen Strict-Audit-Schiene durchgelaufen oder die Prüfung hat den dritten Menschen nicht als klares Gesicht gezählt.

## Saubere Lösung

### 1. Bestehende Szene nicht weiterverwenden
Die aktuelle Szene muss vollständig als visueller Clip neu gerendert werden, nicht nur Lip-Sync neu ausführen. Dazu werden für die betroffene Szene gelöscht/zurückgesetzt:

- `clip_url`
- `lip_sync_source_clip_url`
- `reference_image_url`
- `lock_reference_url`
- Two-shot `faceMap`, `syncJobs`, `heartbeat`
- `clip_status` zurück auf neu generierbar

Sonst lip-synct das System weiterhin denselben falschen 3-Personen-Clip.

### 2. Anchor-Prüfung darf nicht nur Gesichter zählen
Der aktuelle `countFacesInImage` zählt nur „klar sichtbare Gesichter“. In deinem Screenshot steht die zusätzliche Person seitlich/profilartig – genau so ein Fall kann vom Count als „nicht klar identifizierbar“ ignoriert werden.

Ich würde daher eine zweite Audit-Stufe ergänzen:

- `countHumansInImage`: zählt sichtbare menschliche Körper/Personen, nicht nur Frontalgesichter.
- Für Two-Shot gilt dann:
  - `humans === expectedCharacters`
  - `faces >= expectedCharacters` nur als Zusatzsignal
  - wenn `humans > expectedCharacters`: harter Abbruch `anchor_extra_person_detected`

Damit wird „2 Gesichter, aber 3 Körper“ zuverlässig abgefangen.

### 3. Strict-Audit auch für bereits komponierte Anchors erzwingen
Aktuell wird die Cinematic-Sync-Sicherheitslogik nur aktiv, wenn `referenceImageUrl` nicht wie ein komponierter Anchor aussieht. Wenn aber ein falscher `/scene-anchors/`-Anchor bereits gespeichert ist, kann die Pipeline ihn überspringen.

Ich würde ändern:

- Bei Cinematic-Sync + 2+ Cast immer Audit durchführen, auch wenn `referenceImageUrl` schon ein `/scene-anchors/`-Bild ist.
- Nur wenn `anchor_face_audit.ok === true` und die Audit-Version aktuell ist, darf der bestehende Anchor wiederverwendet werden.
- Sonst Cache invalidieren und neu rendern.

### 4. Provider-Prompt zusätzlich auf „two-person isolation“ umstellen
Beim zweiten Strict-Retry wird der Prompt noch stärker eingeschränkt:

- „exactly two people total in the entire image“
- „empty office background, no colleagues, no third body, no partial person“
- „crop/framing must exclude all other humans“
- bei 2 Personen: explizite Rollenpositionierung links/rechts

Das reduziert die Wahrscheinlichkeit, dass Nano Banana oder Hailuo aus einer Business-Szene automatisch einen dritten Kollegen ergänzt.

### 5. Hailuo-Output nach dem Master-Clip prüfen
Selbst wenn der Anchor korrekt ist, kann das i2v-Modell im Video eine dritte Person ergänzen. Deshalb würde ich nach dem Master-Clip-Render eine First-Frame-Prüfung ergänzen:

- Frame aus dem erzeugten Clip extrahieren bzw. vorhandene erste Frame-Quelle nutzen.
- `countHumansInImage` auf den Master-Clip-Frame anwenden.
- Wenn `humans > expectedCharacters`, Clip als fehlerhaft markieren und nicht zu Sync.so weitergeben.

Falls First-Frame-Extraktion serverseitig aktuell zu groß ist, machen wir das mindestens auf dem Anchor sofort und markieren Master-Clip-Validierung als nächsten Schritt.

### 6. UI-Status klarer machen
Wenn die Szene wegen 3 Personen gestoppt wird, soll die UI klar sagen:

```text
Anchor enthält zusätzliche Person: 3/2 Personen erkannt. Clip wurde nicht weiter lip-synct.
```

Oder:

```text
Master-Clip enthält zusätzliche Person: 3/2 Personen erkannt. Bitte Clip neu rendern.
```

## Technische Änderungen

- Neue Shared-Hilfe in `supabase/functions/_shared/face-count.ts` oder separater Datei: `countHumansInImage`.
- `compose-video-clips`:
  - Cinematic-Sync-Anchors immer auditieren, nicht nur wenn sie neu komponiert wurden.
  - Audit-Version in `audio_plan.twoshot.anchor_face_audit.version` speichern.
  - Existing Anchors ohne aktuelle Audit-Version invalidieren.
  - Hard-Abort bei `humans > expectedFaces`.
- `compose-scene-anchor`:
  - Cache-Key auf neue Version erhöhen.
  - Strict-Retry-Prompt um „no third body / no partial person / no colleague“ erweitern.
- Betroffene Szene `4e771db5-cc40-40ec-b889-58057a3c9855` vollständig resetten, damit sie wirklich neu durchläuft.

## Erwartetes Ergebnis

- Ein Two-Shot mit 2 Charakteren darf nicht mehr als 2 sichtbare Menschen enthalten – auch nicht, wenn nur 2 Gesichter erkannt werden.
- Bereits gespeicherte fehlerhafte Anchors werden nicht still wiederverwendet.
- Die falsche Szene wird neu erzeugt statt nur erneut gelip-synct.
- Wenn das Bild-/Video-Modell trotzdem eine dritte Person einfügt, stoppt die Pipeline vor weiteren Kosten mit einer eindeutigen Fehlermeldung.