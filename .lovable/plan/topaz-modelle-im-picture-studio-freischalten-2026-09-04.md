# Topaz-Modelle im Picture Studio freischalten

Ziel: Clarity läuft bereits; Topaz Upscale, Dust & Scratch und Colorization werden für alle Nutzer im Studio ausführbar gemacht.

## 1. Registry-Flags aktivieren

- `src/config/pictureModels/flags.ts`: `ENABLED_PICTURE_FLAGS` um die drei Topaz-Flags erweitern:
  - `picture.enhance.topaz_upscale`
  - `picture.enhance.topaz_restore`
  - `picture.enhance.topaz_colorize`
- `src/config/pictureModels/enhanceModels.ts`: `enabled` für `topaz-image-upscale`, `topaz-dust-scratch` und `topaz-colorization` auf `true` setzen (die `beta`-Kennzeichnung kann bleiben, solange die Preise als `costUnverified` gelten).

## 2. Backend-Schalter setzen

- Edge Function `enhance-image` liest `PICTURE_TOPAZ_UPSCALE_ENABLED`, `PICTURE_TOPAZ_RESTORE_ENABLED` und `PICTURE_TOPAZ_COLORIZE_ENABLED` aus der Umgebung.
- Diese Schalter müssen auf `true` gesetzt werden, damit `isModelUnlocked` Topaz-Runs zulässt.
- Die `PICTURE_ENHANCE_TEST_USER_IDS`-Allowlist bleibt als Notfall-Override bestehen.

## 3. Preise und Snapshot bleiben unverändert

- Topaz-Preise sind weiterhin als `costUnverified: true` markiert; das bedeutet nur, dass die geschätzten Providerkosten noch nicht durch echte Rechnungen bestätigt sind.
- Die degressive Margen-Kurve und der FX-Puffer bleiben aktiv.
- Clarity behält seinen Legacy-Festpreis (0,03 € / 0,06 €).

## 4. Validierung

- `src/test/picture-pricing-parity.test.ts` erneut laufen lassen.
- Typecheck (`tsc --noEmit`) ausführen.
- Keine Live-Provider-Aufrufe; keine echten Testläufe im Plan.

## Technische Details

- Keine neue Edge Function nötig; `enhance-image` ist bereits implementiert und prüft `isModelUnlocked`.
- Keine Adapter-Änderungen; Topaz-Payloads werden bereits korrekt gebaut.
- Keine Datenbank-Migration nötig; `picture_enhance_runs` existiert bereits.
