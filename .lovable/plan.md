## Ziel
Jede einzelne Karte in der linken Sidebar (Hub-Detailseiten) bekommt ein **eigenes cinematisches Cover-Bild** im Bond-2028-Stil (Deep Black `#050816` + Gold `#F5C76A` + Cyan). Kein Hub-Cover mehr als Fallback für Karten mit eigenem Motiv.

## Umfang — 39 Cover, aufgeteilt nach Hubs

**Planen (4):** Kalender · Content-Planer · Composer · Post-Time-Advisor
**Optimieren (7):** Text-Studio · AI-Post-Generator · Image-Caption-Pairing · Coach · Comment-Manager · Template-Manager · Campaigns
**Analysieren (5):** Analytics-Dashboard · PostHog · Usage Reports · Trend-Radar · AI Text Studio
**Erstellen (18):** Media-Library · VoicePro · Music Studio · SFX Library · Stock Videos · Universal Content Creator · Universal Video Creator · Universal Director's Cut · AI Video Studio · Video Composer · Render-Queue · Cast & World Library · Creator Library · KI Picture Studio · Template Marketplace · Creator Studio · My Licenses · (Motion Studio bereits im Composer-Cover)
**Team (4):** Team-Workspace · Brand Kit · White-Label · Community
**Gaming (1):** Stream Dashboard

**Summe: 39 neue Bild-Assets** unter `src/assets/hub-covers/<hub>/<slug>.jpg` (1280×720, JPG).

## Design-Rezept (konsistent zu bestehenden Covers)
- Palette: Deep Black `#050816`, Gold `#F5C76A`, Cyan-Akzent, weiches Bokeh.
- Jedes Motiv **abstrakt, thematisch passend, ohne Text/Logo/Personen**.
  - Analytics-Dashboard → holografische Chart-Wall
  - PostHog → Event-Stream-Konsole mit Lichtimpulsen
  - Trend-Radar → Radar-Sweep in Gold
  - Music Studio → leuchtende 3D-Waveform
  - Cast & World → Character-Loadout-Silhouette
  - Video Composer → Timeline mit Fadenkreuz
  - Coach → glühende Sprechblasen-Silhouette
  - Kalender → holografisches Datumsraster
  - usw. — 39 spezifische Prompts, alle im Bond-Grade.
- Generierung: `imagegen--generate_image` (fast tier, 1280×720).

## Änderungen im Code
### `src/config/hubConfig.ts`
- Jedes der 39 Items bekommt ein `cover: <import>`-Feld.
- ES-Imports oben in der Datei ergänzen (39 zusätzliche Imports).

### `src/config/hubCovers.ts`
- Bleibt als Hub-Fallback (für zukünftige neue Items ohne eigenes Cover).

### `src/pages/HubPage.tsx`
- Keine Änderung — der Cover-Slot samt Fallback existiert bereits.

## Ausführungs-Reihenfolge
1. 39 Bilder generieren in parallelen Batches (~6–8 pro Batch, 5 Wellen).
2. Nach jeder Welle Preview-Check der generierten Motive; bei Text-Bleed einzeln nachgenerieren mit „no text, no letters"-Härtung.
3. `hubConfig.ts` mit allen 39 Cover-Imports patchen.
4. `tsgo` + Preview-Check auf `/hub/erstellen`, `/hub/analysieren`, `/hub/optimieren`.

## Nicht-Ziele
- Keine Änderung an Karten-Labels, Routen, Sidebar-Struktur.
- Keine Änderung am Layout (Karten-Höhe, Text-Clamps sind bereits final).
- Keine Cover-Bilder für Admin-Hub (interne Seite).

## Aufwand-Hinweis
39 Bild-Generierungen kosten Credits und dauern ~5–10 Min über alle Wellen hinweg. Die Bilder werden zum Bundle-Size dazuaddiert (~40 × 100–200 KB = ~5–8 MB extra). Ohne CDN-Migration bleibt das im Repo; falls das ein Problem wird, kann ich sie in einem Folge-Schritt auf Lovable Assets CDN auslagern.
