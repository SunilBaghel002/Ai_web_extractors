/**
 * Free AI Providers Integration
 * Supports: Groq, Gemini, Hugging Face, Together, Cohere, Ollama
 */

import "dotenv/config";

// ============================================================
// PROVIDER CONFIGURATIONS
// ============================================================

const PROVIDERS = {
  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
    ],
    defaultModel: "llama-3.3-70b-versatile",
    free: true,
    rateLimit: "30 requests/min",
  },
  gemini: {
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    keyEnv: "GEMINI_API_KEY",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"],
    defaultModel: "gemini-1.5-flash",
    free: true,
    rateLimit: "60 requests/min",
  },
  huggingface: {
    name: "Hugging Face",
    url: "https://api-inference.huggingface.co/models",
    keyEnv: "HUGGINGFACE_API_KEY",
    models: [
      "mistralai/Mistral-7B-Instruct-v0.2",
      "meta-llama/Llama-2-7b-chat-hf",
    ],
    defaultModel: "mistralai/Mistral-7B-Instruct-v0.2",
    free: true,
    rateLimit: "Varies",
  },
  together: {
    name: "Together AI",
    url: "https://api.together.xyz/v1/chat/completions",
    keyEnv: "TOGETHER_API_KEY",
    models: [
      "meta-llama/Llama-3-70b-chat-hf",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
    ],
    defaultModel: "meta-llama/Llama-3-70b-chat-hf",
    free: true,
    rateLimit: "$25 free credits",
  },
  cohere: {
    name: "Cohere",
    url: "https://api.cohere.ai/v1/generate",
    keyEnv: "COHERE_API_KEY",
    models: ["command", "command-light", "command-nightly"],
    defaultModel: "command",
    free: true,
    rateLimit: "100 requests/min (trial)",
  },
  ollama: {
    name: "Ollama (Local)",
    url: process.env.OLLAMA_URL || "http://localhost:11434",
    keyEnv: null,
    models: ["llama3", "mistral", "codellama", "deepseek-coder"],
    defaultModel: process.env.OLLAMA_MODEL || "llama3",
    free: true,
    rateLimit: "Unlimited (local)",
  },
};

// ============================================================
// MAIN AI CALL FUNCTION
// ============================================================

/**
 * Call AI with automatic provider selection
 */
export async function callAI(prompt, options = {}) {
  const {
    provider = process.env.AI_PROVIDER || "groq",
    model = null,
    maxTokens = 2000,
    temperature = 0.3,
    systemPrompt = "You are a helpful AI assistant specialized in code analysis.",
  } = options;

  const providerConfig = PROVIDERS[provider.toLowerCase()];

  if (!providerConfig) {
    throw new Error(
      `Unknown provider: ${provider}. Available: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }

  const apiKey = providerConfig.keyEnv
    ? process.env[providerConfig.keyEnv]
    : null;

  if (providerConfig.keyEnv && !apiKey && provider !== "ollama") {
    throw new Error(
      `API key not found for ${providerConfig.name}. Set ${providerConfig.keyEnv} in .env file.`
    );
  }

  const selectedModel = model || providerConfig.defaultModel;

  console.log(`🤖 Using ${providerConfig.name} (${selectedModel})`);

  try {
    switch (provider.toLowerCase()) {
      case "groq":
        return await callGroq(
          prompt,
          apiKey,
          selectedModel,
          maxTokens,
          temperature,
          systemPrompt
        );
      case "gemini":
        return await callGemini(
          prompt,
          apiKey,
          selectedModel,
          maxTokens,
          temperature
        );
      case "huggingface":
        return await callHuggingFace(prompt, apiKey, selectedModel, maxTokens);
      case "together":
        return await callTogether(
          prompt,
          apiKey,
          selectedModel,
          maxTokens,
          temperature,
          systemPrompt
        );
      case "cohere":
        return await callCohere(
          prompt,
          apiKey,
          selectedModel,
          maxTokens,
          temperature
        );
      case "ollama":
        return await callOllama(
          prompt,
          selectedModel,
          maxTokens,
          temperature,
          systemPrompt
        );
      default:
        throw new Error(`Provider not implemented: ${provider}`);
    }
  } catch (error) {
    console.error(`❌ AI Error (${provider}): ${error.message}`);
    throw error;
  }
}

// ============================================================
// GROQ (Recommended - Very Fast & Free)
// ============================================================

async function callGroq(
  prompt,
  apiKey,
  model,
  maxTokens,
  temperature,
  systemPrompt
) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    provider: "groq",
    model,
    content: data.choices[0].message.content,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    },
  };
}

// ============================================================
// GOOGLE GEMINI (Free Tier)
// ============================================================

async function callGemini(prompt, apiKey, model, maxTokens, temperature) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    provider: "gemini",
    model,
    content: data.candidates[0].content.parts[0].text,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount,
      completionTokens: data.usageMetadata?.candidatesTokenCount,
    },
  };
}

// ============================================================
// HUGGING FACE (Free Tier)
// ============================================================

async function callHuggingFace(prompt, apiKey, model, maxTokens) {
  const url = `https://api-inference.huggingface.co/models/${model}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HuggingFace API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    provider: "huggingface",
    model,
    content: Array.isArray(data) ? data[0].generated_text : data.generated_text,
    usage: {},
  };
}

// ============================================================
// TOGETHER AI (Free Credits)
// ============================================================

async function callTogether(
  prompt,
  apiKey,
  model,
  maxTokens,
  temperature,
  systemPrompt
) {
  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Together API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    provider: "together",
    model,
    content: data.choices[0].message.content,
    usage: data.usage,
  };
}

// ============================================================
// COHERE (Free Trial)
// ============================================================

async function callCohere(prompt, apiKey, model, maxTokens, temperature) {
  const response = await fetch("https://api.cohere.ai/v1/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    provider: "cohere",
    model,
    content: data.generations[0].text,
    usage: {},
  };
}

// ============================================================
// OLLAMA (Local - Completely Free)
// ============================================================

async function callOllama(prompt, model, maxTokens, temperature, systemPrompt) {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();

    return {
      provider: "ollama",
      model,
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      },
    };
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error("Ollama not running. Start it with: ollama serve");
    }
    throw error;
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get list of available providers (with API keys configured)
 */
export function getAvailableProviders() {
  const available = [];

  for (const [key, config] of Object.entries(PROVIDERS)) {
    const hasKey = !config.keyEnv || process.env[config.keyEnv];
    available.push({
      id: key,
      name: config.name,
      available: hasKey || key === "ollama",
      free: config.free,
      rateLimit: config.rateLimit,
      models: config.models,
    });
  }

  return available;
}

/**
 * Test if a provider is working
 */
export async function testProvider(provider = "groq") {
  try {
    const result = await callAI(
      'Say "Hello, I am working!" in exactly those words.',
      {
        provider,
        maxTokens: 50,
      }
    );
    return {
      provider,
      success: true,
      response: result.content.substring(0, 100),
    };
  } catch (error) {
    return {
      provider,
      success: false,
      error: error.message,
    };
  }
}
