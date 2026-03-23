
# Plan: Das echte Restproblem beheben — „validiert“ ist aktuell nur ein DB-Label

## Was ich jetzt eindeutig verifiziert habe

Der Fehler ist inzwischen klarer:

- **Produktion läuft auf r70**  
  `auto-generate-universal-video` loggt: `BUILD_TAG=r70-synth-only-music-2026-03-23`  
  -> Es ist **kein Deploy-Mismatch** mehr.

- **Musik kommt weiterhin bis in den ersten Lambda-Render**  
  `remotion-webhook` zeigt beim Fehlrender:
  `backgroundMusicUrl = .../background-music/library/corporate-ambient-synth-001.mp3`

- **Dann crasht Lambda weiter beim Einlesen der Musik**
  Fehler:
  `Failed to find two consecutive MPEG audio frames`
  -> Danach greift der Retry und entfernt die Musik.

- **Die aktuelle Bibliothek ist faktisch nicht echt validiert**
  In der DB gibt es aktuell:
  - `validated_count = 4`
  - `failed_count = 1`
  - `pending_invalid_count = 114`

- **Der entscheidende Punkt:**  
  `AudioSmokeTest.tsx` ist zwar im Bundle registriert, aber ich finde **keinen Code**, der diesen Smoke-Test wirklich für Tracks ausführt.  
  Gleichzeitig macht `seed-background-music` weiterhin nur:
  - Download
  - Magic-Byte-Check
  - Upload
  - DB-Eintrag

Das heißt: Das eigentliche Problem ist sehr wahrscheinlich **nicht mehr Template, UI oder Voiceover**, sondern:

```text
validation_status = 'validated'
bedeutet aktuell nicht:
"dieser Track wurde erfolgreich in Lambda getestet"
sondern nur:
"dieser Track wurde irgendwann als gültig markiert"
```

## Konsequenz

Der aktuelle Musikpfad baut auf einer Annahme auf, die nicht abgesichert ist.  
Darum landen weiterhin „validierte“ Tracks im Render, die dort sofort ffprobe sprengen.

## Umsetzung

### 1. Echte Track-Validierung einführen
Neue dedizierte Validierungsfunktion bauen, die für jeden Track einen **realen Lambda-Smoke-Test** mit `AudioSmokeTest` startet.

Ablauf pro Track:
1. Public URL aus Storage holen
2. `render-with-remotion` mit `AudioSmokeTest` aufrufen
3. Ergebnis auswerten
4. DB aktualisieren:
   - `validated`, wenn Render startet/abschließt
   - `failed`, wenn `audio_corruption`

Wichtig:
- `validation_status` darf nur noch durch diesen Test gesetzt werden
- nicht mehr manuell oder implizit

### 2. Die 4 aktuell „validierten“ Tracks sofort nachprüfen
Bevor weitere Musik ausgewählt wird:
- die 4 aktuellen Synth-Tracks einzeln durch den Smoke-Test schicken
- alles, was fehlschlägt, direkt auf `failed`
- nur echte Passes dürfen auswählbar bleiben

Damit sehen wir sofort:
- ob das Problem wirklich an allen aktuellen Audiodateien hängt
- oder ob mindestens ein Track tatsächlich Lambda-tauglich ist

### 3. Auswahl-Logik hart absichern
`selectBackgroundMusic()` verschärfen:

- nur `validation_status = 'validated'`
- nur Tracks mit echtem `last_validated_at`
- kein Fallback mehr auf „irgendein is_valid=true“

Zusätzlich auch im Retry:
- Alternativtrack nur aus **echt validierten** Tracks wählen
- wenn kein validierter Track verfügbar ist:
  - sauberer Status „kein validierter Track verfügbar“
  - nicht stillschweigend wieder riskante Quellen nehmen

### 4. Forensik pro Render sichtbar speichern
Im Progress/Result speichern:
- ausgewählte `track_id`
- `storage_path`
- `validation_status`
- `last_validated_at`
- ob Alternativtrack genutzt wurde
- finaler Grund, warum Musik entfernt wurde

So ist beim nächsten Test sofort sichtbar, ob wirklich ein getesteter Track verwendet wurde.

### 5. Bibliothek erst danach wieder skalieren
Erst wenn 1-2 Tracks den Smoke-Test wirklich bestehen:
- Seed/Import-Pipeline erweitern
- neue Tracks zunächst immer als `pending`
- danach automatisch validieren
- nur bestandene Tracks in die Produktionsauswahl aufnehmen

## Betroffene Bereiche

- `supabase/functions/seed-background-music/index.ts`
- `supabase/functions/auto-generate-universal-video/index.ts`
- neue Funktion für Track-Validierung
- optional Progress/Diagnose-UI für Track-Forensik
- bestehende `AudioSmokeTest`-Composition wird endlich aktiv genutzt

## Erwartetes Ergebnis

Nach der Umstellung gibt es keinen Blindflug mehr:

```text
Track in Storage
-> pending
-> echter Lambda-Smoke-Test
-> validated oder failed
-> nur validated darf in reale Video-Renders
```

Damit lösen wir das eigentliche Restproblem:
Nicht „Musik wird falsch eingebunden“, sondern  
**„die Bibliothek enthält Tracks, die als validiert gelten, ohne jemals wirklich gegen Lambda geprüft worden zu sein“.**

## Technische Kurzfassung

Ja — es ist tatsächlich ein anderes Problem:
**Die Produktionspipeline ist live, Voiceover funktioniert, Musik wird an Lambda übergeben — aber der aktuelle Validierungsstatus der Tracks ist nicht belastbar, weil die vorhandene AudioSmokeTest-Architektur noch gar nicht in die Musikbibliothek eingebunden ist.**
