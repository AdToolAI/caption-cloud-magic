import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook, Twitter, Linkedin, Youtube, Settings } from "lucide-react";
import type { Provider } from "@/types/publish";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChannelSelectorProps {
  selectedChannels: Provider[];
  onChannelsChange: (channels: Provider[]) => void;
  onConfigClick?: (channel: Provider) => void;
}

const channels: Array<{ id: Provider; name: string; icon: React.ElementType; color: string; selectedColor: string }> = [
  { 
    id: "instagram", 
    name: "Instagram", 
    icon: Instagram,
    color: "hover:border-pink-500/50 hover:shadow-[0_0_15px_hsla(330,80%,60%,0.2)]",
    selectedColor: "bg-gradient-to-r from-pink-500 to-purple-500 border-pink-500/50 shadow-[0_0_20px_hsla(330,80%,60%,0.3)]"
  },
  { 
    id: "facebook", 
    name: "Facebook", 
    icon: Facebook,
    color: "hover:border-blue-500/50 hover:shadow-[0_0_15px_hsla(220,80%,50%,0.2)]",
    selectedColor: "bg-[#1877F2] border-blue-500/50 shadow-[0_0_20px_hsla(220,80%,50%,0.3)]"
  },
  { 
    id: "x", 
    name: "X", 
    icon: Twitter,
    color: "hover:border-cyan-400/50 hover:shadow-[0_0_15px_hsla(180,80%,50%,0.2)]",
    selectedColor: "bg-zinc-900 border-cyan-400/50 shadow-[0_0_20px_hsla(180,80%,50%,0.3)]"
  },
  { 
    id: "linkedin", 
    name: "LinkedIn", 
    icon: Linkedin,
    color: "hover:border-emerald-500/50 hover:shadow-[0_0_15px_hsla(150,80%,40%,0.2)]",
    selectedColor: "bg-emerald-600 border-emerald-500/50 shadow-[0_0_20px_hsla(150,80%,40%,0.3)]"
  },
  { 
    id: "tiktok", 
    name: "TikTok", 
    icon: () => <span className="text-sm font-bold">TT</span>,
    color: "hover:border-cyan-400/50 hover:shadow-[0_0_15px_hsla(180,80%,50%,0.2)]",
    selectedColor: "bg-black border-cyan-400/50 shadow-[0_0_20px_hsla(180,80%,50%,0.3)]"
  },
  { 
    id: "youtube", 
    name: "YouTube", 
    icon: Youtube,
    color: "hover:border-red-500/50 hover:shadow-[0_0_15px_hsla(0,80%,50%,0.2)]",
    selectedColor: "bg-red-600 border-red-500/50 shadow-[0_0_20px_hsla(0,80%,50%,0.3)]"
  },
];

export function ChannelSelector({ selectedChannels, onChannelsChange, onConfigClick }: ChannelSelectorProps) {
  const toggleChannel = (channelId: Provider) => {
    if (selectedChannels.includes(channelId)) {
      onChannelsChange(selectedChannels.filter((c) => c !== channelId));
    } else {
      onChannelsChange([...selectedChannels, channelId]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">Ziel-Kanäle</label>
      <div className="flex flex-wrap gap-2">
        {channels.map((channel, index) => {
          const isSelected = selectedChannels.includes(channel.id);
          const Icon = channel.icon;

          return (
            <motion.div
              key={channel.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm transition-all duration-300 flex items-center gap-2",
                  "bg-muted/30 backdrop-blur-sm border-white/10",
                  isSelected 
                    ? cn("text-white", channel.selectedColor)
                    : cn("hover:bg-muted/50", channel.color)
                )}
                onClick={() => toggleChannel(channel.id)}
              >
                <Icon className="h-4 w-4" />
                {channel.name}
                {isSelected && onConfigClick && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="ml-1 hover:bg-white/30 rounded p-0.5 transition-all hover:scale-110"
                          onClick={(e) => {
                            e.stopPropagation();
                            onConfigClick(channel.id);
                          }}
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Einstellungen</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Badge>
            </motion.div>
          );
        })}
      </div>
      {selectedChannels.length === 0 && (
        <p className="text-xs text-destructive">Wählen Sie mindestens einen Kanal aus</p>
      )}
    </div>
  );
}
