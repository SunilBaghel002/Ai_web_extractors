/**
 * MCP Request Handlers
 *
 * Handles incoming MCP protocol requests
 */

import { Actor, Dataset } from "apify";
import { PlaywrightCrawler } from "crawlee";
import { getMCPTools, getToolByName } from "./tools.js";
import {
  extractContent,
  extractMetadata,
  extractMedia,
} from "../extractors/index.js";
import { formatOutput } from "../formatters/index.js";
import { cleanHTML } from "../utils/index.js";
import { SELECTORS_TO_REMOVE, MCP_PROTOCOL_VERSION } from "../constants.js";

/**
 * Handle incoming MCP request
 */
export async function handleMCPRequest(request, config) {
  const { method, params, id } = request;

  console.log(`📥 MCP Request: ${method}`);

  try {
    let result;

    switch (method) {
      case "initialize":
        result = handleInitialize();
        break;

      case "tools/list":
        result = handleToolsList();
        break;

      case "tools/call":
        result = await handleToolCall(params);
        break;

      case "resources/list":
        result = handleResourcesList();
        break;

      case "resources/read":
        result = await handleResourceRead(params);
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error.message,
      },
    };
  }
}

/**
 * Handle initialize request
 */
function handleInitialize() {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: "ai-web-content-extractor",
      version: "1.0.0",
    },
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
    },
  };
}

/**
 * Handle tools/list request
 */
function handleToolsList() {
  return {
    tools: getMCPTools(),
  };
}

/**
 * Handle tools/call request
 */
async function handleToolCall(params) {
  const { name, arguments: args } = params;

  console.log(`🔧 Calling tool: ${name}`);
  console.log(`📋 Arguments:`, JSON.stringify(args, null, 2));

  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  let content;

  switch (name) {
    case "extract_webpage":
      content = await executeExtractWebpage(args);
      break;

    case "extract_multiple":
      content = await executeExtractMultiple(args);
      break;

    case "get_page_metadata":
      content = await executeGetMetadata(args);
      break;

    case "crawl_website":
      content = await executeCrawlWebsite(args);
      break;

    case "extract_with_chunking":
      content = await executeExtractWithChunking(args);
      break;

    default:
      throw new Error(`Tool not implemented: ${name}`);
  }

  return {
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
}

/**
 * Execute extract_webpage tool
 */
async function executeExtractWebpage(args) {
  const {
    url,
    format = "markdown",
    includeImages = true,
    includeLinks = true,
    includeMetadata = true,
  } = args;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    async requestHandler({ page }) {
      await page.waitForLoadState("domcontentloaded");
      await cleanHTML(page, SELECTORS_TO_REMOVE);

      const data = await page.evaluate(() => ({
        title: document.querySelector("h1")?.innerText || document.title,
        url: window.location.href,
        textContent: document.body.innerText,
        htmlContent: document.body.innerHTML,
      }));

      const content = await extractContent(page, {
        includeImages,
        includeLinks,
      });
      const metadata = includeMetadata ? await extractMetadata(page) : {};
      const media = await extractMedia(page, { includeImages });

      const formattedContent = formatOutput({ ...data, ...content }, format);

      await Dataset.pushData({
        url,
        title: data.title,
        content: formattedContent,
        metadata,
        images: media.images,
        links: content.links,
        extractedAt: new Date().toISOString(),
      });
    },
  });

  await crawler.run([url]);

  const dataset = await Actor.openDataset();
  const { items } = await dataset.getData();

  return items[0] || { error: "No content extracted" };
}

/**
 * Execute extract_multiple tool
 */
async function executeExtractMultiple(args) {
  const { urls, format = "markdown", maxConcurrency = 3 } = args;

  const results = [];

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: urls.length,
    maxConcurrency,
    async requestHandler({ request, page }) {
      await page.waitForLoadState("domcontentloaded");
      await cleanHTML(page, SELECTORS_TO_REMOVE);

      const data = await page.evaluate(() => ({
        title: document.querySelector("h1")?.innerText || document.title,
        url: window.location.href,
        textContent: document.body.innerText,
      }));

      const content = await extractContent(page, {});
      const formattedContent = formatOutput({ ...data, ...content }, format);

      results.push({
        url: request.url,
        title: data.title,
        content: formattedContent,
        wordCount: data.textContent.split(/\s+/).length,
      });
    },
  });

  await crawler.run(urls);

  return {
    totalPages: results.length,
    pages: results,
  };
}

/**
 * Execute get_page_metadata tool
 */
async function executeGetMetadata(args) {
  const { url } = args;

  let metadata = {};

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    async requestHandler({ page }) {
      await page.waitForLoadState("domcontentloaded");
      metadata = await extractMetadata(page);
      metadata.url = url;
      metadata.fetchedAt = new Date().toISOString();
    },
  });

  await crawler.run([url]);

  return metadata;
}

/**
 * Execute crawl_website tool
 */
async function executeCrawlWebsite(args) {
  const { startUrl, maxDepth = 1, maxPages = 10, sameDomain = true } = args;

  const results = [];

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: maxPages,
    maxConcurrency: 3,
    async requestHandler({ request, page, enqueueLinks }) {
      await page.waitForLoadState("domcontentloaded");
      await cleanHTML(page, SELECTORS_TO_REMOVE);

      const data = await page.evaluate(() => ({
        title: document.querySelector("h1")?.innerText || document.title,
        url: window.location.href,
        textContent: document.body.innerText.substring(0, 5000),
      }));

      results.push({
        url: request.url,
        title: data.title,
        depth: request.userData.depth || 0,
        wordCount: data.textContent.split(/\s+/).length,
      });

      const currentDepth = request.userData.depth || 0;
      if (currentDepth < maxDepth) {
        await enqueueLinks({
          strategy: sameDomain ? "same-domain" : "all",
          userData: { depth: currentDepth + 1 },
        });
      }
    },
  });

  await crawler.run([{ url: startUrl, userData: { depth: 0 } }]);

  return {
    startUrl,
    pagesFound: results.length,
    maxDepthReached: Math.max(...results.map((r) => r.depth)),
    pages: results,
  };
}

/**
 * Execute extract_with_chunking tool
 */
async function executeExtractWithChunking(args) {
  const { url, chunkSize = 1000, chunkOverlap = 100 } = args;

  let result = {};

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    async requestHandler({ page }) {
      await page.waitForLoadState("domcontentloaded");
      await cleanHTML(page, SELECTORS_TO_REMOVE);

      const data = await page.evaluate(() => ({
        title: document.querySelector("h1")?.innerText || document.title,
        textContent: document.body.innerText,
      }));

      // Chunk the content
      const chunks = chunkText(data.textContent, chunkSize, chunkOverlap);

      result = {
        url,
        title: data.title,
        totalChunks: chunks.length,
        totalCharacters: data.textContent.length,
        chunkSize,
        chunkOverlap,
        chunks,
      };
    },
  });

  await crawler.run([url]);

  return result;
}

/**
 * Chunk text into smaller pieces
 */
function chunkText(text, size, overlap) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > size && currentChunk) {
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

/**
 * Handle resources/list request
 */
function handleResourcesList() {
  return {
    resources: [
      {
        uri: "extraction://latest",
        name: "Latest Extraction Results",
        description: "Get the most recent extraction results",
        mimeType: "application/json",
      },
      {
        uri: "extraction://stats",
        name: "Extraction Statistics",
        description: "Get statistics about extractions",
        mimeType: "application/json",
      },
    ],
  };
}

/**
 * Handle resources/read request
 */
async function handleResourceRead(params) {
  const { uri } = params;

  if (uri === "extraction://latest") {
    const dataset = await Actor.openDataset();
    const { items } = await dataset.getData({ limit: 10 });
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(items, null, 2),
        },
      ],
    };
  }

  if (uri === "extraction://stats") {
    const dataset = await Actor.openDataset();
    const info = await dataset.getInfo();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              itemCount: info.itemCount,
              createdAt: info.createdAt,
              modifiedAt: info.modifiedAt,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
}
