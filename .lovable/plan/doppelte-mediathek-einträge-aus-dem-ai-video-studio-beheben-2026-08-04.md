# Doppelte Mediathek-Einträge aus dem AI Video Studio beheben

## Was tatsächlich passiert (nachgewiesen)

Jedes fertige AI-Video landet **zweimal** in der Mediathek. Nachweis aus der Live-Datenbank:

- 83 doppelte Einträge in `video_creations` in den letzten 30 Tagen (gleiche Video-URL, gleicher Nutzer).
- Beispiel: Video `dc63d505…` → zwei Einträge, `80342fcb` und `9aef3ae7`.
- Die Quell-Tabelle `ai_video_generations` hat **keine** Duplikate (0 Gruppen) — es wird also nur die Mediathek doppelt befüllt.

Ursache: Es gibt **zwei unabhängige Schreiber** für denselben Vorgang.

```text
Replicate fertig
   │
   ├─► replicate-webhook  → UPDATE ai_video_generations (status=completed)
   │        │                    │
   │        │                    └─► DB-Trigger auto_save_ai_video_to_library_trg
   │        │                          → INSERT video_creations   (Eintrag 1)
   │        │
   │        └─► INSERT video_creations  (Eintrag 2)  ← ohne Doppel-Prüfung
```

Der DB-Trigger prüft zwar auf ein bereits vorhandenes `ai_generation_id` — der Webhook tut das jedoch **nicht**. Da der Trigger direkt beim Status-Update feuert und der Webhook seinen eigenen Insert erst danach absetzt, greift keine der beiden Prüfungen. Der Trigger-Eintrag übernimmt zusätzlich `created_at` der Generierung, wodurch die beiden Einträge im UI mit ~3–4 Minuten Abstand erscheinen.

## Ist das bei anderen Features auch so?

- **Manuelles Speichern** (`save-ai-video-to-library`, Button in der Verlaufsliste) prüft korrekt auf Duplikate — dieser Pfad ist sauber.
- **Bilder/Musik/Composer** zeigen im aktuellen Datenbestand keine URL-Duplikate. Es gibt aber denselben Bauplan an anderer Stelle (`media_library → content_items`-Sync-Trigger plus Edge-Function-Inserts), der im Zuge der Reparatur geprüft wird.
- Weitere Video-Provider (Pika, Vidu, Runway, HappyHorse) schreiben ebenfalls direkt in `video_creations` und laufen teils zusätzlich über denselben Trigger — sie werden mitgeprüft.

## Was gebaut wird

1. **Ein Schreiber statt zwei**
   - Der Insert in `video_creations` bleibt beim DB-Trigger (er ist idempotent und feuert für alle Provider).
   - Der doppelte Insert in `replicate-webhook` wird entfernt; der Webhook aktualisiert nur noch die Generierung.

2. **Doppel-Eintrag technisch unmöglich machen**
   - Eindeutiger Index auf `(user_id, (metadata->>'ai_generation_id'))` in `video_creations`, sofern gesetzt. Damit kann selbst bei künftigen Änderungen oder Webhook-Wiederholungen kein zweiter Eintrag entstehen.

3. **Bestehende Duplikate aufräumen**
   - Einmalige Bereinigung: pro Generierung bleibt der älteste Eintrag, spätere Dubletten werden gelöscht (betrifft 83 Gruppen). Löschung nur, wenn beide Einträge dieselbe Video-URL haben — es geht kein Video verloren, die Datei im Speicher bleibt unangetastet.

4. **Gleiche Prüfung für die anderen Provider**
   - `generate-pika-video`, `generate-vidu-video`, `generate-runway-video`, `generate-happyhorse-video` sowie den `media_library → content_items`-Sync auf denselben Doppelschreib-Fall durchsehen und, wo vorhanden, auf den einen Schreibpfad reduzieren.

## Technische Details

- Migration: unique partial index
  `CREATE UNIQUE INDEX … ON public.video_creations (user_id, (metadata->>'ai_generation_id')) WHERE metadata ? 'ai_generation_id';`
- Cleanup-Statement per Daten-Tool (kein Migrationsfile, da nutzerspezifische Daten), vor dem Index ausgeführt.
- `supabase/functions/replicate-webhook/index.ts`: Block „5. Auto-save to video_creations" entfernen, Logging auf „handled by DB trigger" umstellen; Funktion neu deployen.
- Der Trigger `auto_save_ai_video_to_library` bleibt unverändert (bereits idempotent).
