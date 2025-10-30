import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Section } from "@/components/ui/Section";

export const SocialProof = () => {
  const { t } = useTranslation();
  
  const testimonials = [
    { 
      name: "Anna M.", 
      role: "Content Creator", 
      text: t('socialProof.testimonial1'), 
    },
    { 
      name: "Max S.", 
      role: "Marketing Manager", 
      text: t('socialProof.testimonial2'), 
    },
    { 
      name: "Lisa K.", 
      role: "Influencerin", 
      text: t('socialProof.testimonial3'), 
    }
  ];
  
  return (
    <Section title={t('socialProof.title')} bg="muted">
      <div className="grid md:grid-cols-3 gap-6">
        {testimonials.map((testimonial) => (
          <Card key={testimonial.name} className="shadow-soft hover:shadow-glow transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {testimonial.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
              <p className="text-sm italic text-muted-foreground leading-relaxed">
                "{testimonial.text}"
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
};
