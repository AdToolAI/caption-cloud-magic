# Character Marketplace — Plan

Erweitert das bestehende Marketplace-Konzept (`/marketplace`, 70/30 Revenue Share) um **Brand Characters / Avatars**. Höchste Priorität: **rechtliche Absicherung** gegen Persönlichkeitsrechts-, DSGVO- und Urheberrechtsverletzungen.

## Rechtliches Schutzkonzept (Kern)

### 1. Strenge Origin-Wall beim Submit
Jeder zum Marketplace eingereichte Charakter MUSS genau **eine** Origin-Kategorie deklarieren:

- **`ai_generated`** (empfohlener Standardweg) — Charakter wurde mit einem AI-Bildgenerator erstellt. Creator wählt Tool aus Liste (Picture Studio, Midjourney, DALL·E, Flux, andere) und bestätigt per Checkbox: "Diese Person existiert nicht real."
- **`licensed_real_person`** — echte Person. **Pflicht-Upload eines Model-Release-PDF** in privaten Bucket `character-licenses` (nur Admins + Creator lesbar). Plus: Vollständiger Name der Person, Land, Gültigkeits-Zeitraum, optional E-Mail der Person für Verification.
- **`self_portrait`** — Creator ist die Person selbst. Selfie-Verification (Liveness-Check via Foto-Vergleich gegen Account-Profil), Identitäts-Bestätigung.

Ohne gültige Origin-Deklaration → Submit blockiert (Edge Function rejected).

### 2. Verbindliche Creator-Verträge
Mehrstufige Checkbox-Wall im Submit-Dialog (alle einzeln zu bestätigen, gespeichert mit Timestamp + IP-Hash + User-Agent in `character_marketplace_consents`):

1. Ich besitze alle Rechte am Bild- und Stimmenmaterial.
2. Falls echte Person: Ich habe ein gültiges Model-Release inkl. Recht zur kommerziellen Sub-Lizenzierung.
3. Charakter zeigt keine reale Person des öffentlichen Lebens (Politiker, Promis, Markenfiguren) ohne explizite schriftliche Genehmigung.
4. Charakter ist nicht minderjährig dargestellt.
5. Ich akzeptiere die **Creator Terms** (eigene Seite `/legal/marketplace-creator-terms`) inkl. Haftungsfreistellung der Plattform.
6. Bei Falschangaben: vollständige Haftung + Account-Sperre + sofortiges Take-Down + Rückzahlung aller verdienten Credits.

### 3. Käufer-Lizenz (separate Akzeptanz)
Beim Kauf akzeptiert der Käufer eine **Buyer License** (`/legal/marketplace-buyer-terms`) mit:
- Erlaubt: kommerzielle Nutzung in eigenen Videos, Anzeigen, Social Media.
- Verboten: Weiterverkauf des nackten Charakters, Erstellung von Deepfakes realer Personen, illegale/diffamierende Inhalte, Adult-Content (außer Charakter explizit so getaggt + Käufer 18+ verifiziert — V2).
- Käufer trägt eigenständige Verantwortung für Output-Compliance (EU AI Act Kennzeichnung, DSGVO).
- Lizenz-Akzeptanz wird in `character_purchases.license_accepted_at` + Snapshot der Lizenz-Version gespeichert.

### 4. Admin-Dual-Review (Premium + Real Persons)
- **Free + AI-Generated** → Auto-Publish nach Submit (wie heute bei Free-Templates).
- **Premium ODER `licensed_real_person`/`self_portrait`** → Pflicht-Review durch Admin. Admin sieht Origin-Deklaration, ggf. Model-Release-PDF (signed URL, 1h gültig), Charakter-Preview. Approve / Reject mit Reason.

### 5. DMCA / Take-Down Workflow
- Öffentlicher Report-Button auf jeder Character Detail Page → Modal mit Reason (`impersonation`, `copyright`, `minor`, `deepfake`, `other`) + Beschreibung + Reporter-E-Mail.
- Speichert in `character_marketplace_reports`. Bei Eingang: Charakter automatisch in Status `under_investigation` (in Library + Marketplace ausgeblendet, bestehende Käufer behalten Zugriff vorerst).
- Admin-Queue mit Entscheidung: `dismiss`, `unlist`, `permanent_remove` (letzteres sperrt auch alle Käufer-Verwendungen + automatischer Refund per Credit-RPC).

### 6. Daten-Minimierung & Rechte der abgebildeten Person
- Model-Release-PDFs werden **nicht** im AI-Pipeline-Kontext, nur in privatem Storage, mit Verschlüsselung at-rest (Supabase Standard).
- Eigener Endpunkt: "Bin ich auf einem Marketplace-Charakter abgebildet?" (`/legal/character-takedown-request`) für Betroffene, ohne Account.

## Datenbank-Schema

Spiegelt die `motion_studio_templates`-Marketplace-Säule auf `brand_characters`:

```sql
-- 1) Marketplace-Spalten auf brand_characters
ALTER TABLE brand_characters
  ADD COLUMN marketplace_status text NOT NULL DEFAULT 'private'
    CHECK (marketplace_status IN ('private','draft','pending_review','published','rejected','unlisted','under_investigation','permanent_removed')),
  ADD COLUMN pricing_type text NOT NULL DEFAULT 'free'
    CHECK (pricing_type IN ('free','premium')),
  ADD COLUMN price_credits integer NOT NULL DEFAULT 0
    CHECK (price_credits >= 0 AND price_credits <= 5000),
  ADD COLUMN revenue_share_percent integer NOT NULL DEFAULT 70,
  ADD COLUMN total_revenue_credits bigint NOT NULL DEFAULT 0,
  ADD COLUMN total_purchases integer NOT NULL DEFAULT 0,
  ADD COLUMN average_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN total_ratings integer NOT NULL DEFAULT 0,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN rejection_reason text,
  ADD COLUMN origin_type text
    CHECK (origin_type IN ('ai_generated','licensed_real_person','self_portrait')),
  ADD COLUMN origin_metadata jsonb NOT NULL DEFAULT '{}',  -- AI-Tool, Person-Name etc.
  ADD COLUMN license_release_path text,                     -- Pfad in private bucket
  ADD COLUMN nsfw_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN sample_video_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN voice_sample_url text,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

-- 2) Käufe
CREATE TABLE character_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES brand_characters(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  price_credits int NOT NULL DEFAULT 0,
  creator_earned_credits int NOT NULL DEFAULT 0,
  platform_fee_credits int NOT NULL DEFAULT 0,
  pricing_type text NOT NULL CHECK (pricing_type IN ('free','premium')),
  license_version text NOT NULL,           -- z.B. 'v1-2026-04-29'
  license_accepted_at timestamptz NOT NULL DEFAULT now(),
  license_ip_hash text,                    -- sha256(ip+salt)
  purchased_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  UNIQUE (character_id, buyer_user_id)
);

-- 3) Consent-Audit-Log (Creator)
CREATE TABLE character_marketplace_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES brand_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consents jsonb NOT NULL,                 -- {ownership:true, model_release:true, ...}
  legal_version text NOT NULL,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) DMCA / Reports
CREATE TABLE character_marketplace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES brand_characters(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email text,
  reason text NOT NULL CHECK (reason IN ('impersonation','copyright','minor','deepfake','nsfw','other')),
  description text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','dismissed','unlisted','permanent_removed')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5) Bewertungen
CREATE TABLE character_marketplace_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES brand_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, user_id)
);
```

**Buyer-Earnings:** wiederverwendet vorhandene `creator_earnings_ledger` (template_id wird nullable belassen, neuer optionaler `character_id` per ALTER hinzufügen).

**Storage-Bucket:** `character-licenses` (private, RLS: nur Owner + Admins read; Pfad: `{user_id}/{character_id}/release.pdf`).

**RLS-Policies (Auszug):**
- `brand_characters` SELECT: bestehende Policy + neue Policy "marketplace_status = 'published' read by all authenticated".
- `character_purchases` INSERT: nur via Edge Function (RPC).
- Käufer kann gekauften Charakter wie eigenen verwenden (View `my_accessible_characters` UNION zwischen owned und purchased).

## Edge Functions

1. **`submit-character-to-marketplace`** — validiert Origin-Wall, prüft Consents, schreibt License-Release-Path bei Real-Person, setzt Status (`published` für Free+AI / `pending_review` sonst), schreibt Audit in `character_marketplace_consents`.
2. **`purchase-marketplace-character`** — neue RPC `purchase_character` analog zu `purchase_template`: Wallet-Debit, Creator-Credit + Ledger, License-Akzeptanz mit Snapshot.
3. **`review-marketplace-character`** — Admin-only; approve/reject mit Reason, signed URL für Release-PDF.
4. **`report-marketplace-character`** — public (auch ohne Auth über E-Mail), schreibt Report + setzt Charakter auf `under_investigation` falls Severity high.
5. **`takedown-marketplace-character`** — Admin: führt `permanent_removed` durch + automatischer Refund aller offenen Käufe via Credit-RPC.

## Frontend

### Marketplace-Tabs
`/marketplace` bekommt **Tab-Bar** auf oberster Ebene: `Templates | Characters | (Snippets später)`. Aktueller Inhalt wandert in Tab "Templates".

### Neue Komponenten
- `CharacterMarketplaceGallery.tsx` — Grid mit Portrait, Name, Origin-Badge ("AI-Generated" / "Real Person ✓ Licensed"), Sample-Video-Hover, Voice-Tag, Preis.
- `CharacterMarketplaceCard.tsx` — Karte mit gleichen 70/30-Hinweisen wie Template-Card.
- `CharacterDetailDialog.tsx` — Portrait, Voice-Sample-Player, 2–3 Sample-Videos, Tags, Creator-Profil, Report-Button, Buy-Button.
- `SubmitCharacterToMarketplaceDialog.tsx` — **Multi-Step Wizard:**
  1. Pricing (Free / Premium + Preis-Slider 25–1000).
  2. Origin-Wall (Radio + dynamisches Formular).
  3. Sample-Videos generieren oder hochladen (max 3).
  4. Legal-Checkboxes (6 Stück, jede einzeln pflicht).
  5. Review & Submit.
- `CharacterReportDialog.tsx` — Report-Modal.
- `BuyerLicenseAcceptDialog.tsx` — vor Kauf, scrollbarer Lizenztext + Pflicht-Checkbox.

### Brand Characters Page (`/brand-characters`)
- Neue Spalte "Marketplace" pro Karte: "Im Marketplace anbieten" / "Status: Pending Review" / "Published — €X verdient".
- Eigener Tab "Purchased Characters" listet zugekaufte Charaktere (read-only Origin, normale Verwendung).

### Admin (`/admin`)
Neuer Tab **Character Reviews** mit drei Sub-Listen:
- Pending Reviews (Submit-Queue)
- Open Reports (DMCA-Queue)
- Permanent Removals Log

### Legal Pages
- `/legal/marketplace-creator-terms` — vollständiger Vertrag, Versionierung im Footer.
- `/legal/marketplace-buyer-terms`
- `/legal/character-takedown-request` — public Form, kein Login nötig.

## Integration in bestehende Module

Gekaufte Charaktere erscheinen in:
- AI Video Toolkit (Brand-Character-Picker)
- Composer (Brand Character Lock Auto-Inject)
- Director's Cut TalkingHead-Dialog
- Avatar Library `/avatars`

Dafür Helper `useAccessibleCharacters()` (UNION owned + purchased) ersetzt punktuell `useBrandCharacters()`.

## Out of Scope (Phase 2)
- Adult-Content-Tagging + 18+ Verification
- Voice-only Marketplace (separate von Charakteren)
- Affiliate-Boost: höhere Revenue-Shares für Top-Creator
- Stripe-Auszahlung verdienter Credits in echtes Geld

## Reihenfolge Implementierung
1. DB-Migration (Tabellen + RLS + RPC `purchase_character`)
2. Storage-Bucket `character-licenses` + Policies
3. Edge Functions (5 Stück)
4. Legal Pages + Versionierung
5. Submit-Wizard + Origin-Wall
6. Marketplace-Tab + Gallery + Detail-Dialog + Buyer-License-Dialog
7. Brand-Characters-Page Marketplace-Aktionen
8. Admin Review + Reports Queue
9. Integration `useAccessibleCharacters` in Toolkit/Composer/TalkingHead
10. Memory-Update + README-Eintrag

Soll ich starten?
