import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

interface BioCardProps {
  bio: {
    platform: string;
    text: string;
  };
  index: number;
  onPreview: (text: string) => void;
}

export function BioCard({ bio, index, onPreview }: BioCardProps) {
  const { t } = useTranslation();

  const handleCopy = () => {
    navigator.clipboard.writeText(bio.text);
    toast.success("Bio copied to clipboard!");
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Bio #{index + 1}</span>
            <Badge variant="outline">{bio.platform}</Badge>
          </div>
          <p className="text-sm">{bio.text}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {bio.text.length} characters
          </p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button
          onClick={handleCopy}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <Copy className="w-4 h-4 mr-2" />
          {t("bio_copy")}
        </Button>
        <Button
          onClick={() => onPreview(bio.text)}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <Eye className="w-4 h-4 mr-2" />
          {t("bio_preview")}
        </Button>
      </div>
    </Card>
  );
}
