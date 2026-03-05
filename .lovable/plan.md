

## Kostenanalyse: Was kostet ein 30-Sekunden-Video aktuell?

### Pipeline-Schritte und ihre externen Kosten

Ein 30-Sekunden-Video durchläuft diese Schritte, jeder mit eigenen externen API-Kosten:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Schritt                  │ API              │ Kosten pro Aufruf     │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Drehbuch generieren   │ Lovable AI       │ ~€0,00 (inkludiert)   │
│    (generate-universal-  │ (Gemini Flash)   │                       │
│     script)              │                  │                       │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 2. Character Sheet       │ Replicate        │ ~$0,04 (1× Flux 1.1  │
│    (optional)            │ Flux 1.1 Pro     │  Pro)                 │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 3. 5× Szenen-Bilder     │ Replicate        │ ~$0,20 (5× Flux 1.1  │
│    (generate-premium-    │ Flux 1.1 Pro     │  Pro à ~$0,04)        │
│     visual)              │                  │                       │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 4. Voiceover             │ ElevenLabs       │ ~$0,30 (30s Text,     │
│    (generate-video-      │ TTS              │  abhängig vom Plan)   │
│     voiceover)           │                  │                       │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 5. Untertitel            │ Lovable AI       │ ~€0,00 (inkludiert)   │
│    (transcribe-audio)    │                  │                       │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 6. Beat-Analyse          │ Lovable AI       │ ~€0,00 (inkludiert)   │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 7. Video-Render          │ AWS Lambda       │ ~$0,15-0,30           │
│    (Remotion Lambda)     │ (Remotion)       │ (11 Lambdas × ~8s     │
│                          │                  │  × 2048MB)            │
├──────────────────────────┼──────────────────┼───────────────────────┤
│ 8. Musik                 │ Jamendo/Pixabay  │ €0,00 (kostenlos)     │
└─────────────────────────────────────────────────────────────────────┘

SUMME PRO ERFOLGREICHEN RENDER:  ~€0,65 - €0,80
```

### Das Problem: Fehlgeschlagene Versuche

Bei **jedem fehlgeschlagenen Versuch** werden die teuren Schritte 2-4 und 7 **komplett wiederholt**:

```text
┌──────────────────────────────────────────────────────────────┐
│ Szenario: 5 fehlgeschlagene Versuche (Dauerschleife)        │
├──────────────────────────────────────────────────────────────┤
│ 5× Replicate-Bilder:  5 × $0,20 = $1,00                    │
│ 5× ElevenLabs:        5 × $0,30 = $1,50                    │
│ 5× AWS Lambda:        5 × $0,20 = $1,00                    │
│ 5× Character Sheet:   5 × $0,04 = $0,20                    │
├──────────────────────────────────────────────────────────────┤
│ TOTAL VERBRANNT:       ~$3,70 ohne ein einziges Video       │
└──────────────────────────────────────────────────────────────┘
```

Hochgerechnet auf 10-12 Tage mit vielen Retry-Schleifen erklärt das die **€50 Verlust**.

### Hauptkostenquelle

- **Replicate (Flux 1.1 Pro)**: $0,04/Bild × 5 Szenen = $0,20 pro Versuch
- **ElevenLabs**: ~$0,30 pro Versuch (30s Audio)
- **AWS Lambda**: ~$0,15-0,30 pro Versuch

Das **dringendste Problem** ist nicht der Einzelpreis, sondern dass bei Retry **alles von vorne** generiert wird — auch die Bilder und das Voiceover, die bereits erfolgreich erstellt wurden.

### Empfohlener Fix (r24 — Asset-Caching & Render-Only-Retry)

**Kernidee:** Bei einem Render-Fehler (Timeout, Rate Limit, Lambda Crash) nur den **Render-Schritt (7)** wiederholen, nicht die komplette Pipeline. Die bereits generierten Assets (Bilder, Voiceover, Musik) aus dem `universal_video_progress`-Record wiederverwenden.

#### Änderungen:

1. **`auto-generate-universal-video/index.ts`**: Neuen Modus `renderOnly` einbauen
   - Wenn `renderOnly: true` + `progressId` übergeben wird → Assets aus bestehendem Progress-Record laden statt neu zu generieren
   - Springt direkt zu Schritt 7 (Render)

2. **`UniversalAutoGenerationProgress.tsx`**: Bei Render-Fehlern (timeout, rate_limit, lambda_crash)
   - Statt komplette Pipeline neu zu starten → `renderOnly: true` mit bestehendem `progressId` aufrufen
   - Spart **~$0,50 pro Retry** (keine neuen Bilder, kein neues Voiceover)

3. **Maximale Pipeline-Neustarts begrenzen**:
   - `renderOnly`-Retries: max 3 (kostet nur ~$0,20 Lambda pro Retry)
   - Komplette Pipeline-Neustarts: max 1 (nur bei "echten" Fehlern wie Script-Fehler)
   - Globales Limit: 5 Versuche total → harter Stopp

#### Kosteneinsparung pro fehlgeschlagenem Video:

```text
Vorher (5 Retries):  5 × €0,75 = €3,75
Nachher (5 Retries): 1 × €0,75 + 4 × €0,20 = €1,55
Ersparnis: ~60%
```

#### Dateien:
- `supabase/functions/auto-generate-universal-video/index.ts` — `renderOnly`-Modus
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — Render-Only-Retry-Logik

