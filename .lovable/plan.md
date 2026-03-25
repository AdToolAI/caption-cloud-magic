

## Smart Onboarding Tutorial mit Nischen-basiertem Starter-Dashboard

### Problem
Neue User sehen nach Registrierung ein Dashboard mit Mock-Daten ("Neue Produktvorstellung") und einer leeren Wochenplanung. Der aktuelle Onboarding-Flow (`src/pages/Onboarding.tsx`) fragt nur Sprache, Plan und Brand ab — keine Nische, keine Plattformen, keine Ziele. Dadurch kann das System keine personalisierten Empfehlungen oder Starter-Posts generieren.

### Loesung

Den bestehenden Onboarding-Flow von 3 auf 6 Schritte erweitern und eine Edge Function bauen, die anhand der gesammelten Daten einen konkreten Wochenplan mit 3-7 Post-Vorschlaegen generiert. Das Dashboard zeigt diesen Plan anstatt der Mock-Daten.

```text
Onboarding (6 Schritte):
[Sprache] → [Nische/Branche] → [Plattformen] → [Ziele/Frequenz] → [Brand] → [Plan generieren + Vorschau]
```

### Datenbank (2 neue Tabellen)

**`onboarding_profiles`** — Nischen-Daten des Users

| Spalte | Typ |
|---|---|
| id | uuid PK |
| user_id | uuid unique, ref profiles |
| niche | text (z.B. "Fitness", "E-Commerce") |
| business_type | text ("creator", "agency", "smb", "freelancer") |
| platforms | text[] |
| posting_goal | text ("grow_audience", "sell_products", "build_brand") |
| posts_per_week | int (3-7) |
| experience_level | text ("beginner", "intermediate", "advanced") |
| created_at | timestamptz |

RLS: User liest/schreibt nur eigene Zeile.

**`starter_week_plans`** — KI-generierte Post-Vorschlaege

| Spalte | Typ |
|---|---|
| id | uuid PK |
| user_id | uuid ref profiles |
| day_of_week | int (0-6) |
| suggested_date | date |
| suggested_time | time |
| platform | text |
| content_idea | text |
| tips | text |
| status | text ("suggested"/"accepted"/"created") |
| created_at | timestamptz |

RLS: User liest/schreibt nur eigene Zeile.

### Edge Function: `generate-starter-plan`

- Empfaengt: niche, business_type, platforms, posting_goal, posts_per_week, experience_level
- Nutzt Lovable AI (gemini-3-flash-preview) mit Kontext aus `posting-stats.json` fuer optimale Zeiten
- Generiert posts_per_week konkrete Post-Ideen mit Tag, Uhrzeit, Plattform, Content-Idee und Tipps
- Speichert in `starter_week_plans`
- Gibt Plan als JSON zurueck fuer sofortige Anzeige

### Frontend-Aenderungen

| Datei | Aenderung |
|---|---|
| `src/pages/Onboarding.tsx` | Von 3 auf 6 Schritte erweitern. Plan-Step wird nach Brand verschoben. Neue Steps: Niche, Plattformen, Ziele. Letzter Step ruft Edge Function auf und zeigt Wochenplan-Vorschau. |
| `src/components/onboarding/NicheStep.tsx` | NEU — Geschaeftstyp-Cards (Creator/Agentur/KMU/Freelancer) + Nischen-Input mit Vorschlaegen |
| `src/components/onboarding/PlatformStep.tsx` | NEU — Multi-Select mit Plattform-Icons (Instagram, TikTok, LinkedIn, Facebook, X) |
| `src/components/onboarding/GoalsStep.tsx` | NEU — Ziel-Auswahl (3 Cards) + Posts/Woche Slider (3-7) + Erfahrungslevel |
| `src/components/onboarding/StarterPlanPreview.tsx` | NEU — Zeigt generierten Wochenplan als Vorschau mit "Los geht's" Button |
| `src/hooks/useOnboardingProfile.ts` | NEU — CRUD fuer onboarding_profiles |
| `supabase/functions/generate-starter-plan/index.ts` | NEU — KI-Generierung des Starter-Plans |
| `src/pages/Home.tsx` | `loadDashboardData()`: Wenn User onboarding_profile hat UND keine echten Posts: starter_week_plans laden und als "Heute"/"Diese Woche" anzeigen mit "Post erstellen" Buttons statt Mock-Daten |

### Dashboard-Integration

Wenn `starter_week_plans` existieren und keine echten calendar_events vorhanden:
- **Heute-Sektion**: Zeigt heutige Starter-Posts mit Plattform-Badge, Content-Idee und "Post erstellen" Button (leitet zu AI Post Generator mit prefill)
- **Wochen-Sektion**: Zeigt alle 3-7 geplanten Tage mit Plattform-Dots und Uhrzeiten
- Sobald User echte Posts erstellt, werden Starter-Daten ausgeblendet

### Implementierungsreihenfolge

1. DB-Migration: `onboarding_profiles` + `starter_week_plans` + RLS
2. Edge Function `generate-starter-plan` mit Lovable AI
3. Onboarding.tsx erweitern (3 neue Steps + Plan-Generierung)
4. 4 neue Step-Komponenten erstellen
5. Home.tsx: Starter-Plan statt Mock-Daten anzeigen

