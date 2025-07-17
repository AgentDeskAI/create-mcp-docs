import { TemplateConfig } from "../utils/templates.js";

export function generateBuildIndexFile(config: TemplateConfig): string {
  // Build pages configuration with improved structure
  const pagesConfig = config.urls
    .map(
      (url) => `    {
      url: "${url}",
      mode: "crawl" as const,
    }`
    )
    .join(",\n\n");

  const useVectra = config.providerType === "vectra";

  const baseConfig = `
const baseConfig = {
  pages: [
${pagesConfig}
  ],

  // Global content processing configuration
  content: {
    excludePatterns: [
      "/admin", // Exclude administrative pages
      "/_next", // Exclude Next.js build artifacts and internal routes
      "/changelog", // Exclude changelog
      "/llms-full.txt",
    ],
  },

  // Global crawler configuration optimized for documentation sites
  crawler: {
    maxRequestsPerCrawl: 200, // Limit to reasonable size for documentation
    maxConcurrency: 8, // Gentle crawling to avoid overwhelming servers
    retryOnBlocked: true, // Retry if temporarily blocked
  },

  // Output the index to the standard location
  outputFile: path.join(__dirname, "docs-index.json"),
};
`;

  const finalConfig = useVectra
    ? `
const config: IndexerConfig | EnhancedIndexerConfig = {
  ...baseConfig,
  provider: {
    type: "vectra",
    embeddings: {
      provider: "openai",
      model: "text-embedding-ada-002",
      apiKey: process.env.OPENAI_API_KEY,
    },
    indexOptions: {
      metadataFields: ["url"],
      metric: "cosine",
    },
    // 🧠 Late Chunking Configuration - Optimized for document-centric search!
    chunking: {
      strategy: "late-chunking",
      useCase: "documentation",
      chunkSize: 1024,
      chunkOverlap: 128,
      maxChunkSize: 1600,
      minChunkSize: 200,
    },
  },
  outputFile: path.join(__dirname, "docs-vectra-index"), // Different filename for Vectra
};
`
    : `const config: IndexerConfig | EnhancedIndexerConfig = baseConfig;`;

  return `import { createIndex, type IndexerConfig, type EnhancedIndexerConfig } from "@agentdesk/mcp-docs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use environment variables (from .env file)
const ENV_USE_VECTRA = process.env.USE_VECTRA === "true" && process.env.OPENAI_API_KEY;

// Final decision
const USE_VECTRA = ENV_USE_VECTRA;

${baseConfig}

// Create the final config with optional Vectra provider
${finalConfig}

async function buildIndex() {
  const providerType = USE_VECTRA
    ? "Vectra (semantic search)"
    : "FlexSearch (keyword search)";
  console.log(
    \`🚀 Building documentation index for ${config.projectName} using \${providerType}...\`
  );

  try {
    await createIndex(config);

    console.log("✅ Documentation index built successfully!");

    if (USE_VECTRA) {
      console.log("🧠 Vectra index creating and ready to use!");
    } else {
      console.log("🔍 FlexSearch index created and ready to use!");
    }
  } catch (error) {
    console.error("❌ Failed to build documentation index:", error);
    process.exit(1);
  }
}

buildIndex();
`;
}
