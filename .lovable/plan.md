## Diagnose

Du hast recht: In Szene 1 sind beide Charaktere gesetzt. Der Screenshot zeigt sogar den korrekt gesetzten Two-Shot-Anchor mit zwei Personen. Das Problem ist nicht „Cast fehlt“, sondern ein **State-/Pipeline-Bruch**:

- **Thumbnail/Startbild** kommt aus `reference_image_url` / Scene-Anchor: zwei Personen, grauer neutraler Hintergrund, falsche Kleidung.
- **Beim Play** nutzt die Vorschau `clip_url`: ein alter oder anders generierter Hailuo-Clip mit nur einer Person in Büro-Szene.
- Die Szene ist aktuell in der Datenbank zurückgesetzt: `clip_status='pending'`, `clip_url=NULL`, `twoshot_stage='master_clip'`. Wenn die UI trotzdem noch ein altes Video abspielt, hält der Frontend-State einen veralteten `clipUrl` oder ein zusammengesetzter Preview-State wird nicht hart aus der DB bereinigt.

Zusätzlich gibt es ein zweites echtes Problem: Der Anchor ist zwar two-shot, aber neutral/grauer Hintergrund und ohne die gewählten Casual-Outfits. Der Hailuo-Clip danach ist wiederum eine andere Szene. Genau diese Entkopplung darf in der Pipeline nicht passieren.

## Ziel

Die Pipeline muss deterministisch werden:

```text
Cast + Outfit + Szenenbeschreibung
        ↓
Scene Anchor mit 2 Personen + Outfit + gewünschter Szene
        ↓
Hailuo Masterclip MUSS diesen Anchor respektieren
        ↓
Post-Hailuo Audit: wenn nicht 2 Personen sichtbar → kein Lip-Sync, Refund, klarer Fehler
        ↓
Two-Pass Lip-Sync nur auf geprüften 2-Personen-Clip
        ↓
Preview spielt nur finalen gültigen Clip oder zeigt „wird neu gerendert“, niemals alte Clips
```

## Implementierungsplan

### 1. Veraltete Preview-Clips zuverlässig entfernen

- Beim Reset / Neurendern einer Cinematic-Sync-Szene nicht nur `clip_url` löschen, sondern auch lokale UI-Zustände zuverlässig überschreiben.
- In `VideoComposerDashboard.refetchScenesFromDb` sicherstellen: Wenn DB `clip_url=NULL` und `clip_status='pending'`, darf lokal kein alter `clipUrl` weiterleben.
- In `ComposerSequencePreview` verhindern, dass Szenen mit `clip_status !== 'ready'` als spielbar gelten, auch wenn lokal noch ein alter `clipUrl` vorhanden ist.

### 2. Anchor-Prompt muss Outfit + Szene respektieren

- Der aktuelle Server-Fallback `neutralTwoShotPrompt(...)` erzeugt bewusst einen neutralen grauen Two-Shot. Das war für Face-Lock gut, ist aber für echte Szenen falsch.
- Für `cinematic-sync` mit 2+ Sprechern ändern:
  - nicht nur „two people front facing gray background“ erzeugen,
  - sondern: **beide Personen, gewählte Outfits, gleiche Szene/Umgebung, equal screen share, beide Münder sichtbar, keine Hand/Mikro vor Mund**.
- Singulare Szenenformulierungen („he is staring at laptop“, „hand on his forehead“) werden entschärft, damit nicht eine Person die ganze Szene dominiert.

### 3. Hailuo-Masterclip muss auf Two-Shot geprüft werden

- Nach dem Hailuo-Render den fertigen MP4-Clip auditieren:
  - Frame 0.5s
  - Mitte
  - Ende
- Erwartung bei Two-Shot: mindestens 2 sichtbare Gesichter / Personen.
- Wenn Hailuo nur eine Person rendert:
  - `clip_error='source_clip_missing_speakers'`
  - `clip_status='failed'`
  - automatischer Credit-Refund
  - kein Sync.so-Lip-Sync starten

### 4. Lip-Sync nur auf validem Masterclip starten

- `compose-clip-webhook` / Auto-Trigger darf `compose-twoshot-lipsync` nur starten, wenn:
  - `clip_status='ready'`
  - `clip_url` gesetzt
  - bei Two-Shot der Masterclip-Audit bestanden ist
- Sonst klare UI-Fehlermeldung statt falschem One-Person-Voiceover.

### 5. Testszene sauber zurücksetzen

- Szene `70a34582-178c-4ed9-a357-5f4725e7902a` erneut resetten:
  - `clip_url=NULL`
  - `clip_status='pending'`
  - `clip_error=NULL`
  - `lip_sync_status='pending'`
  - `twoshot_stage='master_clip'`
  - alte Sync-Jobs / FaceMap nur dort löschen, wo sie aus einem ungültigen Render stammen
- Danach ein frischer Render mit neuer Pipeline.

## Einschätzung zur Dauer

Ehrlich: Für **diese konkrete Fehlerklasse** brauchen wir etwa **1 konzentrierten Implementierungsdurchlauf**.

- **Heute fixbar:** veraltete Preview-Clips, falscher Play-State, Hailuo-One-Person-Audit, sauberer Reset.
- **Noch 1 zusätzlicher Iterationslauf möglich:** Outfit-/Scene-Anchor kann je nach Bildmodell-Ausgabe noch nachjustiert werden.
- **Artlist-Level Perfektion:** Das ist eine größere Architekturstufe (Face-Crop oder Solo-Speaker-Compositing), eher 3–10 Tage, aber für deinen aktuellen Fehler müssen wir nicht direkt dahin.

## Empfehlung

Ich würde jetzt nicht weiter an `temperature` oder Pre-Roll drehen. Das war Lip-Sync-Feintuning. Der aktuelle Fehler sitzt davor: **Anchor/Clip/Preview-State sind nicht mehr dieselbe Wahrheit**.

Als nächstes implementieren wir den deterministischen Two-Shot-Gate:

1. Preview darf keine stale Clips spielen.
2. Anchor muss Szene + Outfit + beide Charaktere enthalten.
3. Hailuo-Output wird geprüft, bevor Lip-Sync startet.

Danach rendern wir Szene 1 neu und bewerten erst dann wieder Lip-Sync-Timing.