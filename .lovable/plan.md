

# Analyse: Warum funktioniert Jamendo im Content Creator aber nicht im Video Creator?

## Der entscheidende Unterschied

**Content Creator** (`auto-generate-explainer`):
- Ruft `search-stock-music` auf → bekommt **direkte Jamendo-Streaming-URL** zurück
- Gibt diese URL 1:1 an `ExplainerVideo` weiter
- Lambda lädt die URL als HTTP-Stream → funktioniert (meistens)

**Video Creator** (`auto-generate-universal-video`):
- Benutzt Jamendo **gar nicht direkt**
- Stattdessen: `selectBackgroundMusic()` → liest aus der `background_music_tracks` DB-Tabelle
- Diese Tabelle enthält aktuell nur **synthetische Sinustöne** (220Hz, 330Hz)
- Die 114 Original-Jamendo-Tracks wurden 1:1 heruntergeladen, nicht re-encoded → crashen in Lambda
- Ergebnis: entweder Summen oder gar keine Musik

**Kurz gesagt:** Der Content Creator nutzt Jamendo-URLs direkt. Der Video Creator nutzt eine lokale Bibliothek, die nur Platzhalter-Töne enthält.

## Beste kostenfreie Methode

Die einfachste und sofort funktionierende Lösung: **Den Video Creator genauso wie den Content Creator arbeiten lassen** — Jamendo-URLs direkt verwenden, ohne den Umweg über die lokale Bibliothek.

### Warum das die beste Option ist

| Methode | Kosten | Qualität | Lambda-kompatibel |
|---------|--------|----------|-------------------|
| **Jamendo direkt** (wie Content Creator) | Kostenlos (CC-Lizenz) | Echte Musik, viele Genres | ✅ Funktioniert bereits im Content Creator |
| Lokale Bibliothek (aktuell) | Kostenlos | Nur Sinustöne | ✅ Aber kein echter Mehrwert |
| Pixabay Music API | Kostenlos | Gut, aber 403-Probleme bei Hotlinking | ⚠️ Braucht Proxy |
| Eigene MP3s hochladen | Kostenlos | Abhängig von Quelle | ✅ Wenn korrekt encodiert |

## Umsetzung

### Schritt 1: `selectBackgroundMusic()` auf Jamendo umstellen
In `auto-generate-universal-video/index.ts` die Musikauswahl ändern:
- Statt DB-Query → `search-stock-music` Edge Function aufrufen (genau wie Content Creator)
- Mood/Style-Mapping bereits vorhanden in `search-stock-music`
- Jamendo-URL direkt als `backgroundMusicUrl` übergeben

### Schritt 2: Optional Proxy für Zuverlässigkeit
Falls Jamendo-URLs in Lambda instabil sind (Hotlink-Schutz, Timeouts):
- `proxyAudioToStorage()` nutzen (existiert bereits im Code)
- Jamendo-Track herunterladen → in `video-assets` Bucket speichern → stabile Storage-URL an Lambda geben

### Schritt 3: Lokale Bibliothek als Fallback behalten
Die DB-basierte Bibliothek bleibt als Fallback:
- Wenn Jamendo nicht erreichbar → validierte lokale Tracks verwenden
- Langfristig können echte re-encodierte Tracks die Bibliothek füllen

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | `selectBackgroundMusic()` auf Jamendo-API umstellen |

## Erwartetes Ergebnis
- Video Creator nutzt dieselbe bewährte Musikquelle wie Content Creator
- Echte Hintergrundmusik statt Sinustöne
- Kein neuer API-Key nötig (Jamendo-Client-ID ist bereits konfiguriert)

