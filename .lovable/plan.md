

## TikTok Domain-Verifizierung

TikTok erwartet, dass die Datei unter einer bestimmten URL abrufbar ist. Wir erstellen eine Edge Function, die den Verifizierungsinhalt zurückgibt.

### Was passiert

1. **Neue Edge Function erstellen**: `tiktok-verify` – gibt den exakten Verifizierungstext zurück:
   ```
   tiktok-developers-site-verification=lR1KqASHK1XQ0Is9kpAAqGUUFhhA8riW
   ```

2. **Content-Type**: `text/plain` (TikTok erwartet eine reine Textdatei)

3. **Kein Auth nötig**: Die Funktion muss öffentlich erreichbar sein (kein JWT-Check)

### Ergebnis

Die Verifizierungsdatei wird unter dieser URL erreichbar sein:
```
https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/tiktok-verify
```

Nach dem Deployment gibst du diese URL im TikTok Developer Portal als Domain-Verifizierung ein und klickst auf "Verify".

### Technische Details

- Datei: `supabase/functions/tiktok-verify/index.ts`
- Einfache Funktion, die auf GET/POST mit dem Verifizierungstext antwortet
- CORS-Headers für Kompatibilität

