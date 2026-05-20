## Ziel

Lip Sync läuft jetzt, aber der vorgelagerte Scene-Anchor ist noch nicht streng genug: Er erlaubt aktuell faktisch „mindestens 2 Gesichter“. Dadurch kann das Bild 3 Personen enthalten, z. B. Charakter A doppelt plus Charakter B einmal. Die saubere Lösung ist: Für Two-Shot-Szenen darf der Anchor nur exakt die erwarteten Charaktere enthalten, jede Identität genau einmal.

## Ursache

Aktuell prüft die Pipeline hauptsächlich:

- Sind mindestens so viele Gesichter sichtbar wie erwartet?
- Sind die Referenzpersonen grundsätzlich vorhanden?

Das reicht für diesen Fehler nicht, weil dein Screenshot diesen Fall zeigt:

```text
Erwartet:   Person A + Person B
Ist-Bild:   Person A + Person B + Person A-Klon
```

Das besteht eine „mindestens 2 Gesichter“-Prüfung, ist aber für Lip Sync und Story-Konsistenz falsch.

## Plan

### 1. Anchor-Prompt auf „exakt N Personen“ härten

`compose-scene-anchor` soll für Multi-Character-Szenen nicht nur sagen „alle Personen sichtbar“, sondern verbindlich:

- Exakt 2 Menschen im Bild bei zwei Charakteren.
- Keine dritte Person, kein Statist, kein Spiegelbild, kein Duplikat.
- Jede Referenzperson genau einmal.
- Klare Slot-Zuordnung: Referenz #1 links, Referenz #2 rechts bzw. definierte Screen-Positionen.
- Bei Business-/Meeting-Szenen ausdrücklich keine zusätzliche Person im Vordergrund oder am Tisch.

Damit wird das Bildmodell weniger wahrscheinlich einen „extra Kollegen“ generieren.

### 2. Audit von „mindestens genug“ auf „exakt richtig“ ändern

In `compose-video-clips` wird die Face-Audit-Regel geändert:

```text
Bisher: faceCount >= expectedFaces ist ok
Neu:    faceCount === expectedFaces ist ok
        faceCount < expectedFaces -> missing speakers
        faceCount > expectedFaces -> extra/clone/person inserted
```

Für Two-Shot bedeutet das: 3 Gesichter bei 2 erwarteten Charakteren wird hart abgelehnt, bevor Hailuo oder Sync.so Credits verbrauchen.

### 3. Identity-Audit auf „jede Identität genau einmal“ erweitern

`_shared/identity-audit.ts` soll nicht nur prüfen, ob Referenz A und B vorhanden sind, sondern auch:

- Wie viele sichtbare Hauptgesichter gibt es insgesamt?
- Welche Gesichter matchen Referenz #1?
- Welche Gesichter matchen Referenz #2?
- Gibt es extra Gesichter ohne Referenz?
- Kommt dieselbe Referenzidentität mehr als einmal vor?

Abbruchgründe werden dadurch klarer:

```text
anchor_extra_person_detected
anchor_identity_duplicate_detected
anchor_identity_missing_detected
anchor_identity_ambiguous
```

### 4. Retry nur mit gezieltem Anti-Duplikat-Prompt

Wenn der erste Anchor 3 statt 2 Personen enthält oder eine Identität doppelt zeigt:

- Cache für diese Szene löschen.
- Einmal neu rendern mit verschärftem Prompt:
  - „Remove all extra humans.“
  - „Only the two reference people may appear.“
  - „Do not duplicate either person.“
- Wenn der zweite Versuch wieder falsch ist: Szene sauber abbrechen statt falschen Clip zu erzeugen.

### 5. Bestehende kaputte Szene neu starten

Nach dem Fix wird für die betroffene Szene gelöscht:

- geklonter `reference_image_url`
- `lock_reference_url`
- `scene_anchor_cache`
- aktueller Clip/Lip-Sync-Zustand
- alte FaceMap/SyncJobs im `audio_plan.twoshot`

Danach läuft sie einmal durch die neue strengere Pipeline.

### 6. UI-Fehler verständlicher machen

Wenn der Anchor abgelehnt wird, soll im Composer nicht nur generisch „fehlgeschlagen“ stehen, sondern z. B.:

```text
Anchor enthält zusätzliche Person: 3/2 Gesichter erkannt
Charakter wurde doppelt erkannt: bitte Anchor neu rendern
```

## Erwartetes Ergebnis

- Two-Shot-Szenen mit 2 Charakteren enthalten exakt 2 Personen.
- Ein geklonter dritter Charakter wird vor Video- und Lip-Sync-Generierung erkannt.
- Keine Credits werden für sichtbar falsche Anchors verbrannt.
- Wenn das Bildmodell trotz Retry keinen sauberen Anchor schafft, stoppt die Szene klar mit verständlicher Fehlermeldung.