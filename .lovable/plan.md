# Seedance 2.5 als sicherer Lip-Sync-Provider einstufen

## Problem

Beim Rendern einer Dialog-Szene mit Seedance 2.5 erscheint eine rote Risiko-Warnung ("keine zuverlässigen Ergebnisse", "Ghost-Mouthing", Haftungs-/Credit-Ausschluss) mit Pflicht-Checkbox, obwohl Seedance 2.5 in v418 als Lip-Sync-Plate-Provider (4–30s) zertifiziert wurde.

Ursache: Die Sicherheitsliste `LIPSYNC_SAFE_PROVIDERS` in `src/config/lipsyncProviderSafety.ts` enthält nur `ai-hailuo`, `ai-happyhorse`, `ai-kling-omni`. Der Clip-Source-Wert `ai-seedance25` fehlt, deshalb greift die v209-Risiko-Warnung. Zusätzlich fehlt `ai-seedance25` in `humanProviderName`, weshalb im Dialog der rohe technische Name "ai-seedance25" statt "Seedance 2.5" steht.

## Änderungen

1. `src/config/lipsyncProviderSafety.ts`
   - `ai-seedance25` in `LIPSYNC_SAFE_PROVIDERS` aufnehmen, mit Kommentar-Verweis auf die v418-Zertifizierung (4–30s Plate, Multi-Speaker geprüft).
   - `humanProviderName`: Mapping `ai-seedance25` → "Seedance 2.5" ergänzen (das legacy `ai-seedance` bleibt "Seedance" und weiterhin risikobehaftet).

2. `src/components/video-composer/SceneCard.tsx`
   - Die Multi-Speaker-Erklärung ("pro Sprecher-Turn ein eigener Hailuo-Plate …") nennt hart "Hailuo", auch wenn Seedance 2.5 gewählt ist. Provider-Namen dynamisch aus dem gewählten Clip-Source über `humanProviderName` einsetzen (DE/EN/ES).

## Nicht Teil dieser Änderung

- Keine Änderung an Pipeline, Kosten, Flag `composer.feature.seedance25_lipsync` oder Refund-Regeln.
- Legacy-Seedance (`ai-seedance`), Kling, Wan, Luma behalten die Risiko-Warnung.

## Verifikation

Dialog-Szene mit Seedance 2.5 und mehreren Sprechern öffnen: Der Render-Bestätigungsdialog zeigt keine rote Warnung und keine Pflicht-Checkbox mehr; der Bestätigen-Button ist sofort aktiv. Mit Kling/Wan bleibt die Warnung bestehen.
