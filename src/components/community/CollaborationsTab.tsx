import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Handshake, Plus, User, X } from "lucide-react";
import { format } from "date-fns";
import { de, enUS, es } from "date-fns/locale";
import { useCollaborations } from "@/hooks/useCollaborations";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";

function getDateLocale(lang: string) {
  if (lang === 'de') return de;
  if (lang === 'es') return es;
  return enUS;
}

export function CollaborationsTab() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const dateLocale = getDateLocale(language);
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

  const statusLabel = (status: string) => {
    if (status === "open") return t('community.filterOpen');
    if (status === "taken") return t('community.filterTaken');
    return t('community.filterClosed');
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl backdrop-blur-xl bg-card/60 border border-white/10 p-6">
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["all", "open", "taken", "closed"].map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(s)}
              className={filterStatus === s
                ? "shadow-[0_0_15px_hsla(43,90%,68%,0.15)]"
                : "border-white/10 hover:bg-white/5 backdrop-blur-md"
              }
            >
              {s === "all" ? t('community.filterAll') : s === "open" ? t('community.filterOpen') : s === "taken" ? t('community.filterTaken') : t('community.filterClosed')}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="gap-2 shadow-[0_0_15px_hsla(43,90%,68%,0.1)]">
          <Plus className="h-4 w-4" /> {t('community.newPost')}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="backdrop-blur-xl bg-card/60 border-white/10">
            <CardContent className="p-4 space-y-3">
              <Input
                placeholder={t('community.collabTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-card/60 border-white/10"
              />
              <Textarea
                placeholder={t('community.describeProject')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="bg-card/60 border-white/10"
              />
              <div className="flex gap-2">
                <Input
                  placeholder={t('community.addSkill')}
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkill())}
                  className="flex-1 bg-card/60 border-white/10"
                />
                <Button variant="outline" size="sm" onClick={handleAddSkill} className="border-white/10 hover:bg-white/5">{t('community.add')}</Button>
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
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="hover:bg-white/5">{t('community.cancel')}</Button>
                <Button size="sm" onClick={handleCreate} disabled={!title.trim() || !description.trim()} className="shadow-[0_0_15px_hsla(43,90%,68%,0.1)]">
                  {t('community.publish')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Posts grid */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-muted-foreground"
        >
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}>
            <Handshake className="h-8 w-8 mb-2 opacity-40 text-[hsl(43,90%,68%)]" />
          </motion.div>
          <p className="text-sm">{t('community.noCollabs')}</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((post, idx) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.4 }}
            >
              <Card className="backdrop-blur-xl bg-card/60 border-white/10 shadow-[0_0_20px_hsla(43,90%,68%,0.04)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.12)] hover:-translate-y-1 transition-all duration-300">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{post.title}</CardTitle>
                    <Badge
                      variant={post.status === "open" ? "default" : post.status === "taken" ? "secondary" : "outline"}
                      className={`text-xs shrink-0 ${post.status === "open" ? "shadow-[0_0_10px_hsla(43,90%,68%,0.15)]" : ""}`}
                    >
                      {statusLabel(post.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">{post.description}</p>
                  {post.skills_needed.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {post.skills_needed.map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs border-white/10">{skill}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {post.profiles?.email?.split("@")[0] || t('community.anonymous')}
                    </div>
                    <span>{format(new Date(post.created_at), "dd. MMM yyyy", { locale: dateLocale })}</span>
                  </div>
                  {post.user_id === user?.id && post.status === "open" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-white/10 hover:bg-white/5"
                        onClick={() => updateStatus(post.id, "taken")}
                      >
                        {t('community.markTaken')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs hover:bg-white/5"
                        onClick={() => updateStatus(post.id, "closed")}
                      >
                        {t('community.close')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}