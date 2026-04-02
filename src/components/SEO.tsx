import { Helmet } from "react-helmet-async";
import { SEO_CONFIG, getCanonicalUrl, getOgImageUrl, getLocale } from "@/config/seo";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  lang?: string;
  structuredData?: object;
  noindex?: boolean;
}

export const SEO = ({
  title,
  description,
  canonical,
  ogImage,
  ogType = "website",
  lang = "de",
  structuredData,
  noindex = false,
}: SEOProps) => {
  const fullTitle = `${title} | ${SEO_CONFIG.siteName}`;
  const url = canonical ? getCanonicalUrl(canonical) : (typeof window !== "undefined" ? window.location.href : "");
  const imageUrl = getOgImageUrl(ogImage);
  const locale = getLocale(lang);

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <html lang={lang} />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      
      {/* Canonical URL */}
      {canonical && <link rel="canonical" href={canonical} />}
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content={String(SEO_CONFIG.ogImageWidth)} />
      <meta property="og:image:height" content={String(SEO_CONFIG.ogImageHeight)} />
      <meta property="og:site_name" content={SEO_CONFIG.siteName} />
      <meta property="og:locale" content={locale} />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      {SEO_CONFIG.twitterHandle && (
        <meta name="twitter:site" content={SEO_CONFIG.twitterHandle} />
      )}
      
      {/* Structured Data / JSON-LD */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};
