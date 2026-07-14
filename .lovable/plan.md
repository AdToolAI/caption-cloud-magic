## Ziel

Cast-Auswahl (bis zu 4 Charaktere) und Native Lip-Sync Panel (Kling Omni) zu **einer** UI zusammenführen. Pro Charakter ein Switch „Lip-Sync geben", mit Live-Zähler (z. B. `1/2`, `2/2`). Kling Omni bleibt bei max. 2 sprechenden Charakteren; die restlichen bleiben stumme Statist:innen im Anchor.

## UI-Konzept (im AI Video Studio → nur wenn `isKlingOmni`)

Eine kombinierte Karte ersetzt heute zwei getrennte Blöcke (`ToolkitCastWorldPicker` Charakter-Zeilen + separates „Native Lip-Sync" Panel):

```text
┌─ Cast & Native Lip-Sync ────────────────── [1/2 mit Lip-Sync] ─┐
│ ┌ Samuel Dusatko  · Aus Cast & World ─── [Lip-Sync ●] 1/2  ✕ ┐│
│ │ [Stimme: Männlich · warm ▾]                                ││
│ │ [Dialog von Samuel … (max 300)                      0/300] ││
│ └─────────────────────────────────────────────────────────────┘│
│ ┌ Anna Weber · Aus Cast & World ──────── [Lip-Sync ○]      ✕ ┐│
│ │ (Statist – kein Dialog, erscheint nur im Anchor)            ││
│ └─────────────────────────────────────────────────────────────┘│
│ [+ Charakter hinzufügen]     (deaktiviert wenn 4 erreicht)     │
└────────────────────────────────────────────────────────────────┘
2 Charaktere im Anchor · 1/2 Lip-Sync · 1 stummer Statist
```

Regeln:
- Max. **4 Zeilen** (= Cast im Anchor). Über 4 hinaus wird der „+"-Button deaktiviert.
- Switch „Lip-Sync" pro Zeile. Nur aktivierbar, solange weniger als 2 Zeilen Lip-Sync aktiv haben. Ist das 2/2-Limit erreicht, sind die restlichen Switches disabled mit Tooltip „Kling Omni erlaubt max. 2 sprechende Charaktere".
- Wird Lip-Sync aktiviert → Voice-Select + Dialog-Textarea (300 Zeichen) klappen auf. Wird deaktiviert → Zeile bleibt als stumme Statist:in im Cast, Dialog wird verworfen (mit kurzem `AlertDialog` falls bereits Text drin steht).
- Zähler-Badge oben rechts zeigt `${lipSyncCount}/2`. Zusatzzeile unten fasst Anchor/Speaker/Statist zusammen (bestehende Amber-Warnung, aber mit den neuen Zahlen).

## Datenmodell

Statt zwei getrennter Quellen (`castCharacterIds: string[]` und `omniLines: OmniLine[]`) genau **eine** Liste als Source of Truth für den Omni-Pfad:

```ts
type OmniCastRow = {
  characterId: string;        // strikt Cast & World UUID (kein „__anon" mehr)
  lipSync: boolean;           // Switch
  line: string;               // nur wenn lipSync
  voicePreset: OmniVoicePreset; // nur wenn lipSync
};
```

Abgeleitete Werte (memoized):
- `castCharacterIds = rows.map(r => r.characterId)` → weiterhin an `ToolkitCastWorldPicker`/Anchor übergeben (keine Backend-Änderung nötig).
- `omniLines` für den Edge-Function-Payload = `rows.filter(r => r.lipSync && r.line.trim())` (max. 2 durch UI garantiert).
- `speakerVoices` bleibt wie in `generate-kling-video` erwartet — unverändertes Backend.

Damit ist **eine widersprüchliche Selektion technisch unmöglich**: ein Charakter kann nicht mehr in Cast auftauchen ohne Zeile, oder umgekehrt.

## Nicht-Omni Modelle

`ToolkitCastWorldPicker` bleibt für alle Modelle **ohne** `isKlingOmni` genau wie heute (bis zu 4 Cast-Charaktere, kein Lip-Sync-Switch). Der neue kombinierte Block ersetzt Picker + Omni-Panel **nur** wenn Kling Omni aktiv ist.

## Umsetzungsschritte

1. **`ToolkitGenerator.tsx`**
   - Neuer State `omniRows: OmniCastRow[]` (initial leer).
   - Umbauen: bisheriger `omniLines`-State entfällt; `castCharacterIds` wird aus `omniRows` abgeleitet, solange Omni aktiv ist. Für andere Modelle bleibt der bestehende `castCharacterIds`-State erhalten (zwei Codepfade sauber getrennt via `isKlingOmni ? … : …`).
   - Migration des Convenience-Prefill (aus bereits gewähltem Cast) → schreibt in `omniRows` mit `lipSync=false`.
   - Payload-Build (Zeilen ~660–670): `omniLines` = aktiver Lip-Sync-Subset; `speakerVoices` analog.
2. **Neue Komponente `OmniCastLipsyncPanel.tsx`** (in `src/components/ai-video/`)
   - Rendert die Rows, Add-Button (`disabled={rows.length>=4}`), Switch mit Zähler-Logik, Voice-Select, Textarea.
   - Nutzt `useBrandCharacters` bereits als Quelle (bestehend, keine Änderung).
   - Character-Dropdown filtert bereits belegte IDs (wie heute in `omniLines`).
3. **Amber-Statuszeile** wird ersetzt durch neuen kompakten Text „X Anchor · Y/2 Lip-Sync · Z Statist(en)".
4. **Verdrahtung im Rendering-Aufruf**: `generate-kling-video` bekommt weiterhin `speaker_voices` — keine Backend-Änderung.
5. **Cleanup**: Falls Nutzer Omni verlässt (Model-Switch), werden `omniRows` in `castCharacterIds` gespiegelt, damit die Cast-Auswahl nicht verloren geht.

## Randfälle

- 0 Rows mit Lip-Sync → stummer Clip mit Ambient-Audio (heutiges Verhalten bleibt).
- 4 Cast-Rows, 2× Lip-Sync aktiviert → Switch auf den anderen 2 Rows disabled + Tooltip.
- User schaltet Lip-Sync ab, Dialogtext existiert → Confirm-Dialog „Dialogtext löschen?" bevor Zeile stumm wird.
- Ein Charakter kann nur einmal in der Liste sein (existierende `usedElsewhere`-Logik übernommen).

## Out of Scope

- Backend/Edge-Function Änderungen an `generate-kling-video`.
- Andere Modelle (Hailuo/HappyHorse/Sync.so-Pfad) — bleibt unverändert.
- Cast & World Bibliothek / Brand Character Lock — unverändert.
