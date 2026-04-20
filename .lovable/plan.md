

# Plan: Systematischer Health-Check der restlichen 10 Admin-Tabs

Du hast aktuell den **KI Superuser** komplett auf grün — aber das Admin-Dashboard hat noch 10 weitere Tabs, die echte Probleme verstecken könnten. Lass uns sie nach Wichtigkeit durchgehen.

## Inspektions-Reihenfolge (Tab für Tab)

### 🔴 Hohe Priorität — direkter Business-Impact

**1. Bug Reports** *(default Tab — siehst du beim Öffnen)*
- Offene Bug Reports von echten Usern
- Inspizieren: Sind unbeantwortete Reports da? Wie alt?

**2. Cost Monitor**
- Tägliche/monatliche Kosten von Lambda, OpenAI, Replicate, ElevenLabs, Gemini
- Inspizieren: Gibt es Cost-Spikes? Liegen wir im Budget?
- Auffällig: Sora/Kling/Image-Generierung sind teuer

**3. Provider Health**
- Status aller externen APIs (OpenAI, Replicate, Gemini, Meta, X, TikTok, Sentry)
- Inspizieren: Welche Provider hatten zuletzt Ausfälle? Quotas-Auslastung?

**4. Sentry Dashboard**
- Echte Frontend-Errors die User auslösen (nicht nur unsere geplanten Test-Szenarien)
- Inspizieren: Top-5 ungelöste Errors, Crash-Rate-Trend

### 🟡 Mittel — System-Stabilität

**5. System Monitor**
- Edge-Function-Latenzen, AI-Job-Queue-Länge, Storage-Verbrauch
- Inspizieren: Hängt eine Queue? Wie voll ist der Storage?

**6. Cache Health**
- Redis Hot-Query-Cache + AI Semantic Cache (pgvector)
- Inspizieren: Hit-Rates, Speicher-Verbrauch, abgelaufene Einträge

**7. Smoke Tests**
- Andere automatisierte Health-Checks (älteres System neben dem KI Superuser)
- Inspizieren: Was läuft hier doppelt? Können wir konsolidieren?

**8. Alerts**
- Aktuelle aktive Alerts (Webhooks, Trigger-bedingte Notifications)
- Inspizieren: Offene Alerts? Stille Failures?

### 🟢 Niedriger — Business-Insights

**9. Conversion Funnel**
- Signup → Verify → Erstes Video → Bezahlt
- Inspizieren: Wo dropt es am meisten?

**10. Email Monitor**
- Versandte Emails (Resend), Bounce-Rate, Open-Rate
- Inspizieren: Email-Zustellung gesund?

## Vorgehen

Pro Tab schauen wir:
1. **Was zeigt die UI tatsächlich?** (Screenshot oder Code-Inspektion)
2. **Stimmen die Daten mit der Realität in der DB überein?** (Spot-Checks via Logs/Queries)
3. **Gibt es Karteileichen oder falsche Alarme?** (wie wir es beim KI Superuser hatten)
4. **Quick-Win-Fixes** sammeln und am Ende als Sammel-Plan umsetzen

## Was du tun musst

Wähle einen Startpunkt:
- **Option A** — Top-Down: Wir gehen alle 10 Tabs strikt nach Priorität durch
- **Option B** — Du machst Screenshots von 2–3 Tabs die dich besonders interessieren, ich analysiere die
- **Option C** — Wir starten mit **Cost Monitor + Provider Health** (höchster Business-Impact, da Geld + externe Abhängigkeiten)

## Erwartetes Ergebnis nach Komplett-Durchgang

- ✅ Klares Bild über den Health-Status jedes Subsystems
- ✅ Liste aller stillen Failures / falschen Alarme / Karteileichen
- ✅ Konkrete Fix-Liste mit Priorität → in Folge-Loops abarbeiten
- ✅ Ein „Master Health Banner" auf dem Admin-Dashboard das alle 11 Tabs zusammenfasst (optional als Bonus)

