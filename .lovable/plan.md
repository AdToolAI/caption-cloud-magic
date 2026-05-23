## Die Regel in einem Satz
**Lip-Sync-Toggle = Master-Schalter für alles, was mit gesprochenem Wort zu tun hat.** Skript, Sprecher-Auswahl, Voice-Settings und das Filtern der Modelle hängen alle daran.

## Zwei klare UI-Zustände

```text
TOGGLE = AUS  →  B-ROLL MODUS (Default)
  Sichtbar:    Prompt, Stil, Look, Cast (optional als Statisten), Audio-Mute
  Versteckt:   Skript-Editor, Sprecher-Zuordnung, Voice-Pickers,
               Dialog-Vorschau, Lip-Sync-Provider-Hinweis
  Modelle:     Alle 11 verfügbar
  Audio:       Stille oder Hintergrundmusik (im Composer-Audio-Track)
  Use-Case:    Action, Landschaft, Produkt-Shots, Atmosphäre

TOGGLE = AN   →  DIALOG MODUS
  Sichtbar:    Prompt, Skript-Editor (NEU sichtbar), Sprecher-Picker
               (1..N Charaktere), Sprache, Cast-Refs, Lip-Sync-Badge
  Versteckt:   Audio-Mute-Option (Dialog kommt aus dem Modell)
  Modelle:     Nur 3 — HappyHorse / Kling 3.0 / Veo 3.1
  Audio:       Vom Modell generiert + perfekt lippensynchron
  Use-Case:    Testimonials, Interviews, Werbespots, Erklärvideos
                — auch mit nur 1 Sprecher!
```

## Warum auch 1 Sprecher den Toggle braucht
Ein Monolog ohne Lip-Sync sieht aus wie:
- Stumme Person + Untertitel = unprofessionell
- Person + überlagerte Stimme ohne Mundbewegung = "Voiceover-Anmutung", nicht filmisch

Mit dem Toggle wird **immer** das Modell genutzt, das Audio + Lippen in einem Pass generiert — egal ob 1, 2 oder 3 Sprecher.

## Komponenten-Sichtbarkeit (konkret)

| UI-Element                           | Toggle AUS | Toggle AN |
|--------------------------------------|------------|-----------|
| Prompt-Editor                        | sichtbar   | sichtbar  |
| **Skript / Dialog-Editor**           | versteckt  | sichtbar  |
| **Sprecher-Zuordnung (Cast → Line)** | versteckt  | sichtbar  |
| **Sprache-Picker (DE/EN/ES)**        | versteckt  | sichtbar  |
| Cast-Picker (Brand-Characters)       | sichtbar   | sichtbar  |
| Cinematic Style Presets              | sichtbar   | sichtbar  |
| Shot Director Slots                  | sichtbar   | sichtbar  |
| Modell-Picker                        | 11 Modelle | 3 Modelle |
| Voice-Settings (für Phase B später)  | versteckt  | versteckt (bis Phase B) |
| Audio-Mute-Schalter                  | sichtbar   | versteckt |
| Lip-Sync-Hinweis-Badge               | versteckt  | sichtbar  |
| Preis-Badge                          | normal     | „Dialog-Tarif" Hinweis |

## Skript-Editor Verhalten

```text
Bei Toggle AN → erstmaliges Öffnen:
  → Skript-Editor erscheint mit Placeholder:
    "[Speaker]: Was möchten Sie sagen?"
  → Cast-Picker schlägt automatisch alle Cast-Mitglieder
    der Szene als Sprecher vor.

Bei Toggle AUS → falls bereits Skript vorhanden:
  → Skript wird NICHT gelöscht, nur versteckt.
  → Hinweis-Toast: "Skript bleibt gespeichert. 
                    Aktiviere Lip-Sync, um es zu nutzen."
  → Beim Render wird Skript ignoriert (B-Roll-Modus).

Bei Toggle AN → mit existierendem Skript:
  → Skript erscheint wieder vorausgefüllt.
  → Sprecher-Zuordnung wird beibehalten.
```

## Auto-Detection beim Laden bestehender Szenen
Damit Altdaten sauber migrieren:

```text
Szene hat dialog_script != null  →  dialog_mode = true
Szene hat audio_plan.twoshot     →  dialog_mode = true
Szene hat engine_override        →  dialog_mode = true
  in ('cinematic-sync',
      'native-dialogue')
Alles andere                     →  dialog_mode = false
```

## Cast-Mitglieder beim Toggle-Wechsel
- **AUS → AN**: Cast bleibt; werden alle als verfügbare Sprecher angeboten. Wenn 0 Cast vorhanden → Hinweis "Füge mindestens 1 Charakter hinzu, um Dialog zu sprechen".
- **AN → AUS**: Cast bleibt (Statisten-Rolle), Skript wird versteckt aber nicht gelöscht.

## Komponenten-Änderungen (technisch, Phase 1)

### `src/components/composer/SceneCard.tsx`
- Lip-Sync-Toggle prominent oben (über/neben Modell-Picker)
- Bedingte Renderblöcke für Skript-Editor, Sprecher-Picker, Sprach-Picker
- Modell-Picker-Optionen via `useMemo(() => allModels.filter(m => dialogMode ? m.capabilities.nativeDialogue : true))`
- Auto-Switch + Toast wenn dialogMode aktiviert und aktuelles Modell inkompatibel

### `src/components/composer/SceneScriptEditor.tsx` (neu/refactored)
- Gekapselt, sichtbar nur wenn `dialogMode === true`
- Sprecher-Zuordnung per Dropdown pro Zeile
- Sprach-Picker (DE/EN/ES) am Kopf des Editors

### Datenbank
- `composer_scenes.dialog_mode` (boolean, default false)
- Migration: bestehende Szenen mit Skript → `dialog_mode = true`

### Modell-Config
- `nativeDialogue: true` Flag in den Configs von HappyHorse, Kling 3.0 Omni, Veo 3.1
- Alle anderen explizit `false`

## Vorteile dieser Trennung

1. **Klare User-Intention**: Kunde wählt zuerst, was er machen will (B-Roll oder Dialog), dann erst Details.
2. **Keine fehlerträchtigen Halbzustände**: Es gibt keine Szene mehr mit Skript + Hailuo (würde aktuell schlechte Lip-Sync-Versuche provozieren).
3. **Cleaner Composer**: 70% der Szenen sind B-Roll → schlanke UI ohne irrelevante Skript-Felder.
4. **Premium-Positionierung**: Dialog-Modus = Premium-Tarif (€0.28+/s), B-Roll = Standard-Tarif.
5. **Eindeutige Erfolgs-Erwartung**: Wenn Toggle AN, garantieren wir Audio + Lippen synchron — keine Diskussion mehr.

## Definition of Done für diese Erweiterung
- Toggle „Dialog & Lip-Sync" sichtbar in jeder SceneCard
- Skript-Editor + Sprecher-Picker + Sprach-Picker nur sichtbar wenn Toggle AN
- Bei Toggle AN: Modell-Picker zeigt nur 3 Dialog-Modelle
- Auto-Switch + Toast bei inkompatiblem Modell
- Skript wird beim Ausschalten gespeichert, nicht gelöscht
- Bestehende Szenen migrieren automatisch korrekt
- Cast-Picker bleibt in beiden Modi nutzbar