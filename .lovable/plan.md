

## Kein Plan nötig — nur eine Einstellung

Deine Kunden besuchen `https://useadtool.ai` und sehen:
- **Keine Lovable-URL** — die `.lovable.app` Domain ist nur in deinem Lovable-Dashboard sichtbar
- **Kein Lovable-Branding im Code** — der Quellcode zeigt "AdTool AI" überall

Das Einzige, was Kunden noch sehen könnten, ist das **"Edit with Lovable" Badge** unten rechts auf der publizierten Seite. Das kann ich jetzt ausblenden.

### Aktion
- Badge ausblenden via `set_badge_visibility(hide_badge: true)`

Das war's — danach gibt es keinen sichtbaren Hinweis mehr auf Lovable für deine Nutzer.

