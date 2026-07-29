## Was ohne neuen Plattform-Review geht

Ich bin die 6 Punkte durchgegangen und nach Freigabe-Bedarf sortiert.

### ✅ **Sofort machbar (kein neuer Review)**

**1. UTM-Tracking-Layer**  
Reine Client-Logik — wir hängen `?utm_source=instagram&utm_medium=social&utm_campaign=...` an alle Links in Captions/Bios. Braucht null Plattform-Freigabe.

**2. YouTube Shorts-Metadaten**  
Nutzt denselben `youtube.upload`-Scope, den wir schon haben. Wir bauen:
- Automatisches `#Shorts` in Title/Description bei 9:16 & ≤60s
- **Chapters** = formatierte Description-Zeilen (`0:00 Intro\n0:15 Hook…`) — YT parst das automatisch
- Category-ID + Tags-Autofill

**3. Instagram Reels-Cover**  
Nur ein zusätzliches `cover_url`-Param am bestehenden `/media`-Endpoint. Kein neuer Scope, kein Review.

**4. Instagram Stories**  
Läuft über denselben `instagram_content_publish`-Scope wie unser Feed-Publish — App-Type `STORIES` statt `REELS`/`VIDEO`. **Wenn** unser aktuelles Meta-App-Review dieses Permission-Bundle enthält (was Standard ist wenn Reels läuft), kein neuer Review nötig. Falls nicht: es wäre nur eine Scope-Erweiterung im bestehenden Review, kein neuer Antrag.

### ⚠️ **Grauzone (hängt vom aktuellen Scope-Set ab)**

**5. Best-First-Comment**  
- **Instagram**: braucht `instagram_manage_comments` — meist im selben Review-Bundle wie Publish. Wenn ja: sofort machbar.
- **LinkedIn**: `w_member_social` (das wir schon haben) erlaubt Posts + Kommentare am eigenen Post. Sollte **ohne** neuen Review gehen.

Ich prüfe live gegen die Connector-Config sobald wir bauen und fallback-brake sauber ab falls ein Scope fehlt.

### ❌ **Braucht neuen Review — später**

**6. Threads**  
Ist eine **eigene API** mit eigenen Scopes (`threads_basic`, `threads_content_publish`) und eigenem App-Review, obwohl Meta-Infrastruktur drunter läuft. Nicht "gratis dabei".

**7. LinkedIn Company Pages**  
Braucht `w_organization_social` → **Marketing Developer Platform**-Freigabe von LinkedIn. Kein Automatismus, dauert 2–6 Wochen.

---

## Vorschlag: Sprint P2-Now

Setze in einer Runde um:
1. **UTM-Layer** in `PublishToSocialTab` + `useSocialPublishing` — plattform-spezifische Presets, User kann Campaign-Name überschreiben
2. **YouTube Shorts-Metadaten** in `publish-to-youtube` — `#Shorts`, Chapters, Category, Tags
3. **IG Reels-Cover-Upload** — neues Cover-Preview-Panel im Composer, Frame-Extraktor bei 0.5s als Default
4. **IG Stories** als 5. Publish-Ziel (mit Auto-Fallback: falls Scope fehlt → Toast + Link zu Reconnect)
5. **First-Comment** als Toggle im Composer — `firstComment: string` wird für IG/LinkedIn nach Post-Success in einer separaten Function-Chain gepostet

Threads und LinkedIn Company Pages parken wir mit einem Review-Kickoff-Doc — sobald du willst reiche ich dir die Meta/LinkedIn-Antragsformulare aufbereitet zurück (Use-Case-Text, App-Video-Skript, Test-Accounts).

**Freigabe**: Sprint P2-Now (Punkte 1–5) so umsetzen? Oder nur einzelne davon (bitte Nummern nennen)?
