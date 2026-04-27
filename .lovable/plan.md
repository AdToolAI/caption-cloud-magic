# Plan — Konsolidierung zum "Unified AI Video Toolkit"

## Deine Entscheidung

Statt 9 Einzel-Studios + Toolkit parallel zu pflegen → **eine** unified Page als primäre Erfahrung. Weniger Feature-Sprawl, klarere UX, einfacherer Wartungsaufwand.

## Strategie: Sanfte Konsolidierung in 2 Stufen

### Stufe 1 (jetzt): Toolkit als neue Standard-Erfahrung

Die neue Seite `/ai-video-studio` wird das **Unified Toolkit** — kein separater Hub mehr, kein Toolkit-Toggle.

**Eine Seite, alles drin:**
- Modell-Dropdown (gruppiert: Empfohlen / Schnell & Günstig / Premium / Audio-fähig)
- Universeller Prompt-Block mit `VideoPromptOptimizer`
- Image-Upload (erscheint nur bei I2V-fähigen Modellen)
- Smart Settings: Dauer, Aspect Ratio, Resolution — dynamisch aus Modell-Capabilities
- Live-Cost-Schätzung
- Generate-Button → ruft die richtige bestehende Edge Function auf
- Tab "Verlauf" (bestehende `VideoGenerationHistory`)
- Tab "Credits" (bestehende `AIVideoCreditPurchase`)

### Stufe 2 (jetzt): Einzel-Studios werden Redirects

Die 9 Studio-Pages (`/kling-video-studio`, `/sora-video-studio`, etc.) werden zu **Redirects** auf das Toolkit mit vorausgewähltem Modell:

```
/kling-video-studio  →  /ai-video-studio?model=kling-3-omni
/sora-video-studio   →  /ai-video-studio?model=sora-2-standard
/wan-video-studio    →  /ai-video-studio?model=wan-2-6-standard
... (alle 9)
```

Vorteile:
- Bestehende Links (Welcome-Bonus, FirstVideoGuide, Dashboard-Hero, Onboarding-Progress) funktionieren weiter
- SEO-Indexe bleiben erhalten (HTTP-Redirect-äquivalent über Router)
- Bookmarks der User brechen nicht
- User landet sofort im Toolkit mit "ihrem" Modell vorausgewählt

Die alten Studio-Komponenten-Dateien werden **gelöscht** (Code-Cleanup):
- `src/pages/KlingVideoStudio.tsx`, `SoraVideoStudio.tsx`, `WanVideoStudio.tsx`, `HailuoVideoStudio.tsx`, `LumaVideoStudio.tsx`, `SeedanceVideoStudio.tsx`, `VeoVideoStudio.tsx`, `LTXVideoStudio.tsx`, `GrokVideoStudio.tsx`

## Was gebaut wird

### Neue Dateien

**`src/config/aiVideoModelRegistry.ts`** — Single Source of Truth, aggregiert alle 9 Modelle:
```typescript
{
  id: 'kling-3-omni',
  name: 'Kling 3.0',
  provider: 'Kuaishou',
  edgeFunction: 'generate-kling-video',
  group: 'recommended', // recommended | fast | premium | audio
  capabilities: { t2v: true, i2v: true, audio: false },
  durations: [3, 5, 8, 10, 15],
  resolutions: ['720p', '1080p'],
  aspectRatios: ['16:9', '9:16', '1:1'],
  costPerSecond: { EUR: 0.30, USD: 0.30 },
  badge: 'Empfohlen',
  requiresAccess: null, // oder 'sora2' für Sora
}
```

**`src/pages/AIVideoToolkit.tsx`** — Neue unified Toolkit-Page (ersetzt `AIVideoStudio.tsx`)

**`src/components/ai-video/ModelSelector.tsx`** — Gruppiertes Dropdown mit Pricing & Badges

**`src/components/ai-video/ToolkitGenerator.tsx`** — Universal Generator mit dynamischen Settings

### Edits

- **`src/App.tsx`** — `/ai-video-studio` zeigt jetzt `AIVideoToolkit`; alle 9 alten Studio-Routen werden zu `<Navigate to="/ai-video-studio?model=...">` Redirects
- **`src/pages/AIVideoStudio.tsx`** — gelöscht und durch `AIVideoToolkit.tsx` ersetzt
- **9 alte Studio-Pages** — gelöscht
- **`src/config/hubConfig.ts`** — bleibt, zeigt nur noch "AI Video Studio" (= Toolkit)

### Edge Functions, Wallet, History

**Bleiben unverändert.** Die Toolkit-UI dispatcht auf die richtige Edge Function basierend auf der Registry. `useAIVideoWallet`, Credit-Refunds, History-Logik werden 1:1 wiederverwendet.

## UX-Flow

1. User klickt "AI Video Studio" in Sidebar → `/ai-video-studio` (Toolkit)
2. Modell-Dropdown defaultet auf "Kling 3.0" (oder URL-Parameter `?model=...`)
3. Settings passen sich dynamisch an (Dauer-Slider zeigt nur valide Werte, Audio-Toggle nur bei Veo/Grok, etc.)
4. Prompt eingeben → Optional optimieren → Generate
5. Cost-Bestätigung im Button: "Generieren · €2.40"
6. Ergebnis erscheint in History-Tab

## Was sich für den User verbessert

- **Ein Klick weniger**: kein Hub-Zwischenschritt mehr
- **Schneller Modellwechsel**: Prompt bleibt erhalten beim Switch
- **Keine Verwirrung**: 1 Seite statt 9 Sub-Seiten
- **Vergleichbarkeit**: Cost-per-Second direkt im Dropdown sichtbar

## Risiken & Mitigation

- **Risiko**: Alte Sora-2-Coming-Soon-Logik (`Sora2ComingSoonGate.tsx`) referenziert `/sora-video-studio`. → Redirect funktioniert, aber wir prüfen Access-Gate im Toolkit selbst (`requiresAccess: 'sora2'` in Registry → wenn kein Access, Modell-Dropdown deaktiviert + Hinweis)
- **Risiko**: WelcomeBonusModal & FirstVideoGuide verlinken auf Einzel-Studios. → Redirects fangen das ab; die Modell-URL-Parameter sorgen dafür, dass der User im "richtigen" Modell landet
- **Risiko**: Code-Verlust bei gelöschten Studios. → Die Studios sind dünne Wrapper um Edge Functions + Settings — alle Logik existiert in den Edge Functions und Configs weiter

## Lokalisierung

Neue UI-Strings (DE/EN/ES) ins zentrale Translation-File. Visual-Prompts bleiben EN (Multilingual Asset Strategy).

## Nicht im Scope

- **Compare Mode** (parallel auf 2-3 Modellen generieren) — verschoben auf separates Follow-up, falls gewünscht
- **Saved Presets** — später
- **Modell-Recommendation-AI** — später

## Ergebnis

Eine schlanke, professionelle Toolkit-Page als primäre Video-Generierungs-Erfahrung. Alle bestehenden Links bleiben funktional via Redirects. Code-Basis schrumpft um 9 Studio-Pages. Wartung wird trivial: neues Modell hinzufügen = ein Eintrag in `aiVideoModelRegistry.ts`.
