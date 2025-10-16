const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { igUserId } = await req.json();

    // Get the Page Access Token from environment
    const pageToken = Deno.env.get('IG_PAGE_ACCESS_TOKEN');
    
    if (!pageToken) {
      console.error('IG_PAGE_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'IG_PAGE_ACCESS_TOKEN nicht konfiguriert. Bitte in den Secrets hinzufügen.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!igUserId) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Instagram User ID fehlt',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Test the token by fetching Instagram account info
    console.log(`Testing token for IG User ID: ${igUserId}`);
    
    const testUrl = `https://graph.facebook.com/v24.0/${igUserId}?fields=id,username,account_type,media_count&access_token=${pageToken}`;
    
    const response = await fetch(testUrl);
    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', data);
      
      // Provide helpful error messages based on Meta API error codes
      let errorMessage = 'Token-Validierung fehlgeschlagen';
      let errorDetails = data.error?.message || JSON.stringify(data);
      
      if (data.error?.code === 190) {
        errorMessage = 'Token ist ungültig oder abgelaufen';
      } else if (data.error?.code === 100) {
        errorMessage = 'Ungültige Instagram User ID oder fehlende Permissions';
      } else if (data.error?.message?.includes('Invalid platform')) {
        errorMessage = 'App ist nicht korrekt konfiguriert (Invalid platform app)';
        errorDetails = 'Stelle sicher, dass:\n' +
          '1. Deine Meta App vom Typ "Business" ist\n' +
          '2. Instagram Graph API (nicht Basic Display) aktiviert ist\n' +
          '3. Website-Plattform mit korrekter Domain konfiguriert ist\n' +
          '4. Der Token ein Page Access Token ist (nicht User Token)\n' +
          '5. Die Facebook Page mit Instagram Business Account verknüpft ist';
      }
      
      return new Response(
        JSON.stringify({
          valid: false,
          error: errorMessage,
          details: {
            code: data.error?.code,
            type: data.error?.type,
            message: errorDetails,
            fbtrace_id: data.error?.fbtrace_id,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Token is valid!
    console.log('Token validation successful:', data);
    
    return new Response(
      JSON.stringify({
        valid: true,
        id: data.id,
        username: data.username,
        account_type: data.account_type,
        media_count: data.media_count,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Token test error:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        error: error.message || 'Unerwarteter Fehler bei der Token-Validierung',
        details: {
          name: error.name,
          stack: error.stack,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
