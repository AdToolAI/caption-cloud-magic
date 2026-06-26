## Creator Library Bundle — Gratis-Inklusion in allen Paid-Plans

Positioniert sich frontal gegen Artlist (€30/mo). Marginal-Kosten für uns ~€0, weil wir 100% auf bestehende kostenfreie Provider-APIs setzen, die schon integriert sind.

### Strategisches Ziel
- "In jedem Paid-Plan inklusive: 10M+ Stock Videos, Photos, SFX & Music — mit Lizenzzertifikat."
- Pricing-Page-Battle gegen Artlist: ein vergleichbares Asset-Bundle gratis dazu, plus AI-Video-Gen.
- Trial-Conversion-Hebel: User sieht "über €360/Jahr Asset-Value inklusive".

### Was bereits existiert (keine Doppel-Arbeit)
- `/stock-videos` (Pexels + Pixabay, 24h Cache, 6 Collections, 4K/HD-Filter, sessionStorage-Handoff)
- `/sfx-library` (Pixabay + Freesound, 24h Cache, Favoriten in `user_audio_library`)
- `/music-studio` (Stable Audio 2.5 + MiniMax — Generierung, kein Library-Browser)
- License-Cert-System (`issue-license-certificate` edge function, `license_certificates` Tabelle, public `/verify/:token`)
- Stock-Photos im Picture-Studio teilweise

### Was wir bauen

#### 1. Unified Library Hub `/library` (neue Page)
Ein einziger Einstiegspunkt mit 4 Tabs, der die existierenden Module bündelt und als "Creator Library" verkauft:
- **Videos** (wraps Stock-Videos)
- **Photos** (neu: Pexels/Pixabay Photos Live-Suche + 24h Cache in `stock_search_cache`)
- **SFX** (wraps SFX-Library)
- **Music** (neu: kuratierte Library aus Pixabay Music + Freesound CC-BY; AI-Music-Gen bleibt separat im Music Studio)

Unified Such-Bar oben, Cross-Type-Results, "Use in Composer / DC / Picture Studio"-Buttons über sessionStorage-Handoff (Pattern existiert).

#### 2. Stock-Photos-Library (neue Komponente, kein neuer Provider-Key)
- Pexels + Pixabay Photos API (beide kostenfrei, beide schon verwendet → API-Keys vorhanden)
- 24h Cache in existierender `stock_search_cache` Tabelle (Type-Discriminator hinzufügen)
- Filter: Orientation, Color, Min-Resolution
- "Use in Picture Studio" / "Use as Reference" / "Save to Library"

#### 3. Music-Library-Browser (neue Komponente)
- Pixabay Music API + Freesound Music-Pack (beide gratis)
- 24h Cache in `sfx_library_cache` (Type-Spalte erweitern: `sfx | music`)
- Mood-Filter (Energetic, Chill, Cinematic, …), BPM, Duration, Genre
- Waveform-Preview, In/Out-Trim, "Use in DC / Composer"

#### 4. Plan-Gate-Logik
- Free-Plan: 10 Downloads/Monat (Quota in `user_audio_library` + `user_video_library` zählen)
- Starter+: Unlimited
- Sanftes Upsell-Modal bei Free-User über Limit

#### 5. Auto-License-Cert bei Download
- Jeder Download triggert `issue-license-certificate` mit korrekter Source-Lizenz (Pexels-License / Pixabay-License / Freesound CC)
- Cert in `/my-licenses` sichtbar, PDF mit QR-Code, public `/verify/:token`

#### 6. Pricing-Page-Update
- "Creator Library Bundle" als prominentes Feature-Bullet bei allen Paid-Plans
- Side-by-Side-Vergleichstabelle vs. Artlist (€30/mo) → "inklusive in Starter (€19/mo)"

### Kosten-Realität für uns
| Komponente | Pro Request | Pro 1000 Users/Monat |
|---|---|---|
| Pexels API | €0 | €0 |
| Pixabay API | €0 | €0 |
| Freesound API | €0 (Attribution) | €0 |
| Storage (nur Favoriten-Thumbs) | Cloud-Quote | <€2 |
| License-PDF Generierung | pdf-lib lokal | €0 |
| **Total Grenzkosten** | | **~€2 / Monat / 1000 User** |

Risiko: Rate-Limits der freien APIs (Pexels 200 req/h, Pixabay 100 req/min). Mitigation: existierender 24h-Cache + serverseitiges Edge-Caching, kein Direct-Browser-to-Provider-Call.

### Was NICHT in Scope ist
- AI-Music-Generierung bleibt metered (Music Studio existiert getrennt)
- Premium-Stock-Quellen (Artgrid, Storyblocks) — später als Standalone-Add-On
- Eigene proprietäre Music-Library — viel zu teuer (Lizenzkosten 5-stellig pro Track)

### Technische Details
- Neue Migration: `stock_search_cache` bekommt `media_type ENUM('video', 'photo')`; `sfx_library_cache` bekommt `track_type ENUM('sfx', 'music')`
- Neue Edge Functions: `search-stock-photos`, `search-library-music` (beide nutzen existierende Provider-Keys, beide mit 24h Cache + Quota-Check)
- Neue Komponenten: `src/pages/Library.tsx` (Hub), `src/components/library/{PhotoBrowser,MusicBrowser,LibrarySearchBar,DownloadQuotaIndicator}.tsx`
- Sidebar-Hub `erstellen`: neuer Eintrag "Creator Library" → `/library`
- License-Auto-Issue: Bestehende `issue-license-certificate` um neue `source_provider` Werte erweitern (pexels-photo, pixabay-photo, freesound-music, pixabay-music)
- Plan-Gate: `useDownloadQuota()` Hook prüft monatliche Downloads gegen Plan-Limit aus `billing_plans`

### Reihenfolge der Umsetzung
1. DB-Migration (Cache-Tables erweitern, evtl. `library_downloads_monthly` View)
2. Edge Functions `search-stock-photos` + `search-library-music` mit Cache
3. Library-Hub `/library` + 4 Tab-Komponenten
4. Auto-License-Cert-Hook bei Download
5. Plan-Gate + Quota-UI
6. Sidebar-Eintrag + Pricing-Page-Update

Erwarteter Aufwand: 2–3 Tage. Danach `Skit Templates`.