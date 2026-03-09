

# Analyse der 5 Test-Szenen & Aktionsplan

## Was die Screenshots zeigen

| Szene | Zeit | Hintergrund | Problem |
|---|---|---|---|
| 1 "Social Media Frust?" | 0:03 | **SCHWARZ** | Bild-Generierung fehlgeschlagen, Fallback = schwarzer Gradient |
| 2 "Verlorene Potenziale" | 0:16 | AI-Bild ✅ | Funktioniert, Character mit Denk-Geste |
| 3 "Ihre Social Media Power" | 0:28 | AI-Bild ✅ | Funktioniert |
| 4 "Ergebnisse, die zählen" | 0:46 | **SCHWARZ** | Bild-Generierung fehlgeschlagen, kein Character sichtbar |
| 5 "Handeln Sie jetzt!" | 0:50 | AI-Bild ✅ | Glassmorphism-Box + CTA-Button funktioniert |

**Kern-Problem:** 2 von 5 Szenen (40%) haben schwarze Hintergründe. Die verbesserten Fallback-Hintergründe und Characters aus dem letzten Update sind im **lokalen Code**, aber die Lambda rendert vom **S3-Bundle**, das noch die alte Version hat.

## Zwei-Gleisiger Fix

### Gleis 1: Bessere Fallback-Bilder (Edge Function — sofort wirksam)

Statt `placehold.co` (einfarbiges PNG) → **Lovable AI Image Generation** (Gemini Flash) als Fallback. Wenn alle Replicate-Retries fehlschlagen, generiert die Edge Function ein professionelles Hintergrundbild via Gemini mit dem Szenen-Kontext (Typ, Titel, Brand-Farben). Das Ergebnis wird als `imageUrl` gesetzt → die Lambda sieht es als normales Bild, egal welches Bundle deployed ist.

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- `generatePNGPlaceholder` → `generateAIFallbackImage` mit Lovable AI Gateway
- Prompt enthält Szenen-Typ, Titel, Brand-Farben, Stil (flat illustration, keine Menschen/Text)
- Fallback auf placehold.co wenn auch Gemini fehlschlägt
- Ergebnis: base64 → Supabase Storage Upload → öffentliche URL

### Gleis 2: Prompt-Optimierung für weniger Failures

Die `generate-premium-visual` Prompts verbessern, damit weniger Szenen überhaupt fehlschlagen:
- Kürzere, klarere Prompts für Szenen-Typen die häufig fehlschlagen (Hook, Proof)
- Aspect-Ratio im Prompt explizit erwähnen
- Stil-Konsistenz durch `categoryStyleHints` die bereits implementiert sind, aber möglicherweise nicht an `generate-premium-visual` weitergegeben werden

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- Prompt-Konstruktion für `generate-premium-visual` Aufruf anpassen
- `categoryStyleHints` und `sceneStyleHints` als Teil des Prompts an die Visual-Generierung übergeben

### Hinweis zum S3-Bundle

Die visuellen Verbesserungen (Glassmorphism, Character-Upgrade, farbige Fallbacks) in `UniversalCreatorVideo.tsx` werden erst nach einem S3-Bundle-Redeploy in Lambda-Renders sichtbar. Gleis 1 umgeht dieses Problem, indem es bessere Bilder *vor* dem Rendering generiert — die Lambda braucht dann keine Fallback-Logik mehr.

## Erwartetes Ergebnis

- Schwarze Szenen → 0% (jede Szene bekommt ein AI-generiertes Bild, auch als Fallback)
- Bild-Qualität der Fallbacks: professionelle Illustrationen statt einfarbige PNGs
- Keine Pipeline-Unterbrechung — nur die Fallback-Funktion wird ersetzt

