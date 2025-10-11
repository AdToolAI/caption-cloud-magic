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
    <Breadcrumb className="mb-6">
      <BreadcrumbList className="text-sm">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/home" className="flex items-center gap-1 hover:text-primary transition-colors group">
              <Home className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
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
              <BreadcrumbLink className="hover:text-primary transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:bg-primary after:transition-all">
                {t(`category.${category}`)}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        )}
        
        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage className="font-semibold">{feature}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}