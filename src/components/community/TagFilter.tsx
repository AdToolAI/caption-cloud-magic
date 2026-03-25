import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tag } from "lucide-react";

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagFilter({ selectedTags, onTagsChange }: TagFilterProps) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("community_message_tags")
        .select("tag")
        .order("usage_count", { ascending: false })
        .limit(20);

      if (data) setAvailableTags(data.map((t: any) => t.tag));
    };
    fetch();
  }, []);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  if (availableTags.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b bg-muted/30">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      {availableTags.map((tag) => (
        <Badge
          key={tag}
          variant={selectedTags.includes(tag) ? "default" : "outline"}
          className={cn(
            "cursor-pointer text-xs transition-colors",
            selectedTags.includes(tag) && "bg-primary text-primary-foreground"
          )}
          onClick={() => toggleTag(tag)}
        >
          {tag}
        </Badge>
      ))}
      {selectedTags.length > 0 && (
        <button
          onClick={() => onTagsChange([])}
          className="text-xs text-muted-foreground hover:text-foreground ml-1"
        >
          Alle zurücksetzen
        </button>
      )}
    </div>
  );
}
