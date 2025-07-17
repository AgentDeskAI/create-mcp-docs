import { promises as fs } from "fs";
import FlexSearch from "flexsearch";
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import path from "path";
import { existsSync } from "fs";
import {
  SearchOptimizer,
  type OptimizationOptions,
} from "./search-optimizer.js";
import {
  IndexerConfigSchema,
  type IndexerConfig,
  type EnhancedIndexerConfig,
  type Doc,
} from "./types.js";

/** Tokenizer instance for measuring content length in tokens */
const tokenizer = new Tiktoken(o200k_base);

// Export everything users need
export * from "./heuristics/index.js";
export * from "./templates/index.js";
export * from "./providers/index.js";
export * from "./pipeline/index.js";
export * from "./chunking/index.js";
export * from "./search-optimizer.js";
export * from "./utils.js";

/**
 * Create a search index from documentation websites
 *
 * Clean, simple API that separates document extraction from indexing.
 * Choose your search provider (FlexSearch, Vectra) based on your needs.
 *
 * @param config - Configuration including pages to crawl and optional provider
 *
 * @example FlexSearch (default):
 * ```typescript
 * await createIndex({
 *   pages: ["https://docs.example.com"],
 *   outputFile: "docs-index.json"
 * });
 * ```
 *
 * @example Vectra (semantic search):
 * ```typescript
 * await createIndex({
 *   pages: ["https://docs.example.com"],
 *   outputFile: "docs-vectra-index",
 *   provider: {
 *     type: 'vectra',
 *     embeddings: {
 *       provider: 'openai',
 *       model: 'text-embedding-ada-002'
 *     }
 *   }
 * });
 * ```
 */
export async function createIndex(
  config: IndexerConfig | EnhancedIndexerConfig
): Promise<void> {
  console.log("🚀 Creating documentation search index...");

  // 1. Auto-detect selectors if not provided
  console.log("🧐 Step 1: Detecting content selectors...");
  const { detectContentSelectors } = await import("./heuristics/index.js");

  const enhancedPages = await Promise.all(
    config.pages.map(async (page) => {
      const pageConfig = typeof page === "string" ? { url: page } : page;
      if (pageConfig.selectors) {
        return pageConfig; // Selectors already provided
      }

      console.log(`🔍 Auto-detecting selectors for: ${pageConfig.url}`);
      const detected = await detectContentSelectors({
        url: pageConfig.url,
        requireLinks: true, // Always try to find navigation links
      });

      return {
        ...pageConfig,
        selectors: {
          content: detected.contentSelector,
          links: detected.linkSelector,
        },
      };
    })
  );

  const configWithSelectors = {
    ...config,
    pages: enhancedPages,
  };

  // Validate configuration
  const validatedConfig = IndexerConfigSchema.parse(configWithSelectors);

  // Import what we need
  const { extractDocuments } = await import("./pipeline/index.js");
  const { SearchProviderFactory } = await import("./providers/index.js");

  // 2. Extract documents (scraping + parsing)
  console.log("📥 Step 2: Extracting documents...");
  const documents = await extractDocuments(validatedConfig);

  if (documents.length === 0) {
    console.log("❌ No documents found, skipping index creation.");
    return;
  }

  // 3. Determine which search provider to use
  const providerConfig =
    "provider" in config && config.provider
      ? config.provider
      : SearchProviderFactory.getDefaultConfig(); // Default to FlexSearch

  // 4. Create and initialize the search provider
  console.log("🔧 Step 3: Setting up search provider...");
  const provider = await SearchProviderFactory.createProvider(providerConfig);
  await provider.initialize(providerConfig);

  console.log(`📚 Using search provider: ${provider.type}`);

  // 5. Create the search index
  console.log(
    `📝 Step 4: Creating ${provider.type} index from ${documents.length} documents...`
  );
  await provider.createIndex(documents, config.outputFile);

  console.log(`✅ Index created successfully: ${config.outputFile}`);
}

/**
 * Simple, clean Knowledge Base for searching indexed documentation
 *
 * Works with any provider (FlexSearch, Vectra) transparently.
 * The search API is the same regardless of which provider was used to create the index.
 *
 * @example Basic usage:
 * ```typescript
 * const kb = new KnowledgeBase({ index: "docs-index.json" });
 * const results = await kb.search({
 *   query: "authentication setup",
 *   tokenLimit: 5000
 * });
 * ```
 */
export class KnowledgeBase {
  private indexPath: string;
  private searchIndex: ISearchIndex | null = null;
  private optimizer: SearchOptimizer;
  private isVectra: boolean = false;
  private openaiApiKey?: string;

  constructor(config: {
    path: string;
    optimization?: Partial<OptimizationOptions>;
    apiKey?: string;
  }) {
    const { path: dirPath, optimization, apiKey } = config;
    this.openaiApiKey = apiKey || process.env.OPENAI_API_KEY;
    const name = "docs";
    // 🚀 Smart index detection: Auto-detect which index type to use
    const vectraIndexPath = path.join(dirPath, `${name}-vectra-index`);
    const flexSearchIndexPath = path.join(dirPath, `${name}-index.json`);

    // Determine which index to use based on availability and environment
    let determinedPath: string | null = null;

    // Priority 1: Check environment variable override
    if (process.env.USE_VECTRA === "true" && existsSync(vectraIndexPath)) {
      determinedPath = vectraIndexPath;
      this.isVectra = true;
    }
    // Priority 2: Auto-detect Vectra index if it exists
    else if (existsSync(vectraIndexPath)) {
      determinedPath = vectraIndexPath;
      this.isVectra = true;
    }
    // Priority 3: Fall back to FlexSearch
    else if (existsSync(flexSearchIndexPath)) {
      determinedPath = flexSearchIndexPath;
      this.isVectra = false;
    }

    // Priority 4: Error if no index found
    if (!determinedPath) {
      throw new Error(`No search index found! Please run 'pnpm build-index' first.
      Expected either:
      - ${vectraIndexPath} (Vectra with Late Chunking)
      - ${flexSearchIndexPath} (FlexSearch)`);
    }

    this.indexPath = determinedPath;

    // 🔑 Ensure we have the OpenAI API key for Vectra
    if (this.isVectra && !this.openaiApiKey) {
      console.error("❌ CONFIGURATION ERROR:");
      console.error("   Vectra index detected but OPENAI_API_KEY not found!");
      console.error("   Solutions:");
      console.error(
        "   1. Pass the API key as a command-line argument to your script."
      );
      console.error(`   2. Or set the OPENAI_API_KEY environment variable.`);
      console.error(
        "   3. Or switch to FlexSearch by deleting the Vectra index."
      );
      throw new Error("OpenAI API key required for Vectra provider");
    }

    this.optimizer = new SearchOptimizer(optimization);
  }

  /**
   * Search the documentation for content matching the query
   * Uses document-centric optimization for better coherence and token utilization
   */
  async search(options: {
    query: string;
    tokenLimit?: number;
  }): Promise<string> {
    const { query, tokenLimit = 10000 } = options;

    // Load the search index if not already loaded
    if (!this.searchIndex) {
      await this.loadSearchIndex();
    }

    if (!this.searchIndex) {
      throw new Error("Failed to load search index");
    }

    // Update optimizer with current token budget
    this.optimizer = new SearchOptimizer({
      tokenBudget: tokenLimit,
      fullDocumentThreshold: 3, // 3+ chunks = return full document
      targetUtilization: 0.9, // Use 90% of token budget
    });

    // Perform the search using the provider's search interface
    // Get more initial results for better grouping
    const rawResults = await this.searchIndex.search({
      query,
      limit: 25, // 🔄 INCREASED: Get more chunks for grouping
      includeContent: true,
    });

    if (rawResults.length === 0) {
      return `No results found for "${query}" in the documentation.`;
    }

    // 🚀 Apply document-centric optimization
    const { optimizedResults, stats } = await this.optimizer.optimizeResults(
      rawResults
    );

    if (optimizedResults.length === 0) {
      return `No results found for "${query}" after optimization.`;
    }

    // Format optimized results for display
    let combinedText = "";

    for (const result of optimizedResults) {
      const resultHeader = this.formatResultHeader(result);
      const resultContent = `${resultHeader}\n\n${result.content.trim()}`;

      combinedText += resultContent + "\n\n---\n\n";
    }

    // Create enhanced summary with detailed optimization stats
    const documentMetrics = this.generateDocumentMetrics(
      rawResults,
      optimizedResults
    );

    const summary = `Search Results Summary (Document-Centric Optimization):
- Query: "${query}"
- Search strategy: ${stats.strategy}
- Original chunks found: ${rawResults.length} from ${
      documentMetrics.totalUniqueDocuments
    } documents (${stats.originalTokens} tokens)
- Optimized results: ${optimizedResults.length} documents (${
      stats.optimizedTokens
    } tokens)
- Token utilization: ${Math.round(
      stats.utilization * 100
    )}% of ${tokenLimit} tokens
- Document coverage: ${Math.round(
      documentMetrics.documentCoverage * 100
    )}% of available documents returned

📄 Documents Retrieved in Full:
${this.formatFullDocumentsList(optimizedResults)}

📊 Document Processing Breakdown:
${this.formatDocumentBreakdown(optimizedResults, documentMetrics)}

🧠 Optimization Benefits:
${this.generateOptimizationInsights(optimizedResults, stats)}

---

`;

    return summary + combinedText.trim();
  }

  /**
   * Formats a result header with metadata about the optimization strategy
   */
  private formatResultHeader(result: any): string {
    const typeEmoji: Record<string, string> = {
      full_document: "📄",
      expanded_chunk: "📝",
      chunk: "🔍",
    };

    const typeDescription: Record<string, string> = {
      full_document: "Full Document",
      expanded_chunk: "Expanded Section",
      chunk: "Relevant Chunk",
    };

    const emoji = typeEmoji[result.type as string] || "📄";
    const description = typeDescription[result.type as string] || "Content";

    return `${emoji} ${description} | ${result.url}
📊 Relevance: ${result.relevanceScore.toFixed(2)} | Chunks Found: ${
      result.chunksFound
    } | Tokens: ${result.tokenCount}`;
  }

  /**
   * Generates insights about the optimization strategy used
   */
  private generateOptimizationInsights(results: any[], stats: any): string {
    const insights = [];

    const fullDocs = results.filter((r) => r.type === "full_document").length;
    const expandedChunks = results.filter(
      (r) => r.type === "expanded_chunk"
    ).length;
    const regularChunks = results.filter((r) => r.type === "chunk").length;

    if (fullDocs > 0) {
      insights.push(
        `• ${fullDocs} document(s) returned in full (high relevance detected)`
      );
    }
    if (expandedChunks > 0) {
      insights.push(`• ${expandedChunks} section(s) expanded with context`);
    }
    if (regularChunks > 0) {
      insights.push(`• ${regularChunks} focused chunk(s) for specific queries`);
    }

    insights.push(
      `• Token efficiency improved: ${Math.round(
        (stats.optimizedTokens / stats.originalTokens) * 100
      )}% more content`
    );

    return insights.join("\n");
  }

  /**
   * Generates document-level metrics for the search results
   */
  private generateDocumentMetrics(rawResults: any[], optimizedResults: any[]) {
    // Count unique documents in raw results
    const uniqueDocuments = new Set(rawResults.map((r) => r.url));
    const totalUniqueDocuments = uniqueDocuments.size;

    // Count documents returned in optimized results
    const optimizedDocuments = new Set(optimizedResults.map((r) => r.url));
    const documentCoverage = optimizedDocuments.size / totalUniqueDocuments;

    // Group raw results by document to get chunk counts
    const documentChunkCounts = new Map<string, number>();
    for (const result of rawResults) {
      const count = documentChunkCounts.get(result.url) || 0;
      documentChunkCounts.set(result.url, count + 1);
    }

    return {
      totalUniqueDocuments,
      documentCoverage,
      documentChunkCounts,
      optimizedDocuments: optimizedDocuments.size,
    };
  }

  /**
   * Formats the list of documents retrieved in full
   */
  private formatFullDocumentsList(optimizedResults: any[]): string {
    const fullDocuments = optimizedResults.filter(
      (r) => r.type === "full_document"
    );

    if (fullDocuments.length === 0) {
      return "None (all results are chunks or expanded sections)";
    }

    return fullDocuments
      .map((doc, index) => {
        const shortUrl = this.shortenUrl(doc.url);
        return `${index + 1}. ${shortUrl} (${doc.chunksFound} chunks found, ${
          doc.tokenCount
        } tokens)`;
      })
      .join("\n");
  }

  /**
   * Formats a detailed breakdown of document processing
   */
  private formatDocumentBreakdown(
    optimizedResults: any[],
    documentMetrics: any
  ): string {
    const breakdown = [];

    // Group optimized results by type
    const typeGroups = {
      full_document: optimizedResults.filter((r) => r.type === "full_document"),
      expanded_chunk: optimizedResults.filter(
        (r) => r.type === "expanded_chunk"
      ),
      chunk: optimizedResults.filter((r) => r.type === "chunk"),
    };

    // Format each type
    for (const [type, results] of Object.entries(typeGroups)) {
      if (results.length === 0) continue;

      const typeEmoji: Record<string, string> = {
        full_document: "📄",
        expanded_chunk: "📝",
        chunk: "🔍",
      };

      const typeName: Record<string, string> = {
        full_document: "Full Documents",
        expanded_chunk: "Expanded Sections",
        chunk: "Individual Chunks",
      };

      const emoji = typeEmoji[type] || "📄";
      const name = typeName[type] || "Content";

      breakdown.push(`${emoji} ${name}: ${results.length}`);

      // Show details for each result of this type
      results.forEach((result, index) => {
        const shortUrl = this.shortenUrl(result.url);
        const chunksInfo =
          result.chunksFound > 1 ? ` (${result.chunksFound} chunks)` : "";
        breakdown.push(
          `   ${index + 1}. ${shortUrl}${chunksInfo} - ${
            result.tokenCount
          } tokens`
        );
      });
    }

    // Add coverage summary
    breakdown.push(
      `\n📈 Coverage: Returned ${documentMetrics.optimizedDocuments}/${documentMetrics.totalUniqueDocuments} available documents`
    );

    return breakdown.join("\n");
  }

  /**
   * Shortens a URL for display purposes
   */
  private shortenUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      if (pathParts.length <= 2) {
        return urlObj.pathname || urlObj.hostname;
      }

      // Show domain + last 2 path parts
      return `${urlObj.hostname}/.../${pathParts.slice(-2).join("/")}`;
    } catch {
      // If URL parsing fails, just truncate
      return url.length > 50 ? url.substring(0, 47) + "..." : url;
    }
  }

  /**
   * Load the appropriate search index based on the file format
   */
  private async loadSearchIndex(): Promise<void> {
    // Determine provider type based on file structure
    if (this.isVectra) {
      await this.loadVectraIndex();
    } else if (await this.isFlexSearchIndex()) {
      await this.loadFlexSearchIndex();
    } else {
      throw new Error(`Unknown index format: ${this.indexPath}`);
    }
  }

  private async isFlexSearchIndex(): Promise<boolean> {
    try {
      // FlexSearch creates .json files
      if (!this.indexPath.endsWith(".json")) return false;

      const data = await fs.readFile(this.indexPath, "utf-8");
      const parsed = JSON.parse(data);

      // FlexSearch has specific structure
      return parsed.reg || parsed.ctx || parsed.map;
    } catch {
      return false;
    }
  }

  private async isVectraIndex(): Promise<boolean> {
    try {
      // Vectra creates directories with index.json
      const stats = await fs.stat(this.indexPath);
      if (stats.isDirectory()) {
        const indexFile = path.join(this.indexPath, "index.json");
        await fs.access(indexFile);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async loadFlexSearchIndex(): Promise<void> {
    const { FlexSearchProvider } = await import("./providers/flexsearch.js");
    const provider = new FlexSearchProvider();
    await provider.initialize(provider.getDefaultConfig());
    this.searchIndex = await provider.loadIndex(this.indexPath);
  }

  private async loadVectraIndex(): Promise<void> {
    const { VectraProvider } = await import("./providers/vectra.js");

    // For Vectra, we need embeddings config
    // In a real implementation, this would be stored with the index
    const provider = new VectraProvider();
    const config = {
      type: "vectra" as const,
      embeddings: {
        provider: "openai" as const,
        model: "text-embedding-ada-002",
        apiKey: this.openaiApiKey, // Already validated in constructor
      },
    };

    await provider.initialize(config);
    this.searchIndex = await provider.loadIndex(this.indexPath);
  }
}

// Import the interface we need
import type { ISearchIndex } from "./types.js";

// Re-export all types for convenience
export type {
  IndexerConfig,
  EnhancedIndexerConfig,
  Doc,
  ISearchProvider,
  ISearchIndex,
  SearchOptions,
  SearchResult,
  FlexSearchConfig,
  VectraConfig,
} from "./types.js";
