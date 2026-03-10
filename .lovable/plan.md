

# Phase 5: Loft-Film Qualitätssprung — Konkrete Gap-Analyse & Maßnahmen

## Ehrliche Bewertung: Wo stehen wir vs. Loft-Film?

Basierend auf der ChatGPT-Analyse und dem Contact Sheet gibt es **5 konkrete Lücken**:

| Bereich | Aktuell | Loft-Film Standard | Gap |
|---------|---------|-------------------|-----|
| **Body-Text** | Endet teils mit "..." (truncateToWords Zeile 1808 noch aktiv als Safety Net, wird aber offenbar doch getriggert) | Saubere, vollständige Sätze | Mittel |
| **Sekundärtext-Größe** | 24px body, 28px hook — auf Mobile kaum lesbar | Min. 28-32px überall | Klein |
| **Statistik-Artefakte** | "9%" mit sinnlosem KI-Text darunter | Saubere, verifizierte Daten | Kritisch |
| **Hook-Dynamik** | Statischer Einstieg, Text blendet langsam ein | Schneller, punchiger Einstieg in <2s | Mittel |
| **Branding/Logo** | Kein Logo, keine URL, kein Markenname sichtbar | Logo + URL im CTA | Klein |
| **15fps** | Video läuft mit 15fps | 30fps Standard | Kritisch |

## Geplante Änderungen

### 1. FPS-Fix: 30fps sicherstellen
**Datei:** `auto-generate-universal-video/index.ts`

Das Video läuft mit 15fps statt 30fps. Das ist der größte Qualitätskiller. Prüfen ob `fps` in der Edge Function korrekt auf 30 gesetzt wird und ob die Lambda-Payload dies korrekt weitergibt. Wenn der fps-Wert korrekt ist, liegt das Problem möglicherweise im `compositionDurationInFrames` oder im Lambda-Aufruf.

### 2. Body-Text: Größere Schrift + sauberes Ende
**Datei:** `UniversalCreatorVideo.tsx`

- Body-Font von 24px auf **28px** erhöhen (non-hook Szenen)
- Hook/CTA Body-Font von 28px auf **32px**
- `truncateToWords` Safety-Net auf 30 Wörter erhöhen (aktuell 20, wird noch getriggert)

### 3. Statistik-Bereinigung: StatsOverlay-Validierung
**Datei:** `auto-generate-universal-video/index.ts`

Das KI-generierte Script produziert offenbar Statistik-Daten mit sinnlosem Text ("9% Zeitersparnis" mit Artefakt-Text). Fix: Stats-Daten in der Edge Function validieren — nur Zahlen + maximal 3 Wörter Label erlauben, Rest verwerfen.

### 4. Hook-Dynamik: Schnellerer Einstieg
**Datei:** `UniversalCreatorVideo.tsx`

- Hook-Szene: `fadeIn`-Delay von 15 Frames auf **5 Frames** reduzieren
- Headline-Animation für Hook von `bounceIn` beschleunigen (stiffness von 200 auf 350)
- Badge erscheint sofort (Delay 0 statt Spring-basiert)

### 5. Branding: Logo/URL im CTA
**Datei:** `UniversalCreatorVideo.tsx` + `auto-generate-universal-video/index.ts`

- Neues optionales Feld `brandUrl` in inputProps
- Im CTA-Szene unter dem Button eine dezente URL-Zeile anzeigen (fontSize 18, opacity 0.6)
- Edge Function: `briefing.websiteUrl` oder `briefing.companyName` in `brandUrl` einfließen lassen

### 6. Bundle-Canary
`UCV_BUNDLE_CANARY` auf `2026-03-10-r55-phase5-quality-jump`.

## Dateien

| Datei | Änderung |
|-------|----------|
| `auto-generate-universal-video/index.ts` | FPS-Check, Stats-Validierung, brandUrl-Feld |
| `UniversalCreatorVideo.tsx` | Größere Fonts, schnellerer Hook, Brand-URL im CTA |

## Priorität
1. **FPS-Fix** (größter visueller Impact)
2. **Stats-Artefakt-Bereinigung** (Glaubwürdigkeit)
3. **Font-Größe + Hook-Dynamik** (Professionalität)
4. **Branding** (nice-to-have)

## Hinweis
Template-Änderungen erfordern S3-Bundle-Redeploy. Edge Function deployed automatisch.

