Befund: Die Szene rendert nicht wirklich seit 7–10 Minuten weiter. HeyGen bricht beim Upload des Talking-Photo-Bildes mit `HEYGEN_UPLOAD_TRANSIENT` / Code `40099` ab. Die UI bleibt trotzdem auf `generating`, weil der Fehler nicht zuverlässig auf die bereits angelegte Sub-Szene zurückgeschrieben wird bzw. der Dialog-Flow die Sub-Szene vorher als „generating“ erstellt.

Plan:

1. Hängende UI-Zustände vermeiden
- In `generate-talking-head` den Request-Body nur einmal am Anfang lesen und `sceneId` für den Catch-Block stabil verfügbar machen.
- Bei jedem Fehler die betroffene Szene zuverlässig auf `clip_status = failed` setzen und `clip_error` speichern.
- Optional den Response-Status bei akzeptiertem async Start auf `202` vereinheitlichen, sobald HeyGen-Job wirklich gestartet wurde.

2. Sub-Szene bei Client-Fehler sofort markieren
- In `SceneDialogStudio.tsx` im per-speaker Catch zusätzlich die neu angelegte Sub-Szene clientseitig/DB-seitig auf `failed` setzen, falls die Edge Function schon vor dem DB-Update scheitert.
- Den Toast soll den echten Grund zeigen: „HeyGen war kurz nicht erreichbar — bitte erneut versuchen“, nicht nur endloses Rendering.

3. Szene nicht mehr ans Ende hängen
- Den bereits besprochenen Insert-Flow umsetzen: SRS-Sub-Szenen werden an der Position der Dialog-Szene eingefügt, nicht am Projektende.
- Die Parent-Dialogszene wird nach erfolgreichem Split ersetzt, damit aus Szene 1 direkt Szene 1/2 als Lip-Sync-Shots werden.

4. Nur echte Speaker-Blöcke rendern
- Vor dem Split sichtbar/technisch prüfen, wie viele Dialog-Blöcke wirklich erkannt wurden.
- Wenn nur Matthew im Skript steht, wird auch nur Matthew gerendert; Sarah muss als eigene Zeile im Skript stehen, sonst gibt es keine zweite Sub-Szene.

5. Bestehende hängende Szene bereinigen
- Die aktuell hängende Szene wird auf `failed` gesetzt, damit du sie erneut starten kannst statt auf einem endlosen Spinner zu bleiben.

Erwartetes Ergebnis:
```text
Vorher:
Szene 1 Dialogcontainer, Szene 2–6 normal, neue Lip-Sync-Szene hängt als Szene 7 auf generating

Nachher:
Szene 1 Dialogcontainer wird ersetzt durch:
Szene 1 Matthew Lip-Sync
Szene 2 Sarah Lip-Sync
alte Szene 2–6 werden zu Szene 3–7
Fehler landen sichtbar auf failed statt endlos generating
```

Technische Dateien:
- `supabase/functions/generate-talking-head/index.ts`
- `src/components/video-composer/SceneDialogStudio.tsx`
- `src/components/video-composer/VideoComposerDashboard.tsx`
- ggf. `SceneCard.tsx` / `StoryboardTab.tsx` für Prop-Durchreichung

Keine neue Datenbankstruktur nötig; nur ein einmaliges Status-Update für die aktuell hängende Szene.