# Founders-Rabatt (20%) + Status-Forfeit

Zwei Erweiterungen für das Beta-Founder-Programm.

## 1) 20% Video-Credit-Rabatt für 24 Monate

**Zielgruppe:** Nutzer mit Zeile in `founders_signups` mit `coupon_id = 'PRO-FOUNDERS-24M'`, deren `claimed_at` weniger als 24 Monate zurückliegt UND deren Status nicht widerrufen ist (siehe Teil 2).

**Umfang:** Rabatt gilt für alle vier AI-Video-Credit-Packs (Starter/Standard/Pro/Enterprise, EUR + USD) — also den `ai-video-purchase-credits`-Flow. Das Beta-Basic-Abo (14,99€) ist davon **nicht** betroffen, das bleibt der eigene 24-Monats-Preis-Lock.

### Datenbank
- Migration: SQL-Helper `public.is_founder_active(_user_id uuid) returns boolean`
  - `true`, wenn Zeile in `founders_signups` mit `coupon_id='PRO-FOUNDERS-24M'`, `revoked_at IS NULL` und `claimed_at > now() - interval '24 months'`.
  - `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE … TO authenticated, service_role`.

### Stripe
- Einmalig via Stripe-API einen wiederverwendbaren Coupon anlegen: `id = FOUNDERS_VIDEO_20`, `percent_off = 20`, `duration = forever`, `applies_to = all` (Credits sind One-off). Coupon-ID als ENV `STRIPE_FOUNDERS_VIDEO_COUPON` im Edge-Runtime hinterlegen (Fallback `FOUNDERS_VIDEO_20` im Code).

### Edge-Function `ai-video-purchase-credits`
- Nach Auth: `is_founder_active(user.id)` prüfen.
- Wenn `true`: `discounts: [{ coupon: FOUNDERS_VIDEO_20 }]` an `stripe.checkout.sessions.create` anhängen und `founder_discount: 'true'` in `metadata` schreiben. Beide Rechnungsfooter (DE/EN) erweitern um „inkl. 20% Founder-Rabatt".
- Bei `false`: Verhalten unverändert.

### UI
- `Credits.tsx` (Top-up-Karten) + `src/components/credits/*`:
  - Founder-Status per neuer `useFounderStatus()`-Hook (ruft `is_founder_active` via RPC, cached, invalidiert bei Auth-Change).
  - Wenn aktiv: gold-getönter Badge „Founder −20%" auf jeder Pack-Karte, durchgestrichener Originalpreis, effektiver Preis darunter (`price * 0.8`).
  - Kurze Info-Zeile: „Founder-Rabatt aktiv bis TT.MM.JJJJ" (aus `claimed_at + 24 months`).

## 2) Founder-Status verfällt bei Pause / Deaktivierung / Löschung

**Ereignisse, die den Status widerrufen:**
- Konto-Löschung (User-initiiert via `/account/delete` und Admin via `admin-delete-user`).
- Abo-Kündigung / Ausbleiben der Zahlung (Stripe-Event `customer.subscription.deleted` bzw. `invoice.payment_failed` nach Grace-Period).
- Manueller „Pause account"-Flow (falls implementiert — wir bauen den Hook ein, damit spätere Pause-UI ihn direkt nutzen kann).

**Nicht widerrufend:** Reguläres Logout, „Logout on all devices". Diese berühren den Status nicht.

### Datenbank
- Migration `founders_signups` erweitern:
  - `revoked_at timestamptz`
  - `revoked_reason text` (`'account_deleted' | 'subscription_canceled' | 'account_paused' | 'admin'`)
- Index `idx_founders_signups_active` auf `(user_id) WHERE revoked_at IS NULL`.
- Neue SECURITY-DEFINER-RPC `public.revoke_founder_status(_user_id uuid, _reason text)` (nur `service_role`), setzt `revoked_at = now()` idempotent.

### Serverseitige Verdrahtung
- `supabase/functions/admin-delete-user/index.ts`: vor dem Auth-Delete `revoke_founder_status(userId, 'admin')` aufrufen (Zeile ~85, direkt bei den anderen `admin.from(...).delete()`-Calls, aber als `rpc`, damit die Zeile in `founders_signups` als „widerrufen" erhalten bleibt, statt gelöscht zu werden — wichtig für die Founder-Kontingent-Zählung: eine widerrufene Zeile blockiert den Slot NICHT weiter, siehe unten).
- User-Delete-Flow `/account/delete` (Seite `DeleteAccount`): Edge-Function `delete-own-account` (neu, falls nicht vorhanden — Route in `App.tsx` prüfen; falls Delete-Logik dort clientseitig ist, ziehen wir sie in eine neue Edge-Function um, die zuerst `revoke_founder_status(user.id, 'account_deleted')` aufruft, dann `admin.auth.admin.deleteUser`).
- `supabase/functions/stripe-webhook/index.ts`: Handler für `customer.subscription.deleted` erweitern → `revoke_founder_status(user.id, 'subscription_canceled')`. `user.id` via `customer_id`-Lookup in `profiles`/`founders_signups.stripe_customer_id`.
- Vorbereitung für Pause: neuer generischer Endpoint `pause-account` (Skeleton, ruft `revoke_founder_status(user.id, 'account_paused')` und setzt später `profiles.paused_at`). Falls kein Pause-Flow existiert, nur den RPC bereitstellen und keine neue Route erstellen.

### Slot-Kontingent
- `claim_founders_slot` bleibt idempotent, aber die Zählung `WHERE coupon_id = _founders_coupon` wird auf `AND revoked_at IS NULL` eingeschränkt, damit widerrufene Slots wieder frei werden für neue Nutzer (freundlicher zu späten Anmeldern, bleibt fair bei 1000-Grenze).
- Zusatz: Wenn ein Nutzer nach Widerruf zurückkommt, entscheidet die Funktion frisch — bekommt er einen neuen Slot nur, wenn wieder unter 1000 aktive Founders. Bestehende widerrufene Zeile wird per `UPDATE … SET revoked_at=NULL, claimed_at=now()` reaktiviert falls freie Slots vorhanden, sonst Fallback-Coupon.

### UI
- Bei aktivem Widerruf zeigt der Badge auf `/pricing` (`FoundersSlotBadge`) und Credits-Seite den regulären (nicht-Founder-)Zustand.
- Beim Klick auf „Konto löschen" wird der bestehende Bestätigungsdialog ergänzt um eine Warnzeile (rot, unter dem Haupttext): „Dein Founder-Status (20% Video-Rabatt & Preisgarantie 14,99€ für 24 Monate) geht dabei unwiderruflich verloren."

## Technische Details

- **Migrationsreihenfolge:** `revoked_at`-Spalten zuerst, dann `is_founder_active`, dann `revoke_founder_status`, dann Update von `claim_founders_slot`.
- **RLS:** Beide neuen RPCs sind `SECURITY DEFINER`, keine neuen Tabellen, keine RLS-Änderungen an `founders_signups`.
- **Stripe-Coupon-Anlage:** Einmalig via `stripe_api_write` (`PostCoupons`) mit `id=FOUNDERS_VIDEO_20`, `percent_off=20`, `duration=forever`.
- **Kein Impact auf Beta-Basic-Abo:** Preis-Lock 14,99€ läuft weiter über den bestehenden `PRO-FOUNDERS-24M`-Coupon in `create-checkout`; der neue Rabatt greift ausschließlich in `ai-video-purchase-credits`.
- **Idempotenz:** `revoke_founder_status` setzt `revoked_at` nur, wenn noch NULL. `is_founder_active` ist reine Read-Funktion.

## Betroffene Dateien

- Neu: 2 SQL-Migrationen (Spalten + Funktionen).
- Bearbeiten: `supabase/functions/ai-video-purchase-credits/index.ts`, `supabase/functions/admin-delete-user/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `supabase/migrations/*` für `claim_founders_slot`-Update.
- Neu (Client): `src/hooks/useFounderStatus.ts`.
- Bearbeiten (Client): `src/pages/Credits.tsx`, `src/components/credits/*` (Pack-Karten), `src/components/account/AdvancedTab.tsx` (+ Delete-Dialog-Seite) für den Warnhinweis.
- Stripe: einmaliger API-Call zum Anlegen des `FOUNDERS_VIDEO_20`-Coupons.
