# UDC Publish & Conversion — Plan

UDC ist funktional fertig, eingefroren und marketing-mäßig auf `/` (UDCShowcase) und `/pricing` (UDCPricingHighlight) positioniert. Jetzt geht es darum, den Moat sichtbar zu machen und Kaufabsicht zu messen — ohne UDC-Code anzufassen.

## Was gebaut wurde (Kurz-Recap)

**Editor-Kern (Waves 1–5):** Multi-Track-Export, Audio-Ducking, saubere Trim/Split-Domäne, Undo/Redo-History, Übergänge (A/B-Mix, absolute Timeline), Preview-Player mit External Mixer, Waveform-Cache, Autosave-Indikator, Snap-Feedback, Action-Log-Toasts.

**Moat-Features (W4.1–W4.7):**
- Voice-Lock (Projekt-persistente Stimme)
- CI-Preflight (14 Regeln, jetzt final)
- Anchor-Refresh mit Side-by-Side Frame-Vergleich + Drift-Slider
- Auto Cut-Down (15s / 6s Varianten)
- Master-Snapshot & Restore
- Preflight-Erweiterung: Aspect-Konsistenz, Endcard-Länge, Loudness-Proxy, Missing-Thumbnails, Blackscreen-Runs, Social-Length-Guard

**Positionierung:** `UDCShowcase` auf Landing, `UDCPricingHighlight` auf Pricing, `UDCWelcomeDialog` beim ersten Editor-Besuch, offizieller Feature-Freeze in `.lovable/UDC-FEATURE-FREEZE.md`.

## Nächste Schritte (Conversion-Fokus)

### 1. Analytics-Events auf die Moat-Features
Ohne Daten wissen wir nicht, ob der Moat konvertiert. Wire minimale Tracking-Calls (bestehende Analytics-Utility, keine neue Infra) an:
- `udc_voice_lock_set` / `udc_voice_lock_mismatch_shown`
- `udc_anchor_refresh_opened` / `udc_anchor_snap_applied`
- `udc_preflight_opened` / `udc_preflight_blocked_export` / `udc_preflight_bypassed`
- `udc_autocut_generated` (mit Länge)
- `udc_master_restored`
- `udc_export_completed` (mit Dauer & Trigger-Quelle: Landing/Pricing/Direct)

### 2. Onboarding-Tour für UDC (3 Steps)
Nur beim ersten Editor-Besuch, nach dem WelcomeDialog. Zeigt in-place:
1. Voice-Lock-Button (im VO-Tab)
2. CI-Preflight-Button (in der Export-Bar)
3. Anchor-Refresh-Button (in der Timeline-Toolbar)
Persistiert in `localStorage` (`udc-tour-completed:v1`). Kein neuer UDC-Code — nur Overlay-Layer über bestehende Buttons.

### 3. Landing-Video-Slot in UDCShowcase
Aktuell nur Textkarten. Füge einen 15s Auto-Play-Loop (`muted`, `playsInline`) über den 4 Pillars ein — Platzhalter-URL, wir zeichnen später ein Sample-Render von UDC selbst auf. Sofort-Effekt: „Show, don't tell" für den Moat.

### 4. Pricing-Vergleichstabelle „UDC vs CapCut vs Descript"
Neuer Abschnitt unter `UDCPricingHighlight` mit einer knappen 4-Zeilen-Tabelle:
- Voice-Lock: UDC ✓ / CapCut ✗ / Descript ✗
- Character-Anchor: UDC ✓ / CapCut ✗ / Descript ✗
- CI-Preflight: UDC ✓ / CapCut ✗ / Descript teilweise
- Auto Cut-Down: UDC ✓ / CapCut manuell / Descript ✗
Erhöht wahrgenommenen Wert direkt vor dem Checkout.

### 5. SEO-Sweep für die neuen UDC-Seiten
Nach den obigen Änderungen: `list_findings` → fixen → `trigger_scan`. Ziel: `/` und `/pricing` haben saubere Titel/Descriptions/Canonicals mit UDC-Keywords („Consistency-First AI Video Editor").

### 6. Publish
Nach 1–5: Security-Scan → `preview_ui--publish`. Danach QA-Runde auf der Live-Domain (`useadtool.ai`), Meta-Preview-Refresh triggern.

## Technisches

- **Kein Eingriff in `src/components/directors-cut/**` oder `src/lib/directors-cut/**`** — Freeze bleibt.
- Analytics: bestehendes Utility (z. B. `src/lib/analytics.ts`, falls vorhanden — sonst dünner Wrapper um `posthog`/`plausible`, was das Projekt bereits nutzt) prüfen und wiederverwenden.
- Tour: neuer `UDCOnboardingTour.tsx` in `src/components/directors-cut/onboarding/` — Ausnahme vom Freeze, weil rein additiv & kein Editor-Verhalten (bitte explizit bestätigen, sonst als Wrapper außerhalb `directors-cut/`).
- Vergleichstabelle & Video-Slot: rein in `UDCShowcase.tsx` / neue `UDCComparisonTable.tsx` unter `src/components/pricing/`.
- SEO: `react-helmet-async` ist bereits Standard-Pattern im Repo — falls nicht, ergänzen wir Provider einmalig.

## Reihenfolge & Umfang

Empfehlung: **1 → 2 → 3 → 4 → 5 → 6** in dieser Sitzung. Wenn zu viel für einen Run, minimaler MVP-Path = **1 + 4 + 6** (Daten + Vergleich + Publish), Rest folgt.
