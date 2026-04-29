# Autopilot Cockpit (`/autopilot`) + Hard Legal Shield

Ein vollständiges KI-Steuerungs-Cockpit mit doppelt verriegelter Aktivierung, Wochenplan-Übersicht, Tool-Transparenz und einem **mehrstufigen Anti-Missbrauchs- und Anti-Deepfake-Sicherheitssystem**, das automatisch erkennt, blockiert und sanktioniert.

## Einstiegspunkt: Hero-Button auf Home-Dashboard

Position: zwischen Video-Carousel und "News & Updates"-Sektion (`DashboardVideoCarousel.tsx`, vor Z. 633). Glassmorphism-Card mit:
- Status-Pulse-Dot (gold = aktiv, grau = inaktiv, rot = paused/locked)
- Headline + Live-Mini-Stats wenn aktiv ("Nächster Post in 2h · 12 Slots geplant")
- CTA "Cockpit öffnen" → `/autopilot`

## Cockpit (`/autopilot`)

### 1. Sticky Kontroll-Leiste
Master-Toggle + 24h-Pause + Notfall-Stopp + Live-Budget-Bar + Compliance-Score (siehe unten).

### 2. Wochen-Kalender (14 Tage horizontal)
Slot-Kacheln mit Status (draft/QA-review/scheduled/posted/blocked). Klick → Drawer mit Preview, Approve/Edit/Regenerate/Skip.

### 3. Strategie-Panel (rechts)
Themen-Pillars · Tonalität · Verbots-Themen · Plattform-Mix · Sprach-Mix · Avatar-Lock — alles inline-editierbar.

### 4. "Welche Tools nutzt die KI?"-Transparenz
Live-Liste mit Status-LEDs: Video Composer · Picture Studio · Music Studio · Talking Head Avatare · Trend Radar · Posting Berater · KI-QA-Gate · Performance-Loop. Jeder Eintrag aufklappbar mit Klartext-Erklärung.

### 5. Activity-Stream (Audit-Log, Pflicht für EU AI Act)
Chronologische, filterbare KI-Entscheidungen mit Prompt + Output + Score + User-Eingriffe.

### 6. Compliance-Cockpit (NEU — eigener Tab)
- Live-Compliance-Score 0–100 (sinkt bei verdächtigen Generierungen)
- Liste aller geblockten/quarantänten Slots der letzten 30 Tage mit Begründung
- "Strikes-Counter" (siehe Sanktions-System unten)
- Direktlink zu AGB / Acceptable-Use-Policy

## Aktivierungs-Flow (3-stufig, EU-AI-Act-konform)

**Erstaktivierung** öffnet einen verbindlichen Onboarding-Flow:

1. **Brand-Brief-Wizard** (Themen, Verbote, Plattformen, Sprachen, Budget, Avatare)
2. **Acceptable-Use-Policy-Akzeptanz** — vollständiger Text muss gescrollt werden, dann 4 explizite Checkboxen (siehe Legal Shield)
3. **Hard-Confirmation** — User tippt manuell "ICH AKTIVIERE" und bestätigt mit Passwort-Re-Auth

Jede Akzeptanz wird mit Timestamp, IP-Hash und User-Agent in `autopilot_consent_log` gespeichert (immutable Audit-Trail).

## HARD LEGAL SHIELD — Mehrstufiger Schutz

### Stufe A — Brief-Wall (Eingabe-Blockade)
Bei der Brief-Erstellung **automatische Klassifizierung** des Inputs durch Lovable AI:
- Verbietet: explizit politische Kampagnen-Inhalte, medizinische/juristische/finanzielle Beratung, Glücksspiel, Adult-Content, Hassrede, Gesundheitsversprechen
- Verbietet: Themen die echte benannte Personen, Politiker, Marken, Prominente, IP/Charaktere als Hauptmotiv haben
- Bei Fund → Brief wird abgelehnt mit erklärendem Hinweis, kein Slot wird erstellt

### Stufe B — Asset-Origin-Wall (Übernahme aus Character Marketplace)
Avatar-Auswahl im Brief erlaubt **ausschließlich**:
- AI-generierte Charaktere mit `origin_type='ai_generated'` (verifiziert via Character Marketplace)
- Self-Portraits des aktuellen Users (`origin_type='self_portrait'` + matching `user_id`)
- Lizenzierte Personen mit gültigem PDF-Release (`origin_type='licensed_real_person'` + verifizierte Lizenzdatei)

Andere Brand Characters → grayed out mit Tooltip "Nicht für Autopilot freigegeben".

### Stufe C — Generation-Wall (Pre-Render-Gate)
Vor jedem Picture/Video/Music-Aufruf:
- Prompt durchläuft `autopilot-prompt-shield` Edge Function (Lovable AI Klassifikator)
- Rejected wenn: prominent person hint, brand/IP mention, child reference, medical claim, deepfake intent keywords, copyrighted material reference
- Ergebnis-Score < 90 → Slot wird `blocked` markiert, kein Render-Aufruf, keine Credits verbraucht

### Stufe D — Output-Wall (Post-Render-Gate, KI-QA)
Nach jedem Render:
- **Vision-Check** (Gemini 2.5 Pro): erkennt Gesichter, vergleicht gegen Verbots-Liste prominenter Personen, prüft auf Logos großer Marken (Nike/Apple/Disney etc.), erkennt urheberrechtlich geschützte Charaktere (Disney/Marvel/Anime-IPs)
- **Watermark-Detection**: Inhalte mit Stockfoto-Watermarks oder fremden Logos werden geblockt
- **NSFW + Minor-Detection** (vorhandene Picture-Studio-Pipeline)
- **Brand-CI-Score** (eigene Brand): muss ≥ 75/100
- Bei jedem Fail → Slot in Quarantäne, Activity-Log-Eintrag, kein Auto-Publish möglich

### Stufe E — Caption-Wall
Captions/Hashtags durchlaufen separaten Text-Filter:
- Keine Behauptungen über echte Personen
- Keine medizinischen/juristischen/finanziellen Versprechen
- Keine direkten Vergleiche mit fremden Marken ("besser als X")
- Keine fragwürdigen Hashtag-Cluster (Engagement-Bait, Spam-Listen)

### Stufe F — Publishing-Wall
Vor `socialmedia-post-publish`:
- Final-Check: ist Asset wirklich approved? Ist Caption durchgelaufen? Ist Compliance-Score OK?
- Cooldown-Check: min. 90 Min seit letztem Post auf gleicher Plattform
- Tages-Limit-Check: nicht über Hard-Cap (z.B. 3 IG/Tag)
- Plattform-Token noch valide?
- Bei jedem Fail → Slot abgebrochen, Activity-Log, optional Mail-Alert

### Stufe G — Watermark & Disclosure
Jedes von Autopilot generierte Asset bekommt:
- Unsichtbares C2PA-Manifest (Provenance-Standard) im Metadata-Header
- Caption-Suffix automatisch: "Made with AI · @useadtool" (TikTok/Meta Pflicht ab 2026 für KI-Inhalte)
- DB-Marker `is_ai_generated=true` + `autopilot_generated=true`

## ANTI-MISSBRAUCHS-SANKTIONS-SYSTEM

### Strike-Mechanik
Jeder Verstoß wird in `autopilot_strikes` geloggt mit Severity:

- **Soft-Strike** (Stufe A/E Brief- oder Caption-Block): Hinweis im Cockpit, kein Limit
- **Hard-Strike** (Stufe C/D Block: Deepfake-Versuch, Copyright, prominente Person): zählt
- **Critical-Strike** (Manipulation versucht: Watermark entfernen, Filter umgehen, fremder Token, mehrfacher gleicher Hard-Strike): zählt doppelt

### Eskalationskette
- **Strike 1**: Warnung im Cockpit + E-Mail mit Klartext-Erklärung
- **Strike 2**: Autopilot 7 Tage gesperrt + verpflichtendes Re-Onboarding mit erweiterten Checkboxen
- **Strike 3**: Autopilot dauerhaft für diesen Account gesperrt + Account-Review-Flag für Admin
- **Critical-Strike (egal welcher Zähler)**: **Sofortige fristlose Account-Löschung** ohne Rückerstattung von Credits/Abos

### Auto-Termination-Trigger (sofortige Account-Löschung)
- Erkennung von Deepfake-Intent gegen reale Person (Stufe D Vision-Match)
- Mehrfacher Versuch, gleichen blockierten Prompt zu generieren
- Versuch, generierte Assets mit gefälschten Origin-Daten in Marketplace einzustellen
- API-Manipulation/Reverse-Engineering-Versuche (z.B. direkte Edge-Function-Calls mit modifizierten Payloads → Hash-Validation auf Server)
- Posten von Inhalten, die nach Veröffentlichung von Plattformen wegen Copyright/Impersonation gesperrt werden (DMCA-Webhook-Eingang)

### Termination-Workflow
- `terminate-autopilot-abuse` Edge Function (admin-only triggered durch automatische Critical-Strike-Detection)
- Setzt `profiles.terminated_at` + `terminated_reason` + `terminated_evidence_json`
- Sperrt sofort alle Sessions (`auth.admin.signOut`)
- Storniert offene Stripe-Subscriptions ohne Refund
- Verschiebt User-Daten in `terminated_accounts_archive` (90 Tage Aufbewahrung für rechtliche Verteidigung, dann Hard-Delete gemäß DSGVO Art. 17 + 6 Abs. 1 lit. f)
- Sendet Termination-Email mit Klartext-Begründung + Beweis-Hash + Rechtsmittel-Hinweis (Widerspruch in 14 Tagen schriftlich)
- Erstellt Admin-Sentry-Alert für manuelle Nachprüfung

### Rechtliche Verankerung
Diese Termination-Klausel wird aufgenommen in:
- Bestehende AGB → neuer Abschnitt "§X Autopilot-Modus & Missbrauchsfolgen"
- Neue **Acceptable-Use-Policy** auf `/legal/autopilot-aup` (öffentlich, vor Aktivierung Pflicht-gelesen)
- Brief-Wizard Checkbox 4: "Ich verstehe, dass Missbrauch (insb. Deepfake-Versuche, Copyright-Verletzungen, Identitätstäuschung) zur sofortigen fristlosen Löschung meines Accounts ohne Anspruch auf Rückerstattung führt"

## Datenbank

- `autopilot_briefs` — pro User: themen, verbote, plattformen, sprachen, budget, auto_publish_enabled, is_active, paused_until, compliance_score, locked_until
- `autopilot_queue` — Slots: scheduled_at, platform, language, status, content_payload, qa_score, blocked_reason, posted_at
- `autopilot_consent_log` — immutable: event, ip_hash, user_agent, accepted_text_hash, timestamp
- `autopilot_strikes` — severity, reason_code, evidence_json, created_at, expires_at
- `autopilot_activity_log` — komplettes Audit
- `terminated_accounts_archive` — gelöschte Accounts mit Beweisen (90d)

Alle mit RLS: User sieht nur eigene Daten, Admin sieht alles.

## Edge Functions

- `autopilot-toggle` — Aktivierung/Deaktivierung mit Consent-Check
- `autopilot-plan-week` — Plan-Generierung (Lovable AI Tool-Calling, Gemini 3 Flash Preview)
- `autopilot-prompt-shield` — Klassifizierung Stufe C
- `autopilot-generate-slot` — orchestriert Picture/Video/Music
- `autopilot-qa-gate` — Vision-Check Stufe D
- `autopilot-caption-shield` — Stufe E
- `autopilot-publish-due` — Cron, postet was fällig ist
- `autopilot-strike` — schreibt Strike, prüft Eskalation, ggf. → `terminate-autopilot-abuse`
- `terminate-autopilot-abuse` — die scharfe Klinge, mit voller Beweissicherung

Alle prüfen `is_active` UND `locked_until` UND `terminated_at` als ersten Schritt → harter Kill-Switch.

## Cron (pg_cron)
- alle 5 Min: `autopilot-publish-due`
- stündlich: `autopilot-generate-slot` für nächste 24h
- täglich 02:00: `autopilot-plan-week` für rollierendes 14d-Fenster
- täglich 03:00: Strike-Decay-Job (Strikes älter als 90 Tage werden inaktiv, außer Critical)

## Routing & UI
- Neue Route `/autopilot` (Cockpit) + `/legal/autopilot-aup` (Acceptable Use Policy)
- Sidebar-Eintrag "Autopilot" mit pulsierendem Dot wenn aktiv, rotem Schloss wenn locked/terminated
- Hero-Button im `DashboardVideoCarousel.tsx`

## Aufwand & Empfehlung

Umsetzung in 2 Build-Sessions:

- **Session A — Cockpit & Foundation**: Datenmodell, Brief-Wizard, AUP-Page, Cockpit-UI (Toggle, Kalender, Strategie, Tools, Activity, Compliance-Cockpit), Hero-Button, Strike-Counter-UI
- **Session B — Engine & Shield**: alle Edge Functions inkl. der 7 Schutz-Walls, Termination-Workflow, Cron-Schedule, Slot-Drawer mit Approve/Edit, Mail-Alerts, C2PA-Watermarking

Default nach Build: **Co-Pilot-Modus** (Approval Pflicht). Auto-Publish-Switch erst nach 7 Tagen sauberer Co-Pilot-Nutzung (Strikes = 0) freigeschaltet.

Soll ich mit Session A starten?
