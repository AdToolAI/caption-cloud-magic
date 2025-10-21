import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle } from "lucide-react";

interface Slide {
  role: "title" | "content" | "cta";
  title: string;
  bullets: string[];
}

interface BrandKit {
  primary_color?: string;
  secondary_color?: string;
  font_pairing?: {
    heading?: string;
    body?: string;
  };
}

interface DesignPreviewProps {
  slides: Slide[];
  brandKit?: BrandKit;
  template: string;
}

export const DesignPreview = ({ slides, brandKit, template }: DesignPreviewProps) => {
  const checkTextLength = (slide: Slide) => {
    const totalChars = slide.title.length + slide.bullets.join(" ").length;
    return totalChars <= 200;
  };

  const checkContrast = () => {
    // Simplified contrast check - in production, use actual color contrast algorithm
    return true;
  };

  const checkCTA = (slide: Slide) => {
    const ctaKeywords = ["follow", "save", "comment", "download", "get", "join", "start", "try"];
    const text = (slide.title + " " + slide.bullets.join(" ")).toLowerCase();
    return ctaKeywords.some(keyword => text.includes(keyword));
  };

  const getPrimaryColor = () => {
    return brandKit?.primary_color || "hsl(var(--primary))";
  };

  const getSecondaryColor = () => {
    return brandKit?.secondary_color || "hsl(var(--secondary))";
  };

  return (
    <div className="space-y-4">
      {slides.map((slide, index) => {
        const isTextTooLong = !checkTextLength(slide);
        const hasCTA = slide.role === "cta" ? checkCTA(slide) : true;
        const isLastSlide = index === slides.length - 1;

        return (
          <Card 
            key={index}
            className="relative overflow-hidden border-2 transition-all hover:shadow-lg"
            style={{
              borderColor: index === 0 ? getPrimaryColor() : "hsl(var(--border))",
            }}
          >
            <div 
              className="absolute inset-0 opacity-5"
              style={{
                background: `linear-gradient(135deg, ${getPrimaryColor()} 0%, ${getSecondaryColor()} 100%)`,
              }}
            />
            
            <CardHeader className="relative">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Slide {index + 1}
                  </span>
                  <Badge variant={slide.role === "title" ? "default" : "secondary"} className="text-xs">
                    {slide.role}
                  </Badge>
                </div>
                
                <div className="flex gap-1">
                  {isTextTooLong && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Zu lang
                    </Badge>
                  )}
                  {!hasCTA && isLastSlide && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Keine CTA
                    </Badge>
                  )}
                  {!isTextTooLong && (
                    <Badge variant="outline" className="text-xs border-success text-success">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      OK
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative space-y-3 pb-8">
              <h3 
                className="text-2xl font-bold leading-tight"
                style={{
                  color: getPrimaryColor(),
                  fontFamily: brandKit?.font_pairing?.heading || "inherit",
                }}
              >
                {slide.title}
              </h3>
              
              {slide.bullets.length > 0 && (
                <ul className="space-y-2">
                  {slide.bullets.map((bullet, bIndex) => (
                    <li 
                      key={bIndex} 
                      className="flex items-start gap-2 text-sm"
                      style={{
                        fontFamily: brandKit?.font_pairing?.body || "inherit",
                      }}
                    >
                      <span 
                        className="mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getSecondaryColor() }}
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground opacity-30">
                AdTool AI
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};