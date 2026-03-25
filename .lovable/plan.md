

## RecoCard: Anfängerstrategie bei weniger als 10 Posts

### Problem
Aktuell wird die RecoCard bei < 10 Posts komplett ausgeblendet. Neue Nutzer sehen keine Empfehlungen und verpassen Orientierung.

### Loesung
Bei < 10 Posts werden statt datenbasierter Insights **statische Anfaenger-Tipps** angezeigt — allgemeine Best Practices fuer Social Media. Zusaetzlich ein Hinweis, dass personalisierte Empfehlungen ab 10 Posts verfuegbar werden.

### Anfaenger-Empfehlungen (hardcoded)
1. **Regelmaessig posten** — "Poste mindestens 3x pro Woche fuer stetiges Wachstum" (Icon: Target)
2. **Beste Zeiten testen** — "Probiere verschiedene Uhrzeiten und beobachte dein Engagement" (Icon: Clock)
3. **Hashtags nutzen** — "Verwende 5-10 relevante Hashtags pro Post" (Icon: Hash)

### Aenderungen

| Datei | Aenderung |
|---|---|
| `src/features/recommendations/RecoCard.tsx` | Neues Array `BEGINNER_RECOMMENDATIONS` mit 3 statischen Tipps. Wenn `posts.length < 10`: diese anzeigen statt `return null`. Unten ein Text wie "Ab 10 Posts erhaeltst du personalisierte KI-Empfehlungen" statt der aktuellen 28-Tage-Info. Ueberschrift aendern zu "Starter-Tipps" wenn Anfaenger-Modus aktiv. |

### UI-Verhalten
- **< 10 Posts**: Starter-Tipps anzeigen, "Uebernehmen"-Button navigiert zu passender Seite (Kalender, Composer)
- **>= 10 Posts**: Wie bisher — echte datenbasierte Insights
- **Kein User eingeloggt**: Karte ausblenden (wie bisher)

