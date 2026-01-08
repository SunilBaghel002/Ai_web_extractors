/**
 * Code Analysis with Free AI
 */

import { callAI } from "./providers.js";

// ============================================================
// CODE ANALYSIS FUNCTIONS
// ============================================================

/**
 * Analyze code - detect patterns, issues, architecture
 */
export async function analyzeCode(code, options = {}) {
  const { provider = process.env.AI_PROVIDER || "groq", language = "auto" } =
    options;

  const prompt = `Analyze the following ${language !== "auto" ? language : ""} code and provide:

1. **Overview**: What does this code do? (2-3 sentences)
2. **Key Components**: List main functions/classes and their purposes
3. **Code Quality**: Rate 1-10 with brief explanation
4. **Potential Issues**: List any bugs, security issues, or anti-patterns
5. **Suggestions**: Top 3 improvements

CODE:
\`\`\`
${truncateCode(code)}
\`\`\`

Provide a concise, structured analysis:`;

  const result = await callAI(prompt, {
    provider,
    maxTokens: 1500,
    systemPrompt: "You are an expert code reviewer. Be concise and actionable.",
  });

  return {
    type: "analysis",
    ...result,
  };
}

/**
 * Explain code for beginners
 */
export async function explainCode(code, options = {}) {
  const { provider = process.env.AI_PROVIDER || "groq", language = "auto" } =
    options;

  const prompt = `Explain this ${language !== "auto" ? language : ""} code in simple terms for a beginner:

1. **What it does**: Main purpose in plain English
2. **How it works**: Step-by-step explanation
3. **Key concepts**: Explain any important programming concepts used
4. **Example**: Show how to use this code

CODE:
\`\`\`
${truncateCode(code)}
\`\`\`

Explain clearly:`;

  const result = await callAI(prompt, {
    provider,
    maxTokens: 1500,
    systemPrompt:
      "You are a patient programming teacher. Explain code simply and clearly.",
  });

  return {
    type: "explanation",
    ...result,
  };
}

/**
 * Generate documentation
 */
export async function generateDocs(code, options = {}) {
  const { provider = process.env.AI_PROVIDER || "groq", language = "auto" } =
    options;

  const prompt = `Generate documentation for this ${language !== "auto" ? language : ""} code:

1. **Overview**: What this code does
2. **API Reference**: Document all public functions with:
   - Description
   - Parameters (name, type, description)
   - Return value
   - Example usage
3. **Usage Examples**: 2-3 practical examples

CODE:
\`\`\`
${truncateCode(code)}
\`\`\`

Generate documentation in Markdown format:`;

  const result = await callAI(prompt, {
    provider,
    maxTokens: 2000,
    systemPrompt:
      "You are a technical writer. Generate clear, professional documentation.",
  });

  return {
    type: "documentation",
    ...result,
  };
}

/**
 * Suggest improvements
 */
export async function improveCode(code, options = {}) {
  const { provider = process.env.AI_PROVIDER || "groq", language = "auto" } =
    options;

  const prompt = `Review this ${language !== "auto" ? language : ""} code and suggest improvements:

For each issue found:
1. **Problem**: What's wrong
2. **Current code**: The problematic part
3. **Improved code**: The fix
4. **Why**: Brief explanation

Focus on:
- Performance
- Readability
- Security
- Best practices

CODE:
\`\`\`
${truncateCode(code)}
\`\`\`

Provide specific, actionable improvements:`;

  const result = await callAI(prompt, {
    provider,
    maxTokens: 2000,
    systemPrompt:
      "You are a senior developer doing code review. Be specific and provide code examples.",
  });

  return {
    type: "improvements",
    ...result,
  };
}

/**
 * Summarize content
 */
export async function summarizeContent(content, options = {}) {
  const { provider = process.env.AI_PROVIDER || "groq", maxLength = 500 } =
    options;

  const prompt = `Summarize the following content in ${maxLength} characters or less:

CONTENT:
${content.substring(0, 10000)}

Provide a clear, informative summary:`;

  const result = await callAI(prompt, {
    provider,
    maxTokens: Math.ceil(maxLength / 3),
    systemPrompt:
      "You are a skilled summarizer. Create concise, informative summaries.",
  });

  return {
    type: "summary",
    ...result,
  };
}

/**
 * Ask questions about code
 */
export async function askAboutCode(code, question, options = {}) {
  const { provider = process.env.AI_PROVIDER || "groq" } = options;

  const prompt = `Given this code:

\`\`\`
${truncateCode(code)}
\`\`\`

Answer this question: ${question}

Provide a helpful, specific answer:`;

  const result = await callAI(prompt, {
    provider,
    maxTokens: 1000,
    systemPrompt:
      "You are a helpful programming assistant. Answer questions about code clearly and accurately.",
  });

  return {
    type: "answer",
    question,
    ...result,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function truncateCode(code, maxLength = 12000) {
  if (code.length <= maxLength) return code;

  return code.substring(0, maxLength) + "\n\n// ... (truncated for length)";
}
