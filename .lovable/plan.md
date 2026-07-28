## Ziel
Jeder Provider im "AI Models Arsenal" auf der Startseite bekommt ein passendes, hochwertiges Cover-Bild — im gleichen filmischen Bond-2028-Look wie die bestehenden (Kling, Sora, Veo Pro etc.). Aktuell haben ~15 von 32 Modellen kein Cover und fallen auf den generischen Genre-Hero zurück, wodurch die Karten leer wirken.

## Scope (nur Frontend / Assets)
Keine Änderung an Business-Logik, Pipelines, Backend. Reine Presentation-Ebene:
- `src/assets/landing/ai-arsenal/gen/` — neue JPGs (1024×1024, filmisch)
- `src/components/landing/ai-arsenal/arsenalCatalog.ts` — imports + `cover:` pro Modell

## Fehlende Cover (15)
**Video (10):** veo-3.1-fast, wan-2-6-standard, seedance-2-mini, seedance-pro, veo-3.1-lite-720p, grok-imagine, kling-3, kling-2.6, kling-2.5-turbo, pika-2-2-standard, vidu-q2-reference, vidu-q2-i2v, ltx-pro, happyhorse-pro
**Image (1):** style-reference

## Visual Direction pro Provider
Jedes Bild bekommt ein eigenes, thematisch passendes Motiv im Bond-2028-Look (deep black, gold accents, cinematic light, subtle glassmorphism), kein Text im Bild:

| Modell | Motiv |
|---|---|
| Veo 3.1 Fast | Motion-blur Lichtstreifen, Speed-Trails, Gold-Cyan |
| Veo 3.1 Lite | Klarer minimalistischer Kinoframe, sanftes Rim-Light |
| Wan 2.6 | Physik-getriebene Wassertropfen in Slow-Motion, Gold |
| Seedance 2 Pro | Tänzerin-Silhouette in dynamischer Pose, Bewegungsspur |
| Seedance 2 Mini | Kompaktere Tanz-Silhouette, hellerer Akzent |
| Grok Imagine | Neon-Cyan/Magenta Glow, xAI-typischer Retro-Futurismus |
| Kling 3.0 | Zeremonielles Portrait, tiefe Schärfe, kinematisches Bokeh |
| Kling 2.6 | Elegantes Fashion-Frame, warmes Goldlicht |
| Kling 2.5 Turbo | Bewegungs-Streak eines fahrenden Autos bei Nacht |
| Pika 2.2 | Zwei Keyframe-Karten mit sanfter Verbindungslinie |
| Vidu Q2 Reference | Charakter-Triptychon, drei gleiche Gesichter aus 3 Winkeln |
| Vidu Q2 I2V | Standbild löst sich in Bewegungs-Partikel auf |
| LTX Pro | Filmset-Blende / Studio-Kamera mit Gold-Rim |
| HappyHorse 1.1 Pro | Verspielte, warme Alltagsszene mit goldenem Highlight |
| Style Reference | Farbpaletten-Swatches + Portrait, das die Palette annimmt |

Qualitätsstufe: `standard` (Foto-Detail, kein Text nötig), `.jpg`, 1024×1024.

## Änderungen
1. 15 neue `.jpg`-Dateien in `src/assets/landing/ai-arsenal/gen/` via `imagegen`.
2. `arsenalCatalog.ts`: 15 neue `import cover* from …` + `cover: cover*` in den jeweiligen `m(...)`-Einträgen einfügen.

## Verifikation
- `tsgo`-Check saubere Imports
- Startseite → Arsenal-Sektion → jede Karte hat jetzt ein einzigartiges Motiv (keine Fallback-Wiederholung mehr)
