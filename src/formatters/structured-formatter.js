/**
 * Structured JSON formatting logic
 */

/**
 * Format content as structured JSON
 */
export function formatAsStructured(data) {
  return {
    title: data.title,
    url: data.url,

    // Content organized by sections
    sections: buildSections(data),

    // Summary
    summary: {
      firstParagraph: getFirstParagraph(data.textContent),
      wordCount: data.textContent.split(/\s+/).filter((w) => w).length,
      headingCount: data.headings?.length || 0,
      linkCount: data.links?.length || 0,
      imageCount: data.images?.length || 0,
    },

    // Hierarchical structure
    outline: buildOutline(data.headings || []),

    // Key content
    keyContent: {
      headings: data.headings?.map((h) => h.text) || [],
      lists: data.lists || [],
      codeBlocks: data.codeBlocks?.length || 0,
    },
  };
}

/**
 * Build sections from headings
 */
function buildSections(data) {
  const sections = [];
  const headings = data.headings || [];
  const text = data.textContent || "";

  if (headings.length === 0) {
    return [
      {
        title: "Main Content",
        level: 1,
        content: text.substring(0, 2000),
      },
    ];
  }

  headings.forEach((heading, index) => {
    sections.push({
      title: heading.text,
      level: heading.level,
      id: heading.id,
    });
  });

  return sections;
}

/**
 * Build hierarchical outline from headings
 */
function buildOutline(headings) {
  const outline = [];
  const stack = [{ children: outline, level: 0 }];

  headings.forEach((heading) => {
    const item = { title: heading.text, level: heading.level, children: [] };

    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    stack[stack.length - 1].children.push(item);
    stack.push(item);
  });

  return outline;
}

/**
 * Get first paragraph of content
 */
function getFirstParagraph(text) {
  const paragraphs = text.split(/\n\n+/);
  for (const p of paragraphs) {
    const cleaned = p.trim();
    if (cleaned.length > 50) {
      return cleaned.substring(0, 300) + (cleaned.length > 300 ? "..." : "");
    }
  }
  return text.substring(0, 300);
}
