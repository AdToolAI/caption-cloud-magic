## Was bereits getrackt wird (Bestand)

- **Auth/Onboarding:** signup, onboarding_step_completed, onboarding_finished
- **Content:** post_generated, caption_copied, campaign_generated, first_post_scheduled
- **Brand:** brand_kit_created/deleted
- **Calendar:** calendar_viewed
- **Monetization:** upgrade_clicked, upgrade_prompt_shown/dismissed
- **Power-Feature-Counter:** nur `directors_cut` und `video_composer`
- **Edge-Functions:** generische `edge_fn_call`-Telemetry vorhanden

## Lücken, die wir schließen sollten

### 1. Payments / Conversion-Funnel (höchste Priorität)
Aktuell wird nur `upgrade_clicked` getrackt – wir sehen nicht, wo User in Stripe abspringen.
- `checkout_started` (in `create-checkout` + `create-enterprise-checkout` Edge Function via `trackBusinessEvent`, mit plan_code, coupon, founders_slot)
- `checkout_completed` (success-Page → ruft check-subscription, dann Event mit plan, amount, payment_method)
- `checkout_abandoned` (cancel-Page Hit)
- `payment_method_selected` (Card / PayPal / Apple / Google – aus Stripe Webhook oder check-subscription)
- `coupon_applied` / `coupon_invalid` (URL-Coupon Hook)
- `founders_slot_claimed`
- `subscription_cancelled`, `subscription_renewed`, `subscription_upgraded/downgraded`
- `trial_started`, `trial_converted`, `trial_expired`

### 2. Power-Features (PowerFeatureKey erweitern)
`PowerFeatureKey` enthält nur 3 Keys – fast alle Studios fehlen für die Discovery-Logik:
- `picture_studio`, `ai_video_toolkit`, `talking_head`, `music_studio`, `motion_studio`, `email_director`, `ad_director`, `autopilot`, `brand_characters`, `marketplace`, `news_hub`, `trend_radar`, `video_translator`, `magic_edit`, `upscaler`, `sora_long_form`

Jede dieser Pages bekommt `useEffect(() => trackFeatureUsage('xxx'))` analog zu DirectorsCut.

### 3. Generation-Events pro Provider
Wir sehen aktuell keinen Provider-Mix in PostHog (nur DB-Logs):
- `video_generated` mit `{ provider, model, duration_s, credits_spent, success }`
- `image_generated` mit `{ provider, model, mode: text2img|edit|upscale|variation }`
- `music_generated` mit `{ tier, duration_s }`
- `voiceover_generated` mit `{ voice_id, language, char_count }`
- `talking_head_generated`
- `render_failed_with_refund` (Credit-Refund-Trigger)

### 4. Social Publishing
Nur `publish` mit Plattform-Name existiert.
- `social_connected` / `social_disconnected` pro Plattform
- `social_publish_success` / `social_publish_failed` mit error_code
- `scheduled_post_executed`
- `social_token_expired` (für Reconnect-UX)

### 5. Engagement / Retention Signals
- `feature_first_use` (einmal pro User pro Feature – wichtig für Activation-Funnel)
- `session_started` / `session_ended` (Dauer)
- `tutorial_started` / `tutorial_completed` / `tutorial_skipped`
- `streak_milestone` (3, 7, 30 Tage)
- `welcome_bonus_claimed`

### 6. Errors & Friction (für Bond-QA-Korrelation)
- `error_shown_to_user` (Toast/Modal mit error_type)
- `credit_insufficient` (welches Feature, wieviel fehlt → starkes Upgrade-Signal)
- `rate_limit_hit_client` (UI-seitig, ergänzt server-side)
- `quota_warning_shown` (Storage/Credits 80%/95%)

### 7. Marketplace
- `character_purchased` (mit price, creator_id)
- `character_listed` / `character_takedown`
- `marketplace_search`

## Empfohlene Reihenfolge

**Phase 1 (jetzt, höchster ROI):** Payments-Funnel komplett (1) + Power-Feature-Keys erweitern (2). Damit sehen wir endlich Conversion + welche Studios überhaupt benutzt werden.

**Phase 2:** Generation-Events pro Provider (3) + Social (4). Liefert Daten für Cost-Optimization und Provider-Auswahl.

**Phase 3:** Engagement (5), Errors (6), Marketplace (7).

## Technische Umsetzung

- **Frontend:** `trackEvent()` aus `@/lib/analytics` (PostHog) + `trackFeatureUsage()` für Counter
- **Edge Functions:** `trackBusinessEvent()` aus `supabase/functions/_shared/telemetry.ts` (PostHog Server-Side)
- **Neue Konstanten in `ANALYTICS_EVENTS`** (analytics.ts) für Type-Safety
- **`PowerFeatureKey`-Union erweitern** in `src/lib/featureUsageTracker.ts` + RPC `increment_feature_usage` ist bereits generisch
- **Keine DB-Migration nötig** für PostHog-Events; nur für `feature_usage`-Counter falls neue Keys ergänzt werden (Tabelle ist bereits key-agnostisch laut RPC)
- **Stripe-Checkout-Funnel:** Events in `create-checkout/index.ts`, success/cancel Routes (`/success`, `/cancel`), und im Webhook (falls aktiv) bzw. in `check-subscription` beim ersten Detect

## Empfehlung

Ich würde **Phase 1 sofort umsetzen** – das sind ~6-8 Datei-Edits und liefert dir den Payment-Funnel, den du nach den Stripe-Änderungen jetzt brauchst, plus Sichtbarkeit über alle Studios. Phase 2+3 können wir danach in separaten Runden machen.

Soll ich mit Phase 1 loslegen, oder willst du eine andere Reihenfolge / nur bestimmte Punkte?