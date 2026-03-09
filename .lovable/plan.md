

# Fix: Schwarze Szenen eliminieren - Maximale Robustheit

## Analyse

Ich habe die gesamte Pipeline forensisch analysiert:

- **Alle 5 Bilder werden erfolgreich generiert** - verifiziert in Storage: 5 WebP-Dateien mit korrektem Content
- **Prompt-Fix wirkt** - Logs zeigen detaillierte Szenen-Prompts statt generischem Fallback
- **Die schwarzen Szenen sind zufällig** - das deutet auf **Netzwerk-Timeouts im Lambda** hin

### Eigentliche Ursache

Das Remotion Lambda (headless Chromium auf AWS) hat begrenzte Netzwerk-Ressourcen. Wenn es 5 Bilder gleichzeitig laden muss, scheitern einzelne Downloads zufällig durch DNS-Timeouts oder Connection-Limits. `SafeImg` fängt `onError` ab, aber in Lambda kann `<Img>` auch "silent fail" (timeout → schwarzer Frame ohne Error-Event).

Zusätzlich: `KenBurnsImage` und `ParallaxBackground` verwenden noch **rohe `<Img>` ohne `SafeImg`-Wrapper** (Zeilen 1322 und 1354).

## Implementierungsplan

### A. Edge Function: Bild-URL-Validierung vor Lambda-Start

**Datei**: `supabase/functions/auto-generate-universal-video/index.ts`

Nach dem Generieren aller Szenen-Bilder (Zeile ~884), BEVOR der Lambda-Payload gebaut wird:
- HEAD-Request auf jede `scene.imageUrl`
- Wenn HEAD fehlschlägt (404, Timeout, etc.) → sofort `generateSVGFallbackToStorage` aufrufen und URL ersetzen
- Ergebnis loggen: `"[pre-render-validation] 5/5 images validated"` oder `"[pre-render-validation] Scene 2 URL failed HEAD, replaced with SVG fallback"`

```text
Ablauf nach Zeile 884:
  for each scene with imageUrl:
    try HEAD request (5s timeout)
    if fails → replace with SVG fallback
  log "pre-render-validation: X/Y images valid"
```

### B. Remotion: Alle Bild-Pfade mit SafeImg absichern

**Datei**: `src/remotion/templates/UniversalCreatorVideo.tsx`

1. **KenBurnsImage** (Zeile 1321-1331): Ersetze `<Img src={imageUrl!} .../>` durch `<SafeImg src={imageUrl!} .../>`
2. **ParallaxBackground** (Zeile 1353-1365): Selbe Änderung
3. Damit sind ALLE Bildpfade abgesichert, unabhängig von der gewählten Animation

### C. SafeImg: Timeout-basierter Fallback

**Datei**: `src/remotion/templates/UniversalCreatorVideo.tsx`

Die aktuelle `SafeImg` wartet nur auf `onError`. In Lambda kann das fehlen. Zusätzlich:
- `useEffect` mit einem 8-Sekunden-Timer
- Wenn nach 8s weder `onLoad` noch `onError` kam → automatisch `setFailed(true)`
- Damit: auch bei "silent failures" (keine Events) erscheint der Gradient statt Schwarz

```text
SafeImg (erweitert):
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setFailed(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);
  
  if (failed) return <GradientFallback .../>;
  return <Img src={src} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} .../>;
```

### D. Build-Tag aktualisieren
`AUTO_GEN_BUILD_TAG` → `"r45-prevalidate-robust-2026-03-09"`

## Dateien

1. `supabase/functions/auto-generate-universal-video/index.ts` — Bild-URL-Validierung + Build-Tag
2. `src/remotion/templates/UniversalCreatorVideo.tsx` — SafeImg mit Timeout + KenBurns/Parallax-Fix

## Wichtig

Die Remotion-Änderungen erfordern ein **neues S3-Bundle-Deployment**. Die Edge-Function-Validierung (A) wirkt sofort und ist die wichtigste Maßnahme — sie verhindert, dass kaputte URLs überhaupt zum Lambda gelangen.

