

## Besserer Ansatz: Saubere Übergänge in Schritt 2

### Analyse des eigentlichen Problems

Das Kernproblem war nie die Dot-Position, sondern:
1. **Zu kurze Standard-Transition-Dauer** (0.8s) — bei schnellen Schnitten reicht das nicht für flüssige Übergänge
2. **Incoming-Video-Sync braucht Zeit** — der zweite Video-Decoder muss erst zur richtigen Stelle seekn, was ~100-200ms dauert
3. **Zu abrupte Easing-Kurve** — die Power-Cosine-Kurve (⁰·⁷) springt zu schnell in die Mitte

### Lösung: 3 gezielte Änderungen (ohne neue UI)

#### 1) Längere Standard-Transition + sanftere Kurve
**`useTransitionRenderer.ts`** und **`DirectorsCutPreviewPlayer.tsx`**:
- `TRANSITION_DURATION` von 0.8s auf **1.2s** erhöhen
- `MIN_TRANSITION_DURATION` von 0.6s auf **0.8s** erhöhen
- Easing von `Math.pow(cosine, 0.7)` auf `Math.pow(cosine, 1.0)` (reine Cosine-Ease) — sanfterer Übergang, weniger "Sprung" in der Mitte

#### 2) Incoming-Video Pre-Sync — früher seekn
**`DirectorsCutPreviewPlayer.tsx`** (Playback-rAF):
- **200ms vor** dem Transition-Fenster das Incoming-Video bereits zur richtigen Stelle seekn und auf Pause lassen
- Erst wenn die Transition tatsächlich startet, `.play()` aufrufen
- So hat der Decoder Zeit, den Frame zu laden bevor er sichtbar wird

#### 3) AI-Vorschläge in Schritt 2 verbessern
**`SceneEditingStep.tsx`** oder wo "Alle Vorschläge anwenden" die Transitions setzt:
- Standard-Transition auf `crossfade` mit **1.2s** setzen (statt 0.8s)
- Crossfade ist am fehlerverzeihendsten — kein harter Cut, kein Sync-Problem sichtbar

### Dateien
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — Dauer + Easing
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Dauer + Pre-Sync
- `src/components/directors-cut/steps/SceneEditingStep.tsx` oder AI-Analyse-Step — Default-Werte

### Ergebnis
- Übergänge sind länger und sanfter → weniger sichtbare Sync-Probleme
- Incoming-Video wird vorgeladen → kein schwarzer Blitz
- Keine neue UI-Komplexität, rein technische Verbesserung

