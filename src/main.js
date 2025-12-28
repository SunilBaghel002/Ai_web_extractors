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
import { callAI, getAvailableProviders, testProvider } from "./ai/providers.js";
import { getMCPTools } from "./mcp/tools.js";
import { parseInstruction, createExtractionPlan } from './ai/instruction-parser.js';
import { executeExtractionPlan, postProcessWithAI } from './extractors/intelligent-extractor.js';

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

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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

  lines.push("## Content", "", data.textContent);

  return lines.join("\n");
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
// MCP REQUEST HANDLER
// ============================================================

async function handleMCPRequest(request, runCrawler) {
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
          // Web extraction tools
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
            document.querySelectorAll(sel).forEach((el) => el.remove());
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
      outputFormat: "markdown",
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
    codeOptions = {},
  } = input;

  const useAI = aiOptions.useAI || false;
  const aiProvider = aiOptions.provider || process.env.AI_PROVIDER || "groq";
  const aiTask = aiOptions.task || "analyze";

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       🤖 AI WEB & CODE EXTRACTOR v2.0                      ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${mode.padEnd(52)}║`);
  console.log(`║  URLs: ${urls.length.toString().padEnd(52)}║`);
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
      const response = await handleMCPRequest(mcpRequest, runCrawler);
      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_RESPONSE", response);
      console.log("✅ MCP Response saved");
    } else {
      const serverInfo = {
        protocol: "mcp",
        version: "2024-11-05",
        tools: getMCPTools(),
        aiProviders: getAvailableProviders(),
      };
      const store = await Actor.openKeyValueStore();
      await store.setValue("MCP_SERVER_INFO", serverInfo);

      console.log("\n📋 Available MCP Tools:");
      getMCPTools().forEach((tool) => {
        console.log(
          `   - ${tool.name}: ${tool.description.substring(0, 60)}...`
        );
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

console.log("Sunil is coding!!!")