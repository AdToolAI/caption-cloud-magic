

## KI-Content-Audit Tool komplett entfernen

### Zu loeschende Dateien
- `src/pages/Audit.tsx`
- `src/components/audit/AuditHeroHeader.tsx`
- `supabase/functions/analyze-audit/index.ts`

### Zu bearbeitende Dateien

| Datei | Aenderung |
|---|---|
| `src/App.tsx` | Import und Route `/audit` entfernen |
| `src/config/hubConfig.ts` | Audit-Eintrag aus Hub-Navigation entfernen |
| `src/components/CommandPalette.tsx` | Audit-Eintrag aus Command Palette entfernen |

### Datenbank-Migration
- Tabellen `content_audit_items` und `content_audits` droppen (in dieser Reihenfolge wegen Foreign Key)

### Nicht angefasst
- Edge Function `analyze-performance-strategy` (KI-Analyse im Analytics Dashboard) bleibt bestehen
- Alle anderen Analytics-Komponenten bleiben unveraendert

