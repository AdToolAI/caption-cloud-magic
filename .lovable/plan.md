# 🏪 Template-Marketplace mit Revenue-Share

User-generated Motion-Studio-Templates verkaufen sich gegen Credits. Creators verdienen 70%, Plattform 30%. Free-Templates landen sofort öffentlich, Premium muss durch Admin-Review.

---

## 1. Datenmodell (1 Migration)

### Erweiterung `motion_studio_templates`
- `creator_user_id uuid` (FK → auth.users) — wer hat es gebaut
- `marketplace_status text` — `draft` | `pending_review` | `published` | `rejected` | `unlisted`
- `pricing_type text` — `free` | `premium`
- `price_credits integer` (default 0) — z.B. 50–500
- `revenue_share_percent integer` (default 70) — Creator-Anteil (admin-tunable)
- `total_revenue_credits bigint` (default 0) — Lifetime Earnings
- `total_purchases integer` (default 0)
- `average_rating numeric(3,2)`, `total_ratings integer`
- `rejection_reason text`, `reviewed_by uuid`, `reviewed_at timestamptz`
- `published_at timestamptz`

### Neue Tabelle `template_purchases`
Kauf-Ledger (idempotent, ein Kauf pro User pro Template = lifetime access):
- `id`, `template_id`, `buyer_user_id`, `creator_user_id`
- `price_credits`, `creator_earned_credits`, `platform_fee_credits`
- `purchased_at`, `refunded_at`
- UNIQUE(`template_id`, `buyer_user_id`) — Re-Use ohne Doppelzahlung

### Neue Tabelle `template_ratings_marketplace`
- `template_id`, `user_id`, `rating (1–5)`, `review_text`, `created_at`
- UNIQUE(`template_id`, `user_id`)
- Trigger aktualisiert `average_rating`/`total_ratings` auf Template

### Neue Tabelle `creator_earnings_ledger`
Audit-Trail aller Credit-Gutschriften für Creator-Wallets:
- `creator_user_id`, `template_id`, `purchase_id`, `credits_earned`, `created_at`

### RLS-Policies
- **SELECT**: Templates mit `marketplace_status='published'` für alle authenticated; `draft`/`pending_review` nur für `creator_user_id` + Admins
- **INSERT** (Creator-Submit): `creator_user_id = auth.uid()`, `marketplace_status` muss `draft` oder `pending_review` sein
- **UPDATE** (eigene Drafts): nur `creator_user_id`, nur erlaubte Felder; Status-Sprünge via Edge-Function
- **Admin**: `has_role(auth.uid(), 'admin')` darf alles
- `template_purchases` SELECT: nur eigene Käufe oder Admin; INSERT nur via Edge-Function (RPC)

### DB-Funktion `purchase_template(template_id)` (SECURITY DEFINER)
Atomar:
1. Template laden, prüfen `published` + `pricing_type`
2. Existierenden Kauf prüfen → wenn vorhanden: no-op, return success
3. Free → Eintrag in `template_purchases` mit `0` Credits
4. Premium:
   - `wallets.balance >= price_credits` prüfen → sonst `INSUFFICIENT_CREDITS`
   - Buyer-Wallet `-price_credits`
   - Creator-Wallet `+round(price * revenue_share/100)` Credits
   - `template_purchases` Insert + `creator_earnings_ledger` Insert
   - `total_revenue_credits` + `total_purchases` updaten

---

## 2. Edge-Functions (4 neu)

### `submit-template-to-marketplace`
- Input: `templateId`, `pricingType`, `priceCredits` (validiert 0 oder 25–1000)
- Validiert: Creator besitzt Template, hat Thumbnail + Preview-Video, mind. 1 Scene
- `pricing_type='free'` → `marketplace_status='published'` + `published_at=now()` (Auto-Publish)
- `pricing_type='premium'` → `marketplace_status='pending_review'` (Admin-Queue)
- Sendet Notification an Creator (Toast „Eingereicht / Live")

### `review-marketplace-template` (Admin-only)
- Input: `templateId`, `decision: 'approve'|'reject'`, `rejectionReason?`
- Setzt `marketplace_status`, `reviewed_by`, `reviewed_at`
- Bei Approve: `published_at=now()`, optional Notification an Creator
- Bei Reject: speichert Grund, Creator kann editieren + erneut einreichen

### `purchase-marketplace-template`
- Wrapper um `purchase_template(template_id)` RPC
- Returnt Balance + Erfolg, Error-Codes für UI
- Triggert Realtime-Event für Creator-Dashboard

### `submit-template-rating`
- Input: `templateId`, `rating`, `reviewText?`
- Prüft: User hat Template gekauft (free zählt) ODER ist Creator nicht selbst
- Upsert in `template_ratings_marketplace`

---

## 3. Frontend

### A) Marketplace-Tab im Composer (`/video-composer` & Motion-Studio Templates-Hub)
Neue Komponente `MarketplaceTemplateGallery.tsx`:
- 3 Tabs: **Featured** | **Free** | **Premium**
- Filter: Use-Case, Style, Aspect-Ratio, Preis-Range, Min-Rating
- Sort: Trending (purchases letzte 7d), Top-Rated, Newest, Price ↑/↓
- Card-Erweiterung (`MarketplaceTemplateCard.tsx`):
  - Creator-Avatar + Name (klickbar → Creator-Profile)
  - Preis-Badge: 🎁 Free / 💎 50 Credits
  - ⭐ Rating + Anzahl Reviews
  - „Owned"-Badge wenn bereits gekauft
- Detail-Dialog (`TemplatePreviewDialog.tsx`):
  - Großer Preview-Player, Scene-Suggestions, Tags
  - Reviews-Liste, „Use Template" / „Buy for X Credits"-Button
  - Bei Free: Direkt-Use; bei Premium: Confirm-Dialog mit Wallet-Balance

### B) Creator-Studio (`/creator-studio`, neue Route)
- **My Templates**: Liste eigener Templates mit Status-Badge (Draft, In Review, Published, Rejected)
- **Submit Flow** (`SubmitTemplateDialog.tsx`):
  - Schritt 1: Template aus eigenen Drafts wählen (oder aus Composer-Briefing erstellen)
  - Schritt 2: Pricing — Toggle Free/Premium, bei Premium: Slider 25–1000 Credits + Earnings-Preview („Du verdienst pro Verkauf X Credits = Y Euro Wert")
  - Schritt 3: Preview-Check (Thumbnail, Beschreibung, Tags) → Submit
- **Earnings-Dashboard**:
  - Total Earned (Credits) + Lifetime Purchases
  - Chart: Earnings letzte 30 Tage (Recharts)
  - Tabelle: Top-performing Templates
  - Hinweis: „Verdienste werden direkt deinem Credit-Wallet gutgeschrieben"

### C) Admin Review-Queue (`/admin` → neuer Tab „Marketplace Review")
- Liste aller `pending_review`-Templates
- Inline Preview, Creator-Info, Vorgeschlagener Preis
- Buttons: Approve / Reject (mit Reason-Textarea)
- Filter: Pending / Recently Reviewed

### D) Sidebar/Nav
- Neuer Eintrag: 🏪 „Marketplace" → führt zur Gallery
- Im User-Menü: „Creator Studio"

---

## 4. Integration mit existierender Infrastruktur

- **Template-Use-Flow**: Beim Klick auf „Use Template" prüft `useApplyMarketplaceTemplate`-Hook erst `template_purchases` (oder free) → erst dann Briefing-Apply. Bestehende `useMotionStudioTemplates` bleibt für System-Templates.
- **Wallets**: Wir nutzen das existierende `wallets`-Table — keine separate Currency. Earnings sind regulär ausgebbare Credits (für AI-Generation, Renders etc.). Falls später Cash-Out gewünscht, kann ein „Withdrawal-Request"-Flow nachgerüstet werden.
- **Notifications**: Web-Push (existiert bereits) für „Template approved", „Neuer Verkauf", „Template rejected".
- **Realtime**: `template_purchases` zur `supabase_realtime` Publication für live Earnings-Updates im Creator-Dashboard.

---

## 5. Lokalisierung (DE/EN/ES)
~40 neue Keys in `src/lib/translations.ts` für Marketplace-UI, Submit-Flow, Earnings-Dashboard, Admin-Queue, Toast-Messages.

---

## 6. Memory
Neue Memory-Datei `mem://features/marketplace/template-revenue-share` mit den Eckdaten (70/30 Split, Tiered Approval, Credits als Currency) + Index-Update.

---

## Out of Scope (für Phase 2)
- Stripe-Connect-Cash-Out (Credits → echtes Geld)
- Template-Versioning & Update-Notifications für Käufer
- Affiliate-Links für Templates
- Bundle-Verkäufe (mehrere Templates als Pack)
- Refund-Flow (manuell via Admin reicht erstmal)

---

## Geschätzter Umfang
- 1 SQL-Migration (3 neue Tabellen + Spalten + RLS + RPC)
- 4 neue Edge-Functions
- ~8 neue Frontend-Komponenten + 1 neue Route + Admin-Tab
- 1 neuer Hook (`useMarketplaceTemplates`, `useTemplatePurchase`, `useCreatorEarnings`)
- Lokalisierung + Memory

Soll ich loslegen?
