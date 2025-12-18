/**
 * Metadata extraction logic
 */

/**
 * Extract metadata from the page
 */
export async function extractMetadata(page) {
  const metadata = await page.evaluate(() => {
    const getMetaContent = (name) => {
      const meta = document.querySelector(
        `meta[name="${name}"], meta[property="${name}"], meta[property="og:${name}"]`
      );
      return meta?.getAttribute("content") || null;
    };

    return {
      // Basic metadata
      title: document.title,
      description: getMetaContent("description"),
      keywords: getMetaContent("keywords"),
      author: getMetaContent("author"),

      // Open Graph
      ogTitle: getMetaContent("og:title"),
      ogDescription: getMetaContent("og:description"),
      ogImage: getMetaContent("og:image"),
      ogType: getMetaContent("og:type"),
      ogUrl: getMetaContent("og:url"),
      ogSiteName: getMetaContent("og:site_name"),

      // Twitter Card
      twitterCard: getMetaContent("twitter:card"),
      twitterTitle: getMetaContent("twitter:title"),
      twitterDescription: getMetaContent("twitter:description"),
      twitterImage: getMetaContent("twitter:image"),

      // Technical
      canonicalUrl:
        document.querySelector('link[rel="canonical"]')?.href || null,
      robots: getMetaContent("robots"),
      viewport: getMetaContent("viewport"),

      // Dates
      publishedTime: getMetaContent("article:published_time"),
      modifiedTime: getMetaContent("article:modified_time"),

      // Favicon
      favicon:
        document.querySelector('link[rel="icon"], link[rel="shortcut icon"]')
          ?.href || null,

      // JSON-LD structured data
      jsonLd: (() => {
        const scripts = document.querySelectorAll(
          'script[type="application/ld+json"]'
        );
        const data = [];
        scripts.forEach((script) => {
          try {
            data.push(JSON.parse(script.textContent));
          } catch (e) {
            // Invalid JSON-LD, skip
          }
        });
        return data.length > 0 ? data : null;
      })(),
    };
  });

  return metadata;
}
