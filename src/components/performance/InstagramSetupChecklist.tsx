import { useState } from "react";
import { ChevronDown, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Pre-connect hint for Instagram.
 *
 * Meta only lists Instagram accounts in its OAuth dialog when the account is a
 * Business/Creator (professional) account AND is linked to a Facebook Page.
 * Without both, the dialog shows "no professional Instagram accounts".
 */
export const InstagramSetupChecklist = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-muted/40">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">{t("socialIntegrations.instagramSetup.title")}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("socialIntegrations.instagramSetup.intro")}
        </p>

        <ol className="space-y-2">
          <li className="flex gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">{t("socialIntegrations.instagramSetup.step1Title")}</p>
              <p className="text-xs text-muted-foreground">{t("socialIntegrations.instagramSetup.step1Desc")}</p>
            </div>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">{t("socialIntegrations.instagramSetup.step2Title")}</p>
              <p className="text-xs text-muted-foreground">{t("socialIntegrations.instagramSetup.step2Desc")}</p>
            </div>
          </li>
        </ol>

        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href="https://business.facebook.com/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t("socialIntegrations.instagramSetup.linkBusinessSuite")}
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://www.facebook.com/business/help/connect-instagram-to-page"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t("socialIntegrations.instagramSetup.linkHelp")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
