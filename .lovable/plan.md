## Ziel
Team-Workspace-Seite auf das „Bond-Gold"-Niveau der Plattform heben (Deep-Black + Gold + Glass) und funktional ausbauen. Aktuell zeigt die Seite rohe i18n-Keys (`team.title`, `team.members`, …), weil der DE- und ES-Sprachblock keinen `team: { … }`-Namespace enthält – das wird nebenbei sauber behoben.

## 1. i18n-Fix (Root-Cause der „team.xxx"-Anzeige)
- In `src/lib/translations.ts` den kompletten `team: { … }`-Namespace, den es aktuell nur im `en`-Block gibt (Zeile 1388), 1:1 in den `de:`- und `es:`-Block einfügen (übersetzt).
- Fehlende neue Keys für die unten beschriebenen Cockpit-/Ausbau-Bereiche in allen drei Sprachen ergänzen.

## 2. Visueller Rebuild `src/pages/TeamWorkspace.tsx`
Komplett neu aufgebaut im Bond-Gold-Stil (analog Analysieren-Hub, Mission Command Deck):

- **Cinematic Hero**: schwarzer Radial-Gradient, Playfair-Display-Headline in Gold, animierter Signal-Ring, KPI-Chips („Aktive Seats", „Offene Approvals", „Tasks diese Woche", „Ø Reaktionszeit").
- **Workspace-Switcher** als Glass-Card mit Rolle, Mitgliedszahl, Plan-Badge, Owner-Avatar-Stack.
- **Command-Tabs** (Members · Roles · Tasks · Approvals · Activity · Billing) als Gold-underline Segmented-Nav mit Icon-Chips und Live-Count-Badges.

## 3. Funktionaler Ausbau
Innerhalb der bestehenden Tabellen (`workspaces`, `workspace_members`, `content_tasks`, `content_approvals`, `user_roles`) – **kein Schema-Change**, nur zusätzliche Reads/Writes:

- **Members-Tab**
  - Roster-Grid mit Avatar-Ring, Rolle, „Last Active" (aus `updated_at`), Seat-Status.
  - Bulk-Invite (Textarea mit Komma-Liste), Rollen-Vorschlag.
  - Inline Rollenwechsel + Entfernen (nur Owner/Admin, per `has_role`).
- **Roles-Tab**
  - Bestehender `RoleManager` in Glass-Card gerahmt, Permission-Matrix-Visualisierung (Read/Write/Approve/Billing) als Bond-Gold-Grid.
- **Tasks-Tab**
  - Kanban-Ansicht (Backlog · In Arbeit · Review · Done) statt Formular-only, Priority-Chips, Assignee-Avatar, Due-Countdown.
  - Formular als Slide-Over statt Inline-Card.
- **Approvals-Tab**
  - Approval-Queue mit Vorschau-Thumb (aus `content_items`/`video_creations`), Approve/Reject direkt inline, Kommentar-Feld.
- **Activity-Tab (neu)**
  - Signal-Log-Komponente wie auf der Startseite, gefiltert auf `workspace_id` (Task-, Approval-, Member-Events).
- **Billing/Seats-Tab**
  - `EnterpriseSeatManager` + `EnterpriseUpgradePrompt` neu gestylt, Seat-Auslastungs-Ring, klarer CTA.

## 4. Neue/angepasste Dateien
```text
src/pages/TeamWorkspace.tsx                 (Rewrite, Bond-Gold + neue Tabs)
src/components/team/TeamHero.tsx            (neu)
src/components/team/WorkspaceSwitcher.tsx   (neu)
src/components/team/MembersRoster.tsx       (neu)
src/components/team/TasksKanban.tsx         (neu)
src/components/team/ApprovalsQueue.tsx      (neu)
src/components/team/TeamActivityLog.tsx     (neu, nutzt vorhandenes Signal-Log-Muster)
src/components/team/PermissionMatrix.tsx    (neu)
src/components/team/RoleManager.tsx         (Styling-Refactor)
src/components/team/EnterpriseSeatManager.tsx (Styling-Refactor)
src/components/team/EnterpriseUpgradePrompt.tsx (Styling-Refactor)
src/lib/translations.ts                     (DE + ES team-Namespace + neue Keys)
```

## 5. Technische Leitplanken
- Nur semantische Design-Tokens (`bg-background`, `text-primary`, `border-primary/20`) – keine Hardcodes wie `text-white`/`#F5C76A`.
- Keine Schema-Changes, keine neuen RLS-Policies (bestehende Policies decken alle CRUD-Aktionen).
- Alle DB-Reads laufen weiter über `supabase` client mit `workspace_id`-Filter.
- Keine Änderung an Auth/Founders/Preis-Logik.

## 6. Nicht enthalten
- Neue Backend-Tabellen oder Edge-Functions.
- Änderungen an Cast & World / Studios / Rendering-Pipeline.
- Preis- oder Plan-Änderungen.
