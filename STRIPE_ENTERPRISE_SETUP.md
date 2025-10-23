# Stripe Enterprise Setup Guide

## 🎯 Übersicht
Für die Enterprise Team-Funktion benötigst du zwei Stripe-Produkte mit unterschiedlichen Preisen für EUR und USD.

## 📋 Schritt 1: Stripe-Produkte erstellen

### 1.1 Enterprise Base Plan erstellen

1. Gehe zu [Stripe Dashboard → Produkte](https://dashboard.stripe.com/products)
2. Klicke auf **"Produkt hinzufügen"**
3. Fülle die Details aus:
   - **Name**: `Enterprise Team - Base Plan`
   - **Beschreibung**: `Base subscription for Enterprise Team workspaces - includes 1 user`
   - **Preismodell**: Wiederkehrend
   
4. Erstelle **zwei Preise** für dieses Produkt:
   
   **EUR-Preis:**
   - Betrag: `49.99 EUR`
   - Abrechnungsintervall: `Monatlich`
   - Kopiere die **Price ID** (beginnt mit `price_...`)
   
   **USD-Preis:**
   - Betrag: `49.99 USD`
   - Abrechnungsintervall: `Monatlich`
   - Kopiere die **Price ID** (beginnt mit `price_...`)

### 1.2 (Optional) Enterprise Seat Add-On erstellen

Falls du separate Line Items für Basis + Seats möchtest (aktuell nicht erforderlich):

1. Erstelle ein zweites Produkt: `Enterprise Seat Add-On`
2. Preise: `49.99 EUR` und `49.99 USD` (monatlich)
3. Kopiere beide Price IDs

---

## 🔐 Schritt 2: Secrets in Lovable hinzufügen

Du musst jetzt die folgenden Secrets in deinem Projekt hinzufügen:

### Erforderliche Secrets:

| Secret Name | Wert | Beispiel |
|-------------|------|----------|
| `STRIPE_PRICE_ENTERPRISE_BASE_EUR` | EUR Price ID vom Base Plan | `price_1ABC...` |
| `STRIPE_PRICE_ENTERPRISE_BASE_USD` | USD Price ID vom Base Plan | `price_1XYZ...` |

### Optional (für separate Seat Add-Ons):

| Secret Name | Wert |
|-------------|------|
| `STRIPE_PRICE_ENTERPRISE_SEAT_EUR` | EUR Price ID vom Seat Add-On |
| `STRIPE_PRICE_ENTERPRISE_SEAT_USD` | USD Price ID vom Seat Add-On |

---

## 🚀 Schritt 3: Secrets hinzufügen

Ich werde jetzt die Tools aufrufen, um die Secrets zu erstellen. Du wirst dann aufgefordert, die Werte einzugeben.

---

## ✅ Nächste Schritte nach Setup

Nach dem Hinzufügen der Secrets:

1. ✅ Trigger ist aktiviert → Non-Enterprise Workspaces können keine Multi-User haben
2. ✅ Enterprise Checkout funktioniert mit korrekter Währung
3. ✅ Seat-Count wird automatisch an Stripe übermittelt

---

## 🧪 Testing

1. Erstelle einen Test-Workspace
2. Klicke auf "Upgrade to Enterprise"
3. Wähle EUR oder USD (basierend auf Sprache)
4. Schließe Checkout ab
5. Lade ein zweites Mitglied ein
6. Prüfe in Stripe → Subscription Quantity sollte auf 2 erhöht werden

---

## 🐛 Troubleshooting

**Problem**: Checkout schlägt fehl mit "Enterprise pricing not configured"
- **Lösung**: Prüfe, ob die Secrets `STRIPE_PRICE_ENTERPRISE_BASE_EUR/USD` korrekt gesetzt sind

**Problem**: Non-Enterprise Workspace kann immer noch mehrere Members hinzufügen
- **Lösung**: Trigger wurde aktiviert, aber nur für **neue** Inserts. Bestehende Members müssen ggf. manuell geprüft werden.

**Problem**: Seat Count wird nicht automatisch aktualisiert
- **Lösung**: Edge Function `update-workspace-seats` prüfen → Logs in Lovable Cloud ansehen
