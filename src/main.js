/**
 * AI Web Content Extractor - Main Entry Point
 * With Anti-Bot Detection Features
 */

import { Actor } from "apify";
import { PlaywrightCrawler, Dataset } from "crawlee";

// ============================================================
// CONSTANTS
// ============================================================

const SELECTORS_TO_REMOVE = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  ".ads",
  ".advertisement",
  ".cookie-banner",
  ".popup",
  ".modal",
  ".sidebar",
  ".menu",
  "#comments",
];

const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  ".content",
  ".post-content",
  ".article-content",
  "#content",
];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk) {
      chunks.push({
        index: chunkIndex++,
        content: currentChunk.trim(),
        charCount: currentChunk.length,
      });

      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(" ") + " " + sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      index: chunkIndex,
      content: currentChunk.trim(),
      charCount: currentChunk.length,
    });
  }

  return chunks;
}

function formatAsMarkdown(data) {
  const lines = [
    `# ${data.title}`,
    "",
    `> Source: ${data.url}`,
    "",
    "---",
    "",
    data.textContent,
  ];

  return lines.join("\n");
}

// ============================================================
// MCP SERVER FUNCTIONS
// ============================================================

function getMCPTools() {
  return [
    {
      name: "extract_webpage",
      description: "Extract clean content from a webpage",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to extract" },
          format: {
            type: "string",
            enum: ["markdown", "text"],
            default: "markdown",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_with_chunking",
      description: "Extract content with RAG-ready chunks",
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
  ];
}

async function handleMCPRequest(request, extractFn) {
  const { method, params, id } = request;

  console.log(`📥 MCP Request: ${method}`);

  try {
    let result;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "ai-web-extractor", version: "1.0.0" },
          capabilities: { tools: true },
        };
        break;

      case "tools/list":
        result = { tools: getMCPTools() };
        break;

      case "tools/call":
        const { name, arguments: args } = params;
        console.log(`🔧 Calling tool: ${name}`);

        if (name === "extract_webpage" || name === "extract_with_chunking") {
          const extracted = await extractFn(args.url, {
            format: args.format || "markdown",
            chunkContent: name === "extract_with_chunking",
            chunkSize: args.chunkSize || 1000,
            chunkOverlap: args.chunkOverlap || 100,
          });

          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify(extracted, null, 2),
              },
            ],
          };
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error.message },
    };
  }
}

// ============================================================
// MAIN EXTRACTION FUNCTION (WITH ANTI-BOT FEATURES)
// ============================================================

async function extractFromUrl(url, options = {}) {
  const {
    format = "markdown",
    chunkContent = false,
    chunkSize = 1000,
    chunkOverlap = 100,
  } = options;

  let result = null;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 30,

    // ⭐ ANTI-BOT DETECTION SETTINGS ⭐
    headless: true,

    // Use browser with stealth settings
    launchContext: {
      launchOptions: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled", // Hide automation
        ],
      },
    },

    // Browser pool settings for stealth
    browserPoolOptions: {
      useFingerprints: true, // Use browser fingerprinting
      fingerprintOptions: {
        fingerprintGeneratorOptions: {
          browsers: ["chrome"],
          operatingSystems: ["windows"],
        },
      },
    },

    // Pre-navigation hook to set headers
    preNavigationHooks: [
      async ({ page, request }) => {
        // Set realistic user agent
        await page.setExtraHTTPHeaders({
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "max-age=0",
        });

        // Hide webdriver property
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });

          // Hide automation indicators
          window.chrome = {
            runtime: {},
          };

          Object.defineProperty(navigator, "plugins", {
            get: () => [1, 2, 3, 4, 5],
          });

          Object.defineProperty(navigator, "languages", {
            get: () => ["en-US", "en"],
          });
        });

        console.log(`🌐 Navigating to: ${request.url}`);
      },
    ],

    async requestHandler({ page, request }) {
      console.log(`📄 Processing: ${request.url}`);

      // Wait for content with multiple strategies
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      } catch (e) {
        console.log("⚠️ domcontentloaded timeout, continuing...");
      }

      // Additional wait for dynamic content
      await page.waitForTimeout(2000);

      // Try to wait for main content
      try {
        await page.waitForSelector("body", { timeout: 5000 });
      } catch (e) {
        console.log("⚠️ Body selector timeout, continuing...");
      }

      // Remove unwanted elements
      await page.evaluate((selectors) => {
        selectors.forEach((selector) => {
          try {
            document.querySelectorAll(selector).forEach((el) => el.remove());
          } catch (e) {}
        });
      }, SELECTORS_TO_REMOVE);

      // Extract content
      const data = await page.evaluate((mainSelectors) => {
        // Find main content
        let mainElement = null;
        for (const selector of mainSelectors) {
          mainElement = document.querySelector(selector);
          if (mainElement) break;
        }
        mainElement = mainElement || document.body;

        // Get text content
        const textContent = mainElement.innerText
          .replace(/\s+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        // Get title
        const title =
          document.querySelector("h1")?.innerText ||
          document.title ||
          "Untitled";

        // Get metadata
        const getMetaContent = (name) => {
          const meta = document.querySelector(
            `meta[name="${name}"], meta[property="${name}"], meta[property="og:${name}"]`
          );
          return meta?.getAttribute("content") || null;
        };

        // Get headings
        const headings = [];
        document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h, i) => {
          headings.push({
            level: parseInt(h.tagName[1]),
            text: h.innerText.trim(),
          });
        });

        // Get links
        const links = [];
        document.querySelectorAll("a[href]").forEach((a) => {
          if (a.href && !a.href.startsWith("javascript:")) {
            links.push({
              url: a.href,
              text: a.innerText.trim(),
            });
          }
        });

        // Get images
        const images = [];
        document.querySelectorAll("img[src]").forEach((img) => {
          if (img.src && !img.src.startsWith("data:")) {
            images.push({
              src: img.src,
              alt: img.alt || "",
            });
          }
        });

        return {
          title,
          textContent,
          description: getMetaContent("description"),
          language: document.documentElement.lang || "en",
          headings,
          links: links.slice(0, 50),
          images: images.slice(0, 20),
        };
      }, MAIN_CONTENT_SELECTORS);

      // Format content
      let content;
      if (format === "markdown") {
        content = formatAsMarkdown({ ...data, url: request.url });
      } else {
        content = data.textContent;
      }

      // Build result
      result = {
        url: request.url,
        timestamp: new Date().toISOString(),
        title: data.title,
        description: data.description,
        content,
        metadata: {
          language: data.language,
          wordCount: data.textContent.split(/\s+/).filter((w) => w).length,
          headingCount: data.headings.length,
          linkCount: data.links.length,
          imageCount: data.images.length,
        },
        headings: data.headings,
        links: data.links,
        images: data.images,
      };

      // Add chunks if requested
      if (chunkContent) {
        result.chunks = chunkText(data.textContent, chunkSize, chunkOverlap);
        result.totalChunks = result.chunks.length;
      }

      console.log(
        `✅ Extracted: ${data.title} (${result.metadata.wordCount} words)`
      );
    },

    // Handle failures
    failedRequestHandler({ request }, error) {
      console.error(`❌ Failed: ${request.url}`);
      console.error(`   Error: ${error.message}`);
    },
  });

  await crawler.run([url]);

  return result;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

await Actor.init();

try {
  // Get input with defaults
  let input = await Actor.getInput();

  if (!input || Object.keys(input).length === 0) {
    console.log("⚠️ No input found, using defaults...");
    input = {
      urls: ["https://example.com"],
      mode: "extractor",
      outputFormat: "markdown",
      aiOptions: {},
    };
  }

  const {
    urls = [],
    mode = "extractor",
    outputFormat = "markdown",
    aiOptions = {},
    mcpRequest = null,
  } = input;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       🤖 AI WEB CONTENT EXTRACTOR                          ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${mode.padEnd(52)}║`);
  console.log(`║  URLs: ${urls.length.toString().padEnd(52)}║`);
  console.log(`║  Format: ${outputFormat.padEnd(50)}║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  // MCP Server Mode
  if (mode === "mcp-server") {
    console.log("\n🔌 MCP Server Mode");

    if (mcpRequest) {
      const response = await handleMCPRequest(mcpRequest, extractFromUrl);

      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_RESPONSE", response);

      await Dataset.pushData({
        type: "mcp_response",
        request: mcpRequest,
        response,
      });

      console.log("✅ MCP Response:", JSON.stringify(response, null, 2));
    } else {
      const serverInfo = {
        protocol: "mcp",
        version: "2024-11-05",
        tools: getMCPTools(),
        instructions: "Send mcpRequest in input to call tools",
      };

      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_SERVER_INFO", serverInfo);

      console.log("\n📋 MCP Server Info:");
      console.log(JSON.stringify(serverInfo, null, 2));
    }
  }
  // Normal Extractor Mode
  else {
    if (!urls || urls.length === 0) {
      throw new Error("At least one URL is required");
    }

    console.log("\n🚀 Starting extraction...\n");

    for (const url of urls) {
      try {
        console.log(`\n📌 Extracting: ${url}`);

        const result = await extractFromUrl(url, {
          format: outputFormat,
          chunkContent: aiOptions.chunkContent || false,
          chunkSize: aiOptions.chunkSize || 1000,
          chunkOverlap: aiOptions.chunkOverlap || 100,
        });

        if (result) {
          await Dataset.pushData(result);
          console.log(`✅ Saved to dataset: ${result.title}`);
        } else {
          console.log(`⚠️ No result for: ${url}`);
        }
      } catch (error) {
        console.error(`❌ Failed to extract ${url}: ${error.message}`);
      }
    }

    // Get stats
    const dataset = await Actor.openDataset();
    const info = await dataset.getInfo();

    console.log(
      "\n╔════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                    ✅ EXTRACTION COMPLETE                   ║"
    );
    console.log(
      "╠════════════════════════════════════════════════════════════╣"
    );
    console.log(`║  Pages Extracted: ${info.itemCount.toString().padEnd(41)}║`);
    console.log(
      "╚════════════════════════════════════════════════════════════╝"
    );
  }
} catch (error) {
  console.error("❌ Error:", error.message);
  console.error(error.stack);
  throw error;
}

await Actor.exit();
