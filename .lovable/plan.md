

## Diagnose

**Root Cause gefunden:** Das Problem ist NICHT der Payload oder die Composition. **Alle Profile A bis J scheitern am selben Fehler:**

> "AWS Concurrency limit reached (Rate Exceeded.)"

Das Diagnostic-Profile-System (A→K→L→N) wurde für Lambda-Crash-Fehler (`reading 'length'`, `reading '0'`) entwickelt. Aber "Rate Exceeded" ist ein **transientes AWS-Throttling-Problem** — kein Grund, das Profil zu wechseln. Jeder Profil-Wechsel startet die gesamte Pipeline neu (Script, Visuals, Voiceover, Rendering), was noch MEHR Lambda-Aufrufe erzeugt und das Throttling verschlimmert.

**Profile K (bareMinimum) "gewinnt" nur**, weil es als letztes dran ist, wenn die vorherigen Lambdas bereits abgelaufen sind — nicht weil es technisch besser ist.

## Plan (r19 — Rate-Limit vs. Diagnostic-Profile Separation)

### 1. Frontend: Rate-Limit-Fehler vom Profil-Cycling trennen

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

In beiden `isRetryableError`-Prüfungen (Zeilen 263-267 und 433-436):
- "Rate Exceeded" / "Concurrency limit" aus dem Auto-Profile-Chain entfernen
- Stattdessen: Bei Rate-Limit-Fehlern den Fehler direkt anzeigen mit Hinweis "AWS ist vorübergehend ausgelastet, bitte in 2-3 Minuten erneut versuchen"
- Der manuelle Retry-Button bleibt verfügbar, startet aber mit dem GLEICHEN Profil (retryCount wird NICHT erhöht)

### 2. Wizard: Separater Rate-Limit-Retry ohne Profil-Wechsel

**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

- Neuen `handleRateLimitRetry` hinzufügen, der `retryCount` NICHT erhöht (gleiche Diagnostic-Profile beibehalten)
- `onRateLimitRetry` als neue Prop an `UniversalAutoGenerationProgress` durchreichen
- Bei Rate-Limit-Fehlern automatisch nach 30s einmalig mit gleichem Profil retrien (statt sofort mit nächstem Profil)

### 3. Error-Kategorisierung verbessern

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Neue Logik:
```text
Rate-Limit/Concurrency → warte 30s, retry GLEICH Profil (max 2x)
reading 'length'/reading '0' → nächstes Diagnostic-Profil (wie bisher)
Alle anderen → Fehler anzeigen, manueller Retry
```

### Dateien
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- `src/components/universal-video-creator/UniversalVideoWizard.tsx`

