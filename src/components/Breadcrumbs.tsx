import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbsProps {
  category?: string;
  feature: string;
}

export function Breadcrumbs({ category, feature }: BreadcrumbsProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky top-14 z-40 bg-background/60 dark:bg-background/30 backdrop-blur-md border-b border-border/50 py-2">
      <div className="container max-w-full px-4">
        <Breadcrumb>
          <BreadcrumbList className="text-sm">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/home" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-smooth">
              <Home className="h-3.5 w-3.5" />
              {t("home")}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        
        {category && (
          <>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink className="text-muted-foreground hover:text-foreground hover:underline transition-smooth">
                {t(`category.${category}`)}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        )}
        
        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium text-foreground">{feature}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
      </div>
    </div>
  );
}