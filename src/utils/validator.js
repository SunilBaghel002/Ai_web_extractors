/**
 * Input validation utilities
 */

import { MODES, OUTPUT_FORMATS } from "../constants.js";

/**
 * Validate and normalize input
 */
export function validateInput(input) {
  const errors = [];

  // Validate URLs
  if (!input.urls || !Array.isArray(input.urls) || input.urls.length === 0) {
    // If in MCP mode, URLs might not be required initially
    if (input.mode !== MODES.MCP_SERVER) {
      errors.push("At least one URL is required");
    }
  }

  // Validate URLs format
  if (input.urls) {
    input.urls.forEach((url, index) => {
      if (typeof url !== "string" || !isValidUrl(url)) {
        errors.push(`Invalid URL at index ${index}: ${url}`);
      }
    });
  }

  // Validate mode
  const validModes = Object.values(MODES);
  if (input.mode && !validModes.includes(input.mode)) {
    errors.push(
      `Invalid mode: ${input.mode}. Valid modes: ${validModes.join(", ")}`
    );
  }

  // Validate output format
  const validFormats = Object.values(OUTPUT_FORMATS);
  if (input.outputFormat && !validFormats.includes(input.outputFormat)) {
    errors.push(
      `Invalid output format: ${
        input.outputFormat
      }. Valid formats: ${validFormats.join(", ")}`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  // Return normalized input with defaults
  return {
    urls: input.urls || [],
    mode: input.mode || MODES.EXTRACTOR,
    outputFormat: input.outputFormat || OUTPUT_FORMATS.MARKDOWN,
    extractOptions: {
      includeImages: true,
      includeLinks: true,
      includeMetadata: true,
      includeTables: true,
      includeCode: true,
      ...input.extractOptions,
    },
    crawlOptions: {
      maxDepth: 0,
      maxPages: 10,
      sameDomain: true,
      ...input.crawlOptions,
    },
    aiOptions: {
      generateSummary: false,
      chunkContent: false,
      chunkSize: 1000,
      chunkOverlap: 100,
      ...input.aiOptions,
    },
    proxyConfiguration: input.proxyConfiguration || null,
    mcpRequest: input.mcpRequest || null,
  };
}

/**
 * Check if string is a valid URL
 */
function isValidUrl(string) {
  try {
    const url = new URL(
      string.startsWith("http") ? string : `https://${string}`
    );
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
