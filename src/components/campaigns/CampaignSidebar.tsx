import { motion } from "framer-motion";
import { Calendar, Check, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface Campaign {
  id: string;
  title: string;
  goal: string;
  topic: string;
  tone: string;
  audience: string;
  duration_weeks: number;
  platform: string[];
  post_frequency: number;
  summary: string;
  ai_json: {
    summary: string;
    weeks: any[];
    hashtag_strategy: string;
    posting_tips: string[];
  };
  created_at: string;
}

interface CampaignSidebarProps {
  campaigns: Campaign[];
  selectedCampaign: Campaign | null;
  onSelectCampaign: (campaign: Campaign) => void;
  onDeleteCampaign: (id: string) => void;
  campaignMedia?: Record<string, string | null>;
}

const platformIcons: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  linkedin: "💼",
  facebook: "👥",
  x: "𝕏",
};

export const CampaignSidebar = ({
  campaigns,
  selectedCampaign,
  onSelectCampaign,
  onDeleteCampaign,
  campaignMedia,
}: CampaignSidebarProps) => {
  const { t } = useTranslation();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4 } }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-5
                 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{t("campaign_my_campaigns")}</h2>
          <p className="text-xs text-muted-foreground">{campaigns.length} Kampagnen</p>
        </div>
      </div>

      {/* Campaign List */}
      {campaigns.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
            <Calendar className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">{t("campaign_no_campaigns")}</p>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-2"
        >
          {campaigns.map((campaign) => {
            const isSelected = selectedCampaign?.id === campaign.id;
            
            return (
              <motion.div
                key={campaign.id}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <button
                  onClick={() => onSelectCampaign(campaign)}
                  className={`
                    w-full text-left p-4 rounded-xl border transition-all duration-300 group relative
                    ${isSelected
                      ? "bg-primary/10 border-primary/50 shadow-[0_0_20px_hsla(43,90%,68%,0.2)]"
                      : "bg-card/30 border-white/5 hover:border-primary/30 hover:bg-card/50"
                    }
                  `}
                >
                  {/* Active Indicator */}
                  {isSelected && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
                  )}

                  <div className="flex items-start gap-3">
                    {/* Media Thumbnail */}
                    {campaignMedia?.[campaign.id] && (
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted/30 flex-shrink-0 border border-white/10">
                        <img 
                          src={campaignMedia[campaign.id]!} 
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-medium text-sm truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {campaign.title}
                        </p>
                        {isSelected && (
                          <div className="p-1 rounded-full bg-primary/20 flex-shrink-0">
                            <Check className="h-3 w-3 text-primary" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {campaign.goal}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {campaign.duration_weeks} {campaign.duration_weeks === 1 ? "Woche" : "Wochen"} • {campaign.post_frequency} Posts/Woche
                      </p>
                    </div>
                  </div>

                  {/* Platform Badges */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {campaign.platform.map((p) => (
                      <Badge
                        key={p}
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${
                          isSelected 
                            ? 'bg-primary/20 text-primary border-primary/30' 
                            : 'bg-muted/50 border-white/5'
                        }`}
                      >
                        {platformIcons[p] || ""} {p}
                      </Badge>
                    ))}
                  </div>

                  {/* Delete Button (visible on hover) */}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCampaign(campaign.id);
                    }}
                    className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100
                               transition-opacity duration-200 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
};
