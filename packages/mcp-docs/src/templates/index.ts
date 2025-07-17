export interface ProjectTemplate {
  name: string;
  description: string;
  files: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts: Record<string, string>;
}

export interface TemplateConfig {
  projectName: string;
  description?: string;
  urls: string[];
  contentSelector?: string;
  linkSelector?: string;
  excludePatterns?: string[];
  includePatterns?: string[];
}

/**
 * Generates the package.json template for a new MCP docs server
 */
export function generatePackageJson(config: TemplateConfig): string {
  const packageJson = {
    name: config.projectName,
    version: "0.1.0",
    description:
      config.description ||
      `MCP documentation server for ${config.projectName}`,
    main: "dist/server.js",
    type: "module",
    scripts: {
      build: "tsc && node dist/build-index.js",
      "build:index": "node dist/build-index.js",
      "build:server": "tsc",
      dev: "tsc --watch",
      start: "node dist/server.js",
      test: "vitest",
    },
    dependencies: {
      "@agentdesk/mcp-docs": "workspace:*",
      "@modelcontextprotocol/sdk": "^1.15.1",
      zod: "^4.0.5",
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      typescript: "^5.0.4",
      vitest: "^1.0.0",
    },
  };

  return JSON.stringify(packageJson, null, 2);
}

/**
 * Generates the TypeScript configuration
 */
export function generateTsConfig(): string {
  const tsConfig = {
    compilerOptions: {
      target: "es2022",
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: "./dist",
      rootDir: "./src",
      declaration: true,
      resolveJsonModule: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  return JSON.stringify(tsConfig, null, 2);
}

/**
 * Generates the MCP server implementation
 */
export function generateServerFile(config: TemplateConfig): string {
  return `import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Doc {
  url: string;
  content: string;
}

interface SearchIndex {
  documents: Doc[];
  index: any; // FlexSearch index
}

class ${toPascalCase(config.projectName)}Server {
  private server: Server;
  private searchIndex: SearchIndex | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "${config.projectName}",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_${toSnakeCase(config.projectName)}_docs",
            description: "Search through ${config.projectName} documentation",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for the documentation",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "search_${toSnakeCase(config.projectName)}_docs":
          return await this.handleSearch(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            \`Unknown tool: \${request.params.name}\`
          );
      }
    });
  }

  private async handleSearch(args: any) {
    const { query, limit = 10 } = args;
    
    if (!query || typeof query !== "string") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Query parameter is required and must be a string"
      );
    }

    await this.ensureIndexLoaded();
    
    if (!this.searchIndex) {
      throw new McpError(
        ErrorCode.InternalError,
        "Search index not available"
      );
    }

    try {
      // Simple text search implementation
      // In a real implementation, you'd use FlexSearch here
      const results = this.searchIndex.documents
        .filter(doc => 
          doc.content.toLowerCase().includes(query.toLowerCase()) ||
          doc.url.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map(doc => ({
          url: doc.url,
          content: doc.content.substring(0, 500) + (doc.content.length > 500 ? "..." : ""),
          relevance: this.calculateRelevance(doc, query)
        }))
        .sort((a, b) => b.relevance - a.relevance);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query,
              results: results.length,
              matches: results
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        \`Search failed: \${error instanceof Error ? error.message : "Unknown error"}\`
      );
    }
  }

  private calculateRelevance(doc: Doc, query: string): number {
    const content = doc.content.toLowerCase();
    const searchQuery = query.toLowerCase();
    
    // Simple relevance scoring
    let score = 0;
    const queryWords = searchQuery.split(/\\s+/);
    
    for (const word of queryWords) {
      const matches = (content.match(new RegExp(word, "g")) || []).length;
      score += matches;
    }
    
    return score;
  }

  private async ensureIndexLoaded() {
    if (this.searchIndex) return;

    try {
      const indexPath = path.join(__dirname, "docs-index.json");
      const indexData = await fs.readFile(indexPath, "utf-8");
      this.searchIndex = JSON.parse(indexData);
    } catch (error) {
      console.error("Failed to load search index:", error);
      throw new McpError(
        ErrorCode.InternalError,
        "Documentation index not found. Please run 'pnpm build:index' first."
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("${config.projectName} MCP server running on stdio");
  }
}

const server = new ${toPascalCase(config.projectName)}Server();
server.run().catch(console.error);
`;
}

/**
 * Generates the index building script
 */
export function generateBuildIndexFile(config: TemplateConfig): string {
  const selectors =
    config.contentSelector || config.linkSelector
      ? `  selectors: {
    ${config.contentSelector ? `content: "${config.contentSelector}",` : ""}
    ${config.linkSelector ? `links: "${config.linkSelector}",` : ""}
  },`
      : "";

  const contentConfig =
    config.excludePatterns || config.includePatterns
      ? `  content: {
    ${
      config.excludePatterns
        ? `excludePatterns: ${JSON.stringify(config.excludePatterns)},`
        : ""
    }
    ${
      config.includePatterns
        ? `includePatterns: ${JSON.stringify(config.includePatterns)},`
        : ""
    }
  },`
      : "";

  return `import { createIndex } from "@agentdesk/mcp-docs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildIndex() {
  console.log("Building documentation index for ${config.projectName}...");
  
  try {
    await createIndex({
      pages: ${JSON.stringify(config.urls, null, 6)},
${selectors}
${contentConfig}
      outputFile: path.join(__dirname, "docs-index.json"),
    });
    
    console.log("✅ Documentation index built successfully!");
  } catch (error) {
    console.error("❌ Failed to build documentation index:", error);
    process.exit(1);
  }
}

buildIndex();
`;
}

/**
 * Generates a README file for the project
 */
export function generateReadme(config: TemplateConfig): string {
  return `# ${config.projectName}

${config.description || `MCP documentation server for ${config.projectName}`}

This MCP server provides search capabilities for the following documentation sources:

${config.urls.map((url) => `- [${url}](${url})`).join("\n")}

## Setup

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Build the documentation index:
   \`\`\`bash
   pnpm build:index
   \`\`\`

3. Build the server:
   \`\`\`bash
   pnpm build:server
   \`\`\`

## Usage

Start the MCP server:

\`\`\`bash
pnpm start
\`\`\`

## Available Tools

### search_${toSnakeCase(config.projectName)}_docs

Search through the documentation.

**Parameters:**
- \`query\` (string, required): Search query
- \`limit\` (number, optional): Maximum number of results (default: 10)

**Example:**
\`\`\`json
{
  "name": "search_${toSnakeCase(config.projectName)}_docs",
  "arguments": {
    "query": "authentication",
    "limit": 5
  }
}
\`\`\`

## Configuration

The documentation sources and selectors are configured in \`src/build-index.ts\`. You can modify:

- URLs to crawl
- CSS selectors for content extraction
- Exclude/include patterns
- Crawler settings

After making changes, rebuild the index with \`pnpm build:index\`.
`;
}

/**
 * Helper function to convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
    .replace(/^(.)/, (char) => char.toUpperCase());
}

/**
 * Helper function to convert string to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/[-\s]+/g, "_")
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Gets the complete project template
 */
export function getProjectTemplate(config: TemplateConfig): ProjectTemplate {
  return {
    name: config.projectName,
    description:
      config.description ||
      `MCP documentation server for ${config.projectName}`,
    files: {
      "package.json": generatePackageJson(config),
      "tsconfig.json": generateTsConfig(),
      "src/server.ts": generateServerFile(config),
      "src/build-index.ts": generateBuildIndexFile(config),
      "README.md": generateReadme(config),
      ".gitignore": `node_modules/
dist/
docs-index.json
*.log
.env
.DS_Store
`,
    },
    dependencies: {
      "@agentdesk/mcp-docs": "workspace:*",
      "@modelcontextprotocol/sdk": "^1.15.1",
      zod: "^4.0.5",
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      typescript: "^5.0.4",
      vitest: "^1.0.0",
    },
    scripts: {
      build: "tsc && node dist/build-index.js",
      "build:index": "node dist/build-index.js",
      "build:server": "tsc",
      dev: "tsc --watch",
      start: "node dist/server.js",
      test: "vitest",
    },
  };
}
