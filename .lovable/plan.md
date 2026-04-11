

## Plan: Fehlende Übersetzungsschlüssel hinzufügen

### Problem
Die Hub-Karten zeigen rohe Schlüssel wie "nav.community" statt übersetztem Text, weil mehrere Übersetzungsschlüssel in `src/lib/translations.ts` fehlen.

### Fehlende Schlüssel

| Schlüssel | EN | DE | ES |
|---|---|---|---|
| `nav.community` | Community | Community | Comunidad |
| `hubItemDesc.brandKit` | Manage your brand colors, fonts and templates | Verwalte Markenfarben, Schriften und Vorlagen | Gestiona colores, fuentes y plantillas de marca |
| `hubItemDesc.campaigns` | Plan and manage marketing campaigns with AI | Plane und verwalte Kampagnen mit KI | Planifica y gestiona campañas con IA |

### Änderungen

**`src/lib/translations.ts`** — 6 Einfügungen:
1. `nav.community` in EN (nach Zeile ~2067), DE (nach ~5020), ES (nach ~7763)
2. `hubItemDesc.brandKit` in EN (nach Zeile ~1628), DE (nach ~4592), ES (nach ~7516)
3. `hubItemDesc.campaigns` in EN (nach Zeile ~1628), DE (nach ~4592), ES (nach ~7516)

### Betroffene Datei
- `src/lib/translations.ts`

