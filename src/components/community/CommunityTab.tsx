import { useState } from "react";
import { ChannelList, type CommunityChannel } from "@/components/community/ChannelList";
import { MessageFeed } from "@/components/community/MessageFeed";
import { MessageComposer } from "@/components/community/MessageComposer";
import { TagFilter } from "@/components/community/TagFilter";
import { SpotlightCard } from "@/components/community/SpotlightCard";
import { useCommunityMessages } from "@/hooks/useCommunityMessages";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";

export function CommunityTab() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [selectedChannel, setSelectedChannel] = useState<CommunityChannel | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const { messages, loading, sendMessage } = useCommunityMessages(selectedChannel?.id || null);

  const canPost = !!(
    user &&
    selectedChannel &&
    selectedChannel.allowed_user_ids.includes(user.id)
  );

  const requireTags = selectedChannel?.moderation_rules?.require_tags === true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid grid-cols-1 lg:grid-cols-[240px_1fr_280px] gap-4"
    >
      <div className="rounded-xl backdrop-blur-xl bg-card/60 border border-white/10 overflow-hidden shadow-[0_0_20px_hsla(43,90%,68%,0.04)]">
        <ChannelList
          selectedChannelId={selectedChannel?.id || null}
          onSelectChannel={setSelectedChannel}
        />
      </div>

      <div className="rounded-xl backdrop-blur-xl bg-card/60 border border-white/10 flex flex-col overflow-hidden min-h-[500px] shadow-[0_0_20px_hsla(43,90%,68%,0.04)]">
        {selectedChannel ? (
          <>
            <div className="px-4 py-3 border-b border-white/10 bg-card/40 backdrop-blur-md">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <span className="text-[hsl(43,90%,68%)]">#</span> {selectedChannel.name}
                <span className="text-xs text-muted-foreground font-normal">
                  — {selectedChannel.topic}
                </span>
              </h2>
            </div>
            <TagFilter selectedTags={filterTags} onTagsChange={setFilterTags} />
            <div className="flex-1 overflow-y-auto">
              <MessageFeed messages={messages} loading={loading} filterTags={filterTags} />
            </div>
            <MessageComposer onSend={sendMessage} canPost={canPost} requireTags={requireTags} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">{t('community.selectChannel')}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl backdrop-blur-xl bg-card/60 border border-white/10 overflow-hidden shadow-[0_0_20px_hsla(43,90%,68%,0.04)]">
        <SpotlightCard channelId={selectedChannel?.id || null} />
      </div>
    </motion.div>
  );
}