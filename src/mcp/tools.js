/**
 * MCP Tools Definitions - Updated with Code & AI Tools
 */

export function getMCPTools() {
  return [
    // ==================== WEB EXTRACTION ====================
    {
      name: "extract_webpage",
      description: "Extract clean, structured content from a webpage",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to extract" },
          format: {
            type: "string",
            enum: ["markdown", "text", "html", "structured"],
            default: "markdown",
          },
          includeImages: { type: "boolean", default: true },
          includeLinks: { type: "boolean", default: true },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_multiple",
      description: "Extract content from multiple webpages in parallel",
      inputSchema: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string" } },
          format: {
            type: "string",
            enum: ["markdown", "text", "structured"],
            default: "markdown",
          },
        },
        required: ["urls"],
      },
    },
    {
      name: "crawl_website",
      description: "Crawl a website following links",
      inputSchema: {
        type: "object",
        properties: {
          startUrl: { type: "string" },
          maxDepth: { type: "integer", default: 1, maximum: 5 },
          maxPages: { type: "integer", default: 10, maximum: 100 },
        },
        required: ["startUrl"],
      },
    },
    {
      name: "extract_with_chunking",
      description: "Extract content split into chunks for RAG/LLM processing",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          chunkSize: { type: "integer", default: 1000 },
          chunkOverlap: { type: "integer", default: 100 },
        },
        required: ["url"],
      },
    },

    // ==================== CODE EXTRACTION ====================
    {
      name: "extract_github_repo",
      description: "Extract all code files from a GitHub repository",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "GitHub repository URL" },
          maxFiles: { type: "integer", default: 50, maximum: 100 },
          extensions: {
            type: "array",
            items: { type: "string" },
            default: [".js", ".ts", ".py", ".jsx", ".tsx"],
          },
          includeTests: { type: "boolean", default: false },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_github_file",
      description: "Extract a single file from GitHub",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "GitHub file URL (blob or raw)" },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_stackoverflow",
      description: "Extract code snippets from a StackOverflow question",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "StackOverflow question URL" },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_code_from_url",
      description: "Extract code blocks from any webpage",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL containing code" },
        },
        required: ["url"],
      },
    },

    // ==================== AI ANALYSIS ====================
    {
      name: "analyze_code",
      description:
        "Analyze code for patterns, issues, and architecture (FREE AI)",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL containing code (GitHub, SO, etc.)",
          },
          provider: {
            type: "string",
            enum: ["groq", "gemini", "huggingface", "together", "ollama"],
            default: "groq",
            description: "AI provider to use (all free)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "explain_code",
      description: "Get a beginner-friendly explanation of code (FREE AI)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          provider: {
            type: "string",
            enum: ["groq", "gemini", "huggingface", "together", "ollama"],
            default: "groq",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "generate_docs",
      description: "Generate documentation for code (FREE AI)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          provider: {
            type: "string",
            enum: ["groq", "gemini", "huggingface", "together", "ollama"],
            default: "groq",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "improve_code",
      description: "Get suggestions to improve code quality (FREE AI)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          provider: {
            type: "string",
            enum: ["groq", "gemini", "huggingface", "together", "ollama"],
            default: "groq",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "summarize_content",
      description: "Summarize any extracted content (FREE AI)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          maxLength: { type: "integer", default: 500 },
          provider: {
            type: "string",
            enum: ["groq", "gemini", "huggingface", "together", "ollama"],
            default: "groq",
          },
        },
        required: ["url"],
      },
    },

    // ==================== UTILITIES ====================
    {
      name: "get_page_metadata",
      description: "Get only metadata from a webpage (fast)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
        },
        required: ["url"],
      },
    },
    {
      name: "list_ai_providers",
      description: "List available FREE AI providers and their status",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

export function getToolByName(name) {
  const tools = getMCPTools();
  return tools.find((tool) => tool.name === name);
}
