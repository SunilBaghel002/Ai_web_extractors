/**
 * Extract structured data (pricing, contact, products, etc.)
 */

/**
 * Extract structured data from page
 */
export async function extractStructuredData(page, options = {}) {
  const data = await page.evaluate((opts) => {
    const result = {};

    // Extract pricing information
    if (opts.includePricing) {
      result.pricing = extractPricing();
    }

    // Extract contact information
    if (opts.includeContact) {
      result.contact = extractContactInfo();
    }

    // Extract product information
    if (opts.includeProduct) {
      result.product = extractProductInfo();
    }

    return result;

    // Helper: Extract pricing
    function extractPricing() {
      const pricing = [];

      // Look for pricing tables
      const pricingSelectors = [
        ".pricing",
        ".price",
        ".plan",
        '[class*="pricing"]',
        '[class*="price"]',
        '[data-testid*="price"]',
      ];

      pricingSelectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            const text = el.innerText;

            // Extract price patterns
            const priceMatch =
              text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g) ||
              text.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|EUR|GBP)/gi);

            if (priceMatch) {
              pricing.push({
                element: selector,
                text: text.trim().substring(0, 200),
                prices: priceMatch,
              });
            }
          });
        } catch (e) {}
      });

      // Extract from structured data
      const jsonLd = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      jsonLd.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent);
          if (
            data.offers ||
            data["@type"] === "Offer" ||
            data["@type"] === "Product"
          ) {
            pricing.push({
              type: "structured-data",
              data: data,
            });
          }
        } catch (e) {}
      });

      return pricing;
    }

    // Helper: Extract contact info
    function extractContactInfo() {
      const contact = {
        emails: [],
        phones: [],
        addresses: [],
        social: [],
      };

      const bodyText = document.body.innerText;

      // Extract emails
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const emails = bodyText.match(emailRegex);
      if (emails) {
        contact.emails = [...new Set(emails)];
      }

      // Extract phone numbers
      const phoneRegex =
        /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const phones = bodyText.match(phoneRegex);
      if (phones) {
        contact.phones = [...new Set(phones)];
      }

      // Extract social media links
      const socialPatterns = {
        twitter: /twitter\.com\/([a-zA-Z0-9_]+)/,
        linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9-]+)/,
        github: /github\.com\/([a-zA-Z0-9-]+)/,
        facebook: /facebook\.com\/([a-zA-Z0-9.]+)/,
        instagram: /instagram\.com\/([a-zA-Z0-9._]+)/,
      };

      document.querySelectorAll("a[href]").forEach((link) => {
        const href = link.href;
        Object.entries(socialPatterns).forEach(([platform, pattern]) => {
          const match = href.match(pattern);
          if (match) {
            contact.social.push({
              platform,
              url: href,
              handle: match[1],
            });
          }
        });
      });

      // Extract from structured data
      const jsonLd = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      jsonLd.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent);
          if (data.contactPoint || data["@type"] === "ContactPoint") {
            contact.structured = data;
          }
        } catch (e) {}
      });

      return contact;
    }

    // Helper: Extract product info
    function extractProductInfo() {
      const product = {
        name: null,
        description: null,
        price: null,
        images: [],
        specifications: [],
      };

      // Try to get from meta tags
      product.name =
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector("h1")?.innerText;

      product.description =
        document.querySelector('meta[property="og:description"]')?.content ||
        document.querySelector('meta[name="description"]')?.content;

      // Extract from structured data (Schema.org)
      const jsonLd = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      jsonLd.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent);
          if (data["@type"] === "Product") {
            product.structured = data;
            product.name = product.name || data.name;
            product.description = product.description || data.description;
            if (data.offers) {
              product.price = data.offers.price || data.offers.lowPrice;
            }
          }
        } catch (e) {}
      });

      // Extract specifications from tables
      document.querySelectorAll("table").forEach((table) => {
        const rows = table.querySelectorAll("tr");
        rows.forEach((row) => {
          const cells = row.querySelectorAll("td, th");
          if (cells.length === 2) {
            product.specifications.push({
              key: cells[0].innerText.trim(),
              value: cells[1].innerText.trim(),
            });
          }
        });
      });

      return product;
    }
  }, options);

  return data;
}
