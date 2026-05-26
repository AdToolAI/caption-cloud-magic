## Ziel

1. Die Post-Bearbeitungsseite (EventDrawer + PostComposerPanel) wird optisch edler und moderner — passend zum „Lightsaber"/Bond-Look der Kalender-Chips.
2. Kampagnen erhalten klaren Vorrang vor dem Strategie-Modus: Solange eine Kampagne aktiv ist, wird der Strategie-Modus für deren Zeitraum automatisch pausiert. Danach knüpft die Strategie automatisch an die Kampagne und an die in Analytics gemessenen Ergebnisse an.

---

## 1) Bearbeitungsseite edler & moderner

Datei: `src/components/calendar/EventDrawer.tsx`, `src/components/calendar/PostComposerPanel.tsx`

- **Header**: Dunkler Glas-Header mit dünner, plattformfarbener „Klinge" links (gleiche Logik wie PostChip), Datum/Uhrzeit als monospace Chrono-Display, Status-Pill (Entwurf / Geplant / Veröffentlicht) mit Pulse.
- **Layout**: Linke Spalte = Composer, rechte Spalte = Live-Preview — beide auf `bg-[#0b0f1a]/85 backdrop-blur-xl` mit feinem Goldrand `border-[hsl(var(--primary))]/15`, Sektions-Trenner als 1px Gold-Gradient-Linie statt grauer Borders.
- **Sektionen** (Briefing, Caption, Hooks, Hashtags, Plattformen, Medien, Zeitpunkt, Auto-Publish): jeweils als „Glas-Karte" mit dezenter Eckenmarkierung, Sektionstitel in Uppercase-Tracking-Gold, Icons als 14px Lucide.
- **Plattform-Toggles**: Aktive Plattform bekommt die plattformeigene Lichtschwert-Klinge links + leichtes Glow; inaktive sind dezent grau, kein bunter Hintergrund mehr.
- **Live-Preview**: Phone-Mockup-Rahmen mit Glow, Plattform-Tabs als segmentierter Bond-Switch.
- **CTA-Bar (sticky Footer)**: „Entwurf speichern" (ghost) + „Bereit zum Auto-Publish" (Primary-Gold mit Glow). Validierung sichtbar inline.
- Bestehende Logik bleibt unverändert (handlePatch, generate-post-v2, scheduled-Status).

## 2) Kampagne > Strategie-Modus (Vorrang & Auto-Anknüpfung)

### A) Vorrang während Kampagnen-Laufzeit

- Beim Generieren / Aktivieren einer Kampagne (Edge Function `calendar-campaign-generate`) wird der Kampagnen-Zeitraum (`starts_at`, `ends_at`) auf die Kampagne geschrieben (falls noch nicht vorhanden).
- Neue Tabelle bzw. Spalten-Erweiterung (Migration): `campaigns` bekommt sicher gestellt `starts_at`, `ends_at`, `pauses_strategy bool default true`. Zusätzlich Tabelle `strategy_mode_pauses (id, user_id, campaign_id, starts_at, ends_at, reason)` für mehrere parallele/aufeinanderfolgende Pausen.
- `tick-strategy-posts` und `generate-week-strategy` prüfen vor jedem Slot, ob `scheduled_at` in einer aktiven `strategy_mode_pauses`-Range liegt → in dem Fall werden für diesen Zeitraum **keine** neuen Strategie-Posts erzeugt und bestehende `pending` Strategie-Posts werden auf `dismissed` mit `reason: 'campaign_override'` gesetzt.
- `useStrategyMode` (Frontend) bekommt zusätzlich `activePauses` aus dieser Tabelle und blendet im „Diese Woche"-Streifen die betroffenen Tage als „🟡 Kampagne aktiv" ein (statt leeren Punkt), Toggle bleibt sichtbar, ist aber für den Pausen-Zeitraum visuell `disabled` mit Tooltip „Pausiert wegen Kampagne X bis TT.MM.".

### B) Auto-Anknüpfung nach Kampagnen-Ende

- Neue Edge Function `strategy-resume-after-campaign` (cron, stündlich): Findet abgelaufene Kampagnen mit `pauses_strategy=true`, deren `ends_at < now()`, sammelt die zugehörigen `calendar_events` der Kampagne, liest deren Performance aus `content_analytics` / Analytics-Dashboard (Reach, ER, Saves, beste Plattform, beste Uhrzeiten, Top-Hooks).
- Das Ergebnis wird als `strategy_seed`-Eintrag in einer neuen Tabelle `strategy_seeds (user_id, source_campaign_id, insights jsonb, consumed_at)` abgelegt.
- `generate-week-strategy` liest beim nächsten Lauf nicht-konsumierte `strategy_seeds`, übergibt deren `insights` zusätzlich an den Prompt („Knüpfe an Kampagne X an: bester Slot Mo 18:00, Top-Hook 'Behind the scenes', schwächste Plattform LinkedIn → reduzieren") und markiert sie als `consumed_at = now()`.
- Im UI „Diese Woche" wird ein Banner gezeigt: „🔗 Strategie knüpft an Kampagne **X** an — basierend auf 12 Posts & echten Analytics-Daten" mit Link zur Kampagne und zum Analytics-Dashboard.

### C) UX-Sicherheit

- Beim Kampagnen-Launch erscheint ein Bestätigungs-Dialog: „Strategie-Modus wird für TT.MM.–TT.MM. automatisch pausiert. Nach Kampagnenende wird deine Strategie auf Basis der Kampagnen-Ergebnisse fortgesetzt." mit Opt-out Checkbox „Strategie parallel weiterlaufen lassen" (setzt `pauses_strategy=false`).

---

## Dateien

**Frontend**
- `src/components/calendar/EventDrawer.tsx` (Redesign)
- `src/components/calendar/PostComposerPanel.tsx` (Redesign + Sektions-Karten)
- `src/hooks/useStrategyMode.ts` (activePauses + Banner-Data)
- `src/components/dashboard/CalendarQuickActions.tsx` bzw. „Diese Woche"-Streifen (Pause-Visualisierung + Banner)
- `src/pages/Campaigns.tsx` / `CampaignFormCard.tsx` (Bestätigungs-Dialog + Opt-out)

**Backend / Edge / DB**
- Migration: `campaigns.pauses_strategy`, Tabelle `strategy_mode_pauses`, Tabelle `strategy_seeds` (+ RLS + GRANTs)
- `supabase/functions/calendar-campaign-generate/index.ts` (schreibt Pause-Range)
- `supabase/functions/tick-strategy-posts/index.ts` (respektiert Pausen)
- `supabase/functions/generate-week-strategy/index.ts` (konsumiert seeds)
- Neu: `supabase/functions/strategy-resume-after-campaign/index.ts` (+ pg_cron stündlich)

## Ergebnis

Bearbeitungsseite wirkt edel & modern in der Bond-/Lightsaber-Sprache. Kampagnen blockieren automatisch konkurrierende Strategie-Posts für ihre Laufzeit, und sobald die Kampagne endet, übernimmt der Strategie-Modus deren echte Performance-Daten und plant darauf aufbauend die nächste Woche.
