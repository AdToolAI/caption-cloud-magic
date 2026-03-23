

# Plan: Social-Media-Plattform-Icons in der Status-Bar mit Verbindungsstatus

## Zusammenfassung
Die hartcodierten Instagram/TikTok-Icons im rechten Bereich der Hero-Status-Bar (Zeilen 143-147 in `Home.tsx`) werden durch alle 6 Plattform-Icons ersetzt. Jedes Icon zeigt visuell den Verbindungsstatus an und ist klickbar, um direkt zur Verbindungsseite zu navigieren.

## Umsetzung

### 1. Neue Komponente: `SocialConnectionIcons`
Neue Datei `src/components/dashboard/SocialConnectionIcons.tsx`:
- Nutzt den bestehenden `usePlatformCredentials`-Hook um den Live-Verbindungsstatus abzufragen
- Zeigt Icons für alle 6 Plattformen: Instagram, TikTok, LinkedIn, YouTube, Facebook, X
- Verbundene Plattformen: Icon in Plattform-Farbe + kleiner grüner Punkt
- Nicht verbundene: Icon ausgegraut/gedimmt
- Klick navigiert zu `/social-media-settings?connect={platform}` (nutzt bestehende Highlight-Logik dort)
- Tooltip mit Plattformname + Status
- Zähler daneben: "X verbunden"

### 2. Home.tsx anpassen (Zeilen 141-147)
- Bestehende hartcodierte Icons + "3 verbunden"-Text ersetzen durch `<SocialConnectionIcons />`
- Überflüssige `Instagram`/`Music`-Imports entfernen falls nicht anderweitig genutzt

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/SocialConnectionIcons.tsx` | Neue Komponente |
| `src/pages/Home.tsx` | Hartcodierte Icons durch neue Komponente ersetzen |

