

## Problem

Die `sendWebPush`-Funktion in der Edge Function ist **nicht funktionsfähig**. Web Push erfordert:

1. **Payload-Verschlüsselung** (RFC 8291 / aes128gcm) mit den `p256dh` und `auth` Keys des Browsers
2. **VAPID-Authentifizierung** (RFC 8292) — ein signierter JWT im `Authorization`-Header

Die aktuelle Implementierung sendet nur einen einfachen `fetch`-Request ohne Verschlüsselung und ohne VAPID-Header. Das wird von jedem Push-Service (Google, Mozilla, Apple) mit einem Fehler abgelehnt.

### Lösung

Die Edge Function `send-push-notification` muss komplett neu geschrieben werden mit einer echten Web Push-Implementierung. Deno hat Zugriff auf die nötigen Crypto-APIs (`SubtleCrypto`).

### Änderungen

**1. `supabase/functions/send-push-notification/index.ts` — komplett neu**
- VAPID JWT generieren (ES256-Signatur mit dem Private Key)
- Payload mit ECDH + AES-128-GCM verschlüsseln (Web Push Encryption)
- Korrekte Headers senden (`Authorization: vapid t=...,k=...`, `Content-Encoding: aes128gcm`)
- Alle Crypto-Operationen über Deno's `SubtleCrypto` API

**2. `supabase/functions/send-push-notification/web-push.ts` — neue Hilfsdatei**
- Verschlüsselungs-Logik isoliert in eigener Datei
- Funktionen: `generateVapidHeaders()`, `encryptPayload()`

**3. Test per `curl_edge_functions`**
- Nach Deployment direkt testen ob VAPID Key abrufbar ist und Push-Versand funktioniert

### Technische Details

```text
Browser ──subscribe──▶ Push Service (FCM/Mozilla)
                          ▲
Edge Function ───────────┘
  1. Import VAPID_PRIVATE_KEY
  2. Create JWT (aud=push-service-origin, sub=mailto:...)
  3. ECDH key agreement with browser's p256dh
  4. Derive content encryption key
  5. AES-128-GCM encrypt payload
  6. POST to endpoint with Authorization + Crypto-Key headers
```

### Betroffene Dateien
- `supabase/functions/send-push-notification/index.ts` — Hauptlogik neu
- `supabase/functions/send-push-notification/web-push.ts` — neue Crypto-Hilfsdatei

