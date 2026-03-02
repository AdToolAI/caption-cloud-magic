
## Status nach r7-autoProfileChain-deepSanitizeV7

### Umgesetzte Änderungen (2026-03-02)

1. **Auto-Profilkette A→B→C→D** ✅
   - Bei `.length`-Fehler wird automatisch das nächste Profil getestet
   - Max 3 Retries (A→B→C→D), danach sauberer Fehlerzustand
   - Toast-Notification zeigt aktives Profil
   - Greift sowohl bei DB-Progress-Failure als auch bei Client-Render-Polling

2. **Deep-Sanitizer v7** ✅
   - `masksProperties` als Array absichern
   - Text-Layer-Daten (t.d.k, t.a, t.m, t.p) defensiv normalisieren
   - Layer-Styles (sy) absichern
   - Effects-Verschachtelung (ef.ef, ef.v) absichern
   - Chars-Shapes rekursiv bereinigen
   - try/catch um gesamten Sanitizer
   - Ungültige Shape-Einträge werden entfernt statt ignoriert

3. **Lottie-Gates vereinheitlicht** ✅
   - ProfessionalLottieCharacter: RenderGuard-Log bei Frame 0
   - LottieIcons: RenderGuard-Log bei Sanitizer-Reject
   - MorphTransition: RenderGuard-Log bei Sanitizer-Reject

4. **Forensik geschärft** ✅
   - `diagnosticProfile` explizit in `content_config` persistiert (invoke-remotion-render)
   - Webhook preserviert forensische Felder bei Completion
   - Canary auf `r7-autoProfileChain-deepSanitizeV7,sanitizer=v7` aktualisiert

### Nächste Schritte
- Remotion S3 Bundle neu deployen: `npx remotion lambda sites create`
- Frischen Render starten
- Wenn Profile A scheitert, läuft automatisch B→C→D
- Im Diagnosepanel prüfen: diagnosticProfile, diag_flags_effective, bundle_probe
