## Phase 6.2 — License Certificate System

### Antwort auf deine Frage zuerst

**Ja — wir orientieren uns 1:1 an etablierten Anbietern, kein Anwalt nötig für MVP.**

Recherche ergab klare Industrie-Standards (Envato, Artlist, Epidemic Sound, Storyblocks):

**Standard-Felder eines Lizenz-Zertifikats** (kommen bei allen Anbietern vor):
1. **Item / Asset Name** + **Asset ID** (eindeutig)
2. **Source-URL** (Link zum Original-Asset im Provider-System)
3. **License Type** (Personal / Commercial / Pro / Broadcast)
4. **Licensee** (Name + E-Mail des Käufers/Users)
5. **Issued Date** + **Purchase/Transaction Code** (eindeutige Verifikations-ID)
6. **Permitted Uses** (kurze Liste: web, social, paid ads, broadcast, merch)
7. **Restrictions** (kurze Liste: no resale, no standalone redistribution)
8. **Attribution requirement** (yes/no)
9. **Verify-URL** (Public Page wo man Echtheit prüfen kann)
10. **Provider Source** + **Original License Reference** (z.B. "Pixabay Content License v1.2", "Replicate Terms §5")

→ Die **License-Terms selbst** (was darf / was nicht) **kopieren wir nicht** vom Provider — wir **referenzieren** den Provider-License-Text per Link/Versionsnummer (das machen Envato & Storyblocks auch). So bleiben wir juristisch sauber: wir behaupten nichts, was nicht der Original-Provider sagt; wir bündeln nur sein Statement in einem schönen PDF mit unserer Asset-ID + Käufer-Identität.

→ **Eigene Liability/Indemnification:** wir kopieren Envato-Wording sinngemäß: *"This certificate confirms the user's right to use the asset under {provider}'s published license. Lovable acts as facilitator and warrants the integrity of asset metadata, but assumes no liability for third-party claims arising from the underlying generation/source provider."* — das ist Standard für AI-Aggregator-Plattformen 2026.

Damit brauchst du **keinen Anwalt** für Phase 6.2. Empfohlen wäre ein Review erst, wenn ihr eine eigene **Indemnification-Garantie** wie Artlist (1M $) anbieten wollt — dafür braucht ihr Versicherung, das ist außerhalb dieser Phase.

---

### Was wir bauen

**1. DB-Schicht**

```text
license_certificates (
  id uuid PK,
  user_id uuid,
  certificate_number text UNIQUE,    -- z.B. "LVB-2026-A8F3K2"
  asset_type text,                   -- 'ai-video' | 'ai-image' | 'ai-music' | 'ai-sfx' |
                                     --  'stock-video' | 'stock-image' | 'stock-sfx' |
                                     --  'character' | 'voiceover'
  asset_id text,                     -- ID im Source-System
  asset_title text,
  asset_thumbnail_url text,
  asset_source_url text,
  source_provider text,              -- 'lovable-ai-video', 'pixabay', 'freesound',
                                     -- 'pexels', 'replicate-music', 'marketplace', 'heygen'
  provider_license_name text,        -- 'Pixabay Content License v1.2'
  provider_license_url text,         -- offizieller Link zum Original-License-Text
  license_tier text,                 -- 'personal' | 'commercial' | 'pro'
  permitted_uses text[],             -- ['web','social','paid_ads','broadcast','print']
  restrictions text[],
  attribution_required bool,
  verify_token text UNIQUE,          -- random 32 chars für public verify-URL
  pdf_storage_path text,             -- regen-able, optional gespeichert
  metadata jsonb,                    -- frei, z.B. brand_kit_id, project_id
  issued_at timestamptz,
  revoked_at timestamptz             -- für Takedowns
);
```

RLS: User sieht nur eigene; Verify-Endpoint liest per `verify_token` (public, no-auth).

**2. Provider-TOS-Mapping** (statisches `_shared/license-mapping.ts`)

```text
pixabay         → "Pixabay Content License" (commercial OK, no resale of asset alone)
freesound       → "Creative Commons (varies by clip)" (attribution if CC-BY)
pexels          → "Pexels License" (commercial OK)
replicate-music → "Replicate Terms §5" (commercial OK, no model-weight resale)
replicate-video → "Replicate Terms §5" (commercial OK)
heygen          → "HeyGen Commercial Use Policy"
marketplace     → "Lovable Marketplace Buyer Terms" (mit Käufer-spezifischem Scope)
own-generation  → "User-Owned (Lovable AI Output)"
```

Jedes Mapping liefert: name, url, permitted_uses[], restrictions[], attribution_required.

**3. Edge Functions**

- `issue-license-certificate` — input: `{asset_type, asset_id, source_provider, ...metadata}` → erzeugt Cert-Row, generiert PDF via `pdf-lib`, lädt nach `license-certificates`-Bucket (private, signed URLs), gibt `{certificate_number, pdf_url, verify_url}` zurück.
- `verify-license-certificate` (public) — `GET ?token=...` → returnt Cert-Status `{valid, asset_title, issued_at, revoked, licensee_initials}` (NICHT volle Käufer-Identität, nur Initialen für Datenschutz)
- `bulk-issue-licenses` — für ganzes Composer/DC-Projekt: iteriert über alle Assets, erzeugt Certs, packt PDFs in ZIP

**4. PDF-Layout** (Bond-Design, A4)

```text
┌────────────────────────────────────────────────┐
│  [Lovable Gold Logo]      License Certificate  │
│                            #LVB-2026-A8F3K2     │
├────────────────────────────────────────────────┤
│  [Asset Thumbnail]                             │
│                                                │
│  Asset: "Cinematic Whoosh Transition"          │
│  Type:   AI Sound Effect                       │
│  Source: Pixabay (ID: 12345)                   │
│                                                │
│  Licensee: Markus M. (markus@example.com)      │
│  Issued:   May 10, 2026                        │
│  License Tier: Commercial                      │
├────────────────────────────────────────────────┤
│  ✓ Web & social media                          │
│  ✓ Paid advertising                            │
│  ✓ Client deliverables                         │
│  ✓ Broadcast & streaming                       │
│  ✗ Resale as standalone asset                  │
│  ✗ Use in trademarks/logos                     │
├────────────────────────────────────────────────┤
│  Source License: Pixabay Content License       │
│  → https://pixabay.com/service/license/        │
│                                                │
│  Verify authenticity:                          │
│  → useadtool.ai/verify/abc123xyz               │
│                                                │
│  [QR-Code zum Verify-URL]                      │
└────────────────────────────────────────────────┘
```

**5. UI-Integration**

- **Asset-Cards** bekommen einen "License" Button (Icon: `FileBadge2`):
  - Media Library (Videos, Images)
  - Music Studio output
  - SFX Library results & favorites
  - Composer scene assets
  - Director's Cut timeline items
- **Account → "My Licenses"** Tab — Liste aller Certs mit Filter (asset_type, date), Bulk-Download als ZIP, Re-Generate, Revoke
- **Public Verify Page** `/verify/:token` (no auth): zeigt grünes Häkchen + Asset-Snapshot + Ausstellungsdatum, oder rotes ✗ bei revoked/invalid

**6. Auto-Issue Hooks** (Convenience)

Nach jeder erfolgreichen Asset-Erstellung **automatisch** Cert ausstellen:
- Music Studio render done → cert
- Picture Studio generation done → cert  
- Marketplace character purchase → cert (zusätzlich zum existierenden License-PDF aus Marketplace-Flow)
- SFX Library "Use in Composer/DC" → cert

So sammelt der User automatisch eine Lizenz-Historie ohne Klick. Manueller Download bleibt jederzeit möglich.

---

### Storage & Bucket

Neuer Bucket `license-certificates`:
- private
- RLS: user_id = first folder segment
- PDFs werden generiert + gecacht; bei Re-Issue (Daten-Update) überschrieben

---

### Phasing innerhalb 6.2

| Step | Inhalt |
|------|--------|
| 6.2.a | Migration (`license_certificates` table + bucket + RLS) |
| 6.2.b | `issue-license-certificate` edge function + `_shared/license-mapping.ts` + PDF-Layout |
| 6.2.c | `verify-license-certificate` public edge + `/verify/:token` public Page |
| 6.2.d | UI: License-Button auf Asset-Cards (Media Library, Music Studio, SFX Library) |
| 6.2.e | Account → "My Licenses" Tab + Bulk-ZIP-Download |
| 6.2.f | Auto-Issue Hooks an 4 Stellen einhängen |

---

### Was diese Phase NICHT macht

- Keine eigene 1M-$-Indemnification-Garantie (braucht Versicherung)
- Keine Music-Sync-License im Artlist/Epidemic-Stil (wir lizenzieren keine Sync-Rechte ein)
- Keine YouTube-Content-ID-Whitelist-Integration (Epidemic-Spezialfeature, separater Vertrag mit YT nötig)

Diese drei Punkte können in **Phase 7+** kommen wenn du Versicherungspartner/YT-Partner hast.

---

### Was wir nach 6.2 haben

- Jedes Asset im System hat **on-demand** ein PDF-Lizenz-Zertifikat im Bond-Design  
- Public **Verify-URL** mit QR-Code → User kann Behörden/Plattformen Echtheit beweisen
- **My Licenses** Tab als zentrale Audit-Trail-Ansicht
- Compliance-Argument ggü. Enterprise-Kunden: "ja, wir liefern Lizenznachweise wie Envato/Storyblocks"

Nach 6.2 starten wir 6.3 (Premium Stock Tier, optional je nach Storyblocks-Reseller-Vertrag).

Approven für Implementation?