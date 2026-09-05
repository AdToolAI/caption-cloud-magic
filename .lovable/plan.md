# Eine Video-Enhance-Engine, viele Einstiegspunkte

Genau wie im Picture Studio: das schwierige Stück (Modelle, Preise, Wallet, Erstattung, Speicherung, Vorher/Nachher) wird **einmal** gebaut. Alle Oberflächen rufen dieselbe Engine auf.

## Was heute existiert (geprüft)

- `director-cut-upscale` ist ein Altpfad: fester Credit-Tarif (15/25/50), veraltete Replicate-Version, ein Simulationsmodus ohne echtes Ergebnis, direkte Wallet-Abbuchung ohne Erstattung und ohne Speicherung des Ergebnisses. Der wird ersetzt, nicht erweitert.
- Die Bild-Seite hat bereits alles Richtige: Registry + Flags (`src/config/pictureModels`), Rate Cards/FX/Margen-Kurve (`src/lib/pictureModels`), Server-Spiegel (`_shared/picture-enhance-models.ts`), Lineage, Erstattungslogik. Die Video-Engine wird 1:1 nach diesem Muster gebaut.

## Architektur

```text
                 video-enhance  (eine Edge Function)
                         │
      ┌──────────────────┼──────────────────┐
   Topaz-Adapter   ByteDance-Adapter   (später Crystal)
      └──────────────────┼──────────────────┘
                 Unified Result (neues Video-Asset)

AI Video Studio ┐
Mediathek       ┤
Motion Studio   ┼──► useEnhanceVideo() ──► video-enhance
Director's Cut  ┤
Content Creator ┘
```

Keine `MotionTopazService` / `DirectorsCutTopazService`. Ein Hook, eine Funktion, eine Registry, eine Preis-Engine.

## Stufe 1 — Engine (das eigentliche Stück Arbeit)

1. **Capability-Registry** `src/config/videoEnhanceModels/` — pro Modell: Fähigkeiten (`upscale`, `fps_interpolation`, `aigc_enhance`, `restoration`), maximale Auflösung/FPS, maximale Clip-Länge, Parameter (Scene, Quality Tier), Label + Positionierung ("Empfohlen" / "Professionelle Detailtreue"), Flag.
   - `bytedance-vcube` — AI-Material, Upscale + FPS, bis 4K.
   - `topaz-video-upscale` — echtes Filmmaterial, Detailtreue, bis 4K/60.
   - Crystal/SeedVR2 nur als Einträge mit `comingSoon`, nicht ausführbar.
   Die UI aller Oberflächen entsteht aus der Frage „welche aktiven Modelle können `upscale`?" — keine fest verdrahteten Modelllisten in Komponenten.
2. **Preis-Engine** `src/lib/videoEnhance/` mit Server-Spiegel: Rate Card pro Modell (pro Sekunde × Auflösungs-/FPS-Faktor), FX-Kurs + Sicherheitspuffer, dieselbe Margen-Kurve und derselbe Deckungsbeitrags-Floor wie bei Bildern. Ein geteilter Fixture-Test beweist: gleiche Konfiguration = gleicher Preis in Studio, Motion Studio, Director's Cut, Content Creator.
3. **Edge Function `video-enhance`** — Auth, serverseitige Modell-/Parameterprüfung (Frontend nie vertrauen), Flag- und Test-Allowlist-Gate, Preis serverseitig, Reservierung, Provider-Job, Poller, Persistenz des Ergebnisses als **neues** Video-Asset, genau eine idempotente Erstattung bei Provider-Fehler oder Timeout.
4. **Nicht-destruktive Lineage**: Quelle bleibt erhalten, der Master ist ein Kind-Asset (`Seedance-Szene → Lip-Sync → Stitch → 4K-Master`). Mediathek zeigt beide, Vorher/Nachher-Vergleich wie im Picture Studio.
5. **Empfehlungslogik** `recommendEnhancement(source, target)` — zentral, nicht pro Oberfläche: bereits 4K auf 4K-Ziel → „Schon optimal, zusätzliche Verbesserung bringt kaum etwas"; 720p/24 aus Seedance → „4K empfohlen"; Reels/TikTok → „1080p reicht, 4K kostet ohne Nutzen mehr".
6. **Freischaltung dreistufig** wie bei Topaz-Bild: Frontend-Flag (Sichtbarkeit), Backend-Schalter (maßgeblich), Test-Allowlist für echte Läufe. Beide Modelle starten gesperrt als „bald verfügbar", bis zwei echte Läufe je Modell bestanden sind (Erfolg + absichtlicher Fehler mit genau einer Erstattung).

## Stufe 2 — Einstiegspunkte (in dieser Reihenfolge)

| Ort | Umfang |
| --- | --- |
| AI Video Studio | Voller Enhance-Bereich: Modellkarten, Auflösung 1080p/2K/4K, FPS Original/24/30/60, ByteDance-Zusatz (Scene, Quality), Preisvorschau, Vergleich |
| Mediathek / Video-Lightbox | Schnellaktion „Video verbessern" auf jedem vorhandenen Video |
| Nach jeder Generierung | Ergebnis-Aktion „Auf 4K verbessern" neben Download/Posten |
| Motion Studio | Optionaler Schritt vor dem Export: Ausgabequalität Original / 1080p / 4K + Modell, mit Vorher-Nachher-Zeile und Zusatzkosten |
| Director's Cut | Finaler Mastering-Schritt: Aus / Empfohlen / Eigene Einstellungen; „Empfohlen" wählt anhand der Projekt-Metadaten (überwiegend Seedance → ByteDance, echtes Uploadmaterial → Topaz) |
| Universal Content Creator | Nur „Qualität verbessern" mit Empfehlungszeile und „Ändern" für Details; kanalabhängige Empfehlung |

Der Altpfad `director-cut-upscale` wird abgelöst, sobald der Director's-Cut-Einstieg steht.

## Was in dieser Stufe nicht passiert

Keine Änderung an Video-Generierung, Lip-Sync, Rendering, Wallet-Grundlogik oder bestehenden Preisen. Enhance ist immer optional und additiv.

## Technische Details

- Neue Dateien: `src/config/videoEnhanceModels/{index,types,models,flags}.ts`, `src/lib/videoEnhance/{rates,pricing,lineage,recommend}.ts`, `src/hooks/useEnhanceVideo.ts`, `supabase/functions/video-enhance/index.ts`, `supabase/functions/_shared/video-enhance-models.ts` (Server-Spiegel, Parity-Test).
- Migration für die Enhance-Läufe inkl. GRANTs und besitzergebundener RLS; Ergebnis-Asset in der bestehenden Video-Persistenz (`video_creations`), Elternbezug über die Lineage-Spalte.
- Verarbeitung ist asynchron: Job anlegen → Client pollt → bei Fertigstellung Datei in den eigenen Speicher übernehmen, nie eine ablaufende Provider-URL persistieren.
- Tests: Registry↔Server-Parität, Preis-Fixtures über alle Einstiegspunkte, Erstattungs-Idempotenz, Empfehlungs-Matrix (Quelle × Ziel × Kanal), EN/DE/ES-Parität aller neuen Texte.
- Aufgabe wird zu Beginn in `roadmap.md` eingetragen.
