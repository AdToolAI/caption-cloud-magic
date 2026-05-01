# Status-Page Incident-Templates

## Ziel
Im Ernstfall (Replicate down, Lambda lahmt, Meta-API streikt) soll **niemand unter Stress Incident-Texte formulieren müssen**. Stattdessen: 1 Klick → Template lädt Titel + Beschreibung + Severity + betroffene Komponenten → "Publish".

## Wo
`src/components/admin/qa-cockpit/IncidentManager.tsx` — sichtbar im QA-Cockpit unter Tab "Status". Die Tabelle `status_incidents` und der `IncidentManager` existieren bereits; es fehlen nur die Templates.

## Templates (5 Stück, EN, ruhiger faktischer Ton)

1. **Replicate (AI Video) outage** — `partial_outage`, betrifft `ai_generation`
   Erwähnt explizit alle Replicate-gehosteten Modelle (Hailuo, Seedance, Kling, HappyHorse, Wan, Pika, Vidu) + Hinweis auf automatische Refunds.

2. **Video rendering (Lambda) slow** — `degraded`, betrifft `video_rendering`
   AWS Lambda Concurrency Limits, automatische Refunds bei Failures.

3. **Social publishing degraded** — `degraded`, betrifft `social_publishing`
   Meta / TikTok / X, automatischer Retry, Hinweis Drafts speichern.

4. **Scheduled maintenance** — `degraded`, betrifft `video_rendering` + `ai_generation`
   Geplantes Wartungsfenster, in-flight jobs resumieren automatisch.

5. **Major outage (DB / Auth)** — `major_outage`, betrifft `web_app` + `database`
   Login/Dashboard/Daten betroffen, Update alle 15 Minuten.

## UI-Änderung im "New incident"-Dialog

```text
┌─ Publish a new incident ──────────────────┐
│                                            │
│  ⚡ Quick templates                        │
│  [Replicate outage] [Lambda slow]          │
│  [Social degraded] [Maintenance] [Major]   │
│                                            │
│  Title    [______________________]         │
│  Desc.    [______________________]         │
│  Severity [Degraded ▾]                     │
│  Affected ☑ Web App  ☐ Database  …         │
│                                            │
│           [Cancel]  [Publish]              │
└────────────────────────────────────────────┘
```

Klick auf einen Template-Chip füllt das Formular vor — alle Felder bleiben editierbar (z. B. um konkrete ETA hinzuzufügen).

## Technische Details

- Konstante `TEMPLATES` (Array von 5 Objekten) am Dateianfang von `IncidentManager.tsx`.
- Neuer `applyTemplate(t)`-Handler setzt `setForm({...})`.
- Render-Block oberhalb der existierenden Form-Felder im Dialog mit kleinen `<Button variant="outline" size="sm">`-Chips.
- Keine DB-Änderung, keine Edge-Function-Änderung, keine neue Route.
- Keine i18n nötig: Status-Page ist bewusst global EN (Investor-/Reviewer-fokussiert).

## Out of scope für jetzt

- Automatisches Triggern aus Watchdog/Probes (separater zukünftiger Schritt — würde manuelle Kontrolle weniger machen, was im Launch-Stress eher Risiko ist).
- Übersetzung der Templates (EN reicht für `/status` global).

## Zeitaufwand
~10 Minuten Implementation + 1 Minute Test.
