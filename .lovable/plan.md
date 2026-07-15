## Post-Launch: Canva-Alternative als AI Design Studio

Kein Eingriff vor dem 26.07. Feature wird als Backlog-Ticket für Woche 3-4 post-launch dokumentiert.

### Entscheidung

- **Zeitpunkt**: nach Launch. Vor dem 26.07. bleibt alles wie es ist.
- **Struktur**: zwei getrennte Studios im Hub:
  - `AI Text-Studio` (bestehend) → bleibt Caption/Hashtag/Copy-Generator.
  - `AI Design Studio` (neu) → vollwertiger Bild-mit-Text-Editor.
- **Editor-Basis**: post-launch final entscheiden (Polotno vs. Fabric.js vs. AI-Composer). Empfehlungs-Reihenfolge nach Kosten/Nutzen: **Polotno SDK** > Fabric.js Eigenbau > AI-Composer.

### Scope für das AI Design Studio (wenn wir bauen)

**Editor-Kern**
- Multi-Layer Canvas mit Undo/Redo, Snap-to-Grid, Alignment-Guides.
- Format-Presets: IG 1:1, IG Story 9:16, Reel 9:16, FB Feed 4:5, YT Thumbnail 16:9, LinkedIn 1.91:1, Print A4, Custom.
- Text-Layer mit Google-Fonts-Library (bereits im Projekt geladen), Outline, Shadow, Gradient-Fill.
- Shape-Layer (Rechteck, Kreis, Linie, Pfeil, Sticker/Icon-Set).
- Bild-Layer mit Crop, Filter, Opacity, Blend-Mode.

**Plattform-Integration (unabhängig von SDK-Wahl)**
- **Brand Kit Auto-Load** aus `brand_kits` (Farben/Fonts/Logo) → 1-Klick-Apply.
- **Media Library Panel** rechts: Studio Bilder + AI-generierte Bilder + Cast Characters direkt einfügbar.
- **AI-Copy-Button** ruft `AI Text-Studio` inline auf → Headlines/CTAs landen als Text-Layer.
- **AI-Background-Button** ruft Nano-Banana/Gemini-Image für Hintergrund-Generierung.
- **Templates**: 15-20 vorgefertigte Ad-Layouts in James-Bond-Ästhetik + User-eigene Templates speicherbar.
- **Export → Media Library** statt Direkt-Download, damit Calendar/Publisher zugreifen können. PNG/JPG/PDF.

**Daten**
- Neue Tabelle `design_studio_projects` (Name, Canvas-JSON, Thumbnail-URL, Format, Owner).
- Storage-Bucket `design-studio-assets` mit RLS auf `user_id/{filename}`.

### Cost-Rundown (zur späteren Entscheidung)

| Weg | Setup | Laufend | Time-to-Ship |
|---|---|---|---|
| Polotno SDK | 3 Tage | ~90 EUR/Monat | 1 Woche |
| Fabric.js Eigenbau | 2-3 Wochen | 0 EUR | 3-4 Wochen |
| AI-Composer | 1 Woche | 0 EUR (AI-Credits) | 1-2 Wochen |

Bei 1000 Founders = 14,990 EUR Umsatz → 90 EUR = 0,6% Kosten. Polotno ist wirtschaftlich unauffällig.

### Reihenfolge post-launch

1. **Woche 1** (nach 26.07.): Heartbeat-Watchdog (bereits geplant).
2. **Woche 2-3**: Linter-Warnings aufräumen (bereits geplant).
3. **Woche 3-4**: Design Studio Entscheidung + Kickoff.
4. **Woche 5-7**: Design Studio MVP live.

### Jetzt zu tun: nichts.

Launch-Fokus bleibt. Ticket ist in `.lovable/plan.md` dokumentiert und wird nach dem 26.07. wieder aufgegriffen.
