

## Plan: Hero-Video auf der Startseite ersetzen

### Was wird gemacht
Das Video in der **GadgetCard** auf der Startseite (Hero-Bereich rechts) wird durch das neue hochgeladene Video ersetzt.

### Umsetzung

**Datei: `src/components/landing/GadgetCardDynamic.tsx`**

1. Das hochgeladene Video (`sora-Mach_mir_bitte_ein_cooles_Werb.mp4`) wird in den `public/`-Ordner kopiert
2. Die Video-URL in Zeile 306 wird von der aktuellen Supabase-Storage-URL auf das neue lokale Video geändert

### Technisch
- Aktuell: `https://lbunafpxuskwmsrraqxl.supabase.co/storage/v1/object/public/ai-videos/...mp4`
- Neu: Lokale Datei aus `public/videos/hero-video.mp4`
- Keine weiteren Änderungen nötig — Autoplay, Mute-Toggle und Play-Button bleiben bestehen

### Ergebnis
Das neue Werbevideo erscheint direkt in der Hero-Karte auf der Startseite.

