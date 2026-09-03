# Seedance 2.5 im AI Video Studio: Bild-Vorprüfung statt roher ModelArk-Fehler

## Befund (belegt aus den Daten)

Das Konto `yev.victoria@gmail.com` hat am 30.08. zwei Seedance-2.5-Läufe mit exakt diesem Provider-Fehler:

```text
ModelArk Error: ModelArk create failed (400):
InvalidParameter — expected the width to be at least 300px,
but received a 152x515px image instead (param: image_url)
```

Direkt davor scheiterten zwei Kling-Omni-Läufe mit demselben Bild:
„Image aspect ratio (0.30) is outside the allowed range [0.40, 2.50]".

Damit ist klar: **Seedance 2.5 selbst funktioniert** — dasselbe Konto hat früher erfolgreiche Seedance-2.5-Läufe. Ausgelöst wurde der Fehler durch ein hochgeladenes Bild von 152×515 px (zu schmal, Seitenverhältnis 0,30). Die Credits wurden korrekt zurückerstattet (Refund-Pfad greift), aber der Nutzer sah rohes Provider-JSON.

Zwei getrennte Probleme:
1. Es gibt keine Vorprüfung von Bildmaßen/Seitenverhältnis vor dem Provider-Aufruf — jeder Anlauf kostet erst eine fehlgeschlagene Generierung.
2. Die Fehlermeldung ist unverständlich (englisches Provider-JSON mit Request-ID) statt einer klaren Handlungsanweisung.

## Was gebaut wird

### 1. Bild-Vorprüfung im Upload (Client)
Beim Hochladen von Startbild, Endbild und Referenzbildern werden Breite, Höhe und Seitenverhältnis gemessen. Verletzt ein Bild die Grenzen des gewählten Modells, wird es gar nicht erst übernommen; stattdessen erscheint eine verständliche Meldung in EN/DE/ES, z. B.: „Dieses Bild ist 152×515 px. Seedance 2.5 braucht mindestens 300 px Breite und ein Seitenverhältnis zwischen 1:2,5 und 2,5:1."

### 2. Modell-Bildgrenzen als geteilte Wahrheit
Pro Modellfamilie werden die dokumentierten Bildanforderungen (Mindestbreite/-höhe, erlaubter Seitenverhältnis-Bereich, Maximalgröße) an einer Stelle hinterlegt und sowohl im Frontend als auch in der Edge Function gelesen — kein zweiter, driftender Satz Regeln.

### 3. Serverseitiger Schutz vor dem Provider-Aufruf
`generate-seedance25-video` prüft die Bildmaße, bevor Credits abgebucht und ModelArk aufgerufen wird. Bei Verstoß: klarer Fehlercode `IMAGE_REQUIREMENTS_NOT_MET` mit lesbarer Meldung, keine Abbuchung, kein Provider-Call.

### 4. Verständliche Provider-Fehler
Bleibt trotzdem ein ModelArk-Fehler übrig, wird er in eine lokalisierte Klartext-Meldung übersetzt (Bild ungültig / Inhalt abgelehnt / Rate-Limit / temporär). Rohes JSON und Request-IDs landen nur noch im Log.

## Technische Details

- Neu: `src/lib/ai-video/imageRequirements.ts` (Grenzen pro Modellfamilie) plus Spiegel in `supabase/functions/_shared/`.
- `ToolkitGenerator.tsx` und `MultiReferenceUploader.tsx`: Messung per `Image`-Objekt beim Upload, Ablehnung mit Toast.
- `supabase/functions/generate-seedance25-video/index.ts`: Vorprüfung vor `deduct_ai_video_credits`, Fehler-Mapping im `catch`-Zweig.
- Tests: Grenzwerte (299 px vs. 300 px, Ratio 0,30 vs. 0,40) und das Fehler-Mapping.

Unberührt bleiben: Preise, Wallet-/Refund-Logik, Lip-Sync-Kette, Composer, andere Video-Funktionen (außer dem geteilten Grenzwert-Modul, das dort noch nicht eingebunden wird).

## Verifikation

Ein Upload mit 152×515 px wird im Studio abgelehnt, bevor Kosten entstehen; ein regulärer 16:9-Upload läuft unverändert bis zur fertigen Seedance-2.5-Generierung durch.
