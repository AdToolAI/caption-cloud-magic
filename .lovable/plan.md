# Problem

Wenn eine Szene **einen Sprecher + Skript** hat, routet `sceneEngineRouter.recommendEngineForScene` automatisch auf `heygen-talking-head`. HeyGen liefert nur den **Photo-Avatar-Bust** (Kopf/Schulter vor neutralem Hintergrund) — der Sprecher steht **nicht im Set** der Szene. Genau das zeigt der Screenshot: Mittiger Avatar, schwarze Ränder, keine Location, kein Framing.

Die `cinematic-sync`-Engine (Hailuo i2v in die echte Szene + Sync.so Lip-Sync) existiert bereits, ist aber nur als manueller Override / Quick-Action auf bereits gerenderten HeyGen-Szenen verfügbar. Sie wird vom Auto-Router nie selbst gewählt.

# Lösung

**Auto-Routing umstellen**, sodass Szenen mit Cast + Dialog standardmäßig in das Set komponiert werden:

| Bedingung | Alt | Neu |
|---|---|---|
| 1 Sprecher + Cast + Dialog | `heygen-talking-head` (Bust) | **`cinematic-sync`** (Sprecher im Set, Lip-Sync) |
| 2+ Sprecher + Cast + Dialog | `heygen-talking-head` | bleibt `heygen-talking-head` (Two-Shot-Pipeline wie heute, MVP) |
| Cast ohne Dialog | `broll` | unverändert |
| `lipSyncWithVoiceover` opt-in | `sync-polish` | unverändert |
| User-Override (`heygen` / `cinematic-sync` / `broll`) | wins | wins |

## Begründung der Schwelle
- Cinematic-Sync ist für **einen Sprecher pro Shot** optimiert (Hailuo i2v + ein Sync.so-Pass). Der Provider liefert bei 2 Gesichtern unzuverlässig (siehe `mem://architecture/lipsync/sync-so-pro-model-policy` → Two-Pass-Targeting nur über Anchor-FaceMap, höheres Failrate-Risiko).
- HeyGen Two-Shot bleibt deshalb für ≥2 Sprecher der sichere Default.
- User kann auf HeyGen zurückwechseln (Dropdown bleibt sichtbar) — kein Funktionsverlust.

## UI-Hinweis
- Auto-Label und Reason in `recommendEngineForScene` für den 1-Sprecher-Fall aktualisieren (`🎬 Cinematic + Lip-Sync (Auto)` / „Sprecher wird in die echte Szene komponiert …").
- Kosten-Hinweis im Generate-Confirm-Dialog (`SceneCard`-Block ab Zeile ~1114) für Cinematic-Sync analog HeyGen ergänzen (`extraCostEur ≈ 0.95` aus Memory).

## Technische Änderungen
- `src/lib/video-composer/sceneEngineRouter.ts`: Auto-Branch in `recommendEngineForScene` splitten nach `speakers >= 2`.
- `src/components/video-composer/SceneCard.tsx`: Cost-/Reason-Text im Confirm-Dialog auf neuen Default ausrichten (nur Strings, keine Pipeline-Logik).
- **Keine Edge-Function-Änderungen** — `compose-video-clips` + Cinematic-Sync-Pfad existieren und sind produktionsstabil.
- **Kein Backend / kein DB-Schema-Touch.**

## Nicht im Scope
- Lipsync-Hängen, Progress-Bar (in vorherigen Loops adressiert).
- Two-Shot Cinematic-Sync (eigenes Folge-Thema).
