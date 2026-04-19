

## Entscheidung: Plan B — Resend direkt mit eigenem DNS-Setup

Du wählst **maximale Provider-Unabhängigkeit**. Resend bekommt seine DNS-Records bei deinem Domain-Registrar (nicht über Cloudflare-Auto-Authorize, nicht über Lovable).

## Wichtige Vorab-Klärung

In deinem Projekt sind bereits **Lovable-Email-Komponenten vorhanden** (`auth-email-hook`, `process-email-queue`, `email_send_log`-Tabelle). Falls in Lovable Cloud auch eine **Sender-Domain** auf einem Subdomain von `useadtool.ai` (z. B. `notify.useadtool.ai`) konfiguriert ist, müssen wir das wissen, **bevor** wir die DNS-Records bei Resend setzen — sonst riskieren wir Konflikte mit den NS-Delegationen, die Lovable bei Cloudflare gesetzt hat.

**Erste Aktion im Default-Mode:** Status der Lovable-Email-Domain prüfen und dir das Ergebnis zeigen.

## Plan

### Schritt 1: Cloudflare-Authorize-Tab schließen — NICHT klicken
Sonst überschreibt Cloudflare automatisch DNS-Records, was den Lovable-Setup brechen könnte.

### Schritt 2: Domain-Status in Lovable prüfen
Ich rufe den Status der konfigurierten Lovable-Email-Domain ab. Drei mögliche Ergebnisse:

- **Keine Lovable-Domain konfiguriert** → freie Bahn, du kannst `useadtool.ai` (Root) bei Resend nutzen
- **Lovable nutzt einen anderen Subdomain** (z. B. `notify.useadtool.ai`) → freie Bahn für Resend auf der Root-Domain
- **Lovable nutzt die Root-Domain oder denselben Subdomain wie Resend will** → echter Konflikt, du musst dich entscheiden

### Schritt 3: Resend-DNS-Records manuell beim Registrar setzen
Sobald wir wissen, dass kein Konflikt besteht:

1. **In Resend-Dashboard** → Domains → Add Domain → `useadtool.ai` (oder Subdomain wählen)
2. Resend zeigt dir 3–4 Records (typisch: 1× MX, 1× TXT/SPF, 1× TXT/DKIM, optional 1× TXT/DMARC)
3. **Wo trägst du sie ein?** → Bei deinem **Domain-Registrar** (dort, wo du `useadtool.ai` gekauft hast — IONOS, GoDaddy, Cloudflare als Registrar, Namecheap, Google Domains, etc.). Ich helfe dir bei der Identifikation, wenn du mir sagst, wo die Domain registriert ist.
4. Records exakt 1:1 kopieren (Name, Typ, Wert)
5. In Resend → "Verify DNS Records" → 5 Min bis 48 h warten

### Schritt 4: Verifizierungs-E-Mail neu auslösen
Sobald Resend die Domain als **Verified ✅** markiert:
- Edge Function `send-verification-email` neu aufrufen für `dusatkojr@web.de`
- E-Mail kommt innerhalb von Sekunden an
- Klick auf Verifizierungslink → Account aktiviert

### Schritt 5: Aufräumen
- Migration für `email_verification_tokens.user_id` UNIQUE-Constraint anwenden (liegt schon im Branch)
- Logs prüfen: `Email sent successfully: <id>`
- Eintrag in `email_verification_tokens` für den User checken

## Wichtige Hinweise

**Was ich für dich tun kann (im Default-Mode):**
- Domain-Status prüfen
- Migration anwenden (UNIQUE-Constraint)
- Verifizierungs-E-Mail neu auslösen
- Logs lesen und debuggen

**Was DU tun musst (manuell, kann ich nicht):**
- Cloudflare-Authorize-Tab schließen ohne klicken
- Resend-Dashboard öffnen, Domain hinzufügen, Records anzeigen lassen
- Records bei deinem Domain-Registrar eintragen
- "Verify DNS" in Resend klicken

## Aufwand

- Domain-Status-Check: 30 Sek
- Resend-Setup + manuelle DNS-Einträge: 5–10 Min (deine Arbeit)
- DNS-Propagation: 5 Min – 48 h (typisch < 1 h)
- Verifizierungs-E-Mail-Test: 30 Sek

**Gesamt:** 15 Min aktive Arbeit + Wartezeit auf DNS-Propagation.

## Nächster Schritt nach Approval

Sobald du diesen Plan freigibst:
1. Ich prüfe sofort den Lovable-Domain-Status
2. Sage dir, ob es einen Konflikt gibt oder freie Bahn
3. Du gehst parallel zu Resend und fügst die Domain hinzu
4. Du sagst mir, bei welchem Registrar `useadtool.ai` liegt — ich gebe dir bei Bedarf die exakten Klick-Pfade

