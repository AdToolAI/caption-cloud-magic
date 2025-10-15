import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Post {
  day: number;
  title: string;
  brief: string;
  channels: string[];
  hashtags: string[];
  eta_minutes: number;
}

interface PostTimelineBuilderProps {
  posts: Post[];
  onChange: (posts: Post[]) => void;
  maxDuration: number;
}

const AVAILABLE_CHANNELS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "Twitter" },
];

export function PostTimelineBuilder({
  posts,
  onChange,
  maxDuration,
}: PostTimelineBuilderProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const addPost = () => {
    const newPost: Post = {
      day: 0,
      title: "",
      brief: "",
      channels: ["instagram"],
      hashtags: [],
      eta_minutes: 60,
    };
    onChange([...posts, newPost]);
    setExpandedIndex(posts.length);
  };

  const removePost = (index: number) => {
    onChange(posts.filter((_, i) => i !== index));
    if (expandedIndex === index) {
      setExpandedIndex(null);
    }
  };

  const updatePost = (index: number, field: keyof Post, value: any) => {
    const updated = [...posts];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const toggleChannel = (postIndex: number, channel: string) => {
    const post = posts[postIndex];
    const channels = post.channels.includes(channel)
      ? post.channels.filter((c) => c !== channel)
      : [...post.channels, channel];
    updatePost(postIndex, "channels", channels);
  };

  const updateHashtags = (postIndex: number, hashtagString: string) => {
    const hashtags = hashtagString
      .split(/[\s,]+/)
      .filter((tag) => tag.trim())
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
    updatePost(postIndex, "hashtags", hashtags);
  };

  const sortedPosts = [...posts].sort((a, b) => a.day - b.day);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Post-Timeline</h3>
          <p className="text-sm text-muted-foreground">
            Definiere die Posts für diese Kampagne
          </p>
        </div>
        <Button onClick={addPost} variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Post hinzufügen
        </Button>
      </div>

      {posts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-muted-foreground mb-4">
              Noch keine Posts hinzugefügt
            </p>
            <Button onClick={addPost} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Ersten Post hinzufügen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedPosts.map((post, originalIndex) => {
            const actualIndex = posts.findIndex(p => p === post);
            const isExpanded = expandedIndex === actualIndex;

            return (
              <Card key={actualIndex} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedIndex(isExpanded ? null : actualIndex)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-sm">
                          Tag {post.day} {post.day === 0 && "(Start)"}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {post.title || "Unbenannter Post"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {post.channels.map((channel) => (
                        <Badge key={channel} variant="secondary" className="text-xs">
                          {channel}
                        </Badge>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePost(actualIndex);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Tag (relativ zum Start)</Label>
                        <Input
                          type="number"
                          min="0"
                          max={maxDuration}
                          value={post.day}
                          onChange={(e) =>
                            updatePost(actualIndex, "day", parseInt(e.target.value) || 0)
                          }
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label>Geschätzte Dauer (Minuten)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="300"
                          value={post.eta_minutes}
                          onChange={(e) =>
                            updatePost(actualIndex, "eta_minutes", parseInt(e.target.value) || 60)
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Post-Titel *</Label>
                      <Input
                        value={post.title}
                        onChange={(e) => updatePost(actualIndex, "title", e.target.value)}
                        placeholder="z.B. Sale-Ankündigung"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Brief / Beschreibung</Label>
                      <Textarea
                        value={post.brief}
                        onChange={(e) => updatePost(actualIndex, "brief", e.target.value)}
                        placeholder="Beschreibe den Inhalt dieses Posts..."
                        rows={3}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Kanäle</Label>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABLE_CHANNELS.map((channel) => (
                          <Badge
                            key={channel.value}
                            variant={
                              post.channels.includes(channel.value)
                                ? "default"
                                : "outline"
                            }
                            className="cursor-pointer hover:bg-primary/80"
                            onClick={() => toggleChannel(actualIndex, channel.value)}
                          >
                            {channel.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Hashtags</Label>
                      <Input
                        value={post.hashtags.join(" ")}
                        onChange={(e) => updateHashtags(actualIndex, e.target.value)}
                        placeholder="#sale #deal #limited"
                      />
                      <p className="text-xs text-muted-foreground">
                        Trenne Hashtags mit Leerzeichen oder Kommas
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}