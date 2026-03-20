
# Plan: Sound im Universal Video Creator wirklich wiederherstellen

## Was ich gefunden habe

Die letzten Laufzeitdaten zeigen klar:
- der erste Render scheitert an `audio_corruption`
- der Retry läuft danach erfolgreich durch
- im erfolgreichen Retry ist `silentRender: false`
- `voiceoverUrl` ist vorhanden
- `backgroundMusicUrl` ist bereits entfernt

Das heißt: Das Voiceover ist im Retry noch da, wird aber im Remotion-Template trotzdem nicht hörbar gerendert.

## Hauptursache

### 1. Recovery-Flag schaltet aktuell auch das Voiceover ab
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

Im Retry setzt die Pipeline `diag.r33_audioStripped = true`, um nur die kaputte Musik zu entfernen.  
Im Template wird dieses Flag aber aktuell so verwendet, dass **alle** Audio-Komponenten blockiert werden:

- Voiceover wird blockiert
- Musik wird blockiert
- Soundeffects werden blockiert

Damit wird aus „Musik entfernen, Voiceover behalten“ effektiv wieder „alles stumm“.

### 2. Voiceover-only-Pfad ist fragil
Im selben Template läuft der lineare Voiceover-Pfad über `Html5Audio`.  
Wenn die Musik im Retry entfernt wird, bleibt kein robuster Audio-Pfad mehr übrig, der sicher in den finalen Render geht.

### 3. Der normale Export-Pfad ist wahrscheinlich ebenfalls unvollständig
**Dateien:**  
- `src/remotion/templates/UniversalVideo.tsx`
- `supabase/functions/render-with-remotion/index.ts`
- `supabase/functions/render-universal-video/index.ts`

Dort wird Audio zwar als Props übergeben, aber die Lambda-Payload setzt nicht konsistent die Audio-Render-Parameter wie im Auto-Generate-Pfad. Dadurch kann der manuelle Export weiterhin stumm bleiben, selbst wenn Auto-Generate später funktioniert.

## Umsetzung

### Schritt 1: Voiceover im Retry wirklich erhalten
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

Ich würde die Audio-Guards so umbauen:
- `silentRender` bleibt der einzige harte „alles stumm“-Schalter
- `r33_audioStripped` darf **nur** Musik/SFX unterdrücken
- Voiceover darf bei `r33_audioStripped=true` weiterhin rendern

Konkret:
- Voiceover-Bedingung: nur `!silentRender && voiceoverUrl`
- Musik-Bedingung: `!silentRender && !r33_audioStripped && backgroundMusicUrl`

### Schritt 2: Voiceover auf einen render-sicheren Pfad legen
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

Den Voiceover-only-Pfad würde ich auf einen stabilen Remotion-Audio-Pfad umstellen, statt ihn vom aktuellen `Html5Audio`-Fallback abhängig zu lassen.

Ziel:
- Voiceover funktioniert auch ohne Hintergrundmusik
- Retry mit „Musik entfernt, Voiceover bleibt“ liefert wirklich Ton
- keine Doppelbelegung des Voiceovers, wenn `SceneAudioManager` aktiv ist

### Schritt 3: Export-Pfad angleichen
**Dateien:**  
- `src/remotion/templates/UniversalVideo.tsx`
- `supabase/functions/render-with-remotion/index.ts`
- `supabase/functions/render-universal-video/index.ts`

Ich würde den zweiten Universal-Renderpfad auf dieselbe Audio-Logik bringen:
- Audio-Komponenten im Template sauber vereinheitlichen
- Payload explizit mit Audio aktiv senden (`audioCodec: 'aac'`, `muted: false`, kein stiller Fallback)
- damit Auto-Generate und manueller Export nicht unterschiedlich reagieren

### Schritt 4: Phase-1 sauber halten
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Da wir ursprünglich „erst Voiceover, dann Musik“ wollten, würde ich die Phase-1-Logik absichern:
- wenn Musik problematisch ist, nur Musik entfernen
- Voiceover immer priorisieren
- optional automatische Musik vorübergehend deaktivieren, bis Voiceover stabil bestätigt ist

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | `r33_audioStripped` nur noch für Musik/SFX nutzen, Voiceover entkoppeln |
| `src/remotion/templates/UniversalVideo.tsx` | Audio-Renderpfad angleichen |
| `supabase/functions/render-with-remotion/index.ts` | Audio-Parameter explizit im Lambda-Payload setzen |
| `supabase/functions/render-universal-video/index.ts` | Audio-Parameter explizit im Lambda-Payload setzen |
| `supabase/functions/auto-generate-universal-video/index.ts` | Phase-1-Priorisierung: Voiceover vor Musik |

## Erwartetes Ergebnis

- der Retry nach `audio_corruption` liefert endlich **Voiceover statt Stille**
- Hintergrundmusik kann weiterhin separat entfernt werden, ohne das Voiceover zu verlieren
- Auto-Generate und Export verhalten sich konsistent
- wir können danach sauber in **Phase 2 Musik** gehen, statt weiter zwei Probleme gleichzeitig zu debuggen

## Technischer Kern in einem Satz

Die Pipeline macht aktuell schon das Richtige auf Backend-Seite („Musik raus, Voiceover behalten“), aber das Remotion-Template interpretiert dieses Recovery-Flag falsch und macht das Video dadurch wieder komplett stumm.
