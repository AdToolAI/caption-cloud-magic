# Premium-KI-Modelle nach oben + Seedance 2.5 als Top-Modell

## Was sich ändert

1. **Sektion "Premium KI-Modelle" wandert nach oben** — direkt unter die Lip-Sync-Beweis-Szene ("Ein Briefing. Ein fertiger Clip.") auf der Startseite. Reihenfolge danach:
   Hero → Proof Moment (Lip-Sync) → **AI Arsenal (37+ Modelle)** → Social Proof → Features → Live-Demo → Instant Avatar → UDC → Pricing → FAQ.

2. **Seedance 2.5 wird neues erstes Modell** im Arsenal — ganz oben in der Liste (Kategorie Video, damit auch in "Alle" und "Video" an erster Stelle), markiert als Hero/Empfohlen. "Seedance 2 Pro" und "Seedance 2.0 Mini" bleiben unverändert erhalten. Cover: bestehendes Seedance-Pro-Bild.

## Technisch

- `src/pages/Index.tsx`: `<AIArsenalShowcase />` von der aktuellen Position (nach `<UDCShowcase />`) nach direkt hinter `<ProofMoment />` verschieben. Keine Prop-Änderungen.
- `src/components/landing/ai-arsenal/arsenalCatalog.ts`: neuer Eintrag `seedance-2-5` als erstes Element von `ARSENAL_CATALOG` (vor `kling-omni`), mit DE/EN/ES-Name, Tagline in drei Sprachen, Caps (Text→Video, Bild→Video, Native Lip-Sync, 1080p), `cover: coverSeedancePro`, `hero: true`, `recommended: true`. Da die Anzeige der Katalog-Reihenfolge folgt, ist kein Sortier-Code nötig.
- Modell-Zähler in den Kategorie-Chips (37/22 usw.) werden aus dem Katalog berechnet und aktualisieren sich automatisch auf 38/23.
- Alle Texte dreisprachig (EN/DE/ES) gemäß bestehendem `cap()`-Muster; englischer Default bleibt gewahrt.
