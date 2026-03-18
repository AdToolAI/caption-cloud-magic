

# Phase 8b + 9: Interview-Daten-Fix & Übergangs-Verfeinerung

## Kritischer Bug: Interview-Daten gehen verloren

**Das Hauptproblem:** Wenn der Nutzer alle 22 Phasen des Interviews durchläuft und dann "Video erstellen" klickt, werden die gesammelten Daten **verworfen**. Der Code erstellt stattdessen ein leeres Objekt mit Platzhaltern.

**Ursache:** In `UniversalVideoConsultant.tsx` (Zeile 164) kommt `data.recommendation` vom AI-Consultant mit allen Interview-Daten (Produktname, Zielgruppe, USPs, etc.). Diese wird in der Bestätigungsnachricht angezeigt, aber **nicht gespeichert**. Wenn der User dann "Video erstellen" klickt (Zeile 229-266), wird ein komplett neues, leeres `result`-Objekt erstellt:

```text
companyName: ''        ← sollte "AdTool AI" sein
productName: productSummary  ← nur ein Textschnipsel aus den Messages
coreProblem: ''        ← verloren
solution: ''           ← verloren
uniqueSellingPoints: [] ← verloren
```

Das erklärt, warum das Video generische Inhalte zeigt ("SocialReach Pro") statt "AdTool AI".

## Geplante Änderungen

### 1. Interview-Daten korrekt durchreichen (KRITISCH)
**Datei:** `src/components/universal-video-creator/UniversalVideoConsultant.tsx`

- Neuen State `lastRecommendation` hinzufügen, der bei `data.isComplete` gesetzt wird
- Im `handleQuickReply` ("Video erstellen"): statt dem leeren Fallback-Objekt `lastRecommendation` verwenden und mit dem category-spezifischen Kontext mergen
- Fallback auf das alte Verhalten nur wenn `lastRecommendation` aus irgendeinem Grund null ist

```typescript
// NEU: State für die AI-Empfehlung
const [lastRecommendation, setLastRecommendation] = useState<any>(null);

// Bei data.isComplete:
setLastRecommendation(data.recommendation);

// Bei "Video erstellen":
if (lastRecommendation) {
  onConsultationComplete({
    ...lastRecommendation,
    category,
    modeChoice: 'full-service'
  });
} else {
  // bisheriger Fallback...
}
```

### 2. Szenen-Übergänge verfeinern (Phase 8b)
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

- `baseTransitionFrames` von 15 → **20** für flüssigere Übergänge
- Easing für Slide-Transitions hinzufügen (quadratische Kurve statt linear)

### 3. Bundle-Canary
`UCV_BUNDLE_CANARY` → `2026-03-18-r59-phase8b-interview-fix`

## Dateien

| Datei | Änderung |
|-------|----------|
| `UniversalVideoConsultant.tsx` | `lastRecommendation` State + korrekte Datenübergabe |
| `UniversalCreatorVideo.tsx` | Transition-Frames 15→20, Easing |

## Auswirkung

Nach diesem Fix werden alle 22 Interview-Phasen (Produktname, Zielgruppe, Problem, Lösung, USPs, CTA-Text, Markenfarben, etc.) korrekt an die Script-Generierung weitergegeben. Das Video wird dann tatsächlich "AdTool AI" zeigen, nicht generische Platzhalter.

S3-Bundle-Redeploy erforderlich für die Template-Änderungen (Transitions).

