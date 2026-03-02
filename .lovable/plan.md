
# Aktueller Stand: r8 — Profile G + disableAllLottie + Forensik

## Was wurde in r8 umgesetzt

1. **Diagnosematrix auf 7 Profile erweitert (A→G)**
   - A: Full Quality
   - B: Morph aus
   - C: Icons aus
   - D: Character aus
   - E: Morph + Icons aus
   - F: Morph + Icons + Character aus
   - G: Hard No-Lottie (disableAllLottie=true, alle Lottie-Komponenten garantiert aus)

2. **`disableAllLottie` Flag** im Schema + Template + Edge Function verdrahtet
   - Bei Profil G werden MorphTransition, LottieIcons UND ProfessionalLottieCharacter komplett deaktiviert
   - Wenn G auch crasht → Beweis: Fehler liegt NICHT in Lottie

3. **Frame-0 Forensik-Marker** in UniversalCreatorVideo.tsx
   - `[FORENSIC] ENTER_SCENE`, `ENTER_TEXT_OVERLAY`, `ENTER_LOTTIE_ICONS`, `ENTER_SUBTITLE_OVERLAY`
   - Profil + diagnosticProfile in CloudWatch sichtbar

4. **progressId durch Webhook-Pipeline** durchgereicht
   - `customData.progressId` in auto-generate + webhook
   - Webhook matched primär via progressId, dann Fallback via renderId-Scan
   - Eliminiert "Zombie"-Progress-Einträge

5. **Defensive Guards** in PrecisionSubtitleOverlay
   - Sichere Text-Splits, Division-by-zero-Schutz, null-Array-Guards

6. **Canary**: `r8-profileG-disableAllLottie-forensics,sanitizer=v8`

## Nächster Schritt
- Bundle neu deployen: `npx remotion lambda sites create`
- Frischen End-to-End-Lauf starten
- Anhand der Profil-Ergebnisse A→G entscheiden:
  - Wenn ein Profil < G erfolgreich → Lottie-Subsystem isoliert
  - Wenn G auch crasht → Fehler liegt außerhalb Lottie, Forensik-Marker zeigen wo
