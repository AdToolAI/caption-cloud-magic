

## Fix: KI-Analyse deployen & Plattform-Icons mit Glow-Effekt

### Problem 1: KI-Analyse "Failed to send a request to the Edge Function"
Die Edge Function `analyze-performance-strategy` existiert im Code, wurde aber nie deployed. Daher schlaegt jeder Aufruf fehl.

**Loesung**: Edge Function deployen. Keine Code-Aenderungen noetig.

### Problem 2: Plattform-Icons im Analytics Dashboard sehen anders aus als auf dem Dashboard
Die `PlatformOverviewCards` verwenden Emoji-Icons (📸, 📘, ▶️) statt der Lucide-Icons mit Markenfarben und Glow-Effekt wie in `SocialConnectionIcons` auf der Startseite.

**Loesung**: `PlatformOverviewCards.tsx` ueberarbeiten:
- Emoji-Icons ersetzen durch Lucide-Icons (Instagram, Facebook, Youtube, Music, Linkedin, Twitter)
- Markenfarben anwenden (pink-500, blue-500, red-600, etc.) -- gleich wie in SocialConnectionIcons
- Glow-Effekt hinzufuegen: `drop-shadow` bzw. `shadow-[0_0_8px_...]` bei verbundenen Plattformen
- Verbunden-Badge in Markenfarbe statt generischem Badge
- Nicht-verbundene Icons ausgegraut (text-muted-foreground/40) wie auf dem Dashboard

### Technische Aenderungen

| Aktion | Detail |
|---|---|
| Deploy Edge Function | `analyze-performance-strategy` deployen |
| `src/components/analytics/PlatformOverviewCards.tsx` | Lucide-Icons mit Glow-Effekt statt Emojis, Markenfarben konsistent mit Dashboard |

