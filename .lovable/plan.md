

## Plan: TikTok Redirect-URI Diagnose + Fix

### Analyse

Der `tiktok-health`-Endpunkt zeigt aktuell nur `hasRedirectUri: true`, aber **nicht den tatsächlichen Wert**. Das ist das fehlende Puzzlestück — wir können nicht prüfen, ob die `TIKTOK_REDIRECT_URI` mit dem TikTok-Portal übereinstimmt.

Auffällig: Die Projektnotizen sagen, die im Portal registrierte URI ist:
```
https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/tiktok-callback
```
Aber die Edge Function heißt **`tiktok-oauth-callback`**, was diese URL ergeben würde:
```
https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/tiktok-oauth-callback
```

Falls die `TIKTOK_REDIRECT_URI`-Secret nicht exakt mit der im TikTok-Portal registrierten URL übereinstimmt, lehnt TikTok den gesamten OAuth-Flow ab — mit genau diesem "client_key"-Fehler.

### Umsetzung

**Schritt 1: `supabase/functions/tiktok-health/index.ts`**
- Die tatsächliche `TIKTOK_REDIRECT_URI` im Response anzeigen (ist keine geheime Information, nur eine URL)
- Die generierte Auth-URL als Test-Wert mitgeben

**Schritt 2: Diagnose**
- Health-Endpunkt aufrufen und die angezeigte Redirect-URI mit dem TikTok-Portal vergleichen
- Falls Mismatch: Secret aktualisieren oder Portal-Eintrag korrigieren

**Schritt 3: Alle TikTok-Functions redeployen**
- `tiktok-oauth-start`, `tiktok-oauth-callback`, `tiktok-health` frisch deployen um sicherzustellen, dass alle denselben Shared-Code verwenden

### Betroffene Dateien
- `supabase/functions/tiktok-health/index.ts` — Redirect-URI + Test-Auth-URL anzeigen

### Ergebnis
Wir sehen sofort, welche Redirect-URI tatsächlich verwendet wird und können sie mit dem Portal abgleichen. Das ist der wahrscheinlichste Grund für den "client_key"-Fehler.

