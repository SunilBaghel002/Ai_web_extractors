import "dotenv/config";
import { Actor } from "apify";
import { PlaywrightCrawler, Dataset } from "crawlee";
import {
  extractFromGitHub,
  parseGitHubUrl,
} from "./extractors/github-extractor.js";
import {
  extractFromStackOverflow,
  extractCodeFromWebsite,
  detectCodePlatform,
} from "./extractors/code-extractor.js";
import {
  analyzeCode,
  explainCode,
  generateDocs,
  improveCode,
  summarizeContent,
} from "./ai/code-analyzer.js";
import {
  callAI,
  getAvailableProviders,
  testProvider,
  isAIConfigured,
  validateAIConfig,
} from "./ai/index.js";
import { getMCPTools } from "./mcp/tools.js";
import {
  parseInstruction,
  createExtractionPlan,
} from "./ai/instruction-parser.js";
import {
  executeExtractionPlan,
  postProcessWithAI,
} from "./extractors/intelligent-extractor.js";

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

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

const STEALTH_SCRIPTS = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
`;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(min = 1000, max = 3000) {
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
    lines.push(`**Description:** ${data.description}`, "");
  }

  if (data.headings && data.headings.length > 2) {
    lines.push("## Table of Contents", "");
    data.headings.slice(0, 15).forEach((h) => {
      const indent = "  ".repeat(Math.min(h.level - 1, 3));
      lines.push(`${indent}- ${h.text}`);
    });
    lines.push("", "---", "");
  }

  lines.push("## Content", "", data.textContent || "");

  return lines.join("\n");
}

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
    'button:has-text("Accept")',
    'button:has-text("I agree")',
  ];

  for (const selector of cookieButtonSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        await page.waitForTimeout(500);
        break;
      }
    } catch (e) {
      // Ignore
    }
  }
}

// ============================================================
// CODE EXTRACTION FUNCTION
// ============================================================

async function extractCode(url, options = {}) {
  const { maxFiles = 50, extensions, includeTests = false } = options;

  const platform = detectCodePlatform(url);
  console.log(`   📂 Platform: ${platform}`);

  switch (platform) {
    case "github":
    case "gist":
      return await extractFromGitHub(url, {
        maxFiles,
        extensions,
        includeTests,
      });
    case "stackoverflow":
      return await extractFromStackOverflow(url);
    default:
      return await extractCodeFromWebsite(url);
  }
}

// ============================================================
// INSTRUCTION-BASED CRAWLER
// ============================================================

async function runInstructionBasedCrawler(urls, instruction, options = {}) {
  const {
    useProxy = false,
    slowMode = false,
    aiProvider = null,
    aiApiKey = null,
    aiModel = null,
  } = options;

  const results = [];
  let successCount = 0;
  let failCount = 0;

  console.log(`\n📋 Processing ${urls.length} URL(s) with instruction...`);
  console.log(`📝 Instruction: "${instruction}"`);

  const aiConfig = {
    aiProvider,
    aiApiKey,
    aiModel,
  };

  // Parse instruction once (applies to all URLs)
  const parsedInstruction = await parseInstruction(
    instruction,
    urls[0],
    isAIConfigured(aiProvider, aiApiKey) ? aiConfig : null
  );

  console.log(`✅ Parsed intent: ${parsedInstruction.intent}`);
  console.log(`🎯 Targets: ${parsedInstruction.targets.join(", ")}`);

  // Create proxy configuration if enabled
  let proxyConfiguration;
  if (useProxy) {
    try {
      proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ["RESIDENTIAL"],
        countryCode: "US",
      });
      console.log("✅ Proxy configured");
    } catch (error) {
      console.log("⚠️ Proxy not available");
      proxyConfiguration = undefined;
    }
  }

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: urls.length + 10,
    maxConcurrency: slowMode ? 1 : 3,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    proxyConfiguration,
    headless: true,

    launchContext: {
      launchOptions: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--window-size=1920,1080",
        ],
      },
    },

    browserPoolOptions: {
      useFingerprints: true,
    },

    preNavigationHooks: [
      async ({ page, request }) => {
        const userAgent = getRandomUserAgent();

        await page.setExtraHTTPHeaders({
          "User-Agent": userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        });

        await page.addInitScript(STEALTH_SCRIPTS);
        await page.setViewportSize({ width: 1920, height: 1080 });

        console.log(`🌐 Navigating to: ${request.url}`);

        if (slowMode) {
          const delay = getRandomDelay(3000, 7000);
          await new Promise((r) => setTimeout(r, delay));
        }
      },
    ],

    async requestHandler({ page, request }) {
      const url = request.url;

      console.log(`📄 Processing: ${url}`);
      console.log(`🎯 Task: ${parsedInstruction.intent}`);

      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
        await page.waitForTimeout(getRandomDelay(1000, 2000));

        // Scroll and clean
        await autoScroll(page);
        await dismissCookieBanners(page);

        await page.evaluate((selectors) => {
          selectors.forEach((sel) => {
            try {
              document.querySelectorAll(sel).forEach((el) => el.remove());
            } catch (e) {}
          });
        }, SELECTORS_TO_REMOVE);

        // Create extraction plan for this URL
        const plan = createExtractionPlan(parsedInstruction, url);

        // Execute extraction based on plan
        let result = await executeExtractionPlan(page, plan, aiConfig);

        // Post-process with AI if needed
        if (plan.requiresAI && isAIConfigured(aiProvider, aiApiKey)) {
          result = await postProcessWithAI(result, plan, aiConfig);
        }

        // Add metadata
        result.status = "success";
        result.extractedAt = new Date().toISOString();

        // Save to dataset
        await Dataset.pushData(result);
        results.push(result);
        successCount++;

        console.log(`✅ Extracted successfully: ${parsedInstruction.intent}`);

        // Log what was found
        if (result.data.code) {
          console.log(
            `   💻 Code: ${result.data.code.files?.length || 0} files`
          );
        }
        if (result.data.images) {
          console.log(`   🖼️ Images: ${result.data.images.length}`);
        }
        if (result.data.tables) {
          console.log(`   📊 Tables: ${result.data.tables.length}`);
        }
        if (result.data.pricing) {
          console.log(`   💰 Pricing: ${result.data.pricing.length} items`);
        }
        if (result.data.contact) {
          console.log(
            `   📧 Contact: ${result.data.contact.emails?.length || 0} emails`
          );
        }
        if (result.aiProcessing) {
          console.log(`   🤖 AI: ${result.aiProcessing.task}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${url}: ${error.message}`);

        const failedResult = {
          url,
          instruction,
          timestamp: new Date().toISOString(),
          status: "failed",
          error: error.message,
        };

        await Dataset.pushData(failedResult);
        results.push(failedResult);
        failCount++;
      }
    },

    failedRequestHandler({ request }, error) {
      console.error(`❌ Failed to load: ${request.url}`);
      failCount++;

      results.push({
        url: request.url,
        instruction,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error.message,
      });
    },
  });

  const requests = urls.map((url) => ({
    url,
    userData: { instruction },
  }));

  await crawler.run(requests);

  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);

  return results;
}

// ============================================================
// MCP REQUEST HANDLER (Updated)
// ============================================================

async function handleMCPRequest(request) {
  const { method, params, id } = request;
  console.log(`📥 MCP Request: ${method}`);

  try {
    let result;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "ai-code-extractor", version: "2.0.0" },
          capabilities: { tools: true, resources: true },
        };
        break;

      case "tools/list":
        result = { tools: getMCPTools() };
        break;

      case "tools/call":
        const { name, arguments: args } = params;
        console.log(`🔧 Calling tool: ${name}`);

        let content;

        switch (name) {
          // NEW: Instruction-based extraction
          case "extract_with_instruction":
            content = await runInstructionBasedCrawler(
              [args.url],
              args.instruction,
              {
                aiProvider: args.useAI ? args.aiProvider || "ollama" : null,
                aiApiKey: args.aiApiKey,
                aiModel: args.aiModel,
                useProxy: args.useProxy,
              }
            );
            break;

          case "extract_multiple_with_instruction":
            content = await runInstructionBasedCrawler(
              args.urls,
              args.instruction,
              {
                aiProvider: args.useAI ? args.aiProvider || "ollama" : null,
                aiApiKey: args.aiApiKey,
                aiModel: args.aiModel,
                useProxy: args.useProxy,
              }
            );
            break;

          // Existing tools
          case "extract_webpage":
          case "extract_multiple":
          case "crawl_website":
          case "extract_with_chunking":
            const urls =
              name === "extract_multiple"
                ? args.urls
                : name === "crawl_website"
                  ? [args.startUrl]
                  : [args.url];
            content = await runCrawler(urls, {
              format: args.format || "markdown",
              chunkContent: name === "extract_with_chunking",
              chunkSize: args.chunkSize,
              chunkOverlap: args.chunkOverlap,
              followLinks: name === "crawl_website",
              maxDepth: args.maxDepth,
              maxPages: args.maxPages,
            });
            break;

          // Code extraction tools
          case "extract_github_repo":
          case "extract_github_file":
            content = await extractFromGitHub(args.url, {
              maxFiles: args.maxFiles,
              extensions: args.extensions,
              includeTests: args.includeTests,
            });
            break;

          case "extract_stackoverflow":
            content = await extractFromStackOverflow(args.url);
            break;

          case "extract_code_from_url":
            content = await extractCode(args.url);
            break;

          // AI analysis tools
          case "analyze_code":
          case "explain_code":
          case "generate_docs":
          case "improve_code":
            const codeData = await extractCode(args.url);
            if (!codeData || !codeData.code) {
              throw new Error("No code found at URL");
            }
            const aiFn = {
              analyze_code: analyzeCode,
              explain_code: explainCode,
              generate_docs: generateDocs,
              improve_code: improveCode,
            }[name];
            const aiResult = await aiFn(codeData.code, {
              provider: args.provider,
            });
            content = { ...codeData, aiResult };
            break;

          case "summarize_content":
            const pageData = await runCrawler([args.url], { format: "text" });
            const textContent =
              pageData[0]?.content || pageData[0]?.textContent;
            content = await summarizeContent(textContent, {
              provider: args.provider,
              maxLength: args.maxLength,
            });
            break;

          case "get_page_metadata":
            content = await runCrawler([args.url], { metadataOnly: true });
            break;

          case "list_ai_providers":
            content = getAvailableProviders();
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        result = {
          content: [
            {
              type: "text",
              text:
                typeof content === "string"
                  ? content
                  : JSON.stringify(content, null, 2),
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
            {
              uri: "extractor://ai-providers",
              name: "AI Providers",
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
// MAIN CRAWLER FUNCTION (Original)
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
    metadataOnly = false,
  } = options;

  const results = [];
  let successCount = 0;

  console.log(`\n📋 Processing ${urls.length} URL(s)...`);

  let proxyConfiguration;
  if (useProxy) {
    try {
      proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ["RESIDENTIAL"],
        countryCode: "US",
      });
    } catch (e) {
      console.log("⚠️ Proxy not available, continuing without");
    }
  }

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: followLinks ? maxPages : urls.length + 10,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 90,
    navigationTimeoutSecs: 60,
    proxyConfiguration,
    headless: true,

    launchContext: {
      launchOptions: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
        ],
      },
    },

    preNavigationHooks: [
      async ({ page, request }) => {
        await page.setExtraHTTPHeaders({
          "User-Agent": getRandomUserAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        });
        console.log(`🌐 Navigating to: ${request.url}`);
      },
    ],

    async requestHandler({ page, request, enqueueLinks }) {
      const url = request.url;
      const depth = request.userData.depth || 0;

      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
        await page.waitForTimeout(1000);

        await page.evaluate((selectors) => {
          selectors.forEach((sel) => {
            try {
              document.querySelectorAll(sel).forEach((el) => el.remove());
            } catch (e) {}
          });
        }, SELECTORS_TO_REMOVE);

        const data = await page.evaluate((mainSelectors) => {
          let mainElement = null;
          for (const selector of mainSelectors) {
            mainElement = document.querySelector(selector);
            if (mainElement) break;
          }
          mainElement = mainElement || document.body;

          const textContent = mainElement.innerText.replace(/\s+/g, " ").trim();
          const title =
            document.querySelector("h1")?.innerText?.trim() ||
            document.title ||
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
            if (text)
              headings.push({
                level: parseInt(h.tagName[1]),
                text: text.substring(0, 200),
              });
          });

          const links = [];
          document.querySelectorAll("a[href]").forEach((a) => {
            if (a.href && !a.href.startsWith("javascript:")) {
              links.push({
                url: a.href,
                text: a.innerText?.trim().substring(0, 100) || "",
              });
            }
          });

          const codeBlocks = [];
          document
            .querySelectorAll("pre code, pre.code, .highlight code")
            .forEach((code) => {
              const text = code.innerText?.trim();
              if (text && text.length > 20) {
                const lang =
                  code.className.match(/language-(\w+)/)?.[1] || "unknown";
                codeBlocks.push({ language: lang, code: text });
              }
            });

          return {
            title,
            textContent,
            description: getMetaContent("description"),
            language: document.documentElement.lang || "en",
            headings: headings.slice(0, 50),
            links: links.slice(0, 100),
            codeBlocks,
          };
        }, MAIN_CONTENT_SELECTORS);

        if (!data.textContent || data.textContent.length < 50) {
          console.log(`⚠️ Skipping ${url} - insufficient content`);
          return;
        }

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

        const result = {
          url,
          timestamp: new Date().toISOString(),
          title: data.title,
          description: data.description,
          content,
          textContent: data.textContent,
          metadata: {
            language: data.language,
            wordCount: data.textContent.split(/\s+/).filter((w) => w).length,
            headingCount: data.headings.length,
            linkCount: data.links.length,
            codeBlockCount: data.codeBlocks.length,
            depth,
          },
          headings: data.headings,
          links: data.links,
          codeBlocks: data.codeBlocks,
          status: "success",
        };

        if (chunkContent) {
          result.chunks = chunkText(data.textContent, chunkSize, chunkOverlap);
          result.totalChunks = result.chunks.length;
        }

        await Dataset.pushData(result);
        results.push(result);
        successCount++;

        console.log(
          `✅ Extracted: ${data.title.substring(0, 50)}... (${result.metadata.wordCount} words)`
        );

        if (followLinks && depth < maxDepth) {
          await enqueueLinks({
            strategy: "same-domain",
            userData: { depth: depth + 1 },
            transformRequestFunction: (req) => {
              if (req.url.match(/\.(pdf|jpg|png|gif|css|js|ico)$/i))
                return false;
              return req;
            },
          });
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        results.push({ url, status: "failed", error: error.message });
      }
    },

    failedRequestHandler({ request }, error) {
      console.error(`❌ Failed: ${request.url}`);
      results.push({
        url: request.url,
        status: "failed",
        error: error.message,
      });
    },
  });

  await crawler.run(urls.map((url) => ({ url, userData: { depth: 0 } })));

  console.log(`\n📊 Summary: ${successCount} succeeded out of ${urls.length}`);
  return results;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

await Actor.init();

try {
  let input = await Actor.getInput();

  if (!input || Object.keys(input).length === 0) {
    console.log("⚠️ No input found, using defaults...");
    input = {
      urls: ["https://example.com"],
      mode: "extractor",
      instruction: "extract the main content",
      outputFormat: "markdown",
    };
  }

  const {
    urls = [],
    mode = "extractor",
    instruction = null,
    outputFormat = "markdown",
    aiOptions = {},
    mcpRequest = null,
    proxyConfiguration = {},
    crawlOptions = {},
    codeOptions = {},
  } = input;

  const useAI = aiOptions.useAI || false;
  const aiProvider = aiOptions.provider || process.env.AI_PROVIDER || "groq";
  const aiApiKey = aiOptions.apiKey || process.env.AI_API_KEY;
  const aiModel = aiOptions.model;
  const aiTask = aiOptions.task || "analyze";

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       🤖 AI WEB & CODE EXTRACTOR v2.0                      ║");
  console.log("║          Instruction-Based Smart Extraction                ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${mode.padEnd(52)}║`);
  console.log(`║  URLs: ${urls.length.toString().padEnd(52)}║`);
  if (instruction) {
    console.log(`║  Instruction: ${instruction.substring(0, 44).padEnd(44)}║`);
  }
  console.log(`║  Format: ${outputFormat.padEnd(50)}║`);
  if (useAI) {
    console.log(`║  AI: ${aiProvider.padEnd(54)}║`);
    console.log(`║  AI Task: ${aiTask.padEnd(49)}║`);
  }
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Check AI providers
  if (useAI || mode === "mcp-server") {
    console.log("\n🤖 Available AI Providers:");
    const providers = getAvailableProviders();
    providers.forEach((p) => {
      const status = p.available ? "✅" : "❌";
      console.log(`   ${status} ${p.name} (${p.id}) - ${p.rateLimit}`);
    });
  }

  // MCP Server Mode
  if (mode === "mcp-server") {
    console.log("\n🔌 MCP Server Mode");

    if (mcpRequest) {
      const response = await handleMCPRequest(mcpRequest);
      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_RESPONSE", response);
      console.log("✅ MCP Response saved");
      console.log(JSON.stringify(response, null, 2));
    } else {
      const serverInfo = {
        protocol: "mcp",
        version: "2024-11-05",
        tools: getMCPTools(),
        aiProviders: getAvailableProviders(),
        examples: [
          {
            instruction: "Get all pricing information",
            type: "structured_data",
          },
          {
            instruction: "Extract the main article and images",
            type: "content_media",
          },
          {
            instruction: "Get all code files from GitHub",
            type: "code_extraction",
          },
        ],
      };
      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_SERVER_INFO", serverInfo);

      console.log("\n📋 Available MCP Tools:");
      getMCPTools().forEach((tool) => {
        console.log(
          `   - ${tool.name}: ${tool.description.substring(0, 60)}...`
        );
      });

      console.log("\n📝 Example Instructions:");
      console.log("   - 'Extract all pricing information'");
      console.log("   - 'Get the main article content'");
      console.log("   - 'Extract all images and their descriptions'");
      console.log("   - 'Get contact information'");
      console.log("   - 'Extract all code from the repository'");
    }
  }
  // Instruction-Based Extractor Mode
  else if (mode === "instruction-based" || instruction) {
    console.log("\n📝 Instruction-Based Extraction Mode");

    if (!instruction) {
      throw new Error("Instruction is required for instruction-based mode");
    }

    const results = await runInstructionBasedCrawler(urls, instruction, {
      useProxy: proxyConfiguration?.useApifyProxy || false,
      slowMode: crawlOptions?.slowMode || false,
      aiProvider: useAI ? aiProvider : null,
      aiApiKey,
      aiModel,
    });

    const successResults = results.filter((r) => r.status === "success");
    const failedResults = results.filter((r) => r.status === "failed");

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
    console.log(
      "╚════════════════════════════════════════════════════════════╝"
    );

    if (successResults.length > 0) {
      console.log("\n📦 Extracted Data Summary:");
      successResults.forEach((r) => {
        console.log(`\n   URL: ${r.url}`);
        console.log(`   Intent: ${r.intent}`);

        const data = r.data;
        if (data.code)
          console.log(`   💻 Code files: ${data.code.files?.length || 0}`);
        if (data.images) console.log(`   🖼️ Images: ${data.images.length}`);
        if (data.links) console.log(`   🔗 Links: ${data.links.length}`);
        if (data.tables) console.log(`   📊 Tables: ${data.tables.length}`);
        if (data.pricing)
          console.log(`   💰 Pricing items: ${data.pricing.length}`);
        if (data.contact) console.log(`   📧 Contact info: Found`);
        if (r.aiProcessing) console.log(`   🤖 AI: ${r.aiProcessing.task}`);
      });
    }
  }
  // Code Extractor Mode
  else if (mode === "code-extractor") {
    console.log("\n💻 Code Extractor Mode");

    for (const url of urls) {
      console.log(`\n📌 Extracting: ${url}`);

      const codeData = await extractCode(url, {
        maxFiles: codeOptions.maxFiles || 50,
        extensions: codeOptions.extensions,
        includeTests: codeOptions.includeTests,
      });

      if (codeData) {
        if (useAI && codeData.code) {
          console.log(`🤖 Running AI ${aiTask}...`);
          const aiFn = {
            analyze: analyzeCode,
            explain: explainCode,
            document: generateDocs,
            improve: improveCode,
          }[aiTask];
          if (aiFn) {
            codeData.aiResult = await aiFn(codeData.code, {
              provider: aiProvider,
            });
          }
        }

        await Dataset.pushData(codeData);
        console.log(
          `✅ Extracted: ${codeData.name} (${codeData.files?.length || codeData.codeBlocks?.length || 1} files)`
        );
      }
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
      useProxy: proxyConfiguration?.useApifyProxy || false,
      followLinks: crawlOptions?.followLinks || false,
      maxDepth: crawlOptions?.maxDepth || 0,
      maxPages: crawlOptions?.maxPages || 100,
    });

    // AI processing if enabled
    if (useAI) {
      console.log(`\n🤖 Running AI ${aiTask} on results...`);
      for (const result of results) {
        if (result.status === "success" && result.textContent) {
          try {
            const aiFn = {
              analyze: analyzeCode,
              explain: explainCode,
              summarize: summarizeContent,
            }[aiTask];
            if (aiFn) {
              result.aiResult = await aiFn(result.textContent, {
                provider: aiProvider,
              });
            }
          } catch (e) {
            console.log(`   ⚠️ AI failed for ${result.url}: ${e.message}`);
          }
        }
      }
    }

    const successResults = results.filter((r) => r.status === "success");
    const failedResults = results.filter((r) => r.status === "failed");

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
