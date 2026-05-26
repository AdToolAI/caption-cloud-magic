## Problem

Im Content Planner → Tab **"Kampagnen"** zeigt der leere Zustand einen Button **"Zu den Templates"**, der auf `/templates` navigiert. Diese Route ist in `src/App.tsx:311` auf `<ComingSoon />` gemappt → "Demnächst"-Screen.

Es existiert aber bereits ein voll funktionsfähiger **`CampaignTemplateDialog`** (`src/components/calendar/CampaignTemplateDialog.tsx`), der Templates aus `calendar_campaign_templates` lädt, Namen + Startdatum abfragt und eine komplette Kampagne (Schedule-Blocks) generiert. Dieser Dialog wird heute nur aus dem Kalender geöffnet.

## Lösung

Den bestehenden Dialog direkt in den Planner-Kampagnen-Tab einbauen, statt auf eine Coming-Soon-Seite zu schicken. Kein neues Backend nötig — alles ist bereits da.

### Änderungen

**1. `src/components/planner/CampaignTab.tsx`**
- State `showTemplateDialog` ergänzen.
- Button "Zu den Templates" im Empty-State + ein neuer **"+ Neue Kampagne"**-Button oben in der Liste (wenn schon Kampagnen existieren) öffnen den `CampaignTemplateDialog` inline statt zu `/templates` zu navigieren.
- Nach `onGenerated` → `fetchCampaigns()` + Erfolgs-Toast.
- Import: `CampaignTemplateDialog` aus `@/components/calendar/CampaignTemplateDialog`.

**2. `src/App.tsx`**
- Route `/templates` → von `<ComingSoon />` auf eine sinnvolle Lösung umstellen. Da `/templates` semantisch auf Kampagnen-Templates verweist (kommt aus dem Planner-Flow), redirecten wir auf `/planner?tab=campaigns&newCampaign=1`. Die Planner-Seite öffnet bei `newCampaign=1` automatisch den Dialog.

**3. `src/components/planner/PlannerV2.tsx`**
- URL-Param `tab` und `newCampaign` lesen → entsprechenden Tab aktivieren und `showTemplateDialog` initial auf `true` setzen, damit Deep-Links / der Redirect funktionieren.

### Technische Details

- `CampaignTemplateDialog` braucht `workspaceId` (in `CampaignTab` bereits als Prop vorhanden) und optional `brandKitId`.
- `onGenerated` callback re-fetched die Kampagnen-Liste — kein Reload nötig.
- `calendar_campaign_templates` Tabelle existiert bereits und enthält Public + Workspace-Templates; Dialog filtert per Tabs (All / My / Public).
- Keine DB-Migration, keine Edge Functions, keine neuen Übersetzungen nötig — `t('planner.goToTemplates')` etc. bleiben unverändert.

### Out-of-Scope

- Erstellen eigener Custom-Templates aus dem Planner (Dialog kann das aktuell nicht, der Kalender auch nicht — separates Feature).
- Andere `ComingSoon`-Routen (`/image-generator`, `/carousel-builder`, etc.) — nur `/templates` betrifft den Kampagnen-Flow.
