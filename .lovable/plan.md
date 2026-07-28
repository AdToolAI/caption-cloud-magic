## Kurzbefund

Der Team Workspace ist **visuell fertig, funktional aber nur ~60 % verdrahtet**. UI, i18n, Tabs, KPIs, Kanban-Ansicht und Enterprise-Checkout laufen. Mehrere Kern-Flows sind aber Read-only Attrappen oder haben Schema-Mismatches, die im Live-Betrieb sofort auffallen würden. Zusätzlich wird der Beta-Basic-Preis von 14,99 € auf **19,99 €** angehoben.

## Was funktioniert (verifiziert)

- Alle Tabellen existieren: `workspaces`, `workspace_members`, `workspace_invitations`, `content_tasks`, `content_approvals`, `user_roles`.
- Edge Functions vorhanden: `create-enterprise-checkout`, `update-workspace-seats`, `upgrade-to-enterprise`, `accept-invitation`.
- Workspace anlegen, Workspace wechseln, KPI-Chips, Kanban-Anzeige, Task anlegen, Enterprise-Upgrade-Checkout, Rollen-Matrix (rein visuell).

## Bestätigte Lücken / Bugs

1. **Einladung verschickt keine E-Mail.** `inviteMember` schreibt nur eine Zeile in `workspace_invitations`. Es gibt keine `send-invitation` Function und keinen DB-Trigger → der Eingeladene erfährt nie davon. `accept-invitation` existiert, wird aber ohne Link nie erreicht.
2. **Nicht-Enterprise-Owner können gar nicht einladen.** Der Invite-Button ist an `isEnterprise && canManage` gekoppelt. Solo-Plan-Kunden sehen nur den Upgrade-Prompt.
3. **Approvals sind read-only.** Approve/Reject/Kommentar fehlen komplett — kein Update auf `status`, `reviewed_by`, `reviewed_at`, `rejection_reason`, obwohl die Spalten existieren.
4. **Tasks lassen sich nach Anlage nicht bewegen.** Kein Statuswechsel (Backlog → In Progress → Review → Done), kein Löschen, kein Edit.
5. **Mitglieder als User-ID-Hash angezeigt.** Kein Join auf `profiles` für Name/E-Mail/Avatar.
6. **`RoleManager` Schema-Mismatch.** Component liest `user_roles` gefiltert nach `workspace_id`, doch dieselben Rollen leben schon in `workspace_members.role`. Doppelte Wahrheit, keine Sync-Logik → Tab bleibt in der Praxis leer.
7. **Activity-Tab hat kein echtes Event-Log** — nur lokale Aggregation aus Members/Tasks/Approvals.
8. **`updateWorkspaceSeats` triggert direkt nach Invite-Insert**, obwohl die Person noch nicht beigetreten ist → potenziell vorzeitige Seat-Abrechnung.
9. **PermissionMatrix ist rein visuell** — die dargestellten Rechte (invite, approve, billing) werden im UI nur teilweise per `canManage` erzwungen.

## Preis-Anpassung 14,99 € → 19,99 €

- `src/config/pricing.ts`: Alle drei Beta-Basic-Einträge (`price: { EUR: 14.99, USD: 14.99 }`) und `getPlanFromPriceId`-Fallback auf `19.99` setzen.
- Neues Stripe-Price-Objekt für 19,99 € EUR/monatlich anlegen und `priceId` an allen drei Stellen tauschen (alter Price bleibt für Bestandskunden gültig).
- Founders-Rabatt (20 %) und 24-Monats-Preisgarantie neu rechnen: garantierter Preis für die ersten 1 000 Nutzer = **15,99 €** (statt bisher 11,99 €). Text in `FoundersBenefitsDialog.tsx` und auf der Landing-Page (`Hero`, Beta-Banner, Pricing-Sektion) entsprechend anpassen.
- Übersetzungen in `src/lib/translations.ts` (DE/EN/ES) für alle sichtbaren Preistexte aktualisieren.
- Keine Migration bestehender Abos — läuft rein Stripe-seitig über den neuen Price für Neubuchungen.

## Vorgeschlagener Fix-Umfang Team Workspace (kein Schema-Change)

**A. Invitation-Loop schließen (kritisch für Live-Gang)**
- Neue Edge Function `send-workspace-invitation` (Resend über bestehende E-Mail-Infra): schreibt Invitation + verschickt Mail mit Accept-Link `/accept-invitation?token=<id>`.
- `TeamWorkspace.inviteMember` ruft diese Function statt Direkt-Insert auf.
- `updateWorkspaceSeats` erst in `accept-invitation` triggern.
- Invite-Button auch für Solo-Owner freischalten (Enterprise-Gate nur auf Bulk-Invite / harte Seat-Grenze).

**B. Approvals interaktiv machen**
- Inline-Approve / Reject Buttons für `pending`-Zeilen, sichtbar für `canManage`.
- Update `status`, `reviewed_by=user.id`, `reviewed_at=now()`, optional `rejection_reason` aus Textarea.

**C. Kanban voll bedienbar**
- Status-Dropdown je Karte + Delete für `canManage`; `completed_at` setzen bei `done`.
- Optional HTML5-Drag&Drop.

**D. Mitglieder mit Profil-Join**
- Zusätzlicher `profiles`-Query (email, display_name, avatar_url) für angezeigte Members.
- Inline Rollenwechsel + Entfernen für Owner/Admin über `workspace_members`.

**E. Roles-Tab entwirren**
- `RoleManager` durch schlanke Ansicht ersetzen, die `workspace_members` liest/mutiert — eine Quelle der Wahrheit. `user_roles` bleibt der App-globalen Admin-Rolle vorbehalten.

**F. Activity-Tab realistisch labeln**
- Klare Beschriftung „Abgeleitete Signale (letzte 25)" statt „Signal Log". Echtes Audit-Log bleibt spätere Ausbaustufe.

## Nicht enthalten

- Neue Tabellen, RLS-Änderungen, neue Plan-Struktur.
- Vollständiges Audit-Log-System.
- Realtime-Subscriptions.
- Migration bestehender 14,99 €-Abos auf den neuen Price.

## Ergebnis nach dem Fix

Ein Team-Workspace, in dem Owner tatsächlich einladen, Rollen ändern, Tasks durch den Kanban schieben und Approvals mit einem Klick freigeben — mit echten Namen statt IDs. Gleichzeitig läuft das Beta-Pricing sauber auf 19,99 € / Monat mit garantierten 15,99 € für die ersten 1 000 Founders über 24 Monate.
