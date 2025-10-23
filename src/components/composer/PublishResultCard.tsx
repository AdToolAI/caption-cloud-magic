import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Instagram, Facebook, Twitter, Linkedin, Youtube, ExternalLink, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PublishResult } from "@/types/publish";

interface PublishResultCardProps {
  result: PublishResult;
}

const providerIcons = {
  instagram: Instagram,
  facebook: Facebook,
  x: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: () => <span className="text-sm font-bold">TT</span>,
};

const providerNames = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
};

export function PublishResultCard({ result }: PublishResultCardProps) {
  const Icon = providerIcons[result.provider];
  const name = providerNames[result.provider];

  return (
    <Card className={result.ok ? "border-green-500/50" : "border-destructive/50"}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span className="font-semibold">{name}</span>
          </div>

          {result.ok ? (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Success</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Failed</span>
            </div>
          )}
        </div>

        {result.ok && result.permalink && (
          <a
            href={result.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View post
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {!result.ok && result.error_message && (
          <div className="mt-2 space-y-1">
            {result.error_code && (
              <p className="text-xs font-mono text-muted-foreground">{result.error_code}</p>
            )}
            <p className="text-sm text-destructive">{result.error_message}</p>
          </div>
        )}

        {result.transform_report && result.transform_report.length > 0 && (
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className="h-4 w-4" />
              Transform Report
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {result.transform_report.map((report: any, i: number) => (
                <div key={i} className="text-xs p-2 bg-muted rounded space-y-1">
                  <p className="font-medium">{report.file}</p>
                  {report.actions && report.actions.length > 0 && (
                    <ul className="list-disc list-inside text-muted-foreground">
                      {report.actions.map((action: string, j: number) => (
                        <li key={j}>{action}</li>
                      ))}
                    </ul>
                  )}
                  {report.warnings && report.warnings.length > 0 && (
                    <Alert variant="destructive" className="mt-1 py-1">
                      <AlertDescription className="text-xs">
                        {report.warnings.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
