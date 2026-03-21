
# Plan: Das eigentliche Musik-Problem sauber beheben

## Was ich jetzt eindeutig im Code und in den Laufzeitdaten gefunden habe

Das Problem ist sehr wahrscheinlich **nicht mehr das Template**.

### 1. Musik wird bereits korrekt an Lambda übergeben
Ich habe drei Stellen geprüft:

- `src/remotion/templates/UniversalCreatorVideo.tsx`
  - Musik ist dort bereits wieder als Root-`<Audio />` aktiv
  - sie wird nur deaktiviert, wenn `silentRender` oder `r33_audioStripped` greift
- `supabase/functions/auto-generate-universal-video/index.ts`
  - `backgroundMusicUrl` wird in `inputProps` gesetzt
  - Audio ist im Lambda-Startpayload aktiv (`muted: false`, `audioCodec: 'aac'`)
- `remotion-webhook` Logs
  - beim ersten Fehlversuch kommt `backgroundMusicUrl` tatsächlich mit

Das heißt: Die Musik **kommt bis zur Render-Engine**.

### 2. Der Absturz passiert vor dem eigentlichen Rendern beim Einlesen der MP3
Die aktuellen Logs sind klar:

- erster Render enthält z. B. `backgroundMusicUrl: .../background-music/library/energetic-pop-015.mp3`
- Lambda bricht ab mit:
  - `Failed to find two consecutive MPEG audio frames`
  - `Invalid data found when processing input`
- danach greift der Retry
- im Retry wird `backgroundMusicUrl` entfernt
- der zweite Render läuft nur mit Voiceover durch

Also: **Die Musik fehlt nicht wegen der UI oder wegen des Audio-Layers, sondern weil die ausgewählten Bibliotheksdateien in Lambda als ungültig erkannt werden.**

### 3. Die aktuelle Seed-Logik markiert problematische Dateien trotzdem als gültig
In `supabase/functions/seed-background-music/index.ts` passiert aktuell nur:

- Download von Jamendo
- einfacher MP3-Magic-Byte-Check
- Upload nach Storage
- DB-Eintrag mit `is_valid = true`

Was **nicht** passiert:
- keine echte Lambda-Kompatibilitätsprüfung
- kein ffprobe-/Render-Smoketest
- kein Re-Encoding
- keine Trennung zwischen „Datei existiert“ und „Datei ist für Remotion-Lambda wirklich nutzbar“

Das erklärt die Endlosschleife perfekt:
```text
Track aus DB gewählt
-> Datei existiert
-> Datei wird als gültig angesehen
-> Lambda versucht Audio einzulesen
-> ffprobe crasht
-> Retry entfernt Musik
-> fertiges Video ohne Hintergrundmusik
```

### 4. Zusätzlich gibt es noch einen Deployment-Mismatch
Im Repo steht aktuell `AUTO_GEN_BUILD_TAG = r68...`, aber die Live-Logs zeigen noch `BUILD_TAG=r67...`.

Das ist **nicht die Hauptursache** für den Musikverlust, aber es zeigt:
- die Runtime ist nicht vollständig auf dem erwarteten Stand
- wir sollten Deployment-Sync ausdrücklich mitfixen

## Was ich stattdessen bauen würde

## Schritt 1: Musikdateien nicht mehr nur per Header prüfen, sondern gegen Lambda validieren
Statt `is_valid` sofort auf `true` zu setzen, würde ich eine echte Validierungs-Pipeline einführen.

### Neue Idee
Jeder Track bekommt einen echten Validierungsstatus, z. B.:

- `pending`
- `validated`
- `failed`

Zusätzlich:
- `validation_error`
- `last_validated_at`
- `validation_attempts`

Damit unterscheiden wir endlich:
- „liegt im Storage“
- „ist im Browser abspielbar“
- „ist in Remotion Lambda wirklich renderbar“

## Schritt 2: Minimalen Audio-Smoke-Test über Remotion einführen
Ich würde **keinen weiteren Template-Umbau** machen, sondern eine kleine dedizierte Audio-Validierung bauen:

### Neue kleine Composition
Eine minimalistische Composition, z. B.:
- schwarzer Background
- 1–2 Sekunden Länge
- nur `<Audio src={trackUrl} />`

Wenn dieser Mini-Render erfolgreich startet bzw. durchläuft, ist der Track Lambda-kompatibel. Wenn er mit `audio_corruption` scheitert, wird er als unbrauchbar markiert.

Das ist der wichtigste Architekturwechsel:
- nicht mehr „Datei sieht wie MP3 aus“
- sondern „Datei hat den echten Lambda-Test bestanden“

## Schritt 3: `seed-background-music` auf Kandidaten-Import statt Sofort-Freigabe umbauen
`seed-background-music` sollte künftig nur noch:

1. Kandidaten von Jamendo holen
2. in Storage speichern
3. als `pending` markieren

Aber **nicht mehr direkt** als produktionsreif freigeben.

Danach läuft separat die Validierung:
- nur bestandene Tracks werden `validated`
- fehlgeschlagene Tracks werden `failed`

## Schritt 4: Nur noch validierte Tracks auswählen
In `selectBackgroundMusic()` würde ich die Auswahl hart einschränken auf:

- nur `validation_status = 'validated'`
- nur Tracks ohne letzten Validierungsfehler
- Mood-/Kategorie-Matching wie bisher

Dann greift die Video-Pipeline nie wieder auf Kandidaten zu, die nur „formal wie MP3 aussehen“, aber im Render abstürzen.

## Schritt 5: Retry bei `audio_corruption` zuerst mit anderem validierten Track
Aktuell entfernt der Retry die Musik direkt.

Ich würde das ändern zu:

1. erster Fehler mit Track A
2. wenn Fehlerkategorie `audio_corruption`:
   - anderen **bereits validierten** Track B derselben Kategorie wählen
3. nur wenn auch das nicht klappt:
   - Musik entfernen und Voiceover-only rendern

So bleibt der Voiceover-Fallback erhalten, aber Musik bekommt eine echte zweite Chance.

## Schritt 6: Forensik erweitern
Ich würde die verwendete Musik pro Render sauber speichern:

- Track-ID
- `storage_path`
- `source_id`
- `validation_status`
- Retry-Track, falls gewechselt
- finaler Grund, warum Musik entfernt wurde

Dann ist bei der nächsten Fehlersuche sofort sichtbar:
- welcher Track gewählt wurde
- ob er wirklich validiert war
- ob ein Fallback-Track versucht wurde

## Schritt 7: Deployment-Sync hart absichern
Weil die Logs noch `r67` zeigen, würde ich zusätzlich die Versionierung sichtbarer machen:

- Build-Tag in der Function
- Canary in den Progress-Daten
- kurze Runtime-Logs für:
  - gewählten Track
  - Validierungsstatus
  - aktiven Build-Tag

Damit sehen wir sofort, ob wirklich der neue Musikpfad live ist.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/seed-background-music/index.ts` | Import nur noch als Kandidaten, nicht sofort als gültig |
| `supabase/functions/auto-generate-universal-video/index.ts` | nur validierte Tracks auswählen, Retry mit Alternativ-Track |
| `src/remotion/Root.tsx` | neue kleine Audio-Validation-Composition registrieren |
| neue Remotion-Template-Datei | minimaler Audio-Smoke-Test |
| neue Migration | Validierungsfelder für `background_music_tracks` |

## Warum ich **nicht** nochmal das Template als Erstes anfassen würde

Weil die Beweise inzwischen klar dagegen sprechen:

- Musik ist im Template vorhanden
- Musik-URL ist im ersten Render vorhanden
- Lambda stürzt beim Audio-Einlesen ab
- Retry entfernt die Musik erst **nach** diesem Absturz

Das ist kein „Audio wird nicht abgespielt“-Problem mehr, sondern ein **„Bibliothek enthält Tracks, die nie produktionsvalidiert wurden“**-Problem.

## Erwartetes Ergebnis

Nach der Umstellung:

- nur noch wirklich Lambda-taugliche Tracks werden verwendet
- Hintergrundmusik bleibt im ersten Render erhalten
- Retry wechselt zuerst auf einen anderen validierten Track statt direkt auf stumm
- die Bibliothek kann weiter auf 100+ Tracks wachsen, aber nur mit echten „usable“ Tracks
- wir debuggen danach nicht mehr blind am Template vorbei

## Kurzfassung

Ja — es ist ein anderes Problem als „noch ein falscher Audio-Branch im Template“:

**Die Musik wird korrekt bis zur Render-Engine geliefert, aber die aktuelle Musikbibliothek wird nur oberflächlich geprüft und enthält Tracks, die in Remotion Lambda beim ffprobe-Einlesen abstürzen.**  
Darum würde ich jetzt die Bibliothek auf echte Lambda-Validierung umstellen statt noch einmal den Audio-Layer umzubauen.
