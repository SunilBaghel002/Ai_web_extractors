/**
 * Parse user instructions and determine extraction strategy
 */

import { getAIProvider } from "./providers.js";

/**
 * Parse user instruction to determine what to extract
 */
export async function parseInstruction(instruction, url, aiConfig) {
  console.log(`🧠 Parsing instruction: "${instruction}"`);

  // Try to understand instruction without AI first (fast path)
  const quickParse = quickParseInstruction(instruction);

  if (quickParse.confidence > 0.8) {
    console.log(`✅ Quick parse successful: ${quickParse.intent}`);
    return quickParse;
  }

  // Use AI for complex instructions
  if (aiConfig && aiConfig.aiProvider) {
    console.log("🤖 Using AI to understand instruction...");
    return await aiParseInstruction(instruction, url, aiConfig);
  }

  return quickParse;
}

/**
 * Quick parse without AI (pattern matching)
 */
function quickParseInstruction(instruction) {
  const lower = instruction.toLowerCase();

  const patterns = [
    // Code extraction
    {
      patterns: [
        "extract code",
        "get code",
        "download code",
        "scrape code",
        "all files",
        "source code",
        "repository",
      ],
      intent: "extract_code",
      targets: ["code", "files", "repository"],
      confidence: 0.95,
    },
    {
      patterns: ["specific file", "particular file", "file named", "get file"],
      intent: "extract_specific_file",
      targets: ["specific_file"],
      confidence: 0.9,
      extractFileName: true,
    },
    {
      patterns: ["readme", "documentation", "docs", "getting started"],
      intent: "extract_documentation",
      targets: ["readme", "documentation"],
      confidence: 0.95,
    },

    // Content extraction
    {
      patterns: [
        "article",
        "blog post",
        "post content",
        "main content",
        "text content",
      ],
      intent: "extract_article",
      targets: ["article", "main_content"],
      confidence: 0.95,
    },
    {
      patterns: ["summary", "summarize", "tldr", "brief", "overview"],
      intent: "extract_summary",
      targets: ["summary"],
      confidence: 0.95,
      requireAI: true,
    },
    {
      patterns: [
        "all text",
        "everything",
        "full page",
        "entire page",
        "complete content",
      ],
      intent: "extract_all",
      targets: ["all"],
      confidence: 0.9,
    },

    // Structured data
    {
      patterns: ["pricing", "price", "cost", "plans", "subscription"],
      intent: "extract_pricing",
      targets: ["pricing", "tables", "plans"],
      confidence: 0.95,
    },
    {
      patterns: ["contact", "email", "phone", "address", "contact info"],
      intent: "extract_contact",
      targets: ["contact_info"],
      confidence: 0.95,
    },
    {
      patterns: ["product", "product details", "product info", "item details"],
      intent: "extract_product",
      targets: ["product", "details", "specifications"],
      confidence: 0.9,
    },
    {
      patterns: ["table", "tables", "data table", "tabular data"],
      intent: "extract_tables",
      targets: ["tables"],
      confidence: 0.95,
    },
    {
      patterns: ["images", "pictures", "photos", "gallery", "image urls"],
      intent: "extract_images",
      targets: ["images"],
      confidence: 0.95,
    },
    {
      patterns: ["links", "urls", "all links", "hyperlinks"],
      intent: "extract_links",
      targets: ["links"],
      confidence: 0.95,
    },
    {
      patterns: ["headings", "headers", "titles", "outline", "structure"],
      intent: "extract_headings",
      targets: ["headings", "structure"],
      confidence: 0.95,
    },

    // Lists and data
    {
      patterns: ["list", "items", "bullet points", "enumeration"],
      intent: "extract_lists",
      targets: ["lists"],
      confidence: 0.9,
    },
    {
      patterns: ["comments", "discussions", "user comments"],
      intent: "extract_comments",
      targets: ["comments"],
      confidence: 0.9,
    },

    // API/Technical
    {
      patterns: ["api", "api documentation", "endpoints", "api reference"],
      intent: "extract_api_docs",
      targets: ["api", "code", "endpoints"],
      confidence: 0.95,
    },
    {
      patterns: ["schema", "data model", "database schema", "structure"],
      intent: "extract_schema",
      targets: ["schema", "tables", "structure"],
      confidence: 0.9,
    },

    // Analysis
    {
      patterns: ["analyze", "analysis", "insights", "understand"],
      intent: "analyze_content",
      targets: ["all"],
      confidence: 0.85,
      requireAI: true,
    },
    {
      patterns: ["explain", "what is", "describe", "tell me about"],
      intent: "explain_content",
      targets: ["all"],
      confidence: 0.85,
      requireAI: true,
    },
  ];

  // Find matching pattern
  for (const pattern of patterns) {
    for (const p of pattern.patterns) {
      if (lower.includes(p)) {
        const result = {
          intent: pattern.intent,
          targets: pattern.targets,
          confidence: pattern.confidence,
          requireAI: pattern.requireAI || false,
          originalInstruction: instruction,
        };

        // Extract specific details
        if (pattern.extractFileName) {
          const fileMatch =
            instruction.match(/["']([^"']+)["']/) ||
            instruction.match(/\b(\w+\.\w+)\b/);
          if (fileMatch) {
            result.fileName = fileMatch[1];
          }
        }

        return result;
      }
    }
  }

  // Default: extract main content
  return {
    intent: "extract_article",
    targets: ["article", "main_content"],
    confidence: 0.5,
    originalInstruction: instruction,
  };
}

/**
 * Use AI to parse complex instructions
 */
async function aiParseInstruction(instruction, url, aiConfig) {
  const { aiProvider, aiApiKey, aiModel } = aiConfig;

  try {
    const ai = getAIProvider(aiProvider, aiApiKey, { model: aiModel });

    const prompt = `Analyze this user instruction for web scraping and determine the extraction intent.

User Instruction: "${instruction}"
Target URL: ${url}

Determine:
1. What does the user want to extract? (code, article, pricing, images, links, tables, etc.)
2. Are they looking for specific elements or everything?
3. What is the primary intent?

Respond in JSON format:
{
  "intent": "extract_code|extract_article|extract_pricing|extract_images|etc",
  "targets": ["target1", "target2"],
  "specifics": "any specific requirements",
  "needsAI": true/false
}

Only respond with valid JSON.`;

    const response = await ai.complete(prompt, { maxTokens: 300 });

    // Parse AI response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: parsed.intent || "extract_all",
        targets: parsed.targets || ["all"],
        specifics: parsed.specifics,
        requireAI: parsed.needsAI || false,
        confidence: 0.95,
        originalInstruction: instruction,
        aiParsed: true,
      };
    }
  } catch (error) {
    console.log(`⚠️ AI parsing failed: ${error.message}`);
  }

  // Fallback
  return quickParseInstruction(instruction);
}

/**
 * Generate extraction plan based on parsed instruction
 */
export function createExtractionPlan(parsedInstruction, url) {
  const plan = {
    instruction: parsedInstruction.originalInstruction,
    intent: parsedInstruction.intent,
    url,
    steps: [],
    extractors: new Set(),
    options: {},
  };

  // Determine which extractors to use
  const targets = parsedInstruction.targets || [];

  targets.forEach((target) => {
    switch (target) {
      case "code":
      case "files":
      case "repository":
        plan.extractors.add("code");
        plan.options.includeCode = true;
        break;

      case "article":
      case "main_content":
        plan.extractors.add("content");
        plan.options.includeMainContent = true;
        break;

      case "images":
        plan.extractors.add("media");
        plan.options.includeImages = true;
        break;

      case "links":
        plan.extractors.add("content");
        plan.options.includeLinks = true;
        break;

      case "tables":
        plan.extractors.add("content");
        plan.options.includeTables = true;
        break;

      case "headings":
      case "structure":
        plan.extractors.add("content");
        plan.options.includeHeadings = true;
        break;

      case "lists":
        plan.extractors.add("content");
        plan.options.includeLists = true;
        break;

      case "pricing":
      case "plans":
        plan.extractors.add("content");
        plan.extractors.add("structured");
        plan.options.includeTables = true;
        plan.options.includePricing = true;
        break;

      case "contact_info":
        plan.extractors.add("structured");
        plan.options.includeContact = true;
        break;

      case "product":
      case "details":
        plan.extractors.add("structured");
        plan.options.includeProduct = true;
        break;

      case "documentation":
      case "readme":
        plan.extractors.add("documentation");
        plan.options.includeDocumentation = true;
        break;

      case "all":
        plan.extractors.add("content");
        plan.extractors.add("media");
        plan.extractors.add("structured");
        plan.options = {
          includeImages: true,
          includeLinks: true,
          includeTables: true,
          includeCode: true,
          includeLists: true,
          includeHeadings: true,
        };
        break;
    }
  });

  // Convert Set to Array
  plan.extractors = Array.from(plan.extractors);

  // Add AI processing if needed
  if (parsedInstruction.requireAI) {
    plan.requiresAI = true;
    plan.aiTask = parsedInstruction.intent;
  }

  // Add specific requirements
  if (parsedInstruction.fileName) {
    plan.options.specificFile = parsedInstruction.fileName;
  }

  if (parsedInstruction.specifics) {
    plan.specifics = parsedInstruction.specifics;
  }

  console.log(`📋 Extraction Plan: ${plan.extractors.join(", ")}`);

  return plan;
}
