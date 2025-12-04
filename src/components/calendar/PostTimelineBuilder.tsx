import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  ChevronDown,
  GripVertical,
  Sparkles,
  FolderOpen,
  Image,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PostMediaUploader } from "./PostMediaUploader";
import { MediaLibraryPickerDialog } from "./MediaLibraryPickerDialog";
import { PostTypeSelector, PostType } from "./PostTypeSelector";

interface Post {
  day: number;
  title: string;
  brief: string;
  caption: string;
  channels: string[];
  hashtags: string[];
  eta_minutes: number;
  postType: PostType;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  importedFromAI?: boolean;
  sourceContentId?: string;
}

interface PostTimelineBuilderProps {
  posts: Post[];
  onChange: (posts: Post[]) => void;
  maxDuration: number;
}

const AVAILABLE_CHANNELS = [
  { id: "instagram", label: "Instagram", color: "bg-pink-500" },
  { id: "tiktok", label: "TikTok", color: "bg-black" },
  { id: "linkedin", label: "LinkedIn", color: "bg-blue-600" },
  { id: "youtube", label: "YouTube", color: "bg-red-600" },
  { id: "twitter", label: "X/Twitter", color: "bg-gray-800" },
  { id: "facebook", label: "Facebook", color: "bg-blue-500" },
];

export function PostTimelineBuilder({ posts, onChange, maxDuration }: PostTimelineBuilderProps) {
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set([0]));
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [activePostIndex, setActivePostIndex] = useState<number | null>(null);

  const addPost = () => {
    const newPost: Post = {
      day: posts.length > 0 ? Math.min(posts[posts.length - 1].day + 1, maxDuration) : 1,
      title: "",
      brief: "",
      caption: "",
      channels: [],
      hashtags: [],
      eta_minutes: 30,
      postType: "image",
    };
    onChange([...posts, newPost]);
    setExpandedPosts((prev) => new Set([...prev, posts.length]));
  };

  const removePost = (index: number) => {
    onChange(posts.filter((_, i) => i !== index));
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const updatePost = <K extends keyof Post>(index: number, key: K, value: Post[K]) => {
    const updated = posts.map((post, i) => (i === index ? { ...post, [key]: value } : post));
    onChange(updated);
  };

  const toggleExpand = (index: number) => {
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleChannel = (index: number, channelId: string) => {
    const post = posts[index];
    const newChannels = post.channels.includes(channelId)
      ? post.channels.filter((c) => c !== channelId)
      : [...post.channels, channelId];
    updatePost(index, "channels", newChannels);
  };

  const updateHashtags = (index: number, value: string) => {
    const hashtags = value
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);
    updatePost(index, "hashtags", hashtags);
  };

  const openMediaPicker = (index: number) => {
    setActivePostIndex(index);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (item: { id: string; title: string; caption: string | null; thumb_url: string | null; type: string | null; source: string | null }) => {
    if (activePostIndex === null) return;

    const mediaUrl = item.thumb_url;
    const mediaType = item.type === "video" ? "video" : "image";

    const updated = posts.map((post, i) =>
      i === activePostIndex
        ? {
            ...post,
            mediaUrl: mediaUrl || undefined,
            mediaType: mediaType as "image" | "video",
            postType: mediaType as PostType,
            title: post.title || item.title,
            caption: post.caption || item.caption || "",
            importedFromAI: item.source === "ai-post-generator",
            sourceContentId: item.id,
          }
        : post
    );
    onChange(updated);
    setMediaPickerOpen(false);
    setActivePostIndex(null);
  };

  const navigateToAIGenerator = () => {
    window.open("/ai-posts?returnToTemplate=true", "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Posts in diesem Template</h3>
          <p className="text-sm text-muted-foreground">
            {posts.length} Post{posts.length !== 1 ? "s" : ""} definiert
          </p>
        </div>
        <Button onClick={addPost} size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Post hinzufügen
        </Button>
      </div>

      {posts.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <div className="text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Noch keine Posts</p>
            <p className="text-sm mt-1">Füge Posts hinzu, um dein Template zu erstellen</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post, index) => (
            <Collapsible
              key={index}
              open={expandedPosts.has(index)}
              onOpenChange={() => toggleExpand(index)}
            >
              <Card
                className={cn(
                  "overflow-hidden transition-all border-white/10",
                  expandedPosts.has(index) && "ring-1 ring-primary/30"
                )}
              >
                {/* Header */}
                <CollapsibleTrigger asChild>
                  <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors">
                    <GripVertical className="h-4 w-4 text-muted-foreground/50" />

                    {/* Media Preview */}
                    {post.mediaUrl ? (
                      <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
                        {post.mediaType === "video" ? (
                          <video src={post.mediaUrl} className="w-full h-full object-cover" />
                        ) : (
                          <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
                        )}
                        {post.importedFromAI && (
                          <div className="absolute top-0.5 right-0.5 bg-gold rounded-full p-0.5">
                            <Sparkles className="h-2 w-2 text-black" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                        {post.postType === "video" ? (
                          <Video className="h-5 w-5 text-muted-foreground/50" />
                        ) : (
                          <Image className="h-5 w-5 text-muted-foreground/50" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Tag {post.day}
                        </Badge>
                        <span className="font-medium truncate">
                          {post.title || "Unbenannter Post"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {post.channels.slice(0, 3).map((ch) => {
                          const channel = AVAILABLE_CHANNELS.find((c) => c.id === ch);
                          return channel ? (
                            <Badge
                              key={ch}
                              className={cn("text-[10px] px-1.5 py-0", channel.color)}
                            >
                              {channel.label}
                            </Badge>
                          ) : null;
                        })}
                        {post.channels.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{post.channels.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        expandedPosts.has(index) && "rotate-180"
                      )}
                    />
                  </div>
                </CollapsibleTrigger>

                {/* Expanded Content */}
                <CollapsibleContent>
                  <div className="border-t border-white/10 p-4 space-y-4">
                    {/* Post Type Selector */}
                    <div className="space-y-2">
                      <Label>Post-Typ</Label>
                      <PostTypeSelector
                        value={post.postType}
                        onChange={(type) => updatePost(index, "postType", type)}
                      />
                    </div>

                    {/* Media Section (for image/video/carousel) */}
                    {post.postType !== "text" && (
                      <div className="space-y-2">
                        <Label>Medien</Label>
                        <PostMediaUploader
                          mediaUrl={post.mediaUrl}
                          mediaType={post.mediaType}
                          onMediaChange={(url, type) => {
                            const updated = posts.map((p, i) => 
                              i === index 
                                ? { ...p, mediaUrl: url, mediaType: type } 
                                : p
                            );
                            onChange(updated);
                          }}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1"
                            onClick={() => openMediaPicker(index)}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Aus Library
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1"
                            onClick={navigateToAIGenerator}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            KI generieren
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tag</Label>
                        <Input
                          type="number"
                          min={1}
                          max={maxDuration}
                          value={post.day}
                          onChange={(e) =>
                            updatePost(index, "day", Math.min(maxDuration, parseInt(e.target.value) || 1))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Geschätzte Zeit (Min)</Label>
                        <Input
                          type="number"
                          min={5}
                          value={post.eta_minutes}
                          onChange={(e) => updatePost(index, "eta_minutes", parseInt(e.target.value) || 30)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Titel</Label>
                      <Input
                        value={post.title}
                        onChange={(e) => updatePost(index, "title", e.target.value)}
                        placeholder="Post-Titel eingeben..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Briefing / Notizen</Label>
                      <Textarea
                        value={post.brief}
                        onChange={(e) => updatePost(index, "brief", e.target.value)}
                        placeholder="Interne Notizen oder Briefing..."
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Caption</Label>
                      <Textarea
                        value={post.caption}
                        onChange={(e) => updatePost(index, "caption", e.target.value)}
                        placeholder="Post-Caption schreiben..."
                        rows={3}
                      />
                    </div>

                    {/* Channels */}
                    <div className="space-y-2">
                      <Label>Plattformen</Label>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABLE_CHANNELS.map((channel) => (
                          <Badge
                            key={channel.id}
                            variant={post.channels.includes(channel.id) ? "default" : "outline"}
                            className={cn(
                              "cursor-pointer transition-all",
                              post.channels.includes(channel.id)
                                ? channel.color
                                : "hover:bg-white/10"
                            )}
                            onClick={() => toggleChannel(index, channel.id)}
                          >
                            {channel.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Hashtags */}
                    <div className="space-y-2">
                      <Label>Hashtags</Label>
                      <Input
                        value={post.hashtags.map((h) => `#${h}`).join(" ")}
                        onChange={(e) => updateHashtags(index, e.target.value)}
                        placeholder="#hashtag1 #hashtag2..."
                      />
                    </div>

                    {/* Delete Button */}
                    <div className="flex justify-end pt-2 border-t border-white/10">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removePost(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Post löschen
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Media Library Picker Dialog */}
      <MediaLibraryPickerDialog
        open={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setActivePostIndex(null);
        }}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}
