

## Plan: TikTok Sandbox Credentials aktualisieren

### Was wird gemacht
Die beiden TikTok-Secrets werden auf die **Sandbox-Werte** aus dem Developer Portal (Screenshot: "captiongenie_test") aktualisiert.

### Secrets die aktualisiert werden

1. **TIKTOK_CLIENT_KEY** — Sandbox Client Key (wird in Edge Functions verwendet)
2. **TIKTOK_CLIENT_SECRET** — Sandbox Client Secret (wird in Edge Functions verwendet)

Zusätzlich wird **VITE_TIKTOK_CLIENT_KEY** im Frontend aktualisiert (wird für den OAuth-Start-Link benötigt).

### Ablauf
- Ich werde dich nacheinander auffordern, die Sandbox-Werte aus dem TikTok Developer Portal einzugeben (über sichere Secret-Eingabe)
- Die Werte werden verschlüsselt gespeichert und sind sofort in den Edge Functions verfügbar

### Ergebnis
- OAuth-Flow nutzt den Sandbox Client Key → kein `client_key`-Fehler mehr
- TikTok-Verbindung funktioniert wieder im Sandbox-Modus

