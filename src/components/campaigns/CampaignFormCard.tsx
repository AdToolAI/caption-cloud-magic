import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Sparkles, Loader2, Trash2, Plus, Zap, Calendar, 
  Target, CheckCircle2, Circle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { CampaignMediaUploader, type UploadedMedia } from "./CampaignMediaUploader";

interface PostType {
  type: 'Reel' | 'Carousel' | 'Story' | 'Static Post' | 'Link Post';
  count: number;
}

interface CampaignFormCardProps {
  goal: string;
  setGoal: (value: string) => void;
  topic: string;
  setTopic: (value: string) => void;
  tone: string;
  setTone: (value: string) => void;
  audience: string;
  setAudience: (value: string) => void;
  durationWeeks: number;
  setDurationWeeks: (value: number) => void;
  postFrequency: number;
  setPostFrequency: (value: number) => void;
  platforms: string[];
  togglePlatform: (platform: string) => void;
  postTypes: PostType[];
  setPostTypes: (value: PostType[]) => void;
  autoDestination: 'none' | 'calendar' | 'planner';
  setAutoDestination: (value: 'none' | 'calendar' | 'planner') => void;
  campaignMedia: UploadedMedia[];
  setCampaignMedia: (value: UploadedMedia[]) => void;
  isGenerating: boolean;
  userPlan: string;
  onGenerate: () => void;
}

const platformConfig = [
  { id: "instagram", label: "Instagram", icon: "📸", color: "from-pink-500 to-purple-500" },
  { id: "tiktok", label: "TikTok", icon: "🎵", color: "from-cyan-400 to-pink-500" },
  { id: "linkedin", label: "LinkedIn", icon: "💼", color: "from-blue-500 to-blue-700" },
  { id: "facebook", label: "Facebook", icon: "👥", color: "from-blue-400 to-blue-600" },
  { id: "x", label: "X", icon: "𝕏", color: "from-gray-600 to-gray-800" },
];

const postTypeConfig = [
  { type: 'Reel', icon: '🎥', label: 'Reel' },
  { type: 'Carousel', icon: '📸', label: 'Carousel' },
  { type: 'Story', icon: '⚡', label: 'Story' },
  { type: 'Static Post', icon: '🖼️', label: 'Static Post' },
  { type: 'Link Post', icon: '🔗', label: 'Link Post' },
];

// Wizard Steps
const steps = [
  { id: 1, label: "Ziel", icon: Target },
  { id: 2, label: "Inhalt", icon: Sparkles },
  { id: 3, label: "Plattform", icon: Zap },
  { id: 4, label: "Planen", icon: Calendar },
];

export const CampaignFormCard = ({
  goal, setGoal,
  topic, setTopic,
  tone, setTone,
  audience, setAudience,
  durationWeeks, setDurationWeeks,
  postFrequency, setPostFrequency,
  platforms, togglePlatform,
  postTypes, setPostTypes,
  autoDestination, setAutoDestination,
  campaignMedia, setCampaignMedia,
  isGenerating,
  userPlan,
  onGenerate,
}: CampaignFormCardProps) => {
  const { t } = useTranslation();

  // Calculate current step based on filled fields
  const getCurrentStep = () => {
    if (!goal.trim()) return 1;
    if (!topic.trim()) return 2;
    if (platforms.length === 0) return 3;
    return 4;
  };
  const currentStep = getCurrentStep();

  const totalPosts = postTypes.reduce((sum, pt) => sum + pt.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl
                 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden"
    >
      {/* Step Indicator */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <motion.div
                    animate={{
                      scale: isCurrent ? 1.1 : 1,
                      boxShadow: isCurrent ? "0 0 20px hsla(43,90%,68%,0.4)" : "none"
                    }}
                    className={`
                      w-10 h-10 rounded-xl flex items-center justify-center
                      transition-all duration-300
                      ${isCompleted 
                        ? 'bg-primary text-primary-foreground' 
                        : isCurrent
                          ? 'bg-primary/20 border-2 border-primary text-primary'
                          : 'bg-muted/30 border border-white/10 text-muted-foreground'
                      }
                    `}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </motion.div>
                  <span className={`text-xs mt-2 ${isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
                
                {idx < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 mt-[-18px] rounded-full transition-colors duration-300 ${
                    step.id < currentStep ? 'bg-primary' : 'bg-white/10'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <div className="p-6 space-y-6">
        {/* Goal & Topic */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="goal" className="text-sm font-medium text-foreground">
              {t("campaign_goal_label")} *
            </Label>
            <Textarea
              id="goal"
              placeholder={t("campaign_goal_placeholder")}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={isGenerating}
              className="mt-2 bg-muted/30 border-white/10 focus:border-primary/50 
                         focus:ring-2 focus:ring-primary/20 transition-all duration-300
                         placeholder:text-muted-foreground/50"
            />
          </div>

          <div>
            <Label htmlFor="topic" className="text-sm font-medium text-foreground">
              {t("campaign_topic_label")} *
            </Label>
            <Input
              id="topic"
              placeholder={t("campaign_topic_placeholder")}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
              className="mt-2 bg-muted/30 border-white/10 focus:border-primary/50 
                         focus:ring-2 focus:ring-primary/20 transition-all duration-300
                         placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Duration & Frequency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground">{t("campaign_duration_label")}</Label>
            <Select value={durationWeeks.toString()} onValueChange={(v) => setDurationWeeks(parseInt(v))} disabled={isGenerating}>
              <SelectTrigger className="mt-2 bg-muted/30 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <SelectItem key={n} value={n.toString()} disabled={userPlan === "free" && n > 1}>
                    {n} {n === 1 ? "Woche" : "Wochen"} {userPlan === "free" && n > 1 && "🔒"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground">{t("campaign_frequency_label")}</Label>
            <Select value={postFrequency.toString()} onValueChange={(v) => setPostFrequency(parseInt(v))} disabled={isGenerating}>
              <SelectTrigger className="mt-2 bg-muted/30 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                {[3, 4, 5, 6, 7].map((n) => (
                  <SelectItem key={n} value={n.toString()}>
                    {n} Posts/Woche
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Platform Selection */}
        <div>
          <Label className="text-sm font-medium text-foreground">{t("campaign_platform_label")} *</Label>
          <div className="flex flex-wrap gap-2 mt-3">
            {platformConfig.map((platform) => {
              const isSelected = platforms.includes(platform.id);
              
              return (
                <motion.button
                  key={platform.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => togglePlatform(platform.id)}
                  disabled={isGenerating}
                  className={`
                    px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300
                    flex items-center gap-2 border
                    ${isSelected
                      ? 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_15px_hsla(43,90%,68%,0.2)]'
                      : 'bg-muted/20 border-white/10 text-muted-foreground hover:border-white/30'
                    }
                  `}
                >
                  <span>{platform.icon}</span>
                  {platform.label}
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Tone & Audience */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tone" className="text-sm font-medium text-foreground">{t("campaign_tone_label")}</Label>
            <Select value={tone} onValueChange={setTone} disabled={isGenerating}>
              <SelectTrigger className="mt-2 bg-muted/30 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="friendly">{t("campaign_tone_friendly")}</SelectItem>
                <SelectItem value="bold">{t("campaign_tone_bold")}</SelectItem>
                <SelectItem value="educational">{t("campaign_tone_educational")}</SelectItem>
                <SelectItem value="emotional">{t("campaign_tone_emotional")}</SelectItem>
                <SelectItem value="corporate">{t("campaign_tone_corporate")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="audience" className="text-sm font-medium text-foreground">{t("campaign_audience_label")}</Label>
            <Input
              id="audience"
              placeholder={t("campaign_audience_placeholder")}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              disabled={isGenerating}
              className="mt-2 bg-muted/30 border-white/10 focus:border-primary/50 
                         focus:ring-2 focus:ring-primary/20 transition-all duration-300"
            />
          </div>
        </div>

        {/* Post Types */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">Post-Typen definieren</Label>
          <p className="text-xs text-muted-foreground">Bestimme, welche Art von Posts erstellt werden sollen</p>
          
          <div className="space-y-2">
            {postTypes.map((pt, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2 items-center p-3 rounded-xl bg-muted/20 border border-white/5"
              >
                <Select 
                  value={pt.type}
                  onValueChange={(value: any) => {
                    const updated = [...postTypes];
                    updated[index].type = value;
                    setPostTypes(updated);
                  }}
                >
                  <SelectTrigger className="w-[160px] bg-muted/30 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10">
                    {postTypeConfig.map((type) => (
                      <SelectItem key={type.type} value={type.type}>
                        {type.icon} {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={pt.count}
                  onChange={(e) => {
                    const updated = [...postTypes];
                    updated[index].count = parseInt(e.target.value) || 1;
                    setPostTypes(updated);
                  }}
                  className="w-20 bg-muted/30 border-white/10"
                />
                <span className="text-sm text-muted-foreground">pro Woche</span>
                
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setPostTypes(postTypes.filter((_, i) => i !== index))}
                  className="ml-auto hover:bg-destructive/20 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </div>
          
          <Button
            variant="outline"
            onClick={() => setPostTypes([...postTypes, { type: 'Static Post', count: 1 }])}
            className="border-dashed border-white/20 hover:border-primary/50 hover:bg-primary/5"
          >
            <Plus className="h-4 w-4 mr-2" />
            Post-Typ hinzufügen
          </Button>
          
          <div className={`text-sm ${totalPosts !== postFrequency ? 'text-destructive' : 'text-muted-foreground'}`}>
            Gesamt: {totalPosts} Posts/Woche 
            {totalPosts !== postFrequency && ` (erwartet: ${postFrequency})`}
          </div>
        </div>

        {/* Media Upload */}
        <div className="p-4 rounded-xl bg-muted/20 border border-white/5">
          <CampaignMediaUploader 
            onMediaChange={setCampaignMedia}
            maxFiles={20}
          />
          <p className="text-xs text-muted-foreground mt-3">
            💡 Tipp: Lade Medien hoch, um sie Posts zuordnen zu können
          </p>
        </div>

        {/* Auto Destination */}
        <div className="p-4 rounded-xl bg-muted/20 border border-white/5 space-y-3">
          <Label className="text-sm font-medium text-foreground">Nach Generierung automatisch übertragen:</Label>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <Checkbox 
                checked={autoDestination === 'calendar'} 
                onCheckedChange={() => setAutoDestination(autoDestination === 'calendar' ? 'none' : 'calendar')}
                className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm group-hover:text-foreground transition-colors">
                  In Kalender übertragen
                </span>
              </div>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer group">
              <Checkbox 
                checked={autoDestination === 'planner'} 
                onCheckedChange={() => setAutoDestination(autoDestination === 'planner' ? 'none' : 'planner')}
                className="border-white/20 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                <span className="text-sm group-hover:text-foreground transition-colors">
                  In Content-Planner mit KI-optimierten Zeiten
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Generate Button */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Button
            onClick={onGenerate}
            disabled={isGenerating || !goal.trim() || !topic.trim() || platforms.length === 0 || totalPosts !== postFrequency}
            className="w-full h-14 text-base font-semibold relative overflow-hidden
                       bg-gradient-to-r from-primary to-primary/80
                       hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)]
                       transition-all duration-300 group"
          >
            {/* Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                            translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t("campaign_generating")}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                {t("campaign_generate")}
              </>
            )}
          </Button>
        </motion.div>

        {userPlan === "free" && (
          <p className="text-xs text-muted-foreground text-center">
            Free: 1 Kampagne (1 Woche) • Pro: Unbegrenzt (bis 8 Wochen)
          </p>
        )}
      </div>
    </motion.div>
  );
};
