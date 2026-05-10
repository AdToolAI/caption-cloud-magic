## Phase 6 — Catalog & License Layer (Artlist-Parität)

Ziel: Die letzten ~30 % Library-Lücke zu Artlist schließen. AI-Creation bleibt unser Vorsprung — Phase 6 baut die **kuratierte / lizenzierte Asset-Seite** und **Compliance-Layer** dazu.

---

### Phase 6.1 — SFX Library

**Was:** Browse-bare Sound-Effects-Bibliothek (Schritte, Whoosh, Impacts, UI-Sounds, Ambience).

**Quellen (Tier-Mix):**
- **Free Tier**: Pixabay SFX API (CC0, ~50k Files) + Freesound.org API (CC-BY/CC0)
- **Pro Tier (später)**: optionaler Storyblocks-Plug

**Features:**
- Suche + Tags (Kategorie, Stimmung, Dauer, BPM)
- Inline-Waveform-Player (peaks.js)
- "Use in Composer" → fügt SFX als Audio-Layer in aktive Szene
- "Use in Director's Cut" → fügt zu Audio-Track hinzu
- Favoriten + Recently Used pro User

**Tech:**
- Neue Tabelle `sfx_library_cache` (24h TTL wie Stock)
- Edge Function `search-sfx-library` (Pixabay + Freesound parallel)
- Route `/sfx-library` + Tab in Composer/DC SidePanel

---

### Phase 6.2 — License Certificate System

**Was:** Pro Asset (AI-Generation, Stock, Music, SFX, Character) ein PDF-Lizenz-Zertifikat mit Asset-ID, Käufer, Source, erlaubten Nutzungen, Verifikations-URL.

**DB:**
- `license_certificates` Tabelle (asset_id, asset_type, user_id, source_provider, license_terms_jsonb, pdf_url, verify_token, issued_at)
- View `asset_provenance` joint über alle Asset-Tabellen

**Edge Functions:**
- `issue-license-certificate` — generiert PDF via `pdf-lib`, speichert in `license-certificates` Bucket (privat, signed URLs)
- `verify-license-certificate` — public Route `/verify/:token` zeigt Lizenz-Status

**Provider-TOS-Mapping** (statisches JSON in Repo):
```
ai-music (Replicate) → Commercial OK, no resale of model weights
ai-video (Replicate) → Commercial OK, attribution optional
pexels-stock → Pexels License (commercial OK, no standalone resale)
pixabay-stock → Pixabay Content License
brand-character → User-owned (eigene Generation)
marketplace-character → 70/30 share, käufer-spezifische Lizenz aus character_licenses
```

**UI:**
- "Download License" Button auf jedem Asset (Media Library, Composer-Asset-Card, DC-Timeline-Item)
- Account → "My Licenses" Tab (alle ausgestellten Zertifikate)
- Bulk-Download als ZIP für ein Projekt

**Scope-Limit (wichtig):**
- Wir indemnify NICHT bis 1M $ wie Artlist. Cert sagt explizit "License pass-through from {provider} + Lovable best-effort guarantee"
- Master License Agreement Template wird als separates Markdown im Repo abgelegt — der User holt sich juristische Freigabe

---

### Phase 6.3 — Premium Stock Tier (optional, gated)

**Was:** Storyblocks-API als Premium-Source neben Pexels/Pixabay.

**Bedingung:** User selbst entscheidet ob er Storyblocks-Reseller-Vertrag abschließt. Wir bauen die Integration; aktivieren sich automatisch sobald `STORYBLOCKS_API_KEY` gesetzt.

**Features:**
- Toggle "Free / Premium" im Stock-Library-Tab
- Premium-Items zeigen Preis-Badge + "Add to Project (€2.50 credits)"
- Edge Function `search-storyblocks` mit Reseller-Auth
- Beim Add → automatisch License-Cert (Phase 6.2) ausgestellt

**Falls Reseller-Vertrag (noch) nicht da:** Phase 6.3 bleibt als Dark-Feature (Code da, Toggle versteckt bis API-Key gesetzt)

---

### Reihenfolge & Zeit

1. **6.1 SFX Library** (~1 Tag) — sofort nutzbar, kein Vertrag nötig
2. **6.2 License Certificates** (~1.5 Tage) — größter Compliance-Hebel
3. **6.3 Premium Stock** (~0.5 Tag Code, blockiert auf Reseller-Vertrag)

**Nicht in Phase 6** (eigene spätere Phasen):
- Mobile Companion App (Phase 7)
- NLE-Plugins für Premiere/DaVinci (Phase 8)
- Curated Playlists / Editor Picks (Phase 9 — braucht Editorial-Team)

---

### Was wir nach Phase 6 haben

- AI-Creation: **deutlich über Artlist** (11 Video-Provider, Music-Studio, Marketplace, Composer, DC)
- Catalog: **gleichauf** (SFX ✓, Stock Free+Premium ✓, AI-Music statt Sync-Music)
- Compliance: **vergleichbar** (License-Certs pro Asset, audit-trail, verify-URL)
- Lücke bleibt: Sync-Music-Katalog (juristisch + finanziell außerhalb Scope), NLE-Plugins, Mobile App

Soll ich mit **6.1 SFX Library** starten sobald approved?