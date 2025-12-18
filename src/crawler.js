/**
 * Crawler configuration and execution
 */

import { Actor } from "apify";
import { PlaywrightCrawler, Dataset } from "crawlee";
import {
  extractContent,
  extractMetadata,
  extractMedia,
} from "./extractors/index.js";
import { formatOutput } from "./formatters/index.js";
import { cleanHTML, createLogger } from "./utils/index.js";
import { SELECTORS_TO_REMOVE, MAIN_CONTENT_SELECTORS } from "./constants.js";

const log = createLogger("Crawler");

/**
 * Create and configure the Playwright crawler
 */
export async function createCrawler(config) {
  const {
    outputFormat,
    extractOptions,
    crawlOptions,
    aiOptions,
    proxyConfiguration,
  } = config;

  const crawler = new PlaywrightCrawler({
    // Proxy configuration
    proxyConfiguration: proxyConfiguration
      ? await Actor.createProxyConfiguration(proxyConfiguration)
      : undefined,

    // Crawl settings
    maxRequestsPerCrawl: crawlOptions.maxPages || 10,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 60,

    // Browser settings
    headless: true,
    browserPoolOptions: {
      useFingerprints: true,
    },

    // Pre-navigation hooks
    preNavigationHooks: [
      async ({ page }) => {
        // Block unnecessary resources for faster loading
        await page.route("**/*", (route) => {
          const resourceType = route.request().resourceType();
          const blockedTypes = ["font", "media"];

          if (blockedTypes.includes(resourceType)) {
            route.abort();
          } else {
            route.continue();
          }
        });
      },
    ],

    // Main request handler
    async requestHandler({ request, page, enqueueLinks }) {
      const url = request.url;
      const depth = request.userData.depth || 0;

      log.info(`📄 Processing [Depth: ${depth}]: ${url}`);

      // Wait for page to be ready
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000); // Allow dynamic content to load

      // Clean the HTML by removing unwanted elements
      await cleanHTML(page, SELECTORS_TO_REMOVE);

      // Find main content container
      const mainContentSelector = await findMainContent(page);

      // Extract all content
      const extractedData = await page.evaluate(
        ({ mainSelector, contentSelectors }) => {
          const mainElement =
            document.querySelector(mainSelector) || document.body;

          return {
            // Basic info
            title:
              document.querySelector("h1")?.innerText ||
              document.title ||
              "Untitled",
            url: window.location.href,

            // Text content
            textContent: mainElement.innerText,
            htmlContent: mainElement.innerHTML,

            // Page info
            language: document.documentElement.lang || "en",
            charset: document.characterSet || "UTF-8",
          };
        },
        {
          mainSelector: mainContentSelector,
          contentSelectors: MAIN_CONTENT_SELECTORS,
        }
      );

      // Extract detailed content
      const content = await extractContent(page, extractOptions);

      // Extract metadata
      const metadata = extractOptions.includeMetadata
        ? await extractMetadata(page)
        : {};

      // Extract media (images, videos)
      const media = await extractMedia(page, extractOptions);

      // Format output according to user preference
      const formattedContent = formatOutput(
        {
          ...extractedData,
          ...content,
        },
        outputFormat
      );

      // Process for AI if enabled
      const aiData = processForAI(extractedData.textContent, aiOptions);

      // Build final result
      const result = {
        // Source information
        url: url,
        canonicalUrl: metadata.canonicalUrl || url,
        timestamp: new Date().toISOString(),

        // Main content
        title: extractedData.title,
        content: formattedContent,

        // Structured data
        headings: content.headings,
        ...(extractOptions.includeLinks && { links: content.links }),
        ...(extractOptions.includeImages && { images: media.images }),
        ...(extractOptions.includeTables && { tables: content.tables }),
        ...(extractOptions.includeCode && { codeBlocks: content.codeBlocks }),

        // Metadata
        metadata: {
          ...metadata,
          language: extractedData.language,
          wordCount: extractedData.textContent.split(/\s+/).filter((w) => w)
            .length,
          charCount: extractedData.textContent.length,
          extractedAt: new Date().toISOString(),
        },

        // AI-specific data
        ai: {
          ...aiData,
          contentType: "webpage",
          format: outputFormat,
          isChunked: aiOptions.chunkContent || false,
        },
      };

      // Save to dataset
      await Dataset.pushData(result);

      log.success(
        `✅ Extracted: ${extractedData.title} (${result.metadata.wordCount} words)`
      );

      // Enqueue more pages if depth allows
      if (crawlOptions.maxDepth > 0 && depth < crawlOptions.maxDepth) {
        await enqueueLinks({
          strategy: crawlOptions.sameDomain ? "same-domain" : "all",
          userData: { depth: depth + 1 },
        });
        log.info(`🔗 Enqueued links from: ${url}`);
      }
    },

    // Handle failed requests
    failedRequestHandler({ request }, error) {
      log.error(`❌ Failed: ${request.url} - ${error.message}`);
    },
  });

  return crawler;
}

/**
 * Run the crawler with given URLs
 */
export async function runCrawler(crawler, urls) {
  const requests = urls.map((url) => ({
    url: normalizeUrl(url),
    userData: { depth: 0 },
  }));

  await crawler.run(requests);
}

/**
 * Find the main content container on the page
 */
async function findMainContent(page) {
  for (const selector of MAIN_CONTENT_SELECTORS) {
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }
  return "body";
}

/**
 * Process content for AI consumption
 */
function processForAI(textContent, aiOptions) {
  const result = {
    rawText: textContent,
  };

  // Chunk content if enabled
  if (aiOptions.chunkContent) {
    result.chunks = chunkText(
      textContent,
      aiOptions.chunkSize || 1000,
      aiOptions.chunkOverlap || 100
    );
    result.totalChunks = result.chunks.length;
  }

  return result;
}

/**
 * Chunk text into smaller pieces for AI processing
 */
function chunkText(text, chunkSize, overlap) {
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

      // Keep overlap from previous chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(" ") + " " + sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  // Add final chunk
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
 * Normalize URL to ensure consistent format
 */
function normalizeUrl(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}
