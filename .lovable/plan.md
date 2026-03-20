

# Plan: Voiceover über die Universal Video Creator Videos legen

## Aktuelle Architektur (bereits vorhanden)

Die Pipeline ist technisch schon gebaut, aber es gibt zwei Probleme die verhindern, dass der Voiceover tatsächlich im fertigen Video ankommt:

```text
auto-generate-universal-video
  → generate-video-voiceover (ElevenLabs TTS)
  → Lambda renders with muted:true
  → Webhook → mux-audio-to-video (FFmpeg: video + voiceover)
```

### Problem 1: Parameter-Mismatch bei Voiceover-Generierung

`auto-generate-universal-video` sendet `voiceGender: 'male'` an `generate-video-voiceover`, aber die Funktion erwartet `voice` (z.B. 'aria', 'roger'). Resultat: `voice` ist `undefined`, Fallback auf 'aria' — **funktioniert**, aber die Gender-Auswahl des Users wird ignoriert.

**Fix:** In `generate-video-voiceover/index.ts` ein Gender-Mapping hinzufügen: `male` → `roger`, `female` → `sarah`. Oder in `auto-generate-universal-video` den `voice`-Parameter korrekt setzen.

### Problem 2: render-universal-video (Export-Pfad) hat kein Audio-Muxing

Der manuelle Export-Schritt (`UniversalExportStep.tsx` → `render-universal-video`) rendert synchron und hat **keinen** `silentRender`/`audioTracks`-Mechanismus. Voiceover/Musik-URLs werden zwar in die `inputProps` geschrieben, aber das Lambda rendert trotzdem ohne Audio (da kein Audio-Codec konfiguriert ist).

**Fix:** Nicht nötig für Phase 1 — der Auto-Generate-Pfad hat bereits alles.

### Problem 3: Sicherstellen dass der Mux-Pfad zuverlässig funktioniert

Die Webhook → Mux-Pipeline muss getestet und ggf. gehärtet werden.

## Umsetzung (Schritt für Schritt — nur Voiceover, keine Musik)

### Schritt 1: Voice-Gender-Mapping fixen
**Datei:** `supabase/functions/generate-video-voiceover/index.ts`
- Gender-Mapping hinzufügen: `{ male: 'roger', female: 'sarah' }` als Fallback wenn `voice` ein Gender-String ist
- Damit wird die Stimme korrekt zum Geschlecht gemapped

### Schritt 2: Voiceover-URL im Auto-Generate sicherstellen  
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- Den `voice`-Parameter korrekt setzen basierend auf `briefing.voiceGender`
- Mapping: `male` → `'roger'`, `female` → `'sarah'`
- Logging verbessern um Voiceover-URL-Status zu tracken

### Schritt 3: Mux-Audio Robustheit
**Datei:** `supabase/functions/mux-audio-to-video/index.ts`
- Timeout-Handling verbessern (aktuell kein explizites Timeout)
- Logging erweitern für bessere Diagnose

### Schritt 4: Webhook audioTracks-Logging
**Datei:** `supabase/functions/remotion-webhook/index.ts`
- Detaillierteres Logging der `audioTracks` und `silentRender`-Flags für Diagnose

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/generate-video-voiceover/index.ts` | Gender-Mapping für Voice-Auswahl |
| `supabase/functions/auto-generate-universal-video/index.ts` | Voice-Parameter korrekt setzen |
| `supabase/functions/mux-audio-to-video/index.ts` | Robustheit + Logging |
| `supabase/functions/remotion-webhook/index.ts` | Audio-Diagnose-Logging |

## Erwartetes Ergebnis
- Voiceover wird korrekt generiert mit passender Stimme (männlich/weiblich)
- Nach Lambda-Render wird der Voiceover automatisch via FFmpeg auf das Video gemuxed
- Fertiges Video hat Sprache — **Musik kommt in Phase 2**

## Hinweis
Alle Änderungen sind Edge-Function-basiert — kein Bundle-Redeploy nötig. Sofort nach Deploy testbar.

