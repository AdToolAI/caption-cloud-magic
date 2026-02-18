
# Fix: Lambda crasht weil `renderId` kein gueltiger Input-Parameter ist

## Das eigentliche Problem

Laut der offiziellen Remotion-Dokumentation ist `renderId` ein **Rueckgabewert** von Lambda -- KEIN Eingabe-Parameter. Lambda generiert intern seine eigene `renderId`. Wenn wir `renderId` im Payload mitschicken, crasht Lambda still beim Initialisieren (kein Output, kein Webhook, kein progress.json).

**Beweis aus den Logs:**
- S3 HEAD fuer `out.mp4` = 404 (kein Video)
- S3 HEAD fuer `progress.json` = 404 (Lambda hat nie gestartet)
- Kein Webhook aufgerufen (Lambda ist vor dem Rendering gecrasht)

## Warum Director's Cut funktioniert

Director's Cut nutzt `RequestResponse` (synchron) und bekommt `renderId` als **Antwort** zurueck. Ausserdem kontrolliert es den Output-Pfad mit `outName` als **einfacher String**: `directors-cut-${id}.mp4`.

## Loesung

Zwei Aenderungen:

### Aenderung 1: Lambda Payload korrigieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

- `renderId` aus dem Payload **entfernen**
- `outName` als **einfachen String** hinzufuegen: `universal-video-${pendingRenderId}.mp4`
- Das ist exakt das gleiche Format wie Director's Cut (`directors-cut-${id}.mp4`)

### Aenderung 2: S3-Polling anpassen
**Datei:** `supabase/functions/check-remotion-progress/index.ts`

- Zusaetzlich zum bestehenden Pfad `renders/{renderId}/out.mp4` auch den `outName`-Pfad checken: `universal-video-${renderId}.mp4` im Bucket-Root
- Wenn der `source` aus `video_renders` den Wert `universal-creator` hat, direkt den `outName`-Pfad verwenden

### Warum das diesmal funktioniert

| Aspekt | Vorher (crasht) | Nachher (Fix) |
|--------|----------------|---------------|
| `renderId` im Payload | Ja (ungueltig, crasht Lambda) | Nein (entfernt) |
| `outName` | Fehlt | `universal-video-xyz.mp4` (String) |
| S3-Pfad bekannt? | Nein (Lambda-interne ID) | Ja (via outName) |
| Format wie Director's Cut | Nein | Ja (identisches Muster) |

### Erwartetes Ergebnis

1. Lambda bekommt einen sauberen Payload ohne unbekannte Parameter
2. Lambda rendert das Video und speichert es unter `universal-video-${pendingRenderId}.mp4`
3. S3-Polling findet die Datei und markiert als `completed`
4. Webhook wird ebenfalls aufgerufen als Backup
