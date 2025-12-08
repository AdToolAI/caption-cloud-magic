import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, Loader2, FileDown, Trash2, ExternalLink, 
  Upload, Video, X, Sparkles, Hash, Lightbulb, Target, Check, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";
import type { UploadedMedia } from "./CampaignMediaUploader";
import { CampaignPostPreview } from "./CampaignPostPreview";

interface GeneratedContent {
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
}

interface CampaignPost {
  id?: string;
  day: string;
  post_type: string;
  title: string;
  caption_outline: string;
  hashtags: string[];
  cta: string;
  best_time: string;
  media_url?: string;
  media_type?: string;
}

interface CampaignWeek {
  week_number: number;
  theme: string;
  posts: CampaignPost[];
}

interface Campaign {
  id: string;
  title: string;
  ai_json: {
    summary: string;
    weeks: CampaignWeek[];
    hashtag_strategy: string;
    posting_tips: string[];
  };
}

interface CampaignDisplayCardProps {
  campaign: Campaign;
  campaignMedia: UploadedMedia[];
  mediaAssignments: Record<string, string>;
  setMediaAssignments: (value: Record<string, string>) => void;
  isGenerating: boolean;
  userPlan: string;
  onScheduleToCalendar: (campaign: Campaign) => void;
  onScheduleToPlanner: (campaign: Campaign) => void;
  onDelete: (id: string) => void;
  onAutoAssignMedia: () => void;
  // Click-to-Select props
  selectedMediaId: string | null;
  onMediaSelect: (mediaId: string) => void;
  onPostClick: (postId: string) => void;
  // Generator props
  onOpenGenerator: (post: CampaignPost, postId: string) => void;
  generatedContents: Record<string, GeneratedContent>;
  platforms: string[];
  // Legacy drag-drop (kept for compatibility)
  handleDragStart: (e: React.DragEvent, mediaId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, postId: string) => void;
}

export const CampaignDisplayCard = ({
  campaign,
  campaignMedia,
  mediaAssignments,
  setMediaAssignments,
  isGenerating,
  userPlan,
  onScheduleToCalendar,
  onScheduleToPlanner,
  onDelete,
  onAutoAssignMedia,
  selectedMediaId,
  onMediaSelect,
  onPostClick,
  onOpenGenerator,
  generatedContents,
  platforms,
  handleDragStart,
  handleDragOver,
  handleDrop,
}: CampaignDisplayCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showPreviews, setShowPreviews] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      {/* Media Library */}
      {campaignMedia.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                     shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
                <Upload className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Medien-Bibliothek</h3>
                <p className="text-xs text-muted-foreground">{campaignMedia.length} Dateien</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onAutoAssignMedia}
              className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              Auto-Zuordnung
            </Button>
          </div>
          
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {campaignMedia.map((media) => {
              const isSelected = selectedMediaId === media.id;
              return (
                <div
                  key={media.id}
                  onClick={() => onMediaSelect(media.id)}
                  className={`cursor-pointer rounded-xl overflow-hidden border transition-all duration-300 hover:scale-105 relative
                    ${isSelected 
                      ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_20px_hsla(43,90%,68%,0.4)]' 
                      : 'border-white/10 hover:border-primary/50 hover:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]'
                    }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5">
                        <Check className="h-3 w-3" />
                      </Badge>
                    </div>
                  )}
                  
                  {media.type === 'video' ? (
                    <div className="aspect-video bg-muted/30 flex items-center justify-center">
                      <Video className="h-8 w-8 text-muted-foreground" />
                    </div>
                  ) : (
                    <img 
                      src={media.preview} 
                      alt={media.title}
                      className="aspect-video object-cover"
                    />
                  )}
                  
                  <div className="p-2 bg-card/80">
                    <p className="text-xs font-medium truncate">{media.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {media.type === 'video' ? '🎥 Video' : '🖼️ Bild'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Klicke auf ein Medium, dann auf einen Post zum Zuordnen
          </p>
        </motion.div>
      )}

      {/* Campaign Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl
                   shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">{campaign.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{campaign.ai_json.weeks.length} Wochen geplant</p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={() => navigate(`/planner?campaign_id=${campaign.id}`)}
              variant="outline"
              size="sm"
              className="gap-2 border-white/10 hover:border-accent/50 hover:bg-accent/10"
            >
              <Calendar className="h-4 w-4 text-accent" />
              2-Wochen-Planer
            </Button>
            <Button 
              onClick={() => onScheduleToPlanner(campaign)}
              disabled={isGenerating}
              variant="outline"
              size="sm"
              className="gap-2 border-white/10 hover:border-accent/50 hover:bg-accent/10"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 text-accent" />
              )}
              KI-Planner
            </Button>
            <Button 
              onClick={() => onScheduleToCalendar(campaign)}
              disabled={isGenerating}
              size="sm"
              className="gap-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30
                         hover:shadow-[0_0_15px_hsla(43,90%,68%,0.3)]"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              In Kalender
            </Button>
            {userPlan === "pro" && (
              <Button variant="outline" size="sm" className="border-white/10">
                <FileDown className="mr-2 h-4 w-4" />
                PDF
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onDelete(campaign.id)}
              className="hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">{t("campaign_summary")}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{campaign.ai_json.summary}</p>
            </div>
          </div>
        </div>

        {/* Weeks Accordion */}
        <div className="p-6">
          <Accordion type="single" collapsible className="w-full space-y-3">
            {campaign.ai_json.weeks.map((week, weekIdx) => (
              <AccordionItem 
                key={week.week_number} 
                value={`week-${week.week_number}`}
                className="border border-white/10 rounded-xl overflow-hidden bg-muted/10"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-white/5">
                  <div className="flex items-center gap-4">
                    {/* Week Number */}
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30
                                      flex items-center justify-center font-bold text-primary">
                        {week.week_number}
                      </div>
                      {weekIdx < campaign.ai_json.weeks.length - 1 && (
                        <div className="absolute top-full left-1/2 w-0.5 h-4 bg-primary/20 -translate-x-1/2" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-foreground">Woche {week.week_number}</p>
                      <p className="text-sm text-muted-foreground">{week.theme}</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto bg-muted/50 text-muted-foreground">
                      {week.posts.length} Posts
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="grid gap-4 pt-2">
                    {week.posts.map((post, postIndex) => {
                      const postId = post.id || `${week.week_number}-${postIndex}`;
                      const assignedMediaId = mediaAssignments[postId];
                      const assignedMedia = campaignMedia.find(m => m.id === assignedMediaId);
                      const generatedContent = generatedContents[postId];
                      const isPreviewOpen = showPreviews[postId];
                      
                      // Use generated content or fallback to original
                      const displayCaption = generatedContent?.caption || post.caption_outline;
                      const displayHashtags = generatedContent?.hashtags || post.hashtags;
                      const displayHook = generatedContent?.hook || "";
                      const displayCta = generatedContent?.cta || post.cta;
                      
                      return (
                        <motion.div
                          key={postIndex}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: postIndex * 0.05 }}
                          onClick={() => selectedMediaId && onPostClick(postId)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, postId)}
                          className={`p-4 rounded-xl bg-card/40 border transition-all duration-300 group
                            ${selectedMediaId 
                              ? 'border-primary/50 hover:border-primary hover:bg-primary/5 cursor-pointer' 
                              : 'border-white/5 hover:border-primary/30 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)]'
                            }
                            ${generatedContent ? 'ring-1 ring-green-500/30' : ''}`}
                        >
                          {/* Generated Badge */}
                          {generatedContent && (
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
                                <Sparkles className="h-2.5 w-2.5 mr-1" />
                                KI-generiert
                              </Badge>
                            </div>
                          )}

                          {/* Post Header */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs border-white/20">{post.day}</Badge>
                                <Badge className="text-xs bg-accent/20 text-accent border-accent/30">
                                  {post.post_type}
                                </Badge>
                                {post.best_time && (
                                  <Badge variant="secondary" className="text-xs bg-muted/30">
                                    🕐 {post.best_time}
                                  </Badge>
                                )}
                              </div>
                              <h4 className="font-semibold text-foreground">{post.title}</h4>
                            </div>
                            
                            {/* Media Zone - Click to assign when media selected */}
                            {assignedMedia ? (
                              <div className="relative group/media">
                                {assignedMedia.type === 'video' ? (
                                  <div className="w-20 h-20 bg-muted/30 flex items-center justify-center rounded-lg border border-white/10">
                                    <Video className="h-6 w-6 text-muted-foreground" />
                                  </div>
                                ) : (
                                  <img 
                                    src={assignedMedia.preview}
                                    alt={assignedMedia.title}
                                    className="w-20 h-20 object-cover rounded-lg border border-white/10"
                                  />
                                )}
                                
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover/media:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = { ...mediaAssignments };
                                    delete updated[postId];
                                    setMediaAssignments(updated);
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className={`w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-all
                                ${selectedMediaId 
                                  ? 'border-primary bg-primary/10 text-primary' 
                                  : 'border-white/20 text-muted-foreground/50 hover:border-primary/50 hover:bg-primary/5'
                                }`}>
                                <Upload className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          
                          {/* Hook (if generated) */}
                          {displayHook && (
                            <p className="text-sm font-medium mt-3 p-2 rounded bg-primary/10 border border-primary/20">
                              {displayHook}
                            </p>
                          )}
                          
                          {/* Caption */}
                          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                            {displayCaption}
                          </p>
                          
                          {/* Hashtags */}
                          <div className="flex flex-wrap gap-1 mt-3">
                            {displayHashtags?.slice(0, 5).map((tag: string, i: number) => (
                              <Badge 
                                key={i} 
                                variant="secondary" 
                                className="text-[10px] bg-primary/10 text-primary border-primary/20"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {displayHashtags?.length > 5 && (
                              <Badge variant="secondary" className="text-[10px] bg-muted/30">
                                +{displayHashtags.length - 5}
                              </Badge>
                            )}
                          </div>
                          
                          {/* CTA */}
                          {displayCta && (
                            <p className="text-sm font-medium mt-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                              🎯 {displayCta}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 pt-3 mt-3 border-t border-white/5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenGenerator(post, postId);
                              }}
                              className="gap-1.5 text-xs border-primary/30 hover:border-primary hover:bg-primary/10"
                            >
                              <Sparkles className="h-3 w-3 text-primary" />
                              Mit KI generieren
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowPreviews(prev => ({ ...prev, [postId]: !prev[postId] }));
                              }}
                              className="gap-1.5 text-xs hover:bg-accent/10"
                            >
                              <Eye className="h-3 w-3" />
                              {isPreviewOpen ? "Vorschau schließen" : "Plattform-Vorschau"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/generator", { state: { prefillCaption: displayCaption } });
                              }}
                              className="gap-1.5 text-xs hover:bg-accent/10"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Generator
                            </Button>
                          </div>

                          {/* Platform Preview */}
                          {isPreviewOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-4 pt-4 border-t border-white/10"
                            >
                              <CampaignPostPreview
                                platforms={platforms}
                                mediaUrl={assignedMedia?.preview}
                                mediaType={assignedMedia?.type}
                                caption={displayCaption}
                                hook={displayHook}
                                hashtags={displayHashtags || []}
                              />
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Strategy Section */}
        <div className="p-6 border-t border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Hashtag Strategy */}
            <div className="p-4 rounded-xl bg-muted/20 border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">{t("campaign_hashtag_strategy")}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {campaign.ai_json.hashtag_strategy}
              </p>
            </div>
            
            {/* Posting Tips */}
            <div className="p-4 rounded-xl bg-muted/20 border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-accent" />
                <h3 className="font-semibold text-foreground">{t("campaign_posting_tips")}</h3>
              </div>
              <ul className="space-y-2">
                {campaign.ai_json.posting_tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
