import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Static fallback holidays
const staticHolidays: Record<string, any[]> = {
  DE: [
    { date: "2025-01-01", localName: "Neujahr", name: "New Year's Day" },
    { date: "2025-04-18", localName: "Karfreitag", name: "Good Friday" },
    { date: "2025-04-21", localName: "Ostermontag", name: "Easter Monday" },
    { date: "2025-05-01", localName: "Tag der Arbeit", name: "Labour Day" },
    { date: "2025-05-29", localName: "Christi Himmelfahrt", name: "Ascension Day" },
    { date: "2025-06-09", localName: "Pfingstmontag", name: "Whit Monday" },
    { date: "2025-10-03", localName: "Tag der Deutschen Einheit", name: "German Unity Day" },
    { date: "2025-12-25", localName: "Weihnachten", name: "Christmas Day" },
    { date: "2025-12-26", localName: "Zweiter Weihnachtstag", name: "Boxing Day" }
  ],
  GB: [
    { date: "2025-01-01", localName: "New Year's Day", name: "New Year's Day" },
    { date: "2025-04-18", localName: "Good Friday", name: "Good Friday" },
    { date: "2025-04-21", localName: "Easter Monday", name: "Easter Monday" },
    { date: "2025-05-05", localName: "Early May Bank Holiday", name: "Early May Bank Holiday" },
    { date: "2025-05-26", localName: "Spring Bank Holiday", name: "Spring Bank Holiday" },
    { date: "2025-08-25", localName: "Summer Bank Holiday", name: "Summer Bank Holiday" },
    { date: "2025-12-25", localName: "Christmas Day", name: "Christmas Day" },
    { date: "2025-12-26", localName: "Boxing Day", name: "Boxing Day" }
  ],
  ES: [
    { date: "2025-01-01", localName: "Año Nuevo", name: "New Year's Day" },
    { date: "2025-01-06", localName: "Epifanía del Señor", name: "Epiphany" },
    { date: "2025-04-18", localName: "Viernes Santo", name: "Good Friday" },
    { date: "2025-05-01", localName: "Fiesta del Trabajo", name: "Labour Day" },
    { date: "2025-08-15", localName: "Asunción de la Virgen", name: "Assumption of Mary" },
    { date: "2025-10-12", localName: "Fiesta Nacional de España", name: "National Day" },
    { date: "2025-11-01", localName: "Todos los Santos", name: "All Saints' Day" },
    { date: "2025-12-06", localName: "Día de la Constitución", name: "Constitution Day" },
    { date: "2025-12-25", localName: "Navidad", name: "Christmas Day" }
  ]
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { region, month, year, brand_kit_id } = await req.json();

    if (!region || !month || !year) {
      throw new Error("Missing required parameters: region, month, year");
    }

    console.log(`Fetching holidays for ${region}/${year}, month: ${month}`);

    // Fetch holidays from API or use fallback
    let holidays = [];
    try {
      const countryCode = region === "GB" ? "GB" : region;
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
      
      if (response.ok) {
        const data = await response.json();
        holidays = data;
      } else {
        console.log("API failed, using static fallback");
        holidays = staticHolidays[region] || [];
      }
    } catch (error) {
      console.log("API error, using static fallback:", error);
      holidays = staticHolidays[region] || [];
    }

    // Filter by month
    const monthStr = String(month).padStart(2, '0');
    const filteredHolidays = holidays.filter((h: any) => {
      const holidayMonth = h.date.split('-')[1];
      return holidayMonth === monthStr;
    });

    console.log(`Found ${filteredHolidays.length} holidays for month ${month}`);

    // Get brand context if brand_kit_id provided
    let brandContext = "";
    if (brand_kit_id) {
      const { data: brandKit } = await supabaseClient
        .from("brand_kits")
        .select("brand_name, target_audience, brand_tone, keywords")
        .eq("id", brand_kit_id)
        .single();

      if (brandKit) {
        brandContext = `
Brand: ${brandKit.brand_name || 'N/A'}
Target Audience: ${brandKit.target_audience || 'General'}
Brand Tone: ${brandKit.brand_tone || 'Professional'}
Keywords: ${brandKit.keywords ? JSON.stringify(brandKit.keywords) : 'N/A'}
`;
      }
    }

    // Generate AI content ideas for each holiday
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const holidaysWithIdeas = await Promise.all(
      filteredHolidays.map(async (holiday: any) => {
        const holidayName = holiday.localName || holiday.name;
        const holidayDate = holiday.date;

        const prompt = `Generate 3-5 creative social media content ideas for the holiday "${holidayName}" on ${holidayDate}.

${brandContext ? `Consider this brand context:\n${brandContext}` : ''}

For each idea, provide a short, actionable description (1-2 sentences). Focus on:
- Visual content opportunities (photos, graphics, videos)
- Behind-the-scenes content
- User engagement posts
- Product/service highlights
- Community/customer appreciation

Return ONLY a JSON array of strings, nothing else. Example format:
["Idea 1 description", "Idea 2 description", "Idea 3 description"]`;

        try {
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "user", content: prompt }
              ],
              temperature: 0.8,
            }),
          });

          if (!aiResponse.ok) {
            console.error(`AI API error for ${holidayName}:`, await aiResponse.text());
            return {
              ...holiday,
              ideas: ["Create a festive post celebrating this holiday", "Share behind-the-scenes preparations", "Engage followers with holiday-themed questions"]
            };
          }

          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "[]";
          
          // Try to parse JSON from response
          let ideas = [];
          try {
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              ideas = JSON.parse(jsonMatch[0]);
            } else {
              ideas = JSON.parse(content);
            }
          } catch (parseError) {
            console.error(`Failed to parse AI response for ${holidayName}:`, parseError);
            ideas = ["Create a festive post celebrating this holiday", "Share behind-the-scenes preparations", "Engage followers with holiday-themed questions"];
          }

          return {
            date: holiday.date,
            name: holidayName,
            type: holiday.type || "Public",
            ideas: Array.isArray(ideas) ? ideas : ["Create a festive post celebrating this holiday"]
          };
        } catch (error) {
          console.error(`Error generating ideas for ${holidayName}:`, error);
          return {
            date: holiday.date,
            name: holidayName,
            type: holiday.type || "Public",
            ideas: ["Create a festive post celebrating this holiday", "Share behind-the-scenes preparations", "Engage followers with holiday-themed questions"]
          };
        }
      })
    );

    return new Response(
      JSON.stringify({ holidays: holidaysWithIdeas }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in calendar-holiday-suggestions:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
