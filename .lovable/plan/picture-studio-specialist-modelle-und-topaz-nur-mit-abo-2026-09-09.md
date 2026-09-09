# Picture Studio: Specialist-Modelle und Topaz nur mit Abo

Abo = Zugang zu Premium-Funktionen. Credits = tatsächliche Nutzung. An der Abrechnung, den Rückerstattungen, der Job-Historie und der Speicherung ändert sich nichts.

## Aufteilung der Modelle

**Core (für alle nutzbar)**
- Standard (Gemini Image)
- GPT Image
- Ideogram
- Recraft
- Qwen

**Specialist (nur mit aktivem Abo)**
- FLUX Ultra
- Pro (Imagen 4 Ultra)
- Ultra (Nano Banana)
- Fast (Seedream 4)

**Professional Enhance (nur mit aktivem Abo)**
- Topaz Upscale, Topaz Dust & Scratch, Topaz Colorization
- Clarity Pro bleibt für alle frei, damit Enhance testbar bleibt

## Was Nutzer ohne Abo sehen

- Alle Modelle und Topaz bleiben sichtbar, inklusive Beschreibung und Preis.
- Gesperrte Einträge bekommen ein kleines Schloss- bzw. PRO-Abzeichen.
- Beim Start erscheint kein Fehler, sondern ein Upgrade-Fenster im gleichen Stil wie bei Video-Verbessern:
  - Titel: „Specialist-Modelle freischalten“
  - Text: Zugang zu Premium-Bildmodellen und professioneller Topaz-Verbesserung mit AdTool AI Beta Basic
  - Aktion: „Upgrade auf Beta Basic – 14,95 €/Monat“
  - Zweite Aktion: Weiter mit einem freien Modell (Bild: GPT Image, Enhance: Clarity Pro)
- Prompt, Bild und alle Einstellungen bleiben dabei erhalten.
- Creator-Konten und die bestehenden Test-Konten sind wie überall ausgenommen.

Gilt einheitlich in Erzeugen, Batch und Bearbeiten (Magic Edit) sowie im Enhance-Tab.

## Technische Umsetzung

Server (maßgeblich, keine zweite Premium-Logik):
- Neu: `supabase/functions/_shared/picture-studio-premium.ts` — dünnes Gate über den bestehenden `_shared/subscription-entitlement.ts` (gleiche Quelle wie Topaz Video/Text Studio), inklusive `VIDEO_ENHANCE_TEST_USER_IDS`-Override.
- Exportiert die Specialist-Tier-Liste (`fast`, `pro`, `ultra`, `flux`), die Premium-Enhance-Modell-IDs (`topaz-*`) und die Fehlercodes `PICTURE_SPECIALIST_PREMIUM_REQUIRED` / `PICTURE_ENHANCE_PREMIUM_REQUIRED` samt Fallback-Vorschlag.
- Prüfung in `generate-image-replicate`, `magic-edit-image` (falls Premium-Tier) und `enhance-image` — jeweils **vor** Preisermittlung, Wallet-Abbuchung, Provider-Aufruf und Job-Anlage. Antwort: HTTP 403 mit strukturiertem Code, keine Abbuchung, keine Rückerstattung, kein Provider-Request.
- `enhance-image` behält `isModelUnlocked` (Feature-Flags) zusätzlich; das Abo-Gate kommt davor.

Client (nur Darstellung):
- Neu: `src/lib/pictureStudio/premium.ts` als Spiegel der Tier-/Modell-Listen und Fehlercodes.
- Zugriffsanzeige über `useAuth().subscribed`, `useTrialAccess().isPaid` und `useAccountType().isCreator` — nicht über `hasFullAccess`.
- Angepasst: `ImageGenerator.tsx`, `BatchGeneratePanel.tsx`, `MagicEditPanel.tsx`, `EnhancePanel.tsx` — Abzeichen, Upgrade-Dialog, Fallback-Auswahl. Im Batch-Panel wird die Vorauswahl für Nicht-Abonnenten von „Fast“ auf ein freies Modell gesetzt.
- Texte in DE, EN, ES.

Tests:
- Deno-Tests für das Gate: freier Nutzer + Core → erlaubt; freier Nutzer + Specialist/Topaz → 403 mit Code; Abonnent → erlaubt; Creator- und Test-Konto → erlaubt; direkter API-Aufruf umgeht das Gate nicht.
- Vitest-Paritätstest: Client-Liste der Specialist-Tiers und Premium-Enhance-Modelle stimmt mit der Server-Liste überein.

Unverändert bleiben: Preise, Wallet, Rückerstattungen, Provider-Routing, Orchestrierung, Speicherung, Job-Historie.
