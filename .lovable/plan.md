

## Plan: Strategie-Modus an Erfahrungslevel + Auto-Upgrade koppeln

### Ziel
Die KI-Strategie nutzt das im Onboarding gesetzte `experience_level` (Anfänger / Fortgeschritten / Profi) als Basis. Sobald der Creator messbares Engagement aufbaut, wird er automatisch hochgestuft — und die Vorschläge (Frequenz, Komplexität, Tonalität) passen sich an.

### Befund
- `experience_level` wird im `GoalsStep` (Onboarding) gesetzt → vermutlich in `profiles` gespeichert.
- `posts_per_week` ebenfalls (3 / 5 / 7).
- Die neue Edge-Function `generate-week-strategy` nutzt diese Felder noch nicht — sie generiert generisch 5–7 Posts.
- Es gibt `post_metrics` mit `engagement_rate`, `reach`, `impressions` → Datenbasis für Auto-Upgrade vorhanden.

### Umsetzung

#### 1) Level-basierte Generierung in `generate-week-strategy`
Die Edge-Function liest `profiles.experience_level` + `profiles.posts_per_week` und passt den AI-Prompt + Output an:

| Level | Posts/Woche | Komplexität | Tonalität im Prompt |
|---|---|---|---|
| **beginner** | 3 | Einfache Formate (Foto + Caption), klare Hooks, Schritt-für-Schritt Ideen | „Erkläre einfach, ermutigend, keine Fachbegriffe" |
| **intermediate** | 5 | Mix aus Reels/Karussell/Story, Trend-Anlehnung, A/B-Hooks | „Konkret, mit Performance-Hinweisen" |
| **advanced** | 7 | Multi-Plattform, Serien-Konzepte, Datenbasierte Empfehlungen mit konkreten Slots | „Datengetrieben, knapp, Profi-Sprache" |

Reasoning-Texte werden dem Level entsprechend formuliert (Anfänger: lehrreich; Profi: knapp/analytisch).

#### 2) Auto-Upgrade-Logik (neue Edge-Function `evaluate-creator-level`)
Wird wöchentlich vom bestehenden `tick-strategy-posts`-Cron mit angetriggert (Sonntag 22:30, vor der Wochengenerierung).

Berechnung pro User über letzte 28 Tage:
- **Avg Engagement Rate** aus `post_metrics`
- **Anzahl publizierter Posts** aus `calendar_events` mit `status='published'`
- **Strategy-Completion-Quote** aus `strategy_posts` (`completed` / total)

Schwellen:
| Aktuell | Upgrade auf | Bedingung |
|---|---|---|
| beginner | intermediate | ≥ 8 Posts/28d **UND** Avg ER ≥ 2,5 % **UND** Completion ≥ 60 % |
| intermediate | advanced | ≥ 16 Posts/28d **UND** Avg ER ≥ 4,5 % **UND** Completion ≥ 70 % |

Bei Upgrade:
- `profiles.experience_level` aktualisieren
- `profiles.posts_per_week` automatisch anheben (3→5 bzw. 5→7)
- Eintrag in neuer Tabelle `creator_level_history` (level_from, level_to, metrics_snapshot, reason)
- In-App-Notification + Toast beim nächsten Login: „🎉 Du wurdest zu **Fortgeschritten** hochgestuft! Deine Strategie wird ab dieser Woche anspruchsvoller."

Kein Auto-Downgrade — Level kann nur manuell im Profil zurückgesetzt werden (verhindert Frust bei Pausen).

#### 3) UI: Level-Badge in `WeekStrategyTimeline`
- Kleines Badge oberhalb der Timeline: „📊 Level: Fortgeschritten · 5 Posts/Woche"
- Klick → kleines Popover mit Fortschritt zum nächsten Level: „Noch 4 Posts und 0,3 % ER bis **Profi**"
- Im `MissedPostDialog` wird die Tonalität des Reasonings ebenfalls level-abhängig angezeigt

#### 4) Manuelle Level-Anpassung
- In Account-Einstellungen / Strategie-Modus-Toggle-Bereich: Dropdown „Level manuell ändern" (überschreibt Auto-Upgrade bis nächste Auswertung).
- Falls User manuell wählt, wird Auto-Upgrade für 14 Tage pausiert (kein Ping-Pong).

### Datenmodell-Änderungen
```text
profiles
├── experience_level (existiert bereits)
├── posts_per_week (existiert bereits)
└── + level_auto_pause_until (TIMESTAMPTZ, nullable)

creator_level_history (neu)
├── id, user_id
├── level_from, level_to
├── trigger ('auto' | 'manual')
├── metrics_snapshot (JSONB)
├── reason (TEXT)
└── created_at
```

### Betroffene Dateien
- *(Migration)* `profiles.level_auto_pause_until` + neue Tabelle `creator_level_history` + RLS
- `supabase/functions/generate-week-strategy/index.ts` — Level-/Frequenz-aware Prompt
- *(neu)* `supabase/functions/evaluate-creator-level/index.ts`
- `supabase/functions/tick-strategy-posts/index.ts` — ruft `evaluate-creator-level` Sonntag vor Generierung auf
- `src/hooks/useStrategyMode.ts` — `experienceLevel`, `postsPerWeek`, `levelProgress` ergänzen
- `src/components/dashboard/WeekStrategyTimeline.tsx` — Level-Badge + Popover
- *(optional)* `src/pages/Account.tsx` oder Strategie-Settings — manuelle Level-Auswahl

### Erwartetes Ergebnis
- Strategie startet sofort auf dem im Onboarding gewählten Level (3/5/7 Posts, passende Komplexität).
- Wer regelmäßig postet und Engagement aufbaut, wird automatisch auf Fortgeschritten / Profi hochgestuft — Vorschläge werden anspruchsvoller, Frequenz steigt.
- Klare Transparenz für den Creator (Badge + Fortschritt zum nächsten Level) → Motivation statt Black-Box.
- Manuelle Übersteuerung möglich, kein nerviges Auto-Downgrade.

