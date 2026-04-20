

## Plan: Email Bounce-Rate Fix + Suppression-Liste UI

### Was sich ändert

**1. Bounce-Rate-Formel korrigieren** (`EmailDashboard.tsx`)

Statt `suppressed / total` nutzen wir die saubere Formel:
```
bounceRate = (echte Bounces + Complaints im Zeitfenster) / (sent + bounces) × 100
```

Quelle: `email_suppression_list` mit `reason IN ('bounce', 'complaint')` und `suppressed_at >= sinceIso` (zeitgefiltert, nicht alle historischen).

**2. Test-Adressen ausfiltern** (Backend + UI)

Resend-Test-Adressen (`bounced@resend.dev`, `bounced+*@resend.dev`, `complained@resend.dev`, `delivered@resend.dev`) werden:
- Im Dashboard-KPI **ausgeschlossen** (separate Anzeige als „Test-Bounces")
- In der Suppression-Liste **mit Test-Badge markiert**

**3. Neue Suppression-Liste UI** (Erweiterung von `SuppressionManager.tsx`)

Aktuell hat der Manager nur Add/Remove. Wir erweitern ihn um:
- **Tabelle aller suppressed Emails** (paginiert, 25 pro Seite)
- **Spalten**: Email, Grund (Bounce/Complaint/Unsubscribe/Manual mit farbigen Badges), Datum, Test-Badge, Aktionen
- **Filter**: Nach Grund + Suchfeld für Email
- **Bulk-Action**: „Alle Test-Adressen entfernen" (One-Click Cleanup)
- **Einzeln entfernen**: Trash-Icon pro Zeile (mit Bestätigung)
- **Export als CSV** (für Audit/Compliance)

**4. Neue KPI-Karten im Dashboard**

Statt nur „Bounce-Rate" zeigen wir:
- **Echte Bounces** (ohne Test-Adressen)
- **Complaints** (Spam-Beschwerden)
- **Unsubscribes** (Marketing Opt-outs)
- **Test-Bounces** (separat, mit Hinweis „nur zum Testen")

**5. Backend: Edge Function erweitern** (`admin-suppression-manage`)

Neue Action `bulk_remove_test`:
```ts
// Entfernt alle Resend-Test-Adressen mit einem Call
DELETE FROM email_suppression_list 
WHERE email LIKE '%@resend.dev'
```

### Technische Details

**Geänderte Dateien:**
- `src/pages/admin/EmailDashboard.tsx` — KPI-Berechnung korrigieren
- `src/components/admin/email/EmailKpiCards.tsx` — Karten erweitern (4 statt 1 Bounce-Karte)
- `src/components/admin/email/SuppressionManager.tsx` — Tabelle + Filter + Bulk-Action hinzufügen
- `supabase/functions/admin-suppression-manage/index.ts` — `bulk_remove_test` Action ergänzen

**Neue Komponente:**
- `src/components/admin/email/SuppressionList.tsx` — Read-Only Tabelle (in SuppressionManager eingebettet)

**Helper-Funktion:**
```ts
const isTestAddress = (email: string) => 
  /^(bounced|complained|delivered)(\+[^@]*)?@resend\.dev$/i.test(email);
```

**RLS:** Bestehende Policy `Admins can view suppression list` reicht aus — keine neuen Policies nötig.

### Was der User danach hat

✅ **Realistische Bounce-Rate** (0% statt fake 100%, weil Test-Adresse rausgefiltert wird)  
✅ **Vollständige Suppression-Übersicht** mit Filter und Suche  
✅ **One-Click Cleanup** für Test-Adressen  
✅ **CSV-Export** für Audits  
✅ **Klare Trennung** zwischen echten Bounces und Test-Bounces  

### Was du danach tun solltest

1. Im neuen Suppression-UI auf **„Alle Test-Adressen entfernen"** klicken → Bounce-Rate fällt auf 0%
2. In Zukunft beim Testen die Adresse `delivered@resend.dev` nutzen (löst keinen Bounce aus)

