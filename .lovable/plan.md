# Futuristic Calendar Posts + Inline Post Composer

Ziel: Posts im Monats-Kalender wirken „next-level" futuristisch und ein Klick öffnet einen vollwertigen Post-Composer (statt nur Briefing-Felder), mit dem der Post fertig produziert und automatisch zum geplanten Zeitpunkt veröffentlicht wird.

## 1. Leuchtende, futuristische Post-Chips (MonthView)

Datei: `src/components/calendar/views/MonthView.tsx`

- Neue `PostChip`-Subkomponente extrahieren (statt Inline-`div`):
  - Animierter Plattform-Gradient (slow shift via Framer Motion `backgroundPosition` 200 % gradient, 8 s loop).
  - Dauerhafter Neon-Glow (`shadow-[0_0_12px_...]` in Plattform-Farbe) statt nur hover.
  - Holographic Shimmer: zusätzlicher Overlay-`<motion.span>` mit diagonalem weißen Gradient, der alle ~6 s einmal durchläuft (`x: ['-120%', '120%']`).
  - Status-Pulse-Dot (links): farbiger 6 px Punkt mit `animate-ping` für `scheduled`/`pending_approval`, statisch für `published`.
  - Glass-Optik: `backdrop-blur-md`, `bg-white/5` Grundlage, Plattform-Gradient nur als 60 %-Overlay → ergibt das gewünschte „holo"-Feeling auch wenn mehrere Plattformen gemixt sind.
  - Multi-Platform: bis zu 3 Mini-Icons rechts (überlappend, `-ml-1`, Ring in Plattform-Farbe).
  - `whileHover={{ y: -2, scale: 1.03 }}` + helleres Glow.
  - Größere Lesbarkeit: 11 px Font, `tracking-wide`, `drop-shadow-[0_0_4px_currentColor]` für Titel-Text.
- `platformColors` um `glowStrong` und `accent` (HSL token) erweitern; Fallback für unbekannte Plattformen bekommt Gold-Hologramm.
- Today-Zelle: vorhandener Doppelring bleibt, zusätzlich ein dezenter rotierender Conic-Gradient-Border (CSS `@property` via inline Tailwind arbitrary value), damit „heute" sofort heraussticht.

Keine Logik-Änderung — `onPostClick(post)` triggert weiter den bestehenden `EventDrawer`-Flow in `src/pages/Calendar.tsx` (Zeile 535-545, 805-814).

## 2. Inline Post-Composer im EventDrawer

Datei: `src/components/calendar/EventDrawer.tsx` (Details-Tab) + neue Datei `src/components/calendar/PostComposerPanel.tsx`.

Statt der heutigen flachen Felder (Titel, Status, Brief, Caption, Channels, Hashtags) bekommt der Details-Tab ein vollwertiges, dem AI-Post-Generator nachempfundenes 2-Spalten-Layout:

**Linke Spalte — Composer:**
- Brief (kollabierbar, default zu).
- Sticky Action-Bar:
  - „✨ Generieren" (ruft `generate-post-v2` — existiert bereits).
  - „🔁 Varianten" (neuer Aufruf mit `options.variants: 3` → speichert in `event.assets_json.draft_variants`).
  - „🪄 Umschreiben" (Tonality-Dropdown: professional / casual / bold / storytelling).
- Hook-Auswahl: A/B/C-Karten aus `result.hooks` mit Radio-Selection, ausgewählter Hook wird vor die Caption gepinnt.
- Caption-Editor (Textarea, Live-Char-Count + Plattform-Limit-Warnung pro aktivierter Plattform: IG 2200, X 280, LI 3000, TikTok 2200, FB 63206).
- Hashtag-Editor mit drei Gruppen-Tabs (reach / niche / branded) aus `result.hashtags`, Click-to-toggle Chips.
- Channels-Picker (bestehend übernehmen).
- Scheduled-At + „Auto-Publish aktivieren"-Switch → schreibt `status='scheduled'` + `auto_publish=true`.

**Rechte Spalte — Live Preview:**
- Reuse der existierenden Preview-Komponenten aus `src/components/post-generator/`:
  `InstagramPostPreview`, `FacebookPostPreview`, `LinkedInPostPreview`, `XPostPreview`, `TikTokPostPreview`.
- Tabs pro aktivierter Plattform (`PreviewTabs.tsx` ggf. mit `compact` prop wiederverwenden, sonst neue schmale Variante).
- Plattform-Tab-Indikator in Plattform-Farbe (gleiches Glow-Token wie Chips → konsistent).

**Footer-CTA:**
- „💾 Entwurf speichern" (status bleibt).
- „🚀 Bereit zum Auto-Publish" → setzt `status='scheduled'`, validiert Pflichtfelder (caption, ≥1 channel, start_at in Zukunft), toast bei Erfolg mit Countdown („wird in 3 h 12 min veröffentlicht").

## 3. Auto-Publish-Verdrahtung

Bereits vorhanden: `supabase/functions/calendar-publish-dispatcher` (kein Backend-Refactor nötig). Wir stellen nur sicher, dass:
- Composer beim „Bereit zum Auto-Publish" `status='scheduled'` setzt.
- Falls `start_at` in Vergangenheit → Inline-Warning + Schedule-Picker fokussieren.
- Erfolgs-Toast referenziert den nächsten Dispatcher-Tick („spätestens in 5 min").

Keine neuen Edge Functions, keine Migrationen.

## Out of scope

- Andere Views (Week/Kanban/List/Heatmap) bekommen kein Composer-Upgrade in dieser Runde (Chips erben den neuen Style nur in MonthView).
- Keine Änderungen an `generate-post-v2` selbst.
- Kein Re-Design des EventDrawer-Headers oder der Tabs (Tasks/Comments/Approval) — nur der Details-Tab wird ersetzt.

## Technische Notizen

- Neue Datei: `src/components/calendar/PostComposerPanel.tsx` (~400 LOC).
- MonthView-Refactor extrahiert `PostChip.tsx` daneben, damit MonthView nicht weiter wächst.
- Reuse Preview-Komponenten via direktem Import — keine Duplikate.
- Alle Farben über bestehende HSL-Tokens (gold, primary, plattform-spezifisch in `platformColors`-Map).
- Animationen via Framer Motion (bereits Projekt-Standard).
