

## Fix: Version Guard False Positive (409-Fehler)

### Problem
Der neu implementierte Version Guard in `invoke-remotion-render` erzeugt einen **False Positive**:
- Serve-URL: `https://remotionlambda-eucentral1-...s3.../sites/adtool-remotion-bundle/index.html`
- Die Regex `/v(\d+)/i` matched auf "eucentral**1**" statt auf eine echte Versionsnummer
- Ergebnis: 409 "VERSION MISMATCH" obwohl Lambda und Bundle synchron sind

### Loesung
Den Version Guard von einem **blockierenden 409-Fehler** zu einem **reinen Warn-Log** umbauen. Wenn die Serve-URL keinen erkennbaren Versionsstring enthaelt (z.B. bei festen Site-Namen wie `adtool-remotion-bundle`), soll der Guard uebersprungen werden und den Render normal durchlassen.

### Aenderungen

**Datei: `supabase/functions/invoke-remotion-render/index.ts`**
- Regex verschaerfen: Nur explizite Versions-Patterns matchen (z.B. `v392`, `v4-0-424`), nicht einzelne Ziffern aus Hostnamen
- Wenn kein Versionsstring in der Serve-URL erkennbar ist: Guard ueberspringen (kein Block)
- Wenn ein Mismatch erkannt wird: nur `console.warn()` statt 409-Response, damit der Render trotzdem laeuft

### Technische Details
Die Regex `/v(\d+)/i` ist zu breit und matched auf beliebige `v` + Zahl Kombinationen in der URL (z.B. `eucentral1`). Korrektur auf spezifischere Patterns wie `/\/v(\d{3,})\b/` oder `/adtool-v(\d+)/` die nur im Site-Pfad matchen.
