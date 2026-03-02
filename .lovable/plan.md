
## Fix r6: deepSanitize + profileFix (2026-03-02)

### Gefundene Root Causes
1. **profileFlags nicht übergeben**: `runGenerationPipeline()` ist eine Module-Level-Funktion, aber `profileFlags` und `diagProfile` wurden NICHT als Parameter übergeben. Ergebnis: `ReferenceError` oder immer Full-Quality (Profile A).
2. **Lottie-Sanitizer zu flach**: `sanitizeForLottiePlayer` prüfte nur Top-Level `shapes`, aber lottie-web greift tief auf `layer.shapes[n].it[m].ks`, `layer.ef`, `asset.layers`, `chars`, `fonts.list` zu.

### Fixes
1. `runGenerationPipeline(supabase, progressId, briefing, userId, diagProfile, profileFlags)` — Profile wird jetzt explizit durchgereicht
2. `sanitizeForLottiePlayer` recursiv gehärtet: `deepSanitizeShapes()` für verschachtelte `.it`/`.ks`, plus Asset-Layer, `chars`, `fonts.list`, `ef` Arrays
3. Canary auf `r6-deepSanitize-profileFix` aktualisiert

### Nächste Schritte
- Remotion S3 Bundle neu deployen (`npx remotion lambda sites create`)
- Frischen Render starten
- Im Diagnose-Panel prüfen: `diagnosticProfile` sollte jetzt `A` (Retry 0), `B` (Retry 1) etc. zeigen
- Wenn A weiterhin crasht → B/C/D identifiziert das Subsystem
