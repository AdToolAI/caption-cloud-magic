# Posting-Bereich: Bestandsaufnahme statt Blindausbau

Ziel: ein belastbarer Ist-/Soll-Report pro Plattform, der zeigt, welche Kanal-Einstellungen wir heute steuern, welche organisch überhaupt möglich sind, und wo der echte Mehrwert unserer Plattform liegt. Erst danach wird gebaut.

## Was der Report liefert

Ein Dokument `docs/posting/channel-capability-report.md` mit:

1. **Ist-Zustand pro Kanal** (Instagram, Facebook, TikTok, X, LinkedIn, YouTube)
   - welche Felder der Composer heute an die API schickt
   - welche Felder hart verdrahtet sind (z. B. TikTok `PUBLIC_TO_EVERYONE`)
   - welche Einstellungen es gar nicht ins UI geschafft haben
2. **Soll-Zustand: was die APIs organisch erlauben**
   - pro Kanal die tatsächlich verfügbaren Post-Optionen laut aktueller API-Doku
   - explizit getrennt: organisch möglich vs. nur über Ads-API (Zielgruppen-Targeting)
   - Voraussetzungen je Option: Scope, App-Review, Account-Typ, Sandbox-Grenzen
3. **Lückenliste mit Aufwand/Nutzen**
   - jede fehlende Option mit Bewertung: Kundennutzen, Umsetzungsaufwand, Risiko (Review/Scope)
   - Kennzeichnung, was ohne neue Berechtigungen sofort baubar ist
4. **Mehrwert-Kapitel: was nur wir können**
   - plattformübergreifende Hebel, die es bei YouTube/Meta nativ nicht gibt: Cross-Post-Varianten, Zeitversatz je Kanal, Posting-Zeit-Empfehlungen, Media-Profile/Auto-Fix, Bulk-Scheduling, Hook-Score, First-Comment-Automation
   - klare Aussage zur Zielgruppe: organisches Audience-Targeting ist bei Meta/LinkedIn/TikTok praktisch abgeschafft; echtes Targeting läuft nur über Ads-APIs. Der plattformseitige Ersatz ist ein Persona-/Zielgruppen-Layer, der Text, Hashtags, Kanalmix und Zeitpunkt steuert.
5. **Empfohlene Roadmap in drei Wellen**
   - Welle 1: fehlende native Optionen ohne neue Scopes
   - Welle 2: Optionen mit Scope-/Review-Bedarf
   - Welle 3: Persona-Layer bzw. Ads-Anbindung als eigenes Modul

## Vorgehen

- Vollständiges Auslesen der Publish-Kette: `supabase/functions/publish/index.ts` (alle sechs `publishTo*`-Funktionen), die dedizierten `publish-to-*`-Functions, `post-first-comment`, `poster-dispatcher`, `calendar-publish-dispatcher`.
- Auslesen der Composer-UI-Schicht: `src/pages/Composer.tsx`, `ChannelConfigModal`, `YouTubeConfigModal`, `CrossPostMagicPanel`, `PublishToSocialTab`, `src/types/publish.ts`.
- Abgleich der Scopes in den OAuth-/Connect-Flows und in `social_connections`, um zu bewerten, was mit bestehenden Berechtigungen sofort möglich ist.
- Recherche der aktuellen Plattform-Dokus (Graph API, TikTok Content Posting API, LinkedIn Posts API, YouTube Data API, X API) für den Soll-Zustand.

## Technische Details

- Der Report ist reine Dokumentation; es werden keine Edge Functions und keine UI-Dateien geändert.
- Ergebnis pro Kanal als Tabelle: Option | heute im UI | heute an API gesendet | API-fähig | benötigter Scope | Aufwand | Priorität.
- Bekannte Randbedingungen aus dem Projekt werden berücksichtigt: X nur Basic API, TikTok im Sandbox-Modus, Meta Graph API v24.
