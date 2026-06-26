
## Problem

Die Smoke Matrix UI zeigt pro Kategorie viel zu wenige Functions (Social Publishing: 1 statt 20, Audio/Music: 5 statt 38). Insgesamt nur ~29 statt 182.

## Ursache

`_shared/smokeRegistry.ts` enthält lokal bereits alle 182 Einträge (verifiziert: 20 social-publishing, 38 audio-music-sfx, 19 briefing-composer, 14 analytics, 35 admin-cron …). Die Edge Function `smoke-matrix-run` importiert dieses Shared-File aber zur **Deploy-Zeit** als Bundle. Da `smoke-matrix-run` selbst seit dem Registry-Wachstum nicht erneut deployed wurde, läuft im Cloud noch die alte 75er-Version.

Die 106 frisch deployten Provider-Functions sind korrekt oben — sie werden nur nicht aufgerufen, weil der Runner sie nicht kennt.

## Fix

Einzig nötiger Schritt:

1. **Re-deploy `smoke-matrix-run`** über `supabase--deploy_edge_functions`. Das bundelt `_shared/smokeRegistry.ts` neu mit allen 182 Einträgen.

Keine Code-Änderung nötig.

## Verifikation

Nach Deploy im Cockpit:
- Dropdown "Social Publishing" → "Sweep starten" sollte 20 Functions zeigen
- "Audio / Music / SFX" sollte 38 Functions zeigen
- "Briefing & Composer" sollte 19 zeigen
- "Alle Kategorien sequentiell" Gesamt ≈ 182

Falls einzelne neu gepatchte Functions failen → das ist erwartete Wave-B-Fehlersuche, separat zu behandeln.

## Hinweis für künftige Waves

Jede Änderung an `_shared/smokeRegistry.ts` muss zwingend von einem Re-Deploy von `smoke-matrix-run` begleitet werden, sonst läuft der Cloud-Runner mit einer veralteten Bundled-Kopie. Werde ich ab jetzt automatisch mit-deployen.
