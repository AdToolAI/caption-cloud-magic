

## Plan: Push-Benachrichtigungs-Anleitung in KI-Assistenten integrieren

### Änderung

**Datei: `supabase/functions/ai-companion/index.ts`**

Im `ADTOOL_KNOWLEDGE`-String einen neuen Abschnitt nach dem FAQ-Bereich einfügen:

**Neuer Abschnitt: `📱 PUSH-BENACHRICHTIGUNGEN EINRICHTEN`**

Enthält:
- **Android (Chrome)**: App-URL öffnen → Drei-Punkte-Menü → "Zum Startbildschirm hinzufügen" → App vom Startbildschirm öffnen → Konto → Benachrichtigungen → Push aktivieren → Chrome-Benachrichtigungen in Android-Einstellungen erlauben
- **iPhone/iOS (Safari)**: App-URL in Safari öffnen → Teilen-Button (□↑) → "Zum Home-Bildschirm" → App vom Home-Bildschirm öffnen → Konto → Benachrichtigungen → Push aktivieren
- **Troubleshooting**: Toggle reagiert nicht, Push blockiert, keine Benachrichtigungen trotz Aktivierung
- **Action-Link**: `[Benachrichtigungen öffnen](/account?tab=notifications)`

### Ergebnis
Nutzer können den KI-Assistenten fragen "Wie aktiviere ich Push-Benachrichtigungen auf dem Handy?" und erhalten eine vollständige Schritt-für-Schritt-Anleitung für ihr Gerät.

