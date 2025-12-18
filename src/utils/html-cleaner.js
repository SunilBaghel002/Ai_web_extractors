/**
 * HTML cleaning utilities
 */

/**
 * Remove unwanted elements from the page
 */
export async function cleanHTML(page, selectorsToRemove) {
  await page.evaluate((selectors) => {
    selectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          el.remove();
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });

    // Remove hidden elements
    document
      .querySelectorAll(
        '[style*="display: none"], [style*="display:none"], [hidden]'
      )
      .forEach((el) => {
        el.remove();
      });

    // Remove empty elements
    document.querySelectorAll("div, span, p").forEach((el) => {
      if (!el.innerText.trim() && !el.querySelector("img, video, iframe")) {
        el.remove();
      }
    });
  }, selectorsToRemove);
}

/**
 * Clean text content
 */
export function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
