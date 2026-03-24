Deno.serve(() => {
  return new Response(
    "tiktok-developers-site-verification=lR1KqASHK1XQ0Is9kpAAqGUUFhhA8riW",
    { headers: { "Content-Type": "text/plain" } }
  );
});
