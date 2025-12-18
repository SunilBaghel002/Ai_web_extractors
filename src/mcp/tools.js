/**
 * MCP Tools Definitions
 *
 * These define the tools/capabilities that AI agents can use
 */

/**
 * Get all available MCP tools
 */
export function getMCPTools() {
  return [
    {
      name: "extract_webpage",
      description:
        "Extract clean, structured content from a single webpage. Returns title, content, metadata, images, and links optimized for AI consumption.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the webpage to extract content from",
          },
          format: {
            type: "string",
            enum: ["markdown", "text", "html", "structured"],
            default: "markdown",
            description: "Output format for the extracted content",
          },
          includeImages: {
            type: "boolean",
            default: true,
            description: "Whether to extract image URLs and alt text",
          },
          includeLinks: {
            type: "boolean",
            default: true,
            description: "Whether to extract all links from the page",
          },
          includeMetadata: {
            type: "boolean",
            default: true,
            description:
              "Whether to extract page metadata (title, description, etc.)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_multiple",
      description:
        "Extract content from multiple webpages in parallel. Useful for gathering information from several sources at once.",
      inputSchema: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Array of URLs to extract content from",
          },
          format: {
            type: "string",
            enum: ["markdown", "text", "html", "structured"],
            default: "markdown",
            description: "Output format for all extracted content",
          },
          maxConcurrency: {
            type: "integer",
            default: 3,
            description: "Maximum number of pages to process simultaneously",
          },
        },
        required: ["urls"],
      },
    },
    {
      name: "get_page_metadata",
      description:
        "Get only the metadata from a webpage without full content extraction. Faster than full extraction when you only need meta information.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to get metadata from",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "crawl_website",
      description:
        "Crawl a website starting from a URL, following links up to a specified depth. Extracts content from all discovered pages.",
      inputSchema: {
        type: "object",
        properties: {
          startUrl: {
            type: "string",
            description: "The starting URL for the crawl",
          },
          maxDepth: {
            type: "integer",
            default: 1,
            minimum: 0,
            maximum: 5,
            description: "Maximum link depth to follow (0 = only start URL)",
          },
          maxPages: {
            type: "integer",
            default: 10,
            maximum: 100,
            description: "Maximum number of pages to crawl",
          },
          sameDomain: {
            type: "boolean",
            default: true,
            description: "Only follow links on the same domain",
          },
        },
        required: ["startUrl"],
      },
    },
    {
      name: "extract_with_chunking",
      description:
        "Extract webpage content and split it into chunks for processing by LLMs with token limits. Ideal for RAG systems.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to extract and chunk",
          },
          chunkSize: {
            type: "integer",
            default: 1000,
            description: "Target size of each chunk in characters",
          },
          chunkOverlap: {
            type: "integer",
            default: 100,
            description: "Number of characters to overlap between chunks",
          },
        },
        required: ["url"],
      },
    },
  ];
}

/**
 * Get tool by name
 */
export function getToolByName(name) {
  const tools = getMCPTools();
  return tools.find((tool) => tool.name === name);
}
