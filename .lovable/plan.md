

## Plan: A4 Getting-Started-Checkliste + A3 Interactive Tour

Alle 4 Klärungen bestätigt:
1. **Reihenfolge:** A4 zuerst → danach A3
2. **5 Checklisten-Schritte:** wie vorgeschlagen
3. **Checkliste:** kollabierbar (Default: offen)
4. **Tour:** Auto-Start beim ersten Login mit „Tour überspringen"-Button

Mein Take zu deiner Tour-Entscheidung: **sehr gut**. Auto-Start sorgt dafür, dass keiner die Tour verpasst, der Skip-Button respektiert Power-User. Standard im SaaS-Onboarding (Notion, Linear, Stripe machen es genauso).

---

## A4 — Getting-Started-Checkliste

### Komponenten
- **`GettingStartedChecklist.tsx`** — neue Komponente, eingebettet in die Sidebar (unter den Hub-Icons). Kollabierbar via Chevron-Toggle, Default: offen für User mit `progress < 100%`.
- **`useGettingStartedProgress.ts`** — Hook, der parallel 5 Datenquellen prüft:
  1. `onboarding_profiles` existiert → ✅ Onboarding
  2. `video_creations` count > 0 → ✅ Erstes Video
  3. `social_connections` count > 0 → ✅ Konto verbunden
  4. `calendar_events` count > 0 → ✅ Post geplant
  5. `brand_kits` count > 0 → ✅ Brand Kit
- **Progress-Ring** im James-Bond-2028-Style: kreisförmiger Fortschrittsbalken in Gold (#F5C76A) mit Glow-Effekt, zeigt „3/5"
- **Auto-Hide:** Bei 100% verschwindet die Checkliste mit einem „Alle Schritte abgeschlossen!"-Toast und persistiert via `localStorage`-Flag (User kann nicht wieder aufploppen)
- **Lokalisiert** (DE/EN/ES) über bestehenden `useTranslation()`-Hook
- **Layout:** Da Sidebar nur 68px breit ist → **Floating Panel** rechts neben der Sidebar (kollabiert: nur Progress-Ring-Icon sichtbar; expandiert: 280px breites Panel mit allen 5 Steps)

### CTAs pro Step
Jeder offene Step ist klickbar und routet zur passenden Seite:
- Onboarding → `/onboarding`
- Erstes Video → `/hailuo-video-studio` (mit personalisiertem Prompt aus A2)
- Konto verbinden → `/hub/social-management`
- Post planen → `/calendar`
- Brand Kit → `/brand-kit`

### Aufwand: ~45 Min

---

## A3 — Interactive Product Tour

### Setup
- **Library:** `react-joyride` installieren
- **`useProductTour.ts`** — Hook, der Tour-Status in neuer Spalte `profiles.tour_completed_at TIMESTAMPTZ` persistiert
- **Auto-Start:** beim ersten Login nach Onboarding (1× pro User), Skip-Button immer sichtbar
- **Manuell startbar:** „Tour erneut starten"-Button in `/settings`

### Tour-Stationen (6 Steps)
1. Sidebar-Hubs („Hier findest du alle Tools")
2. Dashboard-Cards (News & Trend Radar)
3. „Erstes Video"-Hero (aus A2)
4. Getting-Started-Checkliste (aus A4)
5. AI-Studios-Hub
6. Calendar/Planner

### Theming
- **Dark/Gold-Style** passend zum James-Bond-2028-Design (`backgroundColor: '#050816'`, `primaryColor: '#F5C76A'`, Glassmorphism)
- **Lokalisierte Tooltips** (DE/EN/ES)
- **Skip-Button** prominent: „Tour überspringen" / „Skip Tour" / „Saltar tour"

### DB-Migration
- `ALTER TABLE profiles ADD COLUMN tour_completed_at TIMESTAMPTZ;`

### Aufwand: ~60 Min

---

## Reihenfolge der Umsetzung

1. **A4 Schritt 1:** `useGettingStartedProgress`-Hook (15 min)
2. **A4 Schritt 2:** `GettingStartedChecklist`-Komponente + Floating Panel (20 min)
3. **A4 Schritt 3:** Sidebar-Integration + E2E-Test (10 min)
4. **A3 Schritt 1:** DB-Migration + `react-joyride` install (5 min)
5. **A3 Schritt 2:** `useProductTour`-Hook + Auto-Start-Logik (15 min)
6. **A3 Schritt 3:** 6 Tour-Steps + Theming + Lokalisierung (30 min)
7. **A3 Schritt 4:** Settings-Button „Tour erneut starten" + E2E-Test (10 min)

**Gesamt: ~1h 45min**

---

## Nach Approval

Ich baue Schritt für Schritt durch — erst A4 komplett, dann A3 — und teste am Ende beide Features End-to-End in der Preview.

