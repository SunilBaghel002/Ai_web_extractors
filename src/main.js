/**
 * AI Web Content Extractor - FULL VERSION
 * With Proxy Support & Advanced Anti-Detection
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
  '[data-testid="cookie-banner"]',
  ".gdpr",
  ".consent",
];

const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  ".content",
  ".post-content",
  ".article-content",
  "#content",
  ".entry-content",
  ".post-body",
  ".article-body",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(min = 2000, max = 5000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
    `> Extracted: ${new Date().toISOString()}`,
    "",
    "---",
    "",
  ];

  if (data.description) {
    lines.push(`**Description:** ${data.description}`);
    lines.push("");
  }

  if (data.headings && data.headings.length > 2) {
    lines.push("## Table of Contents");
    lines.push("");
    data.headings.slice(0, 15).forEach((h) => {
      const indent = "  ".repeat(Math.min(h.level - 1, 3));
      lines.push(`${indent}- ${h.text}`);
    });
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Content");
  lines.push("");
  lines.push(data.textContent);

  return lines.join("\n");
}

// ============================================================
// MCP SERVER FUNCTIONS
// ============================================================

function getMCPTools() {
  return [
    {
      name: "extract_webpage",
      description:
        "Extract clean content from a webpage. Supports protected sites with proxy.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to extract" },
          format: {
            type: "string",
            enum: ["markdown", "text", "structured"],
            default: "markdown",
          },
          useProxy: {
            type: "boolean",
            default: false,
            description: "Use proxy for protected sites",
          },
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
          useProxy: { type: "boolean", default: false },
        },
        required: ["urls"],
      },
    },
    {
      name: "extract_with_chunking",
      description: "Extract content with RAG-ready chunks for AI processing",
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
    {
      name: "crawl_website",
      description: "Crawl multiple pages from a website following links",
      inputSchema: {
        type: "object",
        properties: {
          startUrl: { type: "string" },
          maxPages: { type: "integer", default: 10, maximum: 100 },
          maxDepth: { type: "integer", default: 2, maximum: 5 },
        },
        required: ["startUrl"],
      },
    },
  ];
}

async function handleMCPRequest(request, runCrawler) {
  const { method, params, id } = request;

  console.log(`📥 MCP Request: ${method}`);

  try {
    let result;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "ai-web-extractor", version: "1.0.0" },
          capabilities: { tools: true, resources: true },
        };
        break;

      case "tools/list":
        result = { tools: getMCPTools() };
        break;

      case "tools/call":
        const { name, arguments: args } = params;
        console.log(`🔧 Calling tool: ${name}`);

        let urls = [];
        let options = {
          format: args.format || "markdown",
          useProxy: args.useProxy || false,
        };

        switch (name) {
          case "extract_webpage":
            urls = [args.url];
            break;
          case "extract_multiple":
            urls = args.urls;
            break;
          case "extract_with_chunking":
            urls = [args.url];
            options.chunkContent = true;
            options.chunkSize = args.chunkSize || 1000;
            options.chunkOverlap = args.chunkOverlap || 100;
            break;
          case "crawl_website":
            urls = [args.startUrl];
            options.maxPages = args.maxPages || 10;
            options.maxDepth = args.maxDepth || 2;
            options.followLinks = true;
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        const extracted = await runCrawler(urls, options);

        result = {
          content: [
            {
              type: "text",
              text: JSON.stringify(extracted, null, 2),
            },
          ],
        };
        break;

      case "resources/list":
        result = {
          resources: [
            {
              uri: "extractor://results",
              name: "Extraction Results",
              mimeType: "application/json",
            },
          ],
        };
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
// STEALTH SCRIPTS (Inject into browser)
// ============================================================

const STEALTH_SCRIPTS = `
    // Hide webdriver
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
    });
    
    // Mock chrome runtime
    window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
    };
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            const plugins = [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
            ];
            plugins.item = (index) => plugins[index];
            plugins.namedItem = (name) => plugins.find(p => p.name === name);
            plugins.refresh = () => {};
            return plugins;
        },
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
    });
    
    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );
    
    // Mock WebGL vendor
    const getParameterProxyHandler = {
        apply: function(target, ctx, args) {
            const param = args[0];
            const result = target.apply(ctx, args);
            if (param === 37445) return 'Intel Inc.';
            if (param === 37446) return 'Intel Iris OpenGL Engine';
            return result;
        }
    };
    
    // Prevent detection of automation
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
`;

// ============================================================
// MAIN CRAWLER FUNCTION
// ============================================================

async function runCrawler(urls, options = {}) {
  const {
    format = "markdown",
    chunkContent = false,
    chunkSize = 1000,
    chunkOverlap = 100,
    useProxy = false,
    maxPages = 100,
    maxDepth = 0,
    followLinks = false,
    slowMode = false,
  } = options;

  const results = [];
  let successCount = 0;
  let failCount = 0;

  console.log(`\n📋 Processing ${urls.length} URL(s)...`);
  if (useProxy) console.log(`🔒 Using Apify Proxy`);
  if (slowMode) console.log(`🐢 Slow mode enabled (human-like delays)`);

  // Create proxy configuration if enabled
  let proxyConfiguration;
  if (useProxy) {
    try {
      proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ["RESIDENTIAL"],
        countryCode: "US",
      });
      console.log("✅ Proxy configured successfully");
    } catch (error) {
      console.log(
        "⚠️ Proxy not available (requires Apify platform), continuing without proxy"
      );
      proxyConfiguration = undefined;
    }
  }

  const crawler = new PlaywrightCrawler({
    // Request limits
    maxRequestsPerCrawl: followLinks ? maxPages : urls.length + 10,
    maxConcurrency: slowMode ? 1 : 3,

    // Timeouts
    requestHandlerTimeoutSecs: 90,
    navigationTimeoutSecs: 60,

    // Proxy
    proxyConfiguration,

    // Browser settings
    headless: true,

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
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--window-size=1920,1080",
        ],
      },
    },

    browserPoolOptions: {
      useFingerprints: true,
      fingerprintOptions: {
        fingerprintGeneratorOptions: {
          browsers: ["chrome", "firefox"],
          operatingSystems: ["windows", "macos"],
          locales: ["en-US"],
        },
      },
    },

    // Pre-navigation hook (stealth setup)
    preNavigationHooks: [
      async ({ page, request }) => {
        const userAgent = getRandomUserAgent();

        // Set headers
        await page.setExtraHTTPHeaders({
          "User-Agent": userAgent,
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
          "sec-ch-ua":
            '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
        });

        // Inject stealth scripts
        await page.addInitScript(STEALTH_SCRIPTS);

        // Set viewport
        await page.setViewportSize({ width: 1920, height: 1080 });

        console.log(`🌐 Navigating to: ${request.url}`);

        // Add delay for slow mode
        if (slowMode) {
          const delay = getRandomDelay(3000, 7000);
          console.log(`   ⏳ Waiting ${delay}ms (human-like delay)`);
          await new Promise((r) => setTimeout(r, delay));
        }
      },
    ],

    // Post-navigation hook
    postNavigationHooks: [
      async ({ page }) => {
        // Random mouse movements to appear human
        try {
          await page.mouse.move(
            Math.random() * 500 + 100,
            Math.random() * 500 + 100
          );
          await page.waitForTimeout(500);
        } catch (e) {
          // Ignore mouse movement errors
        }
      },
    ],

    // Main request handler
    async requestHandler({ page, request, enqueueLinks }) {
      const url = request.url;
      const depth = request.userData.depth || 0;

      console.log(`📄 Processing [Depth ${depth}]: ${url}`);

      try {
        // Wait for content
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
        await page.waitForTimeout(getRandomDelay(1000, 2000));

        // Scroll to load lazy content
        await autoScroll(page);

        // Handle cookie banners
        await dismissCookieBanners(page);

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
          let mainElement = null;
          for (const selector of mainSelectors) {
            mainElement = document.querySelector(selector);
            if (mainElement) break;
          }
          mainElement = mainElement || document.body;

          const textContent = mainElement.innerText
            .replace(/\s+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          const title =
            document.querySelector("h1")?.innerText?.trim() ||
            document.title?.trim() ||
            "Untitled";

          const getMetaContent = (name) => {
            const meta = document.querySelector(
              `meta[name="${name}"], meta[property="${name}"], meta[property="og:${name}"]`
            );
            return meta?.getAttribute("content") || null;
          };

          const headings = [];
          document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
            const text = h.innerText?.trim();
            if (text && text.length > 0) {
              headings.push({
                level: parseInt(h.tagName[1]),
                text: text.substring(0, 200),
              });
            }
          });

          const links = [];
          document.querySelectorAll("a[href]").forEach((a) => {
            const href = a.href;
            if (
              href &&
              !href.startsWith("javascript:") &&
              !href.startsWith("#")
            ) {
              links.push({
                url: href,
                text: (a.innerText?.trim() || "").substring(0, 100),
                isInternal: href.includes(window.location.hostname),
              });
            }
          });

          const images = [];
          document.querySelectorAll("img[src]").forEach((img) => {
            const src = img.src || img.dataset.src;
            if (src && !src.startsWith("data:")) {
              images.push({
                src,
                alt: img.alt || "",
              });
            }
          });

          return {
            title,
            textContent,
            description: getMetaContent("description"),
            author: getMetaContent("author"),
            publishedDate: getMetaContent("article:published_time"),
            language: document.documentElement.lang || "en",
            headings: headings.slice(0, 50),
            links: links.slice(0, 100),
            images: images.slice(0, 30),
          };
        }, MAIN_CONTENT_SELECTORS);

        // Skip if no content
        if (!data.textContent || data.textContent.length < 50) {
          console.log(`⚠️ Skipping ${url} - insufficient content`);
          return;
        }

        // Format content
        let content;
        if (format === "markdown") {
          content = formatAsMarkdown({ ...data, url });
        } else if (format === "structured") {
          content = {
            sections: data.headings.map((h) => h.text),
            paragraphs: data.textContent
              .split("\n\n")
              .filter((p) => p.length > 50),
          };
        } else {
          content = data.textContent;
        }

        // Build result
        const result = {
          url,
          timestamp: new Date().toISOString(),
          title: data.title,
          description: data.description,
          author: data.author,
          publishedDate: data.publishedDate,
          content,
          metadata: {
            language: data.language,
            wordCount: data.textContent.split(/\s+/).filter((w) => w).length,
            charCount: data.textContent.length,
            headingCount: data.headings.length,
            linkCount: data.links.length,
            imageCount: data.images.length,
            depth,
          },
          headings: data.headings,
          links: data.links,
          images: data.images,
          status: "success",
        };

        // Add chunks if requested
        if (chunkContent) {
          result.chunks = chunkText(data.textContent, chunkSize, chunkOverlap);
          result.totalChunks = result.chunks.length;
        }

        // Save to dataset
        await Dataset.pushData(result);
        results.push(result);
        successCount++;

        console.log(
          `✅ Extracted: ${data.title.substring(0, 50)}... (${result.metadata.wordCount} words)`
        );

        // Follow links if enabled
        if (followLinks && depth < maxDepth) {
          await enqueueLinks({
            strategy: "same-domain",
            userData: { depth: depth + 1 },
            transformRequestFunction: (req) => {
              // Only follow HTML pages
              if (req.url.match(/\.(pdf|jpg|png|gif|css|js|ico)$/i)) {
                return false;
              }
              return req;
            },
          });
          console.log(`🔗 Enqueued links from: ${url}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${url}: ${error.message}`);

        const failedResult = {
          url,
          timestamp: new Date().toISOString(),
          status: "failed",
          error: error.message,
          depth,
        };

        await Dataset.pushData(failedResult);
        results.push(failedResult);
        failCount++;
      }
    },

    // Handle navigation failures
    failedRequestHandler({ request }, error) {
      const errorMessage = error.message || "Unknown error";
      console.error(`❌ Failed to load: ${request.url}`);
      console.error(`   Reason: ${errorMessage.substring(0, 100)}`);
      failCount++;

      results.push({
        url: request.url,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: errorMessage,
        depth: request.userData.depth || 0,
      });
    },
  });

  // Run crawler with all URLs
  const requests = urls.map((url) => ({
    url,
    userData: { depth: 0 },
  }));

  await crawler.run(requests);

  console.log(
    `\n📊 Summary: ${successCount} succeeded, ${failCount} failed out of ${urls.length} URLs`
  );

  return results;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 5000) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });
  } catch (e) {
    // Ignore scroll errors
  }
}

async function dismissCookieBanners(page) {
  const cookieButtonSelectors = [
    'button[id*="accept"]',
    'button[class*="accept"]',
    'button[id*="cookie"]',
    'button[class*="cookie"]',
    'button[id*="consent"]',
    '[data-testid*="cookie"] button',
    ".cookie-banner button",
    "#cookie-consent button",
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("OK")',
    'button:has-text("Got it")',
  ];

  for (const selector of cookieButtonSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log("   🍪 Dismissed cookie banner");
        await page.waitForTimeout(500);
        break;
      }
    } catch (e) {
      // Ignore
    }
  }
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
    proxyConfiguration = {},
    crawlOptions = {},
  } = input;

  // Determine if proxy should be used
  const useProxy = proxyConfiguration?.useApifyProxy || false;
  const slowMode = crawlOptions?.slowMode || false;
  const followLinks = crawlOptions?.followLinks || false;
  const maxDepth = crawlOptions?.maxDepth || 0;
  const maxPages = crawlOptions?.maxPages || 100;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       🤖 AI WEB CONTENT EXTRACTOR                          ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${mode.padEnd(52)}║`);
  console.log(`║  URLs: ${urls.length.toString().padEnd(52)}║`);
  console.log(`║  Format: ${outputFormat.padEnd(50)}║`);
  console.log(`║  Proxy: ${(useProxy ? "Yes" : "No").padEnd(51)}║`);
  console.log(`║  Slow Mode: ${(slowMode ? "Yes" : "No").padEnd(47)}║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  // MCP Server Mode
  if (mode === "mcp-server") {
    console.log("\n🔌 MCP Server Mode");

    if (mcpRequest) {
      const response = await handleMCPRequest(mcpRequest, runCrawler);

      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_RESPONSE", response);

      console.log("✅ MCP Response saved");
      console.log(JSON.stringify(response, null, 2));
    } else {
      const serverInfo = {
        protocol: "mcp",
        version: "2024-11-05",
        tools: getMCPTools(),
        instructions: "Send mcpRequest in input to call tools",
      };

      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_SERVER_INFO", serverInfo);

      console.log("\n📋 Available MCP Tools:");
      getMCPTools().forEach((tool) => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
    }
  }
  // Normal Extractor Mode
  else {
    if (!urls || urls.length === 0) {
      throw new Error("At least one URL is required");
    }

    console.log("\n🚀 Starting extraction...");

    const results = await runCrawler(urls, {
      format: outputFormat,
      chunkContent: aiOptions.chunkContent || false,
      chunkSize: aiOptions.chunkSize || 1000,
      chunkOverlap: aiOptions.chunkOverlap || 100,
      useProxy,
      slowMode,
      followLinks,
      maxDepth,
      maxPages,
    });

    // Calculate stats
    const successResults = results.filter((r) => r.status === "success");
    const failedResults = results.filter((r) => r.status === "failed");
    const totalWords = successResults.reduce(
      (sum, r) => sum + (r.metadata?.wordCount || 0),
      0
    );

    console.log(
      "\n╔════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                    ✅ EXTRACTION COMPLETE                   ║"
    );
    console.log(
      "╠════════════════════════════════════════════════════════════╣"
    );
    console.log(`║  Total URLs: ${urls.length.toString().padEnd(46)}║`);
    console.log(
      `║  Succeeded: ${successResults.length.toString().padEnd(47)}║`
    );
    console.log(`║  Failed: ${failedResults.length.toString().padEnd(50)}║`);
    console.log(`║  Total Words: ${totalWords.toString().padEnd(45)}║`);
    console.log(
      "╚════════════════════════════════════════════════════════════╝"
    );

    if (failedResults.length > 0) {
      console.log("\n⚠️ Failed URLs:");
      failedResults.forEach((r) => {
        console.log(`   - ${r.url}`);
        console.log(`     Error: ${r.error?.substring(0, 80)}...`);
      });
    }

    // Show sample of extracted titles
    if (successResults.length > 0) {
      console.log("\n📄 Extracted Pages:");
      successResults.slice(0, 10).forEach((r) => {
        console.log(
          `   - ${r.title?.substring(0, 60)}... (${r.metadata?.wordCount} words)`
        );
      });
      if (successResults.length > 10) {
        console.log(`   ... and ${successResults.length - 10} more`);
      }
    }
  }
} catch (error) {
  console.error("❌ Error:", error.message);
  console.error(error.stack);
  throw error;
}

await Actor.exit();
