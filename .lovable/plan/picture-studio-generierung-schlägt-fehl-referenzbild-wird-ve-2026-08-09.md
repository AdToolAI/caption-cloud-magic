# Picture Studio: Generierung schlägt fehl + Referenzbild wird verzerrt

## Was ich im Code sehe

**1. Vorschau des hochgeladenen Referenzbildes (bestätigt)**

Die Vorschau-Box ist fest `w-full h-24` und das Bild wird mit `object-cover` gefüllt. Bei voller Panelbreite ergibt das ein extrem breites Format — das Bild wird beschnitten/gestreckt statt in seinem echten Seitenverhältnis gezeigt. Das ist genau der Effekt aus deinem Screenshot.

**2. „Bildgenerierung fehlgeschlagen" (Ursache noch nicht bewiesen)**

In den Funktionslogs von `generate-image-replicate` steht zu deinem Lauf nichts außer `shutdown` — die eigentliche Fehlermeldung des Modells wird zwar geloggt, ist aber im aktuellen Log-Fenster nicht mehr sichtbar. Zwei konkrete Verdachtspunkte, beide im Code belegbar:

- **Seitenverhältnis 2:1**: Die Auswahl bietet `2:1` an, wird aber unverändert als `aspect_ratio` an Nano Banana (Ultra) durchgereicht. Das Modell akzeptiert nur eine feste Liste (u. a. `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`) — `2:1` ist nicht dabei und führt zu einer Eingabe-Ablehnung.
- **Referenzbild als Daten-URL**: Hochgeladene Bilder werden per `FileReader` als base64-Daten-URL direkt an die Funktion und weiter an Replicate geschickt. Bei größeren Fotos sprengt das Request-Grenzen.

Ich lege mich vor dem Umbau nicht fest: Schritt 1 des Plans ist ein Testlauf, der den exakten Modellfehler sichtbar macht.

## Vorgehen

1. **Fehler sichtbar machen**: Einen echten Lauf auslösen und den geloggten Replicate-Fehler auslesen. Zusätzlich die Fehlermeldung im Toast konkretisieren (statt nur „Bildgenerierung fehlgeschlagen" der Grund vom Modell), damit solche Fälle künftig ohne Log-Suche erkennbar sind.
2. **Seitenverhältnisse modellgerecht**: Pro Modell eine Liste erlaubter Werte; nicht unterstützte Optionen werden in der Auswahl ausgegraut bzw. serverseitig auf das nächstliegende erlaubte Verhältnis abgebildet (`2:1` → `21:9` bei Nano Banana). Kein stiller Fehlschlag mehr.
3. **Referenzbilder als Datei statt base64**: Upload geht in den vorhandenen Speicher-Bucket (Pfad beginnt mit der User-ID), an das Modell geht eine URL. Das entfernt die Größenbegrenzung und beschleunigt den Aufruf.
4. **Vorschau im echten Format**: Die Referenz-Vorschau zeigt das Bild vollständig (`object-contain`) in einer Box mit begrenzter Höhe und neutralem Hintergrund — also so wie das Bild wirklich aussieht, nicht als breiter Streifen.
5. **Credits**: Bei einem Fehlschlag darf nichts abgebucht werden — im aktuellen Code wird erst nach Erfolg abgezogen; ich prüfe das im Testlauf gegen.

## Technische Details

- `supabase/functions/generate-image-replicate/index.ts`: Aspect-Ratio-Mapping pro Tier (`fast`/`pro`/`ultra`), Replicate-Fehlermeldung ungekürzt im Response-Feld `error` (plus `provider_message`), Log-Zeile mit Tier + Eingabefeldern.
- `src/components/picture-studio/ImageGenerator.tsx`:
  - `handleReferenceUpload` / `handleStyleRefUpload` laden in `background-projects` hoch (`{user.id}/picture-studio/refs/...`) und speichern die öffentliche URL statt der Daten-URL; lokale Vorschau bleibt sofort sichtbar.
  - Vorschau-Block (Zeilen ~664–678): `object-contain`, `max-h-56`, Hintergrund `bg-muted/30`.
  - `ASPECT_RATIOS` filtert nach dem gewählten Tier.
- Keine Änderungen an Preisen, Wallet-Logik oder anderen Studio-Tabs.

## Prüfung danach

- Ultra + Stil-Referenz + 2:1: läuft durch (oder nennt bei Ablehnung den echten Grund).
- Hochgeladenes Hochformat-Bild: Vorschau zeigt das komplette Bild ohne Verzerrung.
- Fehlerfall: kein Credit-Abzug, verständliche Meldung.
