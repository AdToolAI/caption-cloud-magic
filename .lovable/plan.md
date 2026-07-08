# Restliche Launch-Readiness-Arbeiten (Phase 4 & 5)

Die Phasen 1–3 (Pricing-Konsistenz, ehrliches Marketing, Feature-Gating) sind abgeschlossen. Es fehlen noch **Härtung** und **Datenschutz-Feinschliff**, damit die Beta öffentlich gehen kann.

---

## Phase 4 – Robustheit & Zuverlässigkeit

### 4.1 Founders-Slot-Zähler absichern
- Neue RPC `claim_founders_slot(user_id)` mit `SECURITY DEFINER` und Row-Lock (`FOR UPDATE`), zählt bis `FOUNDERS_MAX_SLOTS = 1000` konsistent hoch.
- Spalten in `subscribers`: `is_founder boolean`, `founders_slot_number int`.
- Aufruf aus `create-checkout` **nach** erfolgreicher Session-Erstellung, mit Coupon-Zuweisung `PRO-FOUNDERS-24M` vs. `PRO-LAUNCH-3M`.
- Frontend-Badge `FoundersSlotBadge` liest über gecachte View `founders_slots_public` (nur `remaining_slots`, kein PII).

### 4.2 Timeouts & Fehlertoleranz in AI-Edge-Functions
Kritische Long-Running-Functions bekommen `AbortController` + Credit-Refund bei Timeout/Fehler:
- `compose-video-clips`, `render-directors-cut`, `lipsync-*`, `refine-asset-photo`, `picture-studio-generate`, `generate-ai-video`.
- Einheitliche Fehler-Response inkl. `refunded_credits: true`.
- Bestehende Refund-Automation (siehe Memory) als Vorlage.

### 4.3 Zentrale Stripe-Config
- Neue Datei `supabase/functions/_shared/stripe-config.ts` mit Price-IDs, Product-IDs, Coupons, `FOUNDERS_MAX_SLOTS`.
- `create-checkout`, `customer-portal`, `check-subscription` importieren daraus statt hartcodiert.

### 4.4 Picture Studio – UnifiedAssetPicker
- `PictureStudio.tsx` bekommt den globalen `UnifiedAssetPicker` (Cast/World) analog zu Motion Studio, ersetzt `FileReader`-Upload.
- Uploads laufen über `brand-uploads`-Bucket mit user-id-Prefix (RLS-konform).

---

## Phase 5 – Datenschutz, Auth & Beobachtbarkeit

### 5.1 Community-Tabellen RLS-Scope
Prüfen und ggf. eingrenzen (aktuell `USING (true)`):
- `community_posts`, `community_comments`, `community_reactions`.
- Entweder öffentlich lesbar dokumentieren **oder** auf `authenticated` einschränken – Entscheidung mit User.

### 5.2 Auth-Fail-Audit
- Erwartete Fehlerpfade (falsches Passwort, abgelaufener Token, gepauster Account) durchspielen.
- Konsistente Toasts + Redirects nach `/auth` bzw. `/account/paused`.
- Trial-Grace/Expired-Zustand aus `useTrialStatus` in Sidebar sichtbar machen.

### 5.3 Sichtbarkeit halbfertiger Bereiche
- Social-OAuth-Buttons, die `oauthComingSoon` triggern, hinter `BETA_ACTIVE`-Flag verstecken statt Toast.
- Admin-Only-Routen (`/admin/*`) hinter `has_role(auth.uid(), 'admin')` doppelt absichern (Frontend + Edge).

### 5.4 Beobachtbarkeit für Beta
- PostHog-Events für Beta-KPIs: `beta_signup`, `founders_slot_claimed`, `feature_gate_hit`, `credit_refund_triggered`.
- Admin-Dashboard-Kachel „Beta Health": Founders-Slots verbleibend, Refund-Rate, aktive Trials.

---

## Technische Details

**Neue Dateien**
- `supabase/functions/_shared/stripe-config.ts`
- `supabase/migrations/<ts>_founders_slot_rpc.sql`
- `src/components/landing/FoundersSlotBadge.tsx` (falls noch nicht vorhanden)

**Migration (Kern)**
```sql
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS is_founder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS founders_slot_number int;

CREATE OR REPLACE FUNCTION public.claim_founders_slot(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_slot int;
BEGIN
  SELECT COALESCE(MAX(founders_slot_number), 0) + 1 INTO next_slot
  FROM public.subscribers FOR UPDATE;
  IF next_slot > 1000 THEN RETURN NULL; END IF;
  UPDATE public.subscribers
    SET is_founder = true, founders_slot_number = next_slot
    WHERE user_id = _user_id AND is_founder = false;
  RETURN next_slot;
END; $$;
```

**Erwartete Wirkung**
- Zahlungs- und Rendering-Pipeline werden fehlerresistent (keine Credit-Verluste bei Timeouts).
- Founders-Zähler race-condition-frei.
- Community & Admin-Pfade abgesichert.
- Beta-KPIs live messbar.

---

## Offene Fragen
1. **Community-Sichtbarkeit**: Sollen Posts öffentlich lesbar bleiben (SEO-Vorteil, aber PII) oder nur eingeloggte User?
2. **Reihenfolge**: Alles in einem Rutsch, oder erst 4.1 + 4.2 (Kritischster Zahlungs-/Render-Pfad) und danach Rest?
