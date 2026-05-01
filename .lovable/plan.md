## Ziel

Drei Verbesserungen vor Launch:

1. **Support-Center upgraden** — professionelles UI, Datei-Uploads, geführter Wizard, Auto-Kontext
2. **Support-Mails an `info@useadtool.ai`** umleiten (aktuell hart-codiert auf `bestofproducts4u@gmail.com`)
3. **Automatischer Rechnungsversand** — bei jeder erfolgreichen Stripe-Zahlung bekommt der Kunde die Rechnung als E-Mail mit PDF-Link

---

## Teil 1 — Support-Center Upgrade

### 1.1 Storage & Datenbank (Migration)

Neuer privater Bucket `support-attachments`:
- RLS: Pfad MUSS mit `{user_id}/...` starten (Memory: Storage Path Constraint)
- Max 25 MB pro Datei, max 5 Dateien pro Ticket
- Erlaubte Typen: `image/*`, `video/mp4`, `video/quicktime`, `application/pdf`, `text/plain`

`support_tickets` erweitern:
- `attachments jsonb default '[]'` — Array von `{ path, name, size, type, signed_url }`
- `severity text default 'normal'` — `low | normal | high | blocking`
- `affected_module text` — z.B. `video-composer`, auto-detected aus URL
- `browser_info jsonb` — `{ userAgent, viewport, language, url, plan }`
- `expected_result text` / `actual_result text` / `reproduction_steps text`
- CHECK-Constraint `category` erweitern: `bug | rendering | publishing | account | billing | feature | other`

### 1.2 Neue Support-Seite (Rewrite)

`src/pages/Support.tsx` im James-Bond-Look (deep black, gold accents, glassmorphism), 3 Tabs:

**Tab 1 — "Neuen Fall melden"** (3-Schritt-Wizard):

```text
Step 1: Was ist passiert?
  - Kategorie (visuelle Karten + Icons)
  - Schweregrad (Pills: Niedrig / Normal / Hoch / Blockierend)
  - Betroffenes Modul (auto-vorausgewählt aus letzter URL)

Step 2: Beschreibung (geführt)
  - "Was wolltest du tun?"  (expected_result)
  - "Was ist stattdessen passiert?"  (actual_result)
  - "Schritte zum Reproduzieren"  (nummerierte Liste)
  - "Zusätzliche Details"  (Freitext)
  Hinweis-Banner: "Je präziser, desto schneller — Antwort meist <2h"

Step 3: Beweise & Absenden
  - Drag & Drop Uploader (max 5 × 25 MB)
  - Vorschau-Thumbnails mit Entfernen-Button
  - Auto-Kontext (read-only, einklappbar):
    Browser, OS, Viewport, Plan, User-ID, letzte Konsolen-Errors
  - Submit-Button mit Gold-Glow
```

**Tab 2 — "Meine Tickets"**: Liste eigener Tickets mit Status-Badges + Detail-Drawer.

**Tab 3 — "Schnelle Hilfe"**: Top-5-FAQ-Karten, Links zu `/faq` und `/status`, WhatsApp-Notfall-Button (nur sichtbar bei Severity = "blockierend").

### 1.3 Neue Komponenten

- `src/components/support/AttachmentUploader.tsx` — Drag & Drop, Validierung, Progress-Bar, Upload nach `support-attachments/{user_id}/{draft_id}/...`
- `src/components/support/SupportWizard.tsx` — 3-Schritt-Wizard
- `src/components/support/MyTicketsList.tsx`
- `src/components/support/QuickHelpPanel.tsx`
- `src/lib/support/contextCollector.ts` — sammelt Browser/Viewport/Plan/URL/Console-Errors
- `src/hooks/useConsoleErrorBuffer.ts` — Ring-Buffer für letzte 20 `console.error`-Einträge (mountet einmal in `App.tsx`)

---

## Teil 2 — Support-Mails an info@useadtool.ai

In `supabase/functions/send-support-ticket/index.ts`:
- Empfänger umstellen: `to: "info@useadtool.ai"` (Zeile 126, ersetzt das alte Gmail)
- Reply-To auf User-Email setzen, damit ihr direkt antworten könnt
- Neue Felder akzeptieren: `severity`, `affected_module`, `expected_result`, `actual_result`, `reproduction_steps`, `attachments[]`, `browser_info`
- Anhänge via Supabase Storage Signed URLs (7 Tage Gültigkeit) generieren und in der E-Mail verlinken (mit Vorschau-Thumbnails für Bilder)
- E-Mail-Template überarbeiten:
  - **Betreff**: `[SEVERITY] [Modul] — Subject — User-Email`
  - **Sektionen**: Problem-Zusammenfassung / Was wollte der User / Was ist passiert / Reproduktions-Schritte / Anhänge (Vorschau-Bilder + Links) / Tech-Kontext (eingeklappt)
- **User-Bestätigungs-E-Mail**: kurze Bestätigung mit Ticket-ID und erwarteter Antwortzeit (24h)

---

## Teil 3 — Automatischer Rechnungsversand

### 3.1 Stripe-Konfiguration in den Checkout-Flows

In **`create-checkout`** und **`create-enterprise-checkout`** beim Anlegen der Subscription/Checkout-Session ergänzen:

```text
invoice_creation: { enabled: true }                  (für Einmal-Zahlungen)
subscription_data: {
  invoice_settings: { issuer: { type: 'self' } }
}
customer_update: { address: 'auto', name: 'auto' }   (für korrekte Rechnungsadresse)
```

Außerdem beim Customer-Create/Update sicherstellen, dass `email` gesetzt ist und Stripe-Setting `Email finalized invoices to customers` aktiv ist (Stripe sendet dann automatisch die Rechnungs-E-Mail von Stripe aus — **das ist der einfachste, zuverlässigste Weg**).

### 3.2 Zusätzliche eigene Bestätigungs-E-Mail (gebrandet)

Im **`stripe-webhook`** auf das Event `invoice.payment_succeeded` (zusätzlich zum bereits existierenden `invoice.paid`-Handler für Affiliate-Commissions) reagieren und eine eigene gebrandete Bestätigungs-Mail an den Kunden schicken über die bestehende Lovable-Email-Infrastruktur:

- Neues Template `payment-receipt` in `_shared/transactional-email-templates/`:
  - Im `useadtool.ai`-Branding (gold/black)
  - Dynamische Daten: `customerName`, `amount`, `currency`, `invoiceNumber`, `periodStart`, `periodEnd`, `hostedInvoiceUrl`, `pdfUrl`
  - Großer "Rechnung herunterladen"-Button (verlinkt auf `invoice.invoice_pdf`)
  - Sekundärer Link auf `invoice.hosted_invoice_url`
- Im Webhook (nach erfolgreicher Verarbeitung von `invoice.payment_succeeded`):
  ```text
  supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'payment-receipt',
      recipientEmail: invoice.customer_email,
      idempotencyKey: `receipt-${invoice.id}`,
      templateData: { ... }
    }
  })
  ```
- `idempotencyKey: receipt-{invoice.id}` verhindert Doppel-Sends bei Webhook-Retries

### 3.3 Voraussetzungen für Lovable-Email

Falls noch keine Email-Domain konfiguriert ist, kommt der Setup-Dialog für `useadtool.ai` (Subdomain `notify.useadtool.ai`). Falls bereits konfiguriert, geht es direkt mit Scaffolding und Template-Erstellung weiter — beim Implementieren prüfe ich den Status zuerst.

---

## Dateien (Übersicht)

**Neu:**
- `supabase/migrations/<ts>_support_center_and_attachments.sql`
- `src/components/support/AttachmentUploader.tsx`
- `src/components/support/SupportWizard.tsx`
- `src/components/support/MyTicketsList.tsx`
- `src/components/support/QuickHelpPanel.tsx`
- `src/lib/support/contextCollector.ts`
- `src/hooks/useConsoleErrorBuffer.ts`
- `supabase/functions/_shared/transactional-email-templates/payment-receipt.tsx`

**Geändert:**
- `src/pages/Support.tsx` (Komplett-Rewrite)
- `src/App.tsx` (Console-Error-Buffer mounten)
- `supabase/functions/send-support-ticket/index.ts` (Empfänger → info@useadtool.ai, neue Felder, Reply-To, Anhänge, neues Template)
- `supabase/functions/create-checkout/index.ts` (`invoice_creation.enabled = true`)
- `supabase/functions/create-enterprise-checkout/index.ts` (gleich)
- `supabase/functions/stripe-webhook/index.ts` (Receipt-Email auf `invoice.payment_succeeded`)
- `supabase/functions/_shared/transactional-email-templates/registry.ts` (neues Template registrieren)

---

## Out-of-Scope (für später)

- Admin-Cockpit-Tab "Tickets" (Antworten direkt aus der App)
- Live-Chat / Intercom-Integration
- Eigene Rechnungs-PDF-Generierung (wir nutzen Stripes PDF, das spart Aufwand und ist rechtssicher)
- Automatische Severity-Vorhersage per KI

Sag Bescheid wenn ich starten soll, oder welche Teile (1, 2, 3 oder alle) ich zuerst angehen soll.