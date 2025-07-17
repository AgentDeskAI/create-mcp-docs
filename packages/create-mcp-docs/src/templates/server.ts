import { TemplateConfig } from "../utils/templates.js";
import { toSnakeCase } from "../utils/templates.js";

export function generateServerFile(config: TemplateConfig): string {
  const toolName = toSnakeCase(config.projectName);

  return `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  KnowledgeBase,
  getModuleDir,
  getConfig,
} from "@agentdesk/mcp-docs";

// Get config from command-line arguments
const { apiKey } = getConfig(process.argv);

/**
 * MCP Server for ${config.projectName} Documentation Search
 *
 * This server provides a Model Context Protocol (MCP) interface for searching
 * through ${
   config.projectName
 } documentation. It uses a pre-built search index to provide
 * fast, relevant results for documentation queries.
 *
 * Supports both FlexSearch (fast keyword matching) and Vectra with Late Chunking
 * (semantic search with context preservation).
 *
 * The server automatically detects and loads the appropriate documentation index
 * from the current directory and provides a single tool for searching the docs.
 */

/** MCP server instance configured for ${config.projectName} documentation */
const server = new McpServer({
  name: "${config.projectName.toLowerCase()}-docs",
  version: "0.1.0",
});

/**
 * Main server initialization function
 *
 * Sets up the documentation search tool and starts the MCP server.
 * The server provides a single tool that allows AI models to search
 * through documentation for relevant information.
 *
 * @throws {Error} When the documentation index cannot be loaded or if the server fails to start
 */
async function main() {
  /**
   * Initialize the knowledge base with the index and OpenAI API key for embeddings
   */
  const docs = new KnowledgeBase({
    path: getModuleDir(import.meta.url), // Get the directory path for ES modules
    apiKey, // OpenAI API key from command-line arguments
  });

  /**
   * Register the ${config.projectName} documentation search tool
   */
  server.registerTool(
    "search_${toolName}_docs",
    {
      title: "Search ${config.projectName} Docs",
      description: "Searches the ${config.projectName} documentation.",
      inputSchema: {
        /** The search query string - can be natural language or specific terms */
        query: z
          .string()
          .describe(
            "Natural language query to search the ${
              config.projectName
            } documentation"
          ),
      },
    },

    /**
     * Tool handler function that performs the actual search
     *
     * @param query - The search query string from the AI model
     * @returns Promise resolving to MCP tool response with search results
     */
    async ({ query }) => {
      const text = await docs.search({ query, tokenLimit: 10000 });

      return {
        content: [{ type: "text", text }],
      };
    }
  );

  // Set up stdio transport for MCP communication
  // This allows the server to communicate with MCP clients via standard input/output
  const transport = new StdioServerTransport();

  // Start the server and begin listening for requests
  await server.connect(transport);
}

// Start the server
main().catch((error) => {
  console.error("Failed to start ${config.projectName} docs server:", error);
  process.exit(1);
});
`;
}
