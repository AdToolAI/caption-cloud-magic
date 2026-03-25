import { useState } from "react";
import { ChannelList, type CommunityChannel } from "@/components/community/ChannelList";
import { MessageFeed } from "@/components/community/MessageFeed";
import { MessageComposer } from "@/components/community/MessageComposer";
import { TagFilter } from "@/components/community/TagFilter";
import { SpotlightCard } from "@/components/community/SpotlightCard";
import { useCommunityMessages } from "@/hooks/useCommunityMessages";
import { useAuth } from "@/hooks/useAuth";

export function CommunityTab() {
  const { user } = useAuth();
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
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_280px] gap-4">
      <div className="border rounded-xl bg-card overflow-hidden">
        <ChannelList
          selectedChannelId={selectedChannel?.id || null}
          onSelectChannel={setSelectedChannel}
        />
      </div>

      <div className="border rounded-xl bg-card flex flex-col overflow-hidden min-h-[500px]">
        {selectedChannel ? (
          <>
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                # {selectedChannel.name}
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
            <p className="text-sm">Wähle einen Channel aus, um loszulegen.</p>
          </div>
        )}
      </div>

      <div>
        <SpotlightCard channelId={selectedChannel?.id || null} />
      </div>
    </div>
  );
}
