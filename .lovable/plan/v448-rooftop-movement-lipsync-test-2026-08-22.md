# V448 — Rooftop Movement Lipsync Test

Ein neues Testprojekt mit **genau einer** Szene, das die 4-Sprecher-Lip-Sync-Kette unter Bewegung, leichtem Seitenwinkel und Objekt-Interaktion prüft. Kein Render, kein Publish, keine Änderung an der Lip-Sync-Pipeline.

## Was angelegt wird

**Projekt** `V448 — Rooftop Movement Lipsync Test`
- Sprache: Deutsch (`language = 'de'`)
- Besitzer: der bestehende Owner-Account, dem die vier Cast-Charaktere gehören
- als Testlauf markiert, Status `draft`, kein Auto-Render

**Szene** `S01 — Rooftop Movement Dialogue Test` (einzige Szene, `order_index = 0`)
- Dauer 15 s, Plate-Provider HappyHorse (zertifiziert für Lip-Sync)
- Lip-Sync aktiv, Dialogmodus aktiv, Engine `cinematic-sync`
- Cast: die vier bereits registrierten Charaktere mit Portrait-Anker
  - Sarah Dusatko `5c81f9bf-…`
  - Samuel Dusatko `483f9cdc-…`
  - Matthew Dusatko `54d90504-…`
  - Kay Mark `c65de5c6-…`
- Stimmen: dieselben deutschen ElevenLabs-Zuordnungen wie im letzten funktionierenden 4-Sprecher-Lauf (Lena / Stefan / Markus / Klaus)
- Sechs Dialog-Turns exakt in der von dir vorgegebenen Reihenfolge und Formulierung
- Szenen-Prompt exakt wie von dir formuliert, plus die bestehenden Anti-Panel-/Topologie-Klauseln, die die Pipeline ohnehin selbst anhängt

Nach dem Anlegen bleibt die Szene im Zustand „bereit für genau einen manuellen Render". Es wird nichts ausgelöst.

## Ein Punkt, den du vorher kennen solltest

Die Kette hat für **vier Sprecher** heute eine strengere Framing-Vorgabe als für ein oder zwei: Sie verlangt eine geordnete Reihe mit front- oder dreiviertel-gerichteten Gesichtern, damit die Sprecher-zu-Gesicht-Zuordnung stabil bleibt. Deine gewünschte Regie (Samuel wandert nach rechts, Matthew steht dahinter am Tablet, Kay dreht sich im Dreiviertelprofil zurück) ist genau der Stresstest — sie steht aber teilweise gegen diese Vorgabe.

Ich lege die Szene so an, wie du sie beschrieben hast, und ändere die Pipeline nicht. Mögliches Ergebnis des späteren Renders: die Regie wird vom Plate-Modell teilweise in Richtung Reihe zurückgezogen, oder Kays Dreiviertelwinkel/Matthews Tiefenstaffelung führt zu einem Zuordnungs- oder Face-Share-Befund. Beides ist ein gültiges Testergebnis und genau das, was der Lauf messen soll.

## Technische Details

- Insert in `composer_projects` (title, language `de`, status `draft`, `is_test_run = true`, `video_mode` wie bei bestehenden Composer-Projekten).
- Ein Insert in `composer_scenes` mit:
  `order_index = 0`, `scene_type = 'custom'`, `duration_seconds = 15`,
  `clip_source = 'ai-happyhorse'`, `lip_sync_with_voiceover = true`,
  `dialog_mode = true`, `engine_override = 'cinematic-sync'`,
  `ai_prompt` = dein Szenen-Prompt,
  `scene_action_user` = die Blocking-Beschreibung pro Figur,
  `character_shots` = vier Einträge `{characterId, shotType:'full'}`,
  `dialog_turns` = sechs Einträge `{turnId, order, characterId, text}` (kanonische UUID-Zuordnung, keine Namens-Fuzzy-Matches),
  `dialog_script` = die sechs Zeilen im `Name: Text`-Format,
  `dialog_voices` = die vier deutschen ElevenLabs-Profile.
- Keine Schreibvorgänge in `dialog_shots`, `syncso_*`, `active_run_id`, `lock_reference_url`, `reference_image_url` — die legt erst der Render an.
- Keine Migration, kein Edge-Function-Deploy, kein Code-Change.
- Andere Projekte bleiben unangetastet.

## Rückgabe nach dem Anlegen

Strukturierte Zusammenfassung mit: Projekt-ID, Szenen-ID, den vier erkannten Cast-IDs, den sechs Dialog-Turns, dem gespeicherten Szenen-Prompt und der Bestätigung „bereit für genau einen manuellen Render".
