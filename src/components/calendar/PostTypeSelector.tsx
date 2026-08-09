import { tx } from "@/lib/i18nText";
import { FileText, Image, Video, Images } from "lucide-react";
import { cn } from "@/lib/utils";

export type PostType = "text" | "image" | "video" | "carousel";

interface PostTypeSelectorProps {
  value: PostType;
  onChange: (type: PostType) => void;
  className?: string;
}

const postTypes = [
  { value: "text" as const, label: tx({ de: "Text", en: "Text", es: "Texto" }), icon: FileText },
  { value: "image" as const, label: tx({ de: "Bild", en: "Image", es: "Imagen" }), icon: Image },
  { value: "video" as const, label: tx({ de: "Video", en: "Video", es: "Video" }), icon: Video },
  { value: "carousel" as const, label: tx({ de: "Karussell", en: "Carousel", es: "Carrusel" }), icon: Images },
];

export function PostTypeSelector({ value, onChange, className }: PostTypeSelectorProps) {
  return (
    <div className={cn("flex gap-1 p-1 bg-white/5 rounded-lg", className)}>
      {postTypes.map((type) => {
        const Icon = type.icon;
        const isSelected = value === type.value;
        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              isSelected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/10"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {type.label}
          </button>
        );
      })}
    </div>
  );
}
