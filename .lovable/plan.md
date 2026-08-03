# Masterplan: Solocreator-Funnel „Ein Creator. Ein ganzes Studio."

Ziel: Vom ersten Seitenaufruf bis zum bezahlten Abo eine einzige, durchgängige Erzählung — ohne ein bestehendes Feature zu gefährden. Die Lip-Sync-Pipeline (Freeze v400), Autopilot, Motion Studio, Cast & World und die Stripe-Verdrahtung bleiben unangetastet; verändert werden Reihenfolge, Zustände, Sprache und Timing des Funnels.

## Die eine Kennzahl

**Time to First Finished Clip (TTFFC).** Jede Entscheidung im Funnel wird daran gemessen. Zweitmetrik: Anteil der Trial-Nutzer mit mindestens einem fertigen Clip, der ins Abo konvertiert.

```text
Landing → Studio-Einzug → Studio-Setup (3 Fragen)
   → FIRST PRODUCTION (fertiger Clip im Trial)
   → Kaufmoment "Dein Studio bleibt offen" (14,99 EUR)
   → Founders-Slot (20 % auf Credits, 24 Monate)
```

## Ausgangslage (verifiziert)

- Landing ist bereits stark: Hero, Social Proof, Live-Demo, Instant-Avatar-Demo, UDC-Showcase, AI-Arsenal, Trial-Promise, FAQ.
- Zwei konkurrierende Onboardings: `/onboarding` (6 Schritte inkl. Plan-Auswahl) und das `NicheTutorialModal` auf `/home` (3 Schritte).
- Onboarding gilt faktisch nie als abgeschlossen: 1 von 57 Profilen mit `onboarding_completed = true`.
- 29 von 57 Profilen haben `trial_ends_at = NULL` bei `trial_status = 'active'` — für diese Nutzer entsteht nie ein Kaufmoment.
- Zwei überlappende Neukundenserien: `process-drip-emails` (24 h/72 h/7 d) und `process-activation-emails` (Tag 0/1/3/7).
- Stripe sauber: ein Abo-Preis 14,99 EUR, Founders-Coupon nur auf Credit-Käufe.

## Phase 1 — Landing: von Interesse zu Entscheidung

Die Seite zeigt heute viel Können, aber wenig Konsequenz. Ergänzungen statt Umbau:

- **Ein einziger Primär-CTA** auf der gesamten Seite, identisch formuliert („Studio öffnen"), fixiert in Hero, nach der Live-Demo und im Footer. Alles andere wird sekundär.
- **Ergebnis-Beweis oberhalb des Falzes**: ein 12-Sekunden-Vorher/Nachher (Briefing → fertiger Clip) statt Feature-Liste.
- **Preisklarheit vor dem Signup**: 14,99 EUR/Monat, Trial-Länge, keine versteckten Kosten, Founders-Kontingent mit Live-Zähler. Wer den Preis kennt, konvertiert später besser.
- **Sticky Mobile-CTA** und ein Exit-freundlicher Founders-Hinweis (kein aggressives Popup).
- Reihenfolge: Hero → Ergebnis-Beweis → Live-Demo → Instant-Avatar → Studio-Umfang (Arsenal/UDC) → Preis + Founders → Social Proof → FAQ → Footer.

## Phase 2 — Studio-Einzug statt Registrierung

- Signup-Seite in Studio-Sprache, mit Fortschrittsanzeige „Schritt 1 von 3".
- Nach der Verifizierung geht es direkt nach `/onboarding`, nicht auf ein leeres Dashboard.
- `NicheTutorialModal` wird nicht mehr gemountet (Datei bleibt bestehen); `/onboarding` ist der einzige Pfad.
- Bestandsnutzer mit vorhandenem `onboarding_profiles`-Eintrag werden per Migration als abgeschlossen markiert.

## Phase 3 — Setup in unter 90 Sekunden

Drei Fragen, die ausschließlich die erste Produktion füttern: Nische/Angebot, Format & Plattform, Look/Marke. Die Plan-Auswahl fliegt aus dem Onboarding — im Trial wird produziert, nicht verkauft.

Abschluss erzeugt automatisch:
- ein Startsetup in Cast & World (Charakter + Location, passend zu den Antworten),
- einen vorbereiteten Autopilot-Brief,
- gesetzte Flags (`onboarding_completed`, `onboarding_profiles`).

Fallback: Wenn die Generierung des Startsetups scheitert, kommt ein neutrales Default-Setup — der Nutzer landet nie in einem leeren Studio.

## Phase 4 — First Production als Aha-Moment

- Letzter Onboarding-Schritt führt in eine bereits gefüllte Produktion; der Nutzer klickt nur noch „Produzieren".
- Während des Renderns übernimmt die Production Lounge (existiert bereits) — kein Leerlauf, kein Zweifel.
- Nach dem fertigen Clip: Ergebnis groß, danach genau zwei Aktionen — teilen/herunterladen und „nächste Produktion".
- Dashboard-Leerzustand wird ersetzt durch „Deine erste Produktion" mit einem einzigen nächsten Schritt.

## Phase 5 — Trial mit klarem Vertrag

- `trial_ends_at` wird verbindlich bei Accountanlage gesetzt (Vorschlag: 7 Tage), Backfill für die 29 offenen Accounts.
- Trial-Banner zeigt verbleibende Tage und den konkreten Nutzen, nicht nur eine Zahl.
- Kommunikation: Tag −3 „dein Studio schließt in 3 Tagen", letzter Tag, Grace-Fenster, Pause. Diese Mails umgehen die Frequenzsperre bereits korrekt.

## Phase 6 — Ein E-Mail-Funnel, verhaltensbasiert

`process-activation-emails` (Anker `email_verified_at`) wird die einzige Neukundenserie; `process-drip-emails` wird als Neukundenserie stillgelegt (Cron aus, Funktion und Templates bleiben erhalten).

| Zeitpunkt | Ohne fertigen Clip | Mit fertigem Clip |
| --- | --- | --- |
| Tag 0 | „Dein Studio ist offen" + Direktlink in die vorbereitete Produktion | Glückwunsch + zweite Idee aus der Nische |
| Tag 1 | Ein konkretes Beispiel-Briefing aus der eigenen Nische | Cast & World: Wiedererkennbarkeit aufbauen |
| Tag 3 | Cast & World — „gib deinem Studio ein Gesicht" | Autopilot: Serienproduktion |
| Tag 7 | Letzter Anstoß + Kaufmoment | Kaufmoment + Founders-Slot |

Jede Mail hat genau einen CTA und führt auf genau einen Bildschirm.

## Phase 7 — Ein Kaufmoment, überall gleich

Derselbe Checkout-Einstieg an drei Stellen: nach dem ersten fertigen Clip, in der Trial-Warnung, in der Tag-7-Mail. Immer dieselbe Formulierung: Beta-Basic 14,99 EUR/Monat, Founders-Vorteil 20 % auf jeden Credit-Kauf für 24 Monate, verfällt bei Kündigung. Die bestehenden Upgrade-Modals bei Limits übernehmen dieselbe Sprache statt eigener Varianten.

## Phase 8 — Sprache und Politur

- Durchgang über Onboarding, Aktivierungsmails, Trial-Banner, Upgrade-Dialoge und Leerzustände: Studio, Produktion, Cast, Set — konsistent zu Landing und SEO-Claim, in DE, EN und ES.
- Ladezustände, Fehlerzustände und Bestätigungen bekommen dieselbe Tonalität; kein englischer Fallback-Text im deutschen Funnel.

## Phase 9 — Messen statt raten

- Ereignisse entlang des Funnels: Landing-View, Signup, Verifiziert, Setup fertig, Erste Produktion gestartet, Erster Clip fertig, Checkout geöffnet, Bezahlt.
- Ein Funnel-Board mit TTFFC und Abbruchpunkten je Schritt, damit jede spätere Änderung nachweisbar wirkt.

## Umsetzungsreihenfolge

1. Trial-Vertrag + Backfill (schließt das größte Loch)
2. Ein Onboarding, sauberer Abschluss, Redirect
3. First Production inkl. Startsetup und Fallback
4. E-Mail-Funnel zusammenführen und verzweigen
5. Ein Kaufmoment, konsistent formuliert
6. Landing-Politur (CTA, Ergebnis-Beweis, Preisklarheit)
7. Sprache, Messung, Feinschliff

## Technische Details

- Migration: `trial_ends_at`/`onboarding_completed` backfillen, Trigger für neue Profile.
- `src/pages/Home.tsx`: Tutorial-Modal nicht mehr mounten; Post-Verify-Redirect auf `/onboarding`.
- `src/pages/Onboarding.tsx`: auf drei Schritte kürzen, Plan-Schritt entfernen, Abschluss legt Startsetup an und leitet in die Produktion.
- `src/pages/Index.tsx` + Landing-Komponenten: CTA-Vereinheitlichung, Ergebnis-Beweis, Preis-/Founders-Sektion, Sticky-CTA.
- `supabase/functions/process-activation-emails`: Stufen und Verhaltensverzweigung; Cron `process-drip-emails-hourly` deaktivieren.
- `src/lib/translations.ts`: Funnel-Strings in DE/EN/ES.
- Unberührt: Lip-Sync (Freeze v400), Composer, Autopilot-Engine, Stripe-Preise und Coupon-Logik.

## Offene Entscheidungen

- Trial-Länge: 7 oder 14 Tage?
- Erste Produktion aus dem bestehenden 10-EUR-Willkommensguthaben oder als eigenes, nicht auszahlbares „First Production"-Kontingent?
- Preis bereits auf der Landing zeigen (empfohlen) oder erst nach dem Signup?
