## Befund

Das aktuelle Problem ist nicht primär der Ladebalken, sondern die Quelle, auf die v5 Lip-Sync angewendet wird:

- Die betroffene Szene nutzt `clip_source='ai-happyhorse'` und `engine_override='cinematic-sync'` mit nur einem Sprecher.
- In der Datenbank ist `reference_image_url` leer, aber `lip_sync_source_clip_url` zeigt auf `talking-head-renders/...mp4`.
- Dadurch lip-synct v5 nicht die eigentliche Prompt-Szene, sondern ein rohes Talking-Head/Avatar-Video.
- Zusätzlich wird für `cinematic-sync` im Client die Szenen-Anker-Komposition übersprungen. Bei Single-Speaker-Szenen gibt es serverseitig ebenfalls keinen Pflicht-Anchor, weil die bisherige harte Anchor-Logik nur bei 2+ Charakteren greift.
- Der Webhook-Fallback ruft noch `compose-dialog-scene` statt die v5-Funktion `compose-dialog-segments` auf.

## Plan

1. **Cinematic-Sync nie mehr mit rohem Portrait/Talking-Head als Master starten**
   - In `compose-video-clips` auch für Single-Speaker-`cinematic-sync` einen scene-aware Anchor erzwingen.
   - Der Anchor kombiniert Charakterportrait/Outfit mit der bereinigten Szenenbeschreibung, z. B. „Home Office, Schreibtisch, Monitore, Licht, Kamera“.
   - `reference_image_url` wird dann auf `/scene-anchors/...` gesetzt, bevor HappyHorse/Hailuo den Masterclip rendert.

2. **HappyHorse + Cinematic-Sync korrekt behandeln**
   - HappyHorse darf weiterhin normale Szenen rendern.
   - Für `cinematic-sync` muss HappyHorse aber ein komponiertes `image` bekommen, nicht das rohe Avatarbild.
   - Wenn kein komponierter Anchor erzeugt werden kann, wird die Szene sichtbar abgebrochen statt still auf Portrait/Talking-Head zurückzufallen.

3. **v5 als einzigen Auto-Fallback nutzen**
   - In `compose-clip-webhook` den automatischen Lip-Sync-Fallback von `compose-dialog-scene` auf `compose-dialog-segments` umstellen.
   - Damit läuft auch der serverseitige Rettungspfad über v5 und erzeugt keinen alten Talking-Head-Zwischenpfad mehr.

4. **Falsche alte Quelle bereinigen**
   - Für die aktuell betroffene Szene die veraltete `lip_sync_source_clip_url` auf `NULL` setzen und den Lip-Sync-Status zurücksetzen.
   - Den fertigen rohen Avatar-Clip nicht als gültiges Endergebnis behalten; die Szene soll nach dem Fix neu über scene-aware Anchor → Masterclip → v5 Lip-Sync laufen.

5. **Diagnose/Transparenz verbessern**
   - Logs klarer machen: ob `cinematic-sync` mit `scene_anchor`, `manual_reference`, oder blockiertem `raw_portrait` startet.
   - Bei fehlendem Anchor eine deutsche Fehlermeldung setzen, damit der Nutzer nicht wieder nur ein verschwindendes Progress-Signal sieht.

## Ergebnis nach Umsetzung

Neue Cinematic-Sync-Szenen werden nicht mehr als roher Avatar/Talking Head gerendert. Der Charakter wird zuerst in die Prompt-Szene komponiert, daraus wird der Masterclip erzeugt, und erst danach läuft v5 Lip-Sync auf genau dieser Szene.