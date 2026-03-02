
Ziel: Den verbleibenden `TypeError: Cannot read properties of undefined (reading 'length')` im Remotion-Lambda endgültig eliminieren und gleichzeitig einen sofortigen Stabilitäts-Fallback bereitstellen.

1) Aktueller Befund (aus Logs + Code-Review)
- Transport ist stabil:
  - `invoke-remotion-render` startet erfolgreich (200, echte `real_remotion_render_id`).
  - Scheduling-Felder sind korrekt (`framesPerLambda` + `concurrency:null` + `concurrencyPerLambda:1`).
- Crash passiert danach im Render-Bundle:
  - Webhook-Fehler bleibt identisch mit gleicher Stack-Signatur (`/var/task/index.js ... reading 'length'`).
- `REMOTION_SERVE_URL` zeigt auf:
  - `.../sites/adtool-remotion-bundle/index.html`
- Lottie-Guards sind zwar ergänzt, aber es gibt noch inkonsistente Datenhärtung entlang aller Pfade.

Do I know what the issue is?
- Ja, mit hoher Wahrscheinlichkeit sind es zwei kombinierte Ursachen:
  1) Unvollständige Lottie-Normalisierung in einzelnen Komponentenpfaden (validiert, aber nicht überall normalisiert).
  2) Sehr wahrscheinlich läuft weiterhin ein nicht aktualisiertes Remotion-Bundle auf Lambda (Änderungen in `src/remotion` greifen erst nach Bundle-Sync).

2) Exaktes Problem
- `isValidLottieData()` prüft aktuell Struktur, aber in mehreren Komponenten wird nach erfolgreicher Validierung nicht auf ein vollständig „array-sicheres“ Objekt normalisiert.
- Dadurch können optionale Felder im Lottie-Objekt trotzdem als `undefined` bei `lottie-web` landen und intern `.length` triggern.
- Zusätzlich: Selbst korrekte lokale Codefixes helfen nicht, wenn das aktive Lambda-Bundle nicht neu gebaut/hochgeladen wurde.

3) Umsetzungsplan (priorisiert)

A. Vollständige Lottie-Datenhärtung in allen Entry-Points
- Dateien:
  - `src/remotion/components/MorphTransition.tsx`
  - `src/remotion/components/LottieIcons.tsx`
  - `src/remotion/components/LottieCharacter.tsx`
  - `src/remotion/utils/premiumLottieLoader.ts`
- Änderungen:
  - Nach `isValidLottieData(data)` immer `normalizeLottieData(data)` verwenden, bevor `setAnimationData(...)`.
  - In `loadPremiumLottie()` auch Embedded-Fallback normalisieren (derzeit nur Local/CDN normalisiert).
  - Vor jedem `<Lottie />` finalen Guard beibehalten (nur rendern, wenn valid + vorhanden).
- Erwarteter Effekt:
  - Kein Pfad übergibt mehr halbvalide/unnormalisierte Lottie-Daten an Remotion/Lottie.

B. Sofort-Stabilitätsmodus (falls externer Bundle-Sync verzögert)
- Datei:
  - `supabase/functions/auto-generate-universal-video/index.ts`
- Änderungen:
  - Temporären „safe render mode“ als Feature-Flag im Payload setzen:
    - `characterType: 'svg'`
    - Für problematische Szenen (`solution`, `cta`, `feature`, `proof`) temporär Typ-Mapping auf sichere Typen ohne Lottie-Effekte.
- Erwarteter Effekt:
  - Render läuft sofort durch, selbst wenn das alte Bundle noch aktiv ist.
  - Trade-off: weniger Lottie-Qualität, aber keine Hard-Crashes.

C. Bundle-Sync sicherstellen (kritischer Infrastruktur-Schritt)
- Hintergrund:
  - Änderungen in `src/remotion/**` wirken erst nach neuem Remotion-Site-Bundle.
- Vorgehen:
  - Remotion-Site mit demselben Site-Namen aktualisieren.
  - Sicherstellen, dass `REMOTION_SERVE_URL` auf das aktualisierte Bundle zeigt.
- Erwarteter Effekt:
  - Die implementierten Guards laufen tatsächlich im Lambda-Renderpfad.

D. Forensik-Logging (einmalig, präzise)
- Dateien:
  - `MorphTransition.tsx`, `LottieIcons.tsx`, `ProfessionalLottieCharacter.tsx`
  - ggf. `UniversalCreatorVideo.tsx` (Frame 0 nur strukturierte Kurzdiagnostik)
- Loggen:
  - Quelle (`local/cdn/embedded`)
  - `isValid` + `normalized`
  - Fallback-Entscheidung (`lottie` vs `svg/emoji`)
- Erwarteter Effekt:
  - Nächster Fehler ist sofort einer konkreten Komponente + Datenquelle zuordenbar.

4) Technische Reihenfolge der Umsetzung
1. Lottie-Normalisierung in allen Komponentenpfaden.
2. Embedded-Fallback im Loader ebenfalls normalisieren.
3. Safe-Mode im `auto-generate-universal-video` ergänzen (temporär aktivierbar).
4. Bundle-Sync durchführen.
5. Frischer End-to-End-Run und Logs prüfen.

5) Validierung (Abnahmekriterien)
- Muss erfüllt sein:
  - Neuer Run (kein Retry) startet und endet auf `completed`.
  - Kein Webhook-Fehler `reading 'length'`.
  - Video-Datei wird erzeugt und ist abspielbar.
- Negativtest:
  - Defekte Lottie-Quelle simulieren → Render darf nicht crashen, sondern muss auf SVG/Emoji fallbacken.
- Observability:
  - Logs zeigen für problematische Stellen klar `valid/invalid` und gewählten Fallback.

6) Risiko / Trade-off
- Safe-Mode reduziert kurzfristig visuelle Lottie-Qualität.
- Vorteil: stabile Produktion ohne Render-Abbrüche, bis Bundle + Datenpfade vollständig gehärtet sind.

Technischer Hinweis
- Der wahrscheinlich größte „warum es trotz Fix noch crasht“-Faktor ist der Bundle-Sync. Daher wird der Plan bewusst als Kombination aus Code-Härtung + Infrastruktur-Aktivierung umgesetzt.
