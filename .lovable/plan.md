

## TikTok Verifizierungs-URL korrigieren

TikTok sucht die Datei unter:
```
https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/tiktoklR1KqASHK1XQ0Is9kpAAqGUUFhhA8riW.txt
```

Unsere aktuelle Function heisst `tiktok-verify` und ist daher unter `/functions/v1/tiktok-verify` erreichbar -- falsche URL.

### Was passiert

1. **Alte Edge Function loeschen**: `supabase/functions/tiktok-verify/index.ts`
2. **Neue Edge Function erstellen**: `supabase/functions/tiktoklR1KqASHK1XQ0Is9kpAAqGUUFhhA8riW.txt/index.ts` -- der Ordnername wird zur URL

Der Inhalt bleibt identisch: gibt `tiktok-developers-site-verification=lR1KqASHK1XQ0Is9kpAAqGUUFhhA8riW` als `text/plain` zurueck.

### Technische Details

- Edge Function Ordnername = URL-Pfad nach `/functions/v1/`
- Punkte im Ordnernamen koennten problematisch sein bei Supabase Edge Functions
- Falls der Punkt im Namen nicht funktioniert, muessten wir einen alternativen Ansatz waehlen

