

## Fortschrittsplan: Universal Video Quality Roadmap

### Aktueller Stand (Baseline)
Das erste Video rendert erfolgreich. Der `SceneRenderer` (Zeile 335-343 in `UniversalVideo.tsx`) zeigt aktuell **nur den Hintergrund** pro Szene. Es fehlen:
- Text-Overlays pro Szene (Titel, Beschreibung)
- Lottie-Icons/Animationen
- Szenen-Animationen (Ken Burns, Parallax etc.)
- Character-System
- Sound Effects pro Szene

### Phase 1: Text-Overlays pro Szene (Niedrigstes Risiko)
**Ziel:** Szenen-Titel und Beschreibungstext werden animiert über dem Hintergrund angezeigt.

- `SceneSchema` in `UniversalVideo.tsx` erweitern um `textOverlays` (Array mit `text`, `position`, `style`, `animation`)
- `SceneRenderer` um Text-Rendering erweitern mit bestehenden Animationskomponenten (`TextTypewriter`, `TextBounce`, `TextScaleUp` etc.)
- Edge Function `auto-generate-universal-video` prüfen, ob `textOverlays` bereits im Payload generiert werden — falls nicht, dort hinzufügen
- **Bundle neu deployen** nach Änderung
- **Test-Render** durchführen

### Phase 2: Szenen-Animationen (Ken Burns, Pan, Zoom)
**Ziel:** Hintergrundbilder bewegen sich dynamisch statt statisch zu sein.

- `backgroundAnimation` wird im Schema bereits akzeptiert (`zoomIn`, `panLeft` etc.)
- `SceneRenderer` um `ZoomIn`, `PanEffect`, `ParallaxEffect` aus `src/remotion/components/animations/` erweitern
- Bestehende Komponenten sind bereits vorhanden — nur Integration in `SceneRenderer`
- **Bundle neu deployen + Test-Render**

### Phase 3: Lottie-Icons (Höheres Risiko — isoliert testen)
**Ziel:** Dekorative Lottie-Animationen pro Szenentyp (Hook, Problem, Solution etc.)

- `LottieIcons.tsx` ist bereits implementiert mit Lambda-Detection und Emoji-Fallbacks
- **Strategie:** Lottie zuerst nur als Emoji-Fallback in Lambda aktivieren (CDN-Fetches sind in Lambda deaktiviert)
- `SceneRenderer` um optionalen `<LottieIcons>` Layer erweitern, gated durch ein `diag.enableLottie` Flag
- Falls Lottie-Crash: Emoji-Fallback greift automatisch, kein Render-Abbruch
- **Bundle neu deployen + Test-Render mit `enableLottie: true`**
- Bei Erfolg: CDN-Fetches schrittweise aktivieren

### Phase 4: Audio-Effekte pro Szene
**Ziel:** Sound-Effects (Whoosh, Click, Pop) pro Szene synchronisiert.

- `SceneSchema` um `soundEffectUrl` erweitern
- Pro Szene `<Audio>` Component in der jeweiligen `<Sequence>` einbetten
- Edge Function muss Sound-Effect-URLs pro Szene liefern (aus `EmbeddedSoundLibrary`)
- **Bundle neu deployen + Test-Render**

### Phase 5: Character-System
**Ziel:** Animierte Charaktere mit Lip-Sync pro Szene.

- Höchstes Crash-Risiko — benötigt Rive/Lottie Character Assets
- `ProfessionalLottieCharacter.tsx` und `RiveCharacterReal.tsx` existieren bereits
- Erst aktivieren wenn Phase 1-4 stabil laufen
- Ebenfalls über `diag` Flag steuerbar

### Reihenfolge und Regeln

```text
Phase 1 (Text)  ──► Bundle Deploy ──► Test ──► OK?
       │                                         │
       ▼                                         ▼
Phase 2 (Anim)  ──► Bundle Deploy ──► Test ──► OK?
       │                                         │
       ▼                                         ▼
Phase 3 (Lottie) ─► Bundle Deploy ──► Test ──► OK?
       │                                         │
       ▼                                         ▼
Phase 4 (SFX)   ──► Bundle Deploy ──► Test ──► OK?
       │                                         │
       ▼                                         ▼
Phase 5 (Char)  ──► Bundle Deploy ──► Test ──► OK?
```

**Kritische Regeln:**
1. Jede Phase endet mit Bundle-Redeploy + Test-Render
2. Neue Features werden über `diag` Flags steuerbar gemacht (an/aus)
3. Bei Crash: Feature wird per Flag deaktiviert, nächste Phase startet trotzdem
4. Kein Feature wird ohne erfolgreichen Test-Render als "fertig" markiert

### Nächster Schritt
Phase 1 starten: `SceneRenderer` um Text-Overlays erweitern + Schema-Erweiterung.

