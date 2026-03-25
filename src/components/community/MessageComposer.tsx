import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Send, Plus, X } from "lucide-react";

interface MessageComposerProps {
  onSend: (content: string, tags: string[]) => Promise<void>;
  canPost: boolean;
  requireTags: boolean;
}

export function MessageComposer({ onSend, canPost, requireTags }: MessageComposerProps) {
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [sending, setSending] = useState(false);

  if (!canPost) {
    return (
      <div className="p-4 border-t bg-muted/30 text-center text-sm text-muted-foreground">
        Du bist nicht berechtigt, in diesem Channel zu posten.
      </div>
    );
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const handleSend = async () => {
    if (!content.trim()) return;
    if (requireTags && tags.length === 0) return;
    setSending(true);
    await onSend(content.trim(), tags);
    setContent("");
    setTags([]);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t space-y-2">
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 text-xs">
              {tag}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setTags(tags.filter((t) => t !== tag))} />
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1 flex gap-2 items-end">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht schreiben..."
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="Tag..."
              className="w-20 h-8 text-xs"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={addTag}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button size="icon" onClick={handleSend} disabled={sending || !content.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {requireTags && tags.length === 0 && (
        <p className="text-xs text-destructive">Mindestens ein Tag erforderlich.</p>
      )}
    </div>
  );
}
