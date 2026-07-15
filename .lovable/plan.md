## AI-Arsenal Showcase — Cleanup

Zwei kleine kosmetische Fixes am neuen Cinema-Reel, kein Funktions-Rework.

### 1. Model-Rail Scrollbar entfernen
- `src/components/landing/ai-arsenal/ArsenalModelRail.tsx`: native Scrollbar ausblenden (`scrollbar-width: none`, `-ms-overflow-style: none`, `::-webkit-scrollbar { display: none }`) via Tailwind-Utility oder inline Style. Scroll-Verhalten bleibt (Mausrad/Touch), nur der graue 90er-Balken ist weg.
- Optional: dezente goldene Fade-Maske oben/unten (`mask-image: linear-gradient(...)`), damit klar bleibt, dass die Liste scrollt.

### 2. Play/Pause-Button entfernen
- `src/components/landing/ai-arsenal/ArsenalHeroStage.tsx` (bzw. wo die Timer-Bar sitzt): den Play/Pause-Toggle links neben der Progress-Line entfernen. Es läuft ohnehin nur ein Auto-Advance mit Cover-Bildern, kein echtes Video — der Button suggeriert fälschlich Playback.
- Next-Chevron rechts bleibt (sinnvoll zum manuellen Weiterklicken).
- Hover-Pause und `prefers-reduced-motion`-Stop bleiben unverändert erhalten.
- `useAutoAdvance`-Hook: `isPaused`-State und `toggle`-Return-Value werden nicht mehr von außen benötigt — bleiben aber intern für Hover-Pause. Kein Signatur-Break.

### Nicht in diesem Schritt
- Provider-Vergleichsmodus (gleiche Szene über mehrere Modelle) — später, wie besprochen.
- Keine Änderungen an Transitions, Katalog oder i18n.

Scope: rein Frontend/Presentation, zwei Dateien.