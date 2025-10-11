import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface PricingCardProps {
  title: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  buttonText: string;
  buttonVariant?: "default" | "outline";
  onButtonClick?: () => void;
  popular?: boolean;
}

export const PricingCard = ({
  title,
  price,
  period,
  description,
  features,
  buttonText,
  buttonVariant = "default",
  onButtonClick,
  popular = false,
}: PricingCardProps) => {
  return (
    <Card className={`relative transition-smooth ${popular ? "border-primary border-2" : ""}`}>
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide">
            Popular
          </span>
        </div>
      )}
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-muted-foreground">{description}</CardDescription>}
        <div className="mt-6">
          <span className="text-5xl font-bold tracking-tight">{price}</span>
          {period && <span className="text-muted-foreground text-base ml-2">/ {period}</span>}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button 
          variant={buttonVariant} 
          className="w-full" 
          size="lg"
          onClick={onButtonClick}
        >
          {buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
};
