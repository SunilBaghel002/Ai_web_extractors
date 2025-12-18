/**
 * MCP (Model Context Protocol) Server Implementation
 *
 * This allows AI agents to directly interact with the web extractor
 * following the MCP specification.
 */

import { Actor } from "apify";
import { getMCPTools } from "./tools.js";
import { handleMCPRequest } from "./handlers.js";
import { MCP_PROTOCOL_VERSION } from "../constants.js";

/**
 * Start the MCP Server
 */
export async function startMCPServer(config) {
  console.log("🔌 MCP Server Starting...");
  console.log(`📋 Protocol Version: ${MCP_PROTOCOL_VERSION}`);

  // Store server info in key-value store
  const store = await Actor.openKeyValueStore();

  // Server capabilities and tools
  const serverInfo = {
    protocol: "mcp",
    version: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: "ai-web-content-extractor",
      version: "1.0.0",
      description:
        "Extract clean, structured content from websites for AI agents",
    },
    capabilities: {
      tools: true,
      resources: true,
      prompts: false,
      logging: true,
    },
    tools: getMCPTools(),
    status: "running",
    startedAt: new Date().toISOString(),
  };

  await store.setValue("MCP_SERVER_INFO", serverInfo);
  console.log("✅ MCP Server info saved to key-value store");

  // Create webhook endpoint info
  const webhookInfo = {
    instructions: `
╔════════════════════════════════════════════════════════════╗
║                    MCP SERVER READY                        ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  To interact with this MCP server, use the Apify API:      ║
║                                                            ║
║  POST /v2/acts/{actorId}/runs                              ║
║  {                                                         ║
║    "mode": "mcp-server",                                   ║
║    "mcpRequest": {                                         ║
║      "method": "tools/call",                               ║
║      "params": { ... }                                     ║
║    }                                                       ║
║  }                                                         ║
║                                                            ║
║  Available Tools:                                          ║
║  - extract_webpage: Extract content from a URL             ║
║  - extract_multiple: Extract from multiple URLs            ║
║  - get_page_metadata: Get page metadata only               ║
║  - search_and_extract: Search and extract results          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
        `,
    endpoints: {
      listTools: { method: "tools/list" },
      callTool: {
        method: "tools/call",
        params: { name: "string", arguments: "object" },
      },
      listResources: { method: "resources/list" },
      readResource: { method: "resources/read", params: { uri: "string" } },
    },
  };

  console.log(webhookInfo.instructions);

  // Handle incoming MCP request if provided
  if (config.mcpRequest) {
    console.log("\n📨 Processing MCP Request...");
    const result = await handleMCPRequest(config.mcpRequest, config);
    await store.setValue("MCP_RESPONSE", result);
    console.log("✅ MCP Response saved");
    return result;
  }

  // Keep server info available
  await store.setValue("MCP_ENDPOINTS", webhookInfo);

  return serverInfo;
}
