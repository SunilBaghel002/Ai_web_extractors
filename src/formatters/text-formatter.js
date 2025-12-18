/**
 * Plain text formatting logic
 */

/**
 * Format content as plain text
 */
export function formatAsText(data) {
  const lines = [];

  // Title
  lines.push(data.title.toUpperCase());
  lines.push("=".repeat(data.title.length));
  lines.push("");

  // Source
  lines.push(`Source: ${data.url}`);
  lines.push("-".repeat(50));
  lines.push("");

  // Main content
  lines.push(cleanText(data.textContent));
  lines.push("");

  // Links section
  if (data.links && data.links.length > 0) {
    lines.push("-".repeat(50));
    lines.push("LINKS:");
    data.links.slice(0, 10).forEach((link, i) => {
      lines.push(`  ${i + 1}. ${link.text}: ${link.url}`);
    });
  }

  return lines.join("\n");
}

/**
 * Clean text for plain text output
 */
function cleanText(text) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\t+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}
