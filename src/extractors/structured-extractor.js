/**
 * Extract structured data (pricing, contact, products, etc.)
 */

/**
 * Extract structured data from page
 */
export async function extractStructuredData(page, options = {}) {
  // Ensure options has safe defaults
  const opts = {
    includePricing: options.includePricing || false,
    includeContact: options.includeContact || false,
    includeProduct: options.includeProduct || false,
  };

  const data = await page.evaluate((extractOptions) => {
    const result = {};

    // Extract pricing information
    if (extractOptions.includePricing) {
      result.pricing = extractPricing();
    }

    // Extract contact information
    if (extractOptions.includeContact) {
      result.contact = extractContactInfo();
    }

    // Extract product information
    if (extractOptions.includeProduct) {
      result.product = extractProductInfo();
    }

    // If no specific option is set, try to extract all
    if (
      !extractOptions.includePricing &&
      !extractOptions.includeContact &&
      !extractOptions.includeProduct
    ) {
      result.pricing = extractPricing();
      result.contact = extractContactInfo();
      result.product = extractProductInfo();
    }

    return result;

    // Helper: Extract pricing
    function extractPricing() {
      const pricing = [];

      // Look for pricing-related text
      const pricingSelectors = [
        ".pricing",
        ".price",
        ".plan",
        '[class*="pricing"]',
        '[class*="price"]',
        '[class*="plan"]',
        '[data-testid*="price"]',
        '[data-testid*="plan"]',
      ];

      pricingSelectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            const text = el.innerText || el.textContent || "";

            // Extract price patterns
            const priceMatch =
              text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g) ||
              text.match(
                /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|EUR|GBP|dollars?)/gi
              ) ||
              text.match(/(?:USD|EUR|GBP|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi);

            if (priceMatch && priceMatch.length > 0) {
              pricing.push({
                element: selector,
                text: text.trim().substring(0, 500),
                prices: priceMatch,
                rawText: text.trim(),
              });
            }
          });
        } catch (e) {
          console.error("Pricing extraction error:", e);
        }
      });

      // Also look for pricing in any element containing price-related text
      const allElements = document.querySelectorAll(
        "div, section, article, span, p"
      );
      allElements.forEach((el) => {
        try {
          const text = el.innerText || el.textContent || "";
          if (text.length > 10 && text.length < 500) {
            const hasPriceKeywords =
              /\b(price|pricing|plan|cost|fee|subscription|month|year|annual|free|trial)\b/i.test(
                text
              );
            const hasPriceSymbol = /\$\s*\d+|\d+\s*(?:USD|EUR|GBP)/i.test(text);

            if (hasPriceKeywords && hasPriceSymbol) {
              const priceMatch =
                text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g) ||
                text.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|EUR|GBP)/gi);

              if (priceMatch) {
                pricing.push({
                  element: "auto-detected",
                  text: text.trim().substring(0, 500),
                  prices: priceMatch,
                });
              }
            }
          }
        } catch (e) {
          // Ignore errors for individual elements
        }
      });

      // Deduplicate based on text similarity
      const unique = [];
      const seen = new Set();

      pricing.forEach((item) => {
        const key = item.text.substring(0, 100);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      });

      return unique;
    }

    // Helper: Extract contact info
    function extractContactInfo() {
      const contact = {
        emails: [],
        phones: [],
        addresses: [],
        social: [],
      };

      try {
        const bodyText = document.body.innerText || "";

        // Extract emails
        const emailRegex =
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emails = bodyText.match(emailRegex);
        if (emails) {
          contact.emails = [...new Set(emails)].slice(0, 10);
        }

        // Extract phone numbers
        const phoneRegex =
          /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
        const phones = bodyText.match(phoneRegex);
        if (phones) {
          contact.phones = [...new Set(phones)].slice(0, 10);
        }

        // Extract social media links
        const socialPatterns = {
          twitter: /twitter\.com\/([a-zA-Z0-9_]+)/,
          linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9-]+)/,
          github: /github\.com\/([a-zA-Z0-9-]+)/,
          facebook: /facebook\.com\/([a-zA-Z0-9.]+)/,
        };

        document.querySelectorAll("a[href]").forEach((link) => {
          const href = link.href || "";
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
      } catch (e) {
        console.error("Contact extraction error:", e);
      }

      return contact;
    }

    // Helper: Extract product info
    function extractProductInfo() {
      const product = {
        name: null,
        description: null,
        price: null,
        specifications: [],
      };

      try {
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
          } catch (e) {
            // Invalid JSON-LD
          }
        });
      } catch (e) {
        console.error("Product extraction error:", e);
      }

      return product;
    }
  }, opts);

  return data;
}
