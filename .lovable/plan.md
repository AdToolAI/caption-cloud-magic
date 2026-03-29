

## Dedizierte "Account löschen" Seite

### Was wird gebaut
Eine eigenständige Seite unter `/account/delete` mit einem rechtlich korrekten Lösch-Flow, inklusive Bestätigungs-Checkboxen und klarer Kommunikation der 30-Tage-Widerrufsfrist.

### Seitenaufbau

```text
┌─────────────────────────────────────────┐
│  ⚠️  Account unwiderruflich löschen     │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Was wird gelöscht:                 │  │
│  │ • Alle Projekte und Medien         │  │
│  │ • Alle Credits und Transaktionen   │  │
│  │ • Persönliche Einstellungen        │  │
│  │ • Aktives Abo wird gekündigt       │  │
│  └────────────────────────────────────┘  │
│                                          │
│  📥 Daten vorher exportieren (Button)    │
│                                          │
│  ☐ Ich verstehe, dass alle Daten        │
│    nach 30 Tagen unwiderruflich          │
│    gelöscht werden.                      │
│                                          │
│  ☐ Ich habe die AGB und Datenschutz-    │
│    bestimmungen zur Kenntnis genommen.   │
│                                          │
│  ☐ Ich bestätige, dass mein Abo         │
│    gekündigt und Credits verfallen.      │
│                                          │
│  E-Mail eingeben: [____________]         │
│                                          │
│  [Abbrechen]  [Account endgültig löschen]│
│  (Button nur aktiv wenn alle ☐ ✓        │
│   und E-Mail korrekt)                    │
└─────────────────────────────────────────┘
```

### Änderungen

| Datei | Änderung |
|---|---|
| `src/pages/DeleteAccount.tsx` | Neue Seite: Warnhinweise, 3 Pflicht-Checkboxen, E-Mail-Bestätigung, Datenexport-Button, Lösch-Button, 30-Tage-Hinweis |
| `src/App.tsx` | Route `/account/delete` hinzufügen (geschützt via ProtectedRoute) |
| `src/components/account/AdvancedTab.tsx` | "Konto löschen"-Card: Dialog entfernen, stattdessen Link-Button zu `/account/delete` |

### Rechtliche Absicherung
- 3 Pflicht-Checkboxen müssen alle angehakt sein
- E-Mail-Bestätigung als doppelte Sicherheit
- Hinweis auf 30-Tage-Widerrufsfrist
- Links zu AGB und Datenschutzbestimmungen in den Checkboxen
- Datenexport-Option prominent angeboten vor dem Löschen

### URL für Meta
Die resultierende URL `https://useadtool.ai/account/delete` kann als "Anleitung zur Datenlöschung" in den Meta App Settings hinterlegt werden.

