import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Handshake, Plus, User, X } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useCollaborations } from "@/hooks/useCollaborations";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

export function CollaborationsTab() {
  const { user } = useAuth();
  const { posts, loading, createPost, updateStatus } = useCollaborations();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const handleAddSkill = () => {
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      setSkills([...skills, skillInput.trim()]);
      setSkillInput("");
    }
  };

  const handleCreate = () => {
    if (!title.trim() || !description.trim()) return;
    createPost(title.trim(), description.trim(), skills);
    setTitle("");
    setDescription("");
    setSkills([]);
    setShowCreate(false);
  };

  const filtered = filterStatus === "all" ? posts : posts.filter((p) => p.status === filterStatus);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["all", "open", "taken", "closed"].map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "Alle" : s === "open" ? "Offen" : s === "taken" ? "Vergeben" : "Geschlossen"}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="gap-2">
          <Plus className="h-4 w-4" /> Neuer Post
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Titel der Kollaboration"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Beschreibe dein Projekt und was du suchst..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Skill hinzufügen (z.B. Video-Editing)"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkill())}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleAddSkill}>Hinzufügen</Button>
            </div>
            {skills.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {skills.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setSkills(skills.filter((sk) => sk !== s))}
                    />
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Abbrechen</Button>
              <Button size="sm" onClick={handleCreate} disabled={!title.trim() || !description.trim()}>
                Veröffentlichen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posts grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Handshake className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Keine Kollaborationen gefunden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((post) => (
            <Card key={post.id} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{post.title}</CardTitle>
                  <Badge
                    variant={post.status === "open" ? "default" : post.status === "taken" ? "secondary" : "outline"}
                    className="text-xs shrink-0"
                  >
                    {post.status === "open" ? "Offen" : post.status === "taken" ? "Vergeben" : "Geschlossen"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-3">{post.description}</p>
                {post.skills_needed.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {post.skills_needed.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {post.profiles?.email?.split("@")[0] || "Anonym"}
                  </div>
                  <span>{format(new Date(post.created_at), "dd. MMM yyyy", { locale: de })}</span>
                </div>
                {post.user_id === user?.id && post.status === "open" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => updateStatus(post.id, "taken")}
                    >
                      Als vergeben markieren
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => updateStatus(post.id, "closed")}
                    >
                      Schließen
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
