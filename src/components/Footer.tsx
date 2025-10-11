import { useTranslation } from "@/hooks/useTranslation";
import { Sparkles } from "lucide-react";

export const Footer = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/50">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            CaptionGenie
          </div>
          <p className="text-sm text-muted-foreground">
            © {currentYear} CaptionGenie. {t('footer_rights')}
          </p>
        </div>
      </div>
    </footer>
  );
};
