

## Hub-Reorganisation: Erstellen + Optimieren zusammenlegen, Medien -> Erstellen

### Aenderungen

**1. hubConfig.ts - Hub-Struktur umbauen**
- "Erstellen" Hub entfernen
- Die 3 Items (Text-Studio, Post-Generator, Bild-Text-Pairing) in "Optimieren" verschieben
- "Medien" Hub umbenennen zu key: "erstellen", mit neuem Titel/Beschreibung die auf Content-Erstellung fokussiert
- Icon von "Optimieren" anpassen (bleibt MessageSquare oder wird zu Sparkles da es jetzt auch KI-Erstellung umfasst)

**Neues "Optimieren"** (6 Items):
- KI Text-Studio, KI Post-Generator, Bild-Text-Pairing (von Erstellen)
- KI-Content-Coach, Kommentar-Manager, Vorlagen-Manager (bestehend)

**Neues "Erstellen"** (ehemals Medien, 8 Items):
- Media Library, VoicePro, Universal Content Creator, Universal Video Creator, Director's Cut, Sora Long-Form, AI Video Studio, Background Replacer

**2. translations.ts - Texte anpassen (DE, EN, ES)**
- `hubs.erstellen` / `hubDesc.erstellen` -> neue Beschreibung fuer den Medien/Content-Hub
- `hubs.optimieren` / `hubDesc.optimieren` -> erweiterte Beschreibung die auch KI-Text-Erstellung umfasst
- `hubs.medien` -> entfernen oder als Alias behalten

**3. CommandBar.tsx - Kategorien aktualisieren**
- Text-Studio Kategorie von `hubs.erstellen` auf `hubs.optimieren` aendern

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| `src/config/hubConfig.ts` | Erstellen-Hub entfernen, Items nach Optimieren, Medien zu Erstellen umbenennen |
| `src/lib/translations.ts` | Hub-Titel und Beschreibungen in allen 3 Sprachen anpassen |
| `src/components/ui/CommandBar.tsx` | Kategorie-Zuordnung aktualisieren |

