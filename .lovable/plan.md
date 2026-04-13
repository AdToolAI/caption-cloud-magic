

## AI Video Studio — Unified Hub Redesign (James Bond 2028)

### Konzept
Eine neue zentrale **Hub-Seite** (`/ai-video-studio`) im James Bond 2028 Stil, die als Einstiegspunkt für alle KI-Video-Anbieter dient. Die einzelnen Studios bleiben als separate Seiten bestehen, werden aber von der Hub aus navigiert.

### Struktur

```text
/ai-video-studio (Hub)
├── Hero-Header mit Titel, Wallet-Anzeige
├── Haftungsausschluss (Disclaimer-Banner)
├── 4 Provider-Karten im Bento-Grid:
│   ├── Sora 2 (OpenAI) → /ai-video-studio/generate
│   ├── Kling 3.0 (Kuaishou) → /kling-video-studio
│   ├── Seedance 2.0 (ByteDance) → /seedance-video-studio
│   └── Wan 2.5 (Wan Video) → /wan-video-studio
├── Unified Bibliothek (alle Anbieter)
└── Credits-Bereich
```

### Design (James Bond 2028)
- Glassmorphism-Karten mit `backdrop-blur`, `border-gold/20`
- Gold-Gradient-Akzente (#F5C76A → Cyan)
- Floating Particles im Hero
- Framer Motion Stagger-Animationen
- Hover: 3D-Neon-Glow-Lift auf den Provider-Karten

### Provider-Karten — Inhalt pro Anbieter
Jede Karte zeigt:
- **Name & Logo-Badge** (z.B. "Sora 2" mit "OpenAI" Badge)
- **Spezialisierung** (z.B. "Cinematic storytelling & artistic shots")
- **Preise** (von–bis pro Sekunde)
- **Max. Dauer** und **Qualität**
- **Verfügbare Modi** (Text-to-Video, Image-to-Video)
- CTA-Button → Link zum jeweiligen Studio

### Haftungsausschluss
Prominent platzierter Disclaimer mit Icon:
- Keine Haftung für generierte Inhalte
- KI-Videos müssen als solche gekennzeichnet werden
- Hinweis auf Urheberrecht und Nutzungsverantwortung
- Zweisprachig (DE/EN/ES)

### Unified Bibliothek
- Die `VideoGenerationHistory`-Komponente wird als Tab auf der Hub-Seite integriert
- Zeigt Videos **aller Anbieter** zentral an (bereits so implementiert)
- Filter nach Anbieter möglich

### Tabs auf der Hub-Seite
1. **Studios** — Die 4 Provider-Karten
2. **Bibliothek** — Alle generierten Videos (alle Anbieter)
3. **Credits** — Wallet & Credit-Pakete kaufen

### Änderungen

**1. `src/pages/AIVideoStudio.tsx`** — Komplett neu als Hub-Seite
- Bisheriger Sora-2-Generator wird zu eigenem Tab/Bereich innerhalb der Seite
- Hero-Header mit animiertem Titel "AI Video Studio"
- Provider-Grid mit 4 Glassmorphism-Karten
- Disclaimer-Sektion
- Tabs: Studios | Bibliothek | Credits

**2. `src/components/ai-video/AIVideoProviderCard.tsx`** — Neue Komponente
- Wiederverwendbare Karte pro Provider
- Props: name, provider, description, pricing, features, link, badge

**3. `src/components/ai-video/AIVideoDisclaimer.tsx`** — Neue Komponente
- Rechtlicher Hinweis mit Shield-Icon
- Lokalisiert (DE/EN/ES)

**4. Bestehende Studio-Seiten** (Kling, Seedance, Wan)
- Erhalten einen einheitlichen "← Zurück zum AI Studio" Header
- Behalten ihre volle Funktionalität

### Dateien
- **Neu**: `src/components/ai-video/AIVideoProviderCard.tsx`, `src/components/ai-video/AIVideoDisclaimer.tsx`
- **Komplett neu**: `src/pages/AIVideoStudio.tsx` (wird zur Hub + behält Sora-2-Generator als Sub-View)
- **Edit**: `src/pages/KlingVideoStudio.tsx`, `src/pages/SeedanceVideoStudio.tsx`, `src/pages/WanVideoStudio.tsx` (einheitlicher Back-Link)

