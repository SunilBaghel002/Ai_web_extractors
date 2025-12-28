/**
 * Intelligent extraction based on user instructions
 */

import { extractContent } from "./content-extractor.js";
import { extractMetadata } from "./metadata-extractor.js";
import { extractMedia } from "./media-extractor.js";
import { isCodePlatform, extractCodeContent } from "./code-extractor.js";
import { extractStructuredData } from "./structured-extractor.js";
import { callAI } from "../ai/providers.js";

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

  // Check if it's a code platform and user wants code
  if (plan.extractors.includes("code") || isCodePlatform(plan.url)) {
    console.log("💻 Extracting code content...");
    const codeData = await extractCodeContent(page, plan.url);

    // Filter for specific file if requested
    if (plan.options.specificFile && codeData.files) {
      codeData.files = codeData.files.filter((f) =>
        f.name.includes(plan.options.specificFile)
      );
    }

    results.data.code = codeData;
  }

  // Extract general content
  if (plan.extractors.includes("content")) {
    console.log("📄 Extracting content...");
    const content = await extractContent(page, plan.options);

    // Filter based on specific targets
    if (plan.targets.includes("headings")) {
      results.data.headings = content.headings;
    }
    if (plan.targets.includes("links")) {
      results.data.links = content.links;
    }
    if (plan.targets.includes("tables")) {
      results.data.tables = content.tables;
    }
    if (plan.targets.includes("lists")) {
      results.data.lists = content.lists;
    }

    // Include paragraphs for article/main content
    if (
      plan.targets.includes("article") ||
      plan.targets.includes("main_content")
    ) {
      results.data.paragraphs = content.paragraphs;
      results.data.textContent = content.paragraphs.join("\n\n");
    }

    // Include everything if 'all' is specified
    if (plan.targets.includes("all")) {
      results.data.content = content;
    }
  }

  // Extract media
  if (plan.extractors.includes("media")) {
    console.log("🖼️ Extracting media...");
    const media = await extractMedia(page, plan.options);
    results.data.images = media.images;
    results.data.videos = media.videos;
  }

  // Extract structured data
  if (plan.extractors.includes("structured")) {
    console.log("📊 Extracting structured data...");
    const structured = await extractStructuredData(page, plan.options);

    if (plan.options.includePricing) {
      results.data.pricing = structured.pricing;
    }
    if (plan.options.includeContact) {
      results.data.contact = structured.contact;
    }
    if (plan.options.includeProduct) {
      results.data.product = structured.product;
    }
    if (
      !plan.options.includePricing &&
      !plan.options.includeContact &&
      !plan.options.includeProduct
    ) {
      results.data.structured = structured;
    }
  }

  // Extract metadata
  console.log("🏷️ Extracting metadata...");
  results.data.metadata = await extractMetadata(page);

  return results;
}

/**
 * Post-process results with AI if needed
 */
export async function postProcessWithAI(results, plan, aiConfig) {
  if (!plan.requiresAI || !aiConfig.aiProvider) {
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
