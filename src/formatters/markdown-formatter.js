/**
 * Markdown formatting logic
 */

/**
 * Format content as Markdown
 */
export function formatAsMarkdown(data) {
  const lines = [];

  // Title
  lines.push(`# ${data.title}`);
  lines.push("");

  // Source
  lines.push(`> Source: ${data.url}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Table of Contents (if multiple headings)
  if (data.headings && data.headings.length > 3) {
    lines.push("## Table of Contents");
    lines.push("");
    data.headings.forEach((h) => {
      const indent = "  ".repeat(h.level - 1);
      lines.push(`${indent}- [${h.text}](#${h.id})`);
    });
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Main content
  lines.push("## Content");
  lines.push("");
  lines.push(cleanTextContent(data.textContent));
  lines.push("");

  // Code blocks
  if (data.codeBlocks && data.codeBlocks.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Code Snippets");
    lines.push("");
    data.codeBlocks.forEach((block, index) => {
      lines.push(`### Code Block ${index + 1} (${block.language})`);
      lines.push("");
      lines.push("```" + block.language);
      lines.push(block.code);
      lines.push("```");
      lines.push("");
    });
  }

  // Tables
  if (data.tables && data.tables.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Tables");
    lines.push("");
    data.tables.forEach((table, index) => {
      lines.push(`### Table ${index + 1}`);
      lines.push("");

      if (table.headers.length > 0) {
        lines.push("| " + table.headers.join(" | ") + " |");
        lines.push("| " + table.headers.map(() => "---").join(" | ") + " |");
      }

      table.rows.forEach((row) => {
        lines.push("| " + row.join(" | ") + " |");
      });
      lines.push("");
    });
  }

  // Links
  if (data.links && data.links.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## References & Links");
    lines.push("");
    data.links.slice(0, 20).forEach((link) => {
      lines.push(`- [${link.text}](${link.url})${link.isExternal ? " ↗" : ""}`);
    });
    if (data.links.length > 20) {
      lines.push(`- ... and ${data.links.length - 20} more links`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Clean text content for better readability
 */
function cleanTextContent(text) {
  return text
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines to double
    .replace(/\t+/g, " ") // Tabs to spaces
    .replace(/[ ]{2,}/g, " ") // Multiple spaces to single
    .trim();
}
