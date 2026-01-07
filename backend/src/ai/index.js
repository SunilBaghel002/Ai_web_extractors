/**
 * AI Module Exports
 */

export {
  analyzeCode,
  explainCode,
  generateDocs,
  improveCode,
  summarizeContent,
  askAboutCode,
} from "./code-analyzer.js";

export { callAI, getAvailableProviders, testProvider } from "./providers.js";

/**
 * Check if AI is configured
 */
export function isAIConfigured(aiProvider, aiApiKey) {
  if (!aiProvider) return false;
  
  // Ollama doesn't need API key
  if (aiProvider === 'ollama') return true;
  
  // Other providers need API key
  const providersNeedingKey = ['openai', 'anthropic', 'google', 'groq', 'huggingface', 'together'];
  
  if (providersNeedingKey.includes(aiProvider)) {
    return !!aiApiKey;
  }
  
  return false;
}

/**
 * Validate AI configuration
 */
export function validateAIConfig(aiProvider, aiApiKey) {
  if (!aiProvider) {
    throw new Error('AI provider is required');
  }
  
  const providersNeedingKey = ['openai', 'anthropic', 'google', 'groq', 'huggingface', 'together'];
  
  if (providersNeedingKey.includes(aiProvider) && !aiApiKey) {
    throw new Error(`API key is required for ${aiProvider}`);
  }
  
  return true;
}