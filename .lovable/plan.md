
Aktueller Stand: r9 – Nicht-Lottie-Isolation (Profile H→J)

Umgesetzte Änderungen (r9)
1) Diagnosematrix erweitert auf A→J (10 Profile)
   - H: disablePrecisionSubtitles=true (+ alle Lottie aus)
   - I: disableSceneFx=true (SceneTypeEffects + FloatingIcons aus)
   - J: disableAnimatedText=true (Plain-Text statt AnimatedText)

2) Template-Guards in UniversalCreatorVideo.tsx
   - SceneBackground: neuer `disableSceneFx` Prop → SceneTypeEffects + FloatingIcons conditional
   - TextOverlay: neuer `disableAnimatedText` Prop → plain `<span>` statt AnimatedText
   - PrecisionSubtitleOverlay: bereits über `disablePrecisionSubtitles` geschützt

3) Forensik-Marker erweitert
   - `[FORENSIC] ENTER_TEXT_ANIM idx=X disableAnimatedText=Y`
   - Bundle-Canary: `r9-profileJ-nonLottieIsolation`

4) Retry-Dedupe im Frontend
   - `retryTriggeredRef` in UniversalAutoGenerationProgress verhindert Doppel-Retries

5) Edge Function deployt
   - auto-generate-universal-video mit H/I/J Profile-Flags

Nächster Schritt
- Remotion S3 Bundle neu deployen: `npx remotion lambda sites create`
- Frischen Lauf starten und Profile A→J beobachten
- Zombie-Cleanup in check-remotion-progress (ausstehend)
