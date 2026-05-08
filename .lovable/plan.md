
## Problem-Analyse

### Bug 1: Doppelte Voiceovers übereinander
`handleGenerateInline()` in `SceneDialogStudio.tsx` (Zeile 470-486) fuegt bei jedem Klick neue `scene_audio_clips`-Zeilen ein, loescht aber NIEMALS die alten. Drueckt der User zweimal "Voiceover generieren", liegen 2x Sarah + 2x Matthew uebereinander.

### Bug 2: Matthew redet laenger als Sarah trotz kuerzerem Skript
Die Dauer wird mit `block.text.length / 18` geschaetzt (Zeile 464), aber die **echte** Audio-Dauer kommt vom TTS-Service. Wenn ElevenLabs oder Hume fuer Sarahs Stimme schneller spricht als fuer Matthews, ist das Ergebnis falsch. Zusaetzlich: wenn alte Clips nicht geloescht wurden, laeuft Matthews alter langer Clip parallel zum neuen kurzen.

### Bug 3: Lip-Sync passt nicht
Im **Inline-Modus** (Standard, ohne "Als separate Szenen rendern") wird kein HeyGen-Lip-Sync ausgefuehrt — es werden nur Voiceover-Audio-Clips ueber das Video gelegt. Das Video laeuft unveraendert weiter, die Muender bewegen sich zufaellig. Lip-Sync passiert NUR im SRS-Modus (Shot-Reverse-Shot mit HeyGen).

### Wie Artlist / Synthesia es machen
Diese Tools generieren per Sprecher-Block:
1. TTS-Audio zuerst
2. Audio + Portraet an einen Avatar-Renderer (HeyGen/D-ID/Synthesia)
3. Der Renderer animiert das Gesicht Frame-fuer-Frame passend zur Audio-Wellenform
4. Das resultierende Video ERSETZT die Originalszene

Unser Inline-Modus ueberspringt Schritt 2-4 komplett.

---

## Fix-Plan

### 1. Alte Voiceover-Clips loeschen vor Neugenerierung
**Datei:** `src/components/video-composer/SceneDialogStudio.tsx`

Vor der `for (const block of blocks)`-Schleife in `handleGenerateInline()`:
- DELETE alle bestehenden `scene_audio_clips` mit `scene_id = sceneId` AND `kind = 'voiceover'`
- Damit werden alte Clips sauber entfernt, bevor neue eingefuegt werden

### 2. Echte Audio-Dauer statt Schaetzung verwenden
**Datei:** `src/components/video-composer/SceneDialogStudio.tsx`

Die Variable `duration` (Zeile 464) nutzt bereits `data.duration` als primaere Quelle, faellt aber auf `block.text.length / 18` zurueck. Das Fallback ist zu ungenau. Stattdessen:
- Wenn `data.duration` vorhanden, verwenden
- Wenn nicht: Audio-Datei per `Audio()` Element laden und `loadedmetadata`-Event abwarten fuer echte Dauer
- Erst danach den `scene_audio_clips`-Insert ausfuehren

### 3. Inline-Modus automatisch auf HeyGen upgraden wenn Cast vorhanden
**Datei:** `src/components/video-composer/SceneDialogStudio.tsx`

Wenn die Szene Cast-Charaktere mit `referenceImageUrl` hat:
- Standard-Flow aendern: statt nur Voiceover-Audio ueber die Szene zu legen, fuer jeden Block mit Portraet automatisch `generate-talking-head` aufrufen
- Das HeyGen-Video als `clip_url` der Szene setzen (wie im SRS-Modus, aber ohne separate Szenen zu erstellen)
- Fallback auf Audio-only wenn kein Portraet vorhanden

### 4. UI-Hinweis: Lip-Sync-Status klar kommunizieren
**Datei:** `src/components/video-composer/SceneDialogStudio.tsx`

- Badge neben dem Generate-Button: "Audio only" vs "Lip-Sync (HeyGen)" je nachdem ob Portraets vorhanden sind
- Warnung wenn kein Portraet: "Ohne Portraet nur Audio-Overlay, kein Lip-Sync"

---

## Technische Details

### Schritt 1 — DELETE alte Clips (SceneDialogStudio.tsx, handleGenerateInline)
```ts
// Vor der for-Schleife:
await supabase
  .from('scene_audio_clips')
  .delete()
  .eq('scene_id', sceneId)
  .eq('kind', 'voiceover');
```

### Schritt 2 — Audio-Dauer Fallback (SceneDialogStudio.tsx)
```ts
// Browser-seitiger Dauer-Probe wenn data.duration fehlt:
let duration = Number(data?.duration ?? 0);
if (!duration && audioUrl) {
  duration = await new Promise<number>((resolve) => {
    const a = new Audio(audioUrl);
    a.addEventListener('loadedmetadata', () => resolve(a.duration || block.text.length / 18));
    a.addEventListener('error', () => resolve(block.text.length / 18));
    setTimeout(() => resolve(block.text.length / 18), 5000);
  });
}
```

### Schritt 3 — HeyGen-Auto-Upgrade (SceneDialogStudio.tsx)
Fuer Bloecke deren Sprecher ein `referenceImageUrl` hat:
- TTS Audio generieren (wie jetzt)
- Dann `generate-talking-head` mit `audioUrl` + `imageUrl` aufrufen
- `clip_url` der Szene mit dem HeyGen-Result aktualisieren
- `scene_audio_clips` Insert TROTZDEM machen (fuer Timing/Preview)

Keine neuen Edge Functions noetig — `generate-talking-head` akzeptiert bereits `audioUrl` direkt.

### Kein DB-Schema-Aenderung noetig
Alle Fixes sind rein im Frontend (`SceneDialogStudio.tsx`).
