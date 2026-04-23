

## Trial-Versprechen klar kommunizieren + Grace Period auf 14 Tage erhöhen

### Was du willst (Zusammenfassung)
1. **10 € KI-Video-Guthaben NICHT mehr als wiederkehrendes Feature bewerben** — denn es ist nur ein **einmaliger Welcome-Bonus** beim Trial-Start, kein monatliches Inklusivkontingent. Sonst entstehen falsche Erwartungen + reale Kosten pro Monat.
2. **Trial-Versprechen auf Startseite klar machen:**
   - 14 Tage kostenlos testen
   - 10 € AI-Video-Guthaben einmalig zum Start
   - **Kein automatisches Abo** — Nutzer muss aktiv zustimmen
   - Nach Trial: weitere 14 Tage Grace Period bevor Konto pausiert wird
3. **Backend-Grace anpassen**: Aktuell 3 Tage → soll **14 Tage** sein.

---

### Was geändert wird

#### 1. Pricing-Sektion (Landing) — „10 €"-Bewerbung entfernen
**Datei:** `src/components/landing/PricingSection.tsx` + `src/lib/translations.ts`

- **Feature-Liste**: `f7: "€10 AI video credits per month included"` → ersetzt durch z. B. `"AI video credits via top-up packs (€10 / €50 / €100)"` (verweist auf Top-up-System statt monatlich inkludiert).
- **trialNote** umformulieren von:
  > „14 Tage kostenlos · 10 € AI-Video-Guthaben inklusive · Keine Kreditkarte nötig"
  
  auf:
  > „14 Tage kostenlos testen · Kein Auto-Abo · Jederzeit kündbar"

- Im Pro-Card sichtbares Bild zeigt aktuell „€10 AI video credits per month included" als Bullet — wird komplett umformuliert.

#### 2. Neue prominente Trial-Promise-Sektion auf Landing
**Datei:** `src/components/landing/PricingSection.tsx` (oberhalb der Pro-Karte) ODER neue kleine Komponente `TrialPromiseStrip.tsx`

Visuelles 4-Punkte-Band im Bond-2028-Stil (Glassmorphism, Gold-Akzente), direkt über der Pro-Karte:

```text
┌──────────────────────────────────────────────────────────────┐
│  ✓ 14 Tage          ✓ 10 €              ✓ Kein Auto-       ✓ +14 Tage    │
│    kostenlos          Welcome-Bonus       Abo              Schonfrist     │
│    testen             für KI-Videos       — du entscheidest  bevor Pause │
└──────────────────────────────────────────────────────────────┘
```

Das macht die 4 Trial-Versprechen sofort sichtbar, **ohne** die 10 € als „monatlich inklusive" falsch zu framen.

#### 3. Hero pricingHint anpassen
**Datei:** `src/lib/translations.ts`

- Aktuell: „Ab 19,99 €/Monat · 14 Tage kostenlos · Keine Kreditkarte nötig"
- Neu: „Ab 19,99 €/Monat · 14 Tage testen · Kein Auto-Abo"

#### 4. FAQ-Eintrag ergänzen (optional, aber wertvoll)
**Datei:** `src/lib/translations.ts` (Landing-FAQ-Bereich, falls vorhanden — sonst überspringen)

Neuer Q&A:
- **F:** „Was passiert nach den 14 Tagen Testphase?"
- **A:** „Nichts Automatisches. Dein Konto wird **nicht** automatisch in ein kostenpflichtiges Abo überführt. Du hast danach weitere 14 Tage Schonfrist mit reduziertem Zugriff. Wenn du in dieser Zeit keinen Plan wählst, wird dein Konto pausiert (deine Inhalte bleiben erhalten)."

#### 5. Backend: Grace Period 3 Tage → 14 Tage
**Datei:** `supabase/functions/check-trial-status/index.ts`

- Konstante `GRACE_PERIOD_DAYS = 3` → `GRACE_PERIOD_DAYS = 14`
- Keine DB-Migration nötig (Logik ist nur in der Cron-Funktion).

**Datei:** `src/lib/translations.ts` — `trial.graceBanner` falls Tage-Anzeige eingebaut ist (bleibt dynamisch, da `{days}`-Platzhalter verwendet wird).

---

### Was NICHT geändert wird
- Welcome-Bonus-Logik (`grant-welcome-bonus`) bleibt 10 € einmalig bei E-Mail-Verifikation — funktioniert bereits korrekt.
- Stripe-Preise (19,99 €) — bleibt.
- Trial-Dauer (14 Tage) — bleibt.
- `AIVideoTopupHintCard` — bleibt (verweist korrekt auf Top-ups).

---

### Technische Details
- **5 Files editiert**: `PricingSection.tsx`, `translations.ts` (3 Sprachen-Blöcke), `check-trial-status/index.ts`
- **0 neue DB-Migrationen**
- **0 neue Stripe-Änderungen**

### Aufwand
- Translations EN/DE/ES anpassen (trialNote, f7, pricingHint, optional FAQ): 15 Min
- Trial-Promise-Strip-Komponente bauen + integrieren: 20 Min
- Backend `GRACE_PERIOD_DAYS` ändern: 2 Min
- **Gesamt: ~40 Min**

---

### Ehrliche Einschätzung
**Sehr gute Entscheidung.** Die 10 € als wiederkehrendes Feature zu bewerben war ein Risiko (Cost-Creep + falsche Erwartung beim Bestandskunden). Als **einmaliger Trial-Bonus** ist es dagegen ein perfekter **Conversion-Hebel** — und mit 14 Tagen Grace Period reduzierst du Abo-Frustration und Chargeback-Risiko massiv. Das ist customer-friendly UND profitabel.

