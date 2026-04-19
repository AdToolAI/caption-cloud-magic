

## Plan: Sora 2 → "Coming Soon" für Neu-User + Kling 3 Omni stärken

## Kling 3 Omni — Qualitäts-Einschätzung

Ehrliche Bewertung basierend auf Kling 3.0 (Kuaishou/Kwai), das aktuell als `kwaivgi/kling-v3-omni-video` auf Replicate läuft:

**Stärken:**
- **Bewegungsqualität:** Beste am Markt für realistische Charakter-Bewegungen, Stoff-Physik, Wasser. Schlägt Sora 2 oft bei komplexen Motion-Szenen.
- **Prompt-Adherence:** Sehr präzise — versteht komplexe deutsche Prompts nach Auto-Übersetzung gut.
- **Image-to-Video:** Hervorragend, mit guter Konsistenz zum Referenzbild (besser als Wan 2.5).
- **Kamera-Kontrolle:** Native Camera-Move-Parameter (orbit, push-in, pan).
- **Lizenz:** Offiziell von Kuaishou via Kwaivgi auf Replicate — vollständig sauber.

**Schwächen vs. Sora 2:**
- Schwächer bei Text-Rendering im Video
- Maximal 10s pro Clip (Sora 2 Pro: 12s)
- Keine native Audio-Generierung (Sora 2 erzeugt SFX automatisch)
- Etwas weniger "filmisch" bei Wide-Shots

**Verdict:** **Kling 3 Omni ist 85–90% der Sora-2-Qualität bei rechtlicher Sauberkeit und oft besserer Motion.** Für Charakter-Content & Produktvideos sogar überlegen. Für reine "Cinematic Wide-Shots mit Audio" ist Sora 2 noch vorne.

---

## Implementierung — Was wir bauen

### 1. "Grandfathering"-Mechanik (User-Cutoff)

**DB-Migration:**
- Neue Spalte `profiles.sora2_grandfathered BOOLEAN DEFAULT false`
- One-Shot-Update: Alle existierenden User (created_at < NOW()) → `sora2_grandfathered = true`
- Neue Signups → automatisch `false`

**Helper-Hook:** `useSora2Access()` 
- Liest `profiles.sora2_grandfathered`
- Returns `{ hasAccess: boolean, isLoading: boolean }`

### 2. "Coming Soon"-Overlay für Neu-User

Neue Komponente `<ComingSoonGate>`:
- Wraps Sora 2 Studio + Long-Form Creator
- Zeigt für Nicht-Grandfathered-User:
  - Großes Banner: "Sora 2 — Coming Soon 🎬"
  - Subtext: "OpenAI Sora 2 wird derzeit für die offizielle Integration vorbereitet"
  - CTA: "Probiere stattdessen Kling 3 Omni — die Premium-Alternative" → Link zu `/kling-video-studio`
  - Optional: Email-Liste „Benachrichtige mich, sobald verfügbar" (in DB-Tabelle `sora2_waitlist`)
- Grandfathered-User sehen normales Studio ohne Änderungen

**Betroffene Routen:**
- `/sora-video-studio`
- `/sora2-longform`
- `director-cut-sora-enhance` Button im Director's Cut → Disable + Tooltip für Neu-User

### 3. AI Video Studio Hub anpassen

In `/ai-video-studio` (Hub):
- **Sora 2 Card:** Badge „Coming Soon" für Neu-User, Click → Coming-Soon-Page; für Grandfathered-User normaler Link
- **Kling 3 Omni Card:** Neues Badge „⭐ Recommended" + Position als #1 in der Liste
- **Reihenfolge-Update:** Kling 3 → Wan 2.5 → Hailuo → Luma → Seedance → Sora 2 (für Neu-User unten/coming-soon)

### 4. Marketing-Page (Pricing/Landing)

- „Sora 2"-Erwähnungen auf Landing-Page entfernen oder ersetzen durch „Premium Cinema Engine"
- Hero-Showcase: Kling 3 Omni Demo-Video statt Sora-Demo
- Feature-Liste: „6 lizensierte Premium-KI-Modelle" als USP

### 5. Kling 3 Omni — Stärkung

- Im Kling Studio: Hinweis-Banner „Premium-Empfehlung der Redaktion"
- Default-Einstellungen optimieren (10s, beste Auflösung, kinematischer Look)
- Preset-Library erweitern (3–5 neue Cinematic-Presets)
- VideoPromptOptimizer: Kling-spezifische Cinematic-Enrichment-Templates

### 6. Smart-Upgrade-Hook erweitern

`useFeatureGate` erkennt Sora-2-Feature für Neu-User:
- Statt Upgrade-Modal → Coming-Soon-Modal mit Kling-Empfehlung
- Tracking via PostHog: `sora2_blocked_view`, `kling_redirect_clicked`

### 7. Localization

Neue Keys (DE/EN/ES) für:
- Coming-Soon-Banner-Texte
- Kling-Empfehlungs-Copy
- Waitlist-Bestätigung

---

## Was wir bewusst NICHT tun

- ❌ Sora 2 komplett entfernen (würde Grandfathered-User bestrafen)
- ❌ Streak-Belohnungen ändern (sind generisch „AI Video Credits", keine Modell-Bindung)
- ❌ Bestehende generierte Videos verstecken (bleiben in Mediathek)

---

## Aufwand: ~2h

| Schritt | Zeit |
|---|---|
| DB-Migration + Grandfathering-Backfill | 15 min |
| `useSora2Access` Hook + `ComingSoonGate` Komponente | 25 min |
| Sora-Studios mit Gate wrappen (3 Routes) | 20 min |
| AI Video Studio Hub: Reihenfolge + Badges | 20 min |
| Kling 3 Studio: Recommended-Banner + Presets | 20 min |
| Marketing-Page-Updates | 15 min |
| Localization (DE/EN/ES) | 10 min |
| E2E-Test (Neu-User vs. Grandfathered) | 15 min |

---

## Reihenfolge nach Approval

1. DB-Migration + Backfill bestehender User
2. Hook + ComingSoonGate-Komponente
3. Sora-2-Routes wrappen
4. Hub-Reorder + Kling-Stärkung
5. Marketing-Cleanup
6. Localization + Test

