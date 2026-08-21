# Nur noch KI-Credits — alles andere inklusive

Ziel: Das allgemeine Credit-System (Punkte-Wallet für Rendern, Exporte, Varianten, Text Studio) verschwindet. Es bleibt **eine** Guthaben-Art: das KI-Media-Guthaben in Euro/USD für externe KI-Anbieter (alle Videomodelle, Music Lab, KI-Bildstudio, ElevenLabs-Stimmen).

## Was künftig Geld kostet
- Alle Videomodelle (Seedance, Veo, Kling, Runway, Luma, Hailuo, Pika, Vidu, Wan, LTX, Grok, HappyHorse)
- Music Lab / Musikgenerierung, Audio-Stem-Trennung
- KI-Bildstudio: Bildgenerierung, Magic Edit, Upscale
- ElevenLabs-Sprachausgabe (inkl. Hörbuch-Rendering)

## Was künftig kostenlos ist (Free-Plan und Beta-Basic)
- Jedes Rendern und Exportieren (Universal Creator, Director's Cut, Remotion, Multi-Format-Batch, Composer-Assembly)
- Alle Premium-Renderfunktionen im Director's Cut (Color Grading, Transitions, Speed Ramping, Smart Crop, Chroma Key usw. — reine Remotion-Effekte ohne externen Anbieter)
- Text Studio (Chat und Compare)
- Video-Varianten (Batch), Render-Retries
- Composer-Assembly-Aufschlag

## Umsetzung (technisch)

**Rendern kostenlos machen** — Wallet-Check + `deduct_credits` entfernen in:
`render-universal-video`, `render-with-remotion`, `render-multi-format`, `render-directors-cut` (inkl. `PREMIUM_CREDITS`/`calculateCredits`), `auto-generate-universal-video` (Hauptlauf + `RENDER_ONLY_CREDITS`-Retry), `batch-create-videos`.
`credits_used`-Spalten werden mit `0` befüllt, damit bestehende Tabellen/Records unverändert bleiben.

**Text Studio kostenlos machen** — in `text-studio-chat` und `text-studio-compare` den `ai_video_wallets`-Check und `deduct_text_studio_credits` entfernen; Kostenerfassung nur noch als interne Telemetrie (`cost_eur`) ohne Abzug. Die 402-Toasts in `AITextStudio.tsx` und `PinnedChatWindow.tsx` entfallen.

**Composer** — in `compose-video-assemble` den pauschalen Render-Aufschlag von 0,10 € streichen; Szenen-KI-Kosten bleiben. `compose-video-clips` bleibt unverändert (echte Modellkosten).

**Frontend aufräumen** —
- `PreviewExportStep.tsx`: Credit-Reservierung, Kostenanzeige, „nicht genug Credits"-Warnung und „1x/2x Credits"-Badges entfernen; Rendern immer erlaubt.
- `useAICall.ts` / `useCreditReservation.ts` / `CreditGuard.tsx`: Preflight/Reserve/Commit/Refund-Pfad für Nicht-KI-Features stilllegen (Hook bleibt für KI-Media bestehen, ruft aber keine Punkte-Wallet mehr an).
- `src/lib/featureCosts.ts`: Kosten für nicht-KI-Features auf 0 setzen.
- Texte/Badges, die auf das alte Punkte-System zeigen, in EN/DE/ES anpassen — Sprachreinheitstests laufen weiter durch.

**Datenbank** — keine Migration in diesem Schritt. Die Tabellen `wallets`, `credit_reservations` und die RPCs `deduct_credits` / `deduct_text_studio_credits` bleiben bestehen, werden aber nicht mehr aufgerufen (kein Datenverlust, jederzeit reversibel). Aufräumen kann später separat erfolgen.

**Verifikation** — Build, Typecheck, Sprachreinheitstests, sowie ein gezielter Testlauf, der prüft, dass keine Render-/Text-Studio-Funktion mehr `deduct_credits`, `deduct_text_studio_credits` oder `from('wallets')` verwendet. Kein Deploy in diesem Gate, sofern du nicht ausdrücklich zustimmst.
