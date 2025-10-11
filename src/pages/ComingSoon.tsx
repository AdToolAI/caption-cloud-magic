import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Rocket, ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

const ComingSoon = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Breadcrumbs feature={t("common.comingSoon")} />
        
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
            <Rocket className="h-24 w-24 text-primary relative" />
          </div>
          
          <h1 className="text-4xl font-bold mb-4">
            {t("common.comingSoon")}
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-md">
            {t("common.featureComingSoon")}
          </p>
          
          <Button asChild size="lg">
            <Link to="/home" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("backToHome")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ComingSoon;