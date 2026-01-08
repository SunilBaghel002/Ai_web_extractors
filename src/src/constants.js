/**
 * Application constants
 */

export const SELECTORS_TO_REMOVE = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  ".advertisement",
  ".ads",
  ".ad-container",
  ".sidebar",
  ".navigation",
  ".menu",
  ".cookie-banner",
  ".cookie-consent",
  ".popup",
  ".modal",
  ".newsletter-signup",
  ".social-share",
  ".comments",
  "#comments",
  ".related-posts",
  ".recommended",
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
];

export const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  ".post-content",
  ".article-content",
  ".entry-content",
  ".content",
  ".post",
  "#content",
  "#main-content",
  ".main-content",
  ".page-content",
];

export const OUTPUT_FORMATS = {
  MARKDOWN: "markdown",
  TEXT: "text",
  HTML: "html",
  STRUCTURED: "structured",
};

export const MODES = {
  EXTRACTOR: "extractor",
  MCP_SERVER: "mcp-server",
  CODE_EXTRACTOR: "code-extractor",
};

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 100;

// AI Provider configurations
export const AI_PROVIDERS = {
  GROQ: "groq",
  GEMINI: "gemini",
  HUGGINGFACE: "huggingface",
  TOGETHER: "together",
  COHERE: "cohere",
  OLLAMA: "ollama",
};

// Supported code platforms
export const CODE_PLATFORMS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "stackoverflow.com",
  "codepen.io",
  "jsfiddle.net",
  "replit.com",
  "gist.github.com",
];
