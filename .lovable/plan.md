# Avatar-Bilder reparieren

## Was wirklich passiert ist
Das Bild von Matthew Dusatko ist **nicht gelöscht** — es liegt unverändert im Storage (`brand-characters/8948d3d9…/1ec6e573….jpeg`).

Der Fehler liegt in `src/hooks/useBrandCharacters.ts` (Zeile 75 + 98): Beim Anlegen eines Charakters wird eine **signierte URL mit nur 10 Minuten Gültigkeit** erzeugt und genau diese kurzlebige URL als `reference_image_url` in der DB gespeichert. Sobald die 10 Minuten vorbei sind, liefert Supabase 400/403 und der Browser zeigt nur noch das gebrochene `<img>`-Icon mit "Matthew Dusatko" alt-text.

Das betrifft potenziell **alle Charaktere**, deren `reference_image_url` älter als 10 Minuten ist.

## Fix in 3 Schritten

### 1. Bug an der Quelle beheben (`src/hooks/useBrandCharacters.ts`)
- Beim Erstellen statt 10 Min eine **langlebige** Signed URL ausstellen (5 Jahre, gleiches Muster wie schon in `generate-avatar-portrait` für `portrait_url`).
- Damit werden alle neu erstellten Charaktere ab sofort dauerhaft sichtbar.

### 2. Bestehende Charaktere reparieren (Backfill)
Neue Edge-Function `repair-brand-character-urls` (oder einmaliges SQL+Storage-Script):
- Liest alle `brand_characters` mit gesetztem `storage_path`.
- Erzeugt für jedes eine neue 5-Jahres-Signed-URL.
- Schreibt sie in `reference_image_url` zurück.
- Macht das Gleiche für `portrait_url`, falls dort ein abgelaufenes Token steht (Pfad ist `…/portraits/…`).
- Wird einmal manuell aufgerufen, läuft idempotent.

### 3. Defensive UI-Komponente
Kleiner Wrapper `<AvatarImage character={…} />`, der bei `onError` automatisch eine frische Signed URL über eine RPC/Edge-Function nachlädt. Optional, aber verhindert das gleiche Problem in Zukunft falls sich Tokens irgendwann doch ändern.

## Technische Details
- Bucket: `brand-characters`, RLS verlangt `user_id` als ersten Pfad-Segment — bleibt unverändert.
- Lebensdauer: `60 * 60 * 24 * 365 * 5` Sekunden (~5 Jahre, wie in `generate-avatar-portrait`).
- Keine DB-Migration nötig, nur UPDATE-Statements auf `brand_characters`.
- `useBrandCharacters.createCharacter`: Die kurzlebige URL für die KI-Extraction kann bestehen bleiben (10 Min reichen für den Edge-Function-Call), aber die in der DB gespeicherte URL muss separat als langlebige Variante geschrieben werden.

## Ergebnis
Nach Approval: Matthew Dusatko (und alle anderen) zeigen wieder ihr Portraitbild — sowohl in der Avatar-Bibliothek als auch im Talking-Head-Dialog ("Use original image" wird wieder klickbar mit echter Vorschau).
