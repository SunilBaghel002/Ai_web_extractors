/**
 * Intelligent extraction based on user instructions
 */

import { extractContent } from "./content-extractor.js";
import { extractMetadata } from "./metadata-extractor.js";
import { extractMedia } from "./media-extractor.js";
import { detectCodePlatform } from "./code-extractor.js";
import { extractStructuredData } from "./structured-extractor.js";
import { callAI } from "../ai/providers.js";

/**
 * Check if URL is a code platform
 */
function isCodePlatform(url) {
  if (!url) return false;
  try {
    const platform = detectCodePlatform(url);
    return platform && platform !== "website";
  } catch (e) {
    return false;
  }
}

/**
 * Execute extraction based on plan
 */
export async function executeExtractionPlan(page, plan, aiConfig) {
  console.log(`🎯 Executing: ${plan.intent}`);

  const results = {
    instruction: plan.instruction,
    intent: plan.intent,
    url: plan.url,
    extractedAt: new Date().toISOString(),
    data: {},
  };

  // Ensure plan.options exists
  plan.options = plan.options || {};
  plan.extractors = plan.extractors || [];
  plan.targets = plan.targets || [];

  try {
    // Check if it's a code platform and user wants code
    if (plan.extractors.includes("code") || isCodePlatform(plan.url)) {
      console.log("💻 Extracting code content...");
      try {
        // Dynamic import to avoid issues if code-extractor doesn't export extractCodeContent
        const { extractCodeContent } = await import("./code-extractor.js");
        const codeData = await extractCodeContent(page, plan.url);

        // Filter for specific file if requested
        if (plan.options.specificFile && codeData && codeData.files) {
          codeData.files = codeData.files.filter(
            (f) => f.name && f.name.includes(plan.options.specificFile)
          );
        }

        if (codeData) {
          results.data.code = codeData;
        }
      } catch (error) {
        console.log(`⚠️ Code extraction failed: ${error.message}`);
      }
    }

    // Extract general content
    if (plan.extractors.includes("content")) {
      console.log("📄 Extracting content...");
      try {
        const content = await extractContent(page, {
          includeLinks: plan.options.includeLinks || false,
          includeTables: plan.options.includeTables || false,
          includeCode: plan.options.includeCode || false,
          includeLists: plan.options.includeLists || false,
          ...plan.options,
        });

        // Filter based on specific targets
        if (plan.targets.includes("headings") && content.headings) {
          results.data.headings = content.headings;
        }
        if (plan.targets.includes("links") && content.links) {
          results.data.links = content.links;
        }
        if (plan.targets.includes("tables") && content.tables) {
          results.data.tables = content.tables;
        }
        if (plan.targets.includes("lists") && content.lists) {
          results.data.lists = content.lists;
        }

        // Include paragraphs for article/main content
        if (
          plan.targets.includes("article") ||
          plan.targets.includes("main_content")
        ) {
          results.data.paragraphs = content.paragraphs || [];
          results.data.textContent = (content.paragraphs || []).join("\n\n");
        }

        // Include everything if 'all' is specified
        if (plan.targets.includes("all")) {
          results.data.content = content;
        }

        // For pricing extraction, include relevant content
        if (
          plan.targets.includes("pricing") ||
          plan.targets.includes("plans")
        ) {
          results.data.tables = content.tables || [];
          results.data.paragraphs = content.paragraphs || [];
        }
      } catch (error) {
        console.log(`⚠️ Content extraction failed: ${error.message}`);
      }
    }

    // Extract media
    if (plan.extractors.includes("media")) {
      console.log("🖼️ Extracting media...");
      try {
        const media = await extractMedia(page, {
          includeImages: plan.options.includeImages || false,
          ...plan.options,
        });
        results.data.images = media.images || [];
        results.data.videos = media.videos || [];
      } catch (error) {
        console.log(`⚠️ Media extraction failed: ${error.message}`);
      }
    }

    // Extract structured data
    if (plan.extractors.includes("structured")) {
      console.log("📊 Extracting structured data...");
      try {
        const structured = await extractStructuredData(page, {
          includePricing: plan.options.includePricing || false,
          includeContact: plan.options.includeContact || false,
          includeProduct: plan.options.includeProduct || false,
          ...plan.options,
        });

        if (plan.options.includePricing && structured.pricing) {
          results.data.pricing = structured.pricing;
        }
        if (plan.options.includeContact && structured.contact) {
          results.data.contact = structured.contact;
        }
        if (plan.options.includeProduct && structured.product) {
          results.data.product = structured.product;
        }

        // If no specific option, include all structured data
        if (
          !plan.options.includePricing &&
          !plan.options.includeContact &&
          !plan.options.includeProduct
        ) {
          results.data.structured = structured;
        }
      } catch (error) {
        console.log(`⚠️ Structured data extraction failed: ${error.message}`);
      }
    }

    // Extract metadata
    console.log("🏷️ Extracting metadata...");
    try {
      results.data.metadata = await extractMetadata(page);
    } catch (error) {
      console.log(`⚠️ Metadata extraction failed: ${error.message}`);
      results.data.metadata = { error: error.message };
    }
  } catch (error) {
    console.error(`❌ Extraction plan execution error: ${error.message}`);
    throw error;
  }

  return results;
}

/**
 * Post-process results with AI if needed
 */
export async function postProcessWithAI(results, plan, aiConfig) {
  if (!plan.requiresAI || !aiConfig || !aiConfig.aiProvider) {
    return results;
  }

  console.log(`🤖 Post-processing with AI: ${plan.aiTask}`);

  let prompt = "";
  let dataContext = JSON.stringify(results.data, null, 2).substring(0, 8000);

  switch (plan.aiTask) {
    case "extract_summary":
      prompt = `Summarize this extracted content concisely:

${dataContext}

Provide a clear, brief summary (3-5 sentences).`;
      break;

    case "analyze_content":
      prompt = `Analyze this extracted content and provide insights:

${dataContext}

Provide:
1. Main topics/themes
2. Key information
3. Important takeaways
4. Notable patterns or trends`;
      break;

    case "explain_content":
      prompt = `Explain this content in simple terms:

${dataContext}

Provide an easy-to-understand explanation.`;
      break;

    default:
      prompt = `Process this extracted data according to the user's request: "${plan.instruction}"

Data:
${dataContext}

Provide the requested information.`;
  }

  try {
    const aiResponse = await callAI(prompt, {
      provider: aiConfig.aiProvider,
      model: aiConfig.aiModel,
      maxTokens: 1000,
      temperature: 0.3,
    });

    results.aiProcessing = {
      task: plan.aiTask,
      response: aiResponse.content,
      provider: aiResponse.provider,
      model: aiResponse.model,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.log(`⚠️ AI processing failed: ${error.message}`);
    results.aiProcessing = {
      task: plan.aiTask,
      error: error.message,
    };
  }

  return results;
}
