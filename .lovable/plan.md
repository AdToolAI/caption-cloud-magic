# Hebel 9: Real-Time Collaboration im Video Composer

Macht den Composer team-fähig: mehrere Nutzer können dasselbe Projekt gleichzeitig sehen, Cursor-Bewegungen verfolgen und Kommentar-Threads pro Szene führen — der Enterprise-Differentiator.

## Was der Nutzer bekommt

1. **Share-Dialog** im Composer (`/video-composer/:projectId`)
   - Projekt per Link mit Team-Mitgliedern teilen (E-Mail-Einladung oder Link mit Rolle: `viewer` / `editor`)
   - Liste aller aktiven Kollaboratoren mit Avatar + Live-Status (online/offline)

2. **Live-Cursor-Presence**
   - Bei jedem aktiven Nutzer wird ein farbiger Cursor mit Namen über dem Composer-Canvas angezeigt
   - Szenen-Karten zeigen Avatar-Badges, wenn jemand sie gerade bearbeitet ("Anna editiert")
   - Auto-Refresh bei Änderungen via Supabase Realtime auf `composer_scenes` (kein manueller Reload)

3. **Comment-Threads pro Szene**
   - Jede `SceneCard` bekommt ein Kommentar-Icon mit Counter
   - Klick öffnet Side-Panel mit Thread (Markdown, @mentions, Resolve-Button)
   - Realtime-Push bei neuen Kommentaren + Notification-Badge im Header

4. **Conflict-Indicator**
   - Wenn zwei Nutzer dieselbe Szene editieren, zeigt ein Warning-Toast: "Anna bearbeitet diese Szene gerade"

## Technische Umsetzung

### 1. Datenbank-Migration
```sql
-- Kollaboratoren pro Projekt
CREATE TABLE composer_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES composer_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer','editor','owner')),
  invited_by uuid,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (project_id, user_id)
);

-- Kommentare pro Szene
CREATE TABLE composer_scene_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid REFERENCES composer_scenes(id) ON DELETE CASCADE,
  project_id uuid REFERENCES composer_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES composer_scene_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Security-Definer-Funktion (verhindert RLS-Rekursion)
CREATE FUNCTION can_access_composer_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM composer_projects WHERE id = _project_id AND user_id = _user_id
    UNION
    SELECT 1 FROM composer_collaborators
    WHERE project_id = _project_id AND user_id = _user_id AND accepted_at IS NOT NULL
  );
$$;

-- RLS-Policies basieren auf can_access_composer_project()
-- Bestehende composer_projects/scenes-Policies werden um Collaborator-Zugriff erweitert

-- Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE composer_scenes;
ALTER PUBLICATION supabase_realtime ADD TABLE composer_scene_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE composer_collaborators;
```

### 2. Realtime-Hooks
- **`useComposerPresence(projectId)`**: nutzt `supabase.channel('composer:'+projectId)` mit `track({ user_id, name, color, cursor_x, cursor_y, active_scene_id })`. Throttled auf 50ms.
- **`useComposerRealtime(projectId)`**: subscribet auf `postgres_changes` für `composer_scenes` + invalidiert React-Query-Cache
- **`useSceneComments(sceneId)`**: lädt Thread + subscribet auf neue Inserts

### 3. UI-Komponenten (neu)
- `src/components/video-composer/ShareProjectDialog.tsx` — Einladen via E-Mail/Link, Rollenwahl
- `src/components/video-composer/CollaboratorAvatars.tsx` — Stacked Avatars im Header
- `src/components/video-composer/LiveCursor.tsx` — Floating-Cursor mit Tailwind-Color
- `src/components/video-composer/SceneCommentPanel.tsx` — Side-Sheet mit Thread + Reply
- `src/components/video-composer/SceneCommentBadge.tsx` — Counter-Badge auf SceneCard

### 4. Edge Function
- `invite-composer-collaborator/index.ts` — sendet Einladungs-E-Mail (Resend), erstellt `composer_collaborators`-Row mit `accepted_at = NULL`. Annahme via Magic-Link auf `/video-composer/:projectId?invite=<token>`.

### 5. Integration in bestehende Komponenten
- `VideoComposerDashboard.tsx`: Header bekommt `<CollaboratorAvatars />` + Share-Button
- `SceneCard.tsx`: zeigt `<SceneCommentBadge />` + Avatar bei aktivem Editor
- `Composer.tsx` (Page): mountet `<LiveCursor />` Layer + `useComposerPresence`

### 6. Berechtigungen
- `viewer`: nur Lesen + Kommentieren
- `editor`: alles außer Löschen/Teilen
- `owner`: alle Rechte (= `composer_projects.user_id`)
- UI-Buttons werden basierend auf Rolle disabled

## Aus dem Scope ausgeschlossen
- Operational Transform / CRDT für gleichzeitiges Tippen im selben Feld (nur Last-Write-Wins + Conflict-Toast)
- @mention-Autocomplete (Phase 2)
- E-Mail-Digest für Kommentare (Phase 2)

## Geschätzter Umfang
- Migration: 1 Datei (~150 Zeilen)
- 5 neue Komponenten + 3 Hooks
- 1 Edge Function (Resend-Invite)
- Integration in ~3 bestehende Composer-Files
