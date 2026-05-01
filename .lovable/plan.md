## Ziel

Drei Bereiche so markieren, dass Kunden sie sehen aber **nicht klicken / nutzen** können:
1. **Pika 2.2 (Standard + Pro)** → "Beta / Wartung" im AI Video Toolkit
2. **Gaming Hub** → "Coming Soon"
3. **KI Autopilot** → "Coming Soon"

Bestehender, unauffälliger Pattern: Es gibt schon ein `badge`-Feld in der Modell-Registry und Hub-Items. Wir bauen darauf auf — kein neues System nötig.

---

## Umsetzung

### 1. Pika → "Beta / Wartung" im AI Video Toolkit

**Datei:** `src/config/aiVideoModelRegistry.ts`

Neues optionales Feld `status` zum Model-Type hinzufügen:
```ts
status?: 'live' | 'beta' | 'maintenance' | 'coming_soon';
statusReason?: string;
```

Beide Pika-Einträge bekommen:
```ts
status: 'maintenance',
statusReason: 'Provider-Wartung — Pika ist temporär offline. Wir aktivieren das Modell wieder, sobald die Pika Labs API stabil läuft.',
badge: 'Wartung',
```

**UI-Effekt im Toolkit (`src/components/ai-video-studio/...`):**
- Modell-Karte zeigt `Wartung`-Badge in **gelb** (statt gold)
- Karte ist **disabled** (opacity-50 + cursor-not-allowed)
- Tooltip / kleiner Hinweistext zeigt `statusReason`
- Wenn jemand Pika trotzdem im Dropdown auswählt → Submit-Button disabled mit Hinweis

### 2. Gaming Hub → "Coming Soon"

**Datei:** `src/config/hubConfig.ts`

`HubDefinition`-Type erweitern um `comingSoon?: boolean`. Dem Gaming-Hub setzen:
```ts
{
  key: "gaming",
  ...
  comingSoon: true,
  items: [...],
}
```

**UI-Effekt im HubDashboard / Sidebar:**
- Hub-Kachel zeigt overlay-Badge **"Coming Soon"** (gold-cyan glow, James-Bond-Stil)
- Klick auf Hub öffnet **kein** Submenu → stattdessen kleiner Toast: *"Gaming Hub kommt bald — wir benachrichtigen dich beim Launch."*
- `/gaming`-Route bleibt erreichbar (für interne QA), aber zeigt prominentes "Coming Soon"-Banner oben

### 3. KI Autopilot → "Coming Soon"

**Dateien:**
- `src/components/autopilot/AutopilotHeroBanner.tsx` — Banner auf dem Dashboard
- `src/pages/Autopilot.tsx` — eigentliche Page

**AutopilotHeroBanner:**
- Großes "Coming Soon"-Overlay (semi-transparenter Glas-Effekt mit gold-Akzent)
- CTA-Button von "Autopilot starten" → "Benachrichtigt mich" (vorerst nur visuell, no-op + Toast: *"Eingetragen — wir melden uns beim Launch"*)
- Sub-Headline: *"Vollautonome KI-Content-Pipeline · Launch in Kürze"*

**Autopilot-Page (`/autopilot`):**
- Komplette Page mit "Coming Soon"-Screen ersetzen (Wizard etc. auskommentiert lassen, nicht löschen — kommt später zurück)
- Zeigt: Hero, kurze Feature-Vorschau (3 Cards: Auto-Briefing / Auto-Render / Weekly Review), "Benachrichtigt mich"-Button
- Falls User Admin ist (`useUserRole`-Check) → kleiner Link "Preview öffnen (Admin)" der die echte Autopilot-UI zeigt — damit du intern weiterarbeiten kannst

---

## Technische Details

**Dateien die angefasst werden:**

| Datei | Änderung |
|---|---|
| `src/config/aiVideoModelRegistry.ts` | `status`-Feld + Pika-Einträge auf `maintenance` |
| `src/components/ai-video-studio/AIVideoToolkit*.tsx` (Modell-Picker-Komponente) | `status`-aware Rendering: Badge + Disabled-State + Tooltip |
| `src/config/hubConfig.ts` | `comingSoon?: boolean` Property + Gaming-Hub-Markierung |
| `src/components/dashboard/HubDashboard*.tsx` o.ä. | Coming-Soon-Overlay auf Hub-Karten |
| `src/components/autopilot/AutopilotHeroBanner.tsx` | Coming-Soon-Overlay + Notify-CTA |
| `src/pages/Autopilot.tsx` | Coming-Soon-Screen mit Admin-Bypass |
| `src/lib/translations.ts` | Neue Keys: `comingSoon.title`, `comingSoon.notifyMe`, `comingSoon.notified`, `pika.maintenance` (DE/EN/ES) |

**Was NICHT angefasst wird:**
- Edge Functions für Pika (`generate-pika-video`) — bleiben deployed, falls Provider plötzlich wieder funktioniert
- Autopilot Edge Functions / Cron Jobs — bleiben aus, kommen später zurück
- DB-Schema — keine Migration nötig
- Routing in `App.tsx` — alle Routen bleiben, nur Inhalt der Pages ändert sich

**Reaktivierung später (1-Liner pro Feature):**
- Pika: `status: 'live'` setzen
- Gaming: `comingSoon: false`
- Autopilot: Coming-Soon-Wrapper aus Page entfernen

**Brand-Konsistenz (James Bond 2028):**
- Coming-Soon-Badges: Glass-Effekt, gold-glow (`#F5C76A`), cyan-Akzent für "Notify me"-CTA
- Wartung-Badge (Pika): subtileres Amber/Gold, kein roter Alarm-Ton
- Konsistent mit bestehenden `Premium`/`Neu`-Badges in der Registry

**Estimated changes:** ~7 Dateien, ~250 Zeilen Code, keine DB-Migration, keine Edge-Function-Änderungen.