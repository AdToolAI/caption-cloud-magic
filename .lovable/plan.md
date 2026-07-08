# Launch Readiness – Fortschritt

Phasen 1–3 (Pricing / Marketing / Feature-Gating) ✅
Phase 4.1 (Founders-Slot RPC) ✅ – atomarer `claim_founders_slot`, advisory lock, unique index
Phase 4.3 (Zentrale Stripe-Config) ✅ – `_shared/stripe-config.ts`
Phase 5.1 (Community-RLS) ✅ – Kontrolle: existierende Community-Tabellen (`community_channels`, `community_messages`, `community_message_tags`, `community_audit_log`, `direct_messages`) sind bereits ausschließlich für `authenticated` konfiguriert; keine `USING (true)` gegen `public` mehr offen. Kein Migrations-Bedarf.
Phase 4.2 (Teil 1) ✅ – Shared `_shared/timeout.ts` mit `withTimeout` + `fetchWithTimeout`. Angewendet auf:
  - `generate-ai-video` → Replicate-SDK-Call mit 30s Timeout, 504 + Credit-Refund
  - `generate-studio-image` → AI-Gateway-Fetch mit 90s Timeout pro Modell/Attempt
  - `refine-asset-photo` → AI-Gateway-Fetch mit 90s Timeout pro Modell/Attempt

## Noch offen

### Phase 4.2 – restliche AI-Functions
Die grossen Composer-/Render-Pipelines haben eigene Webhook-Refund-Loops
(siehe `compose-clip-webhook` Retry-Resilience) und brauchen kein
zusätzliches `AbortController`-Wrapping am Dispatch-Punkt. Beobachten,
ob bei `render-directors-cut` und `lipsync-*` Hänger auftreten – dann
Case-by-Case den externen Fetch mit `fetchWithTimeout` umhüllen.

### Phase 4.4 – Picture Studio UnifiedAssetPicker
UI-Refactor auf globalen Picker inkl. `brand-uploads`-Bucket.

### Phase 5.2 – Auth Fail Audit
Fehlerpfade durchspielen (Passwort, Token, Paused Account), einheitliche
Toasts + Redirects nach `/auth`.

### Phase 5.3 – Halbfertige Bereiche verstecken
`oauthComingSoon`-Buttons hinter `BETA_ACTIVE`-Flag, Admin-Routen doppelt
absichern (Frontend + Edge via `has_role`).

### Phase 5.4 – Beta-Beobachtbarkeit
PostHog-Events (`beta_signup`, `founders_slot_claimed`, `feature_gate_hit`,
`credit_refund_triggered`) und Admin-Dashboard-Kachel "Beta Health".
