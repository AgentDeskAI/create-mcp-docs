import { z } from "zod";

/**
 * Schema for CSS selectors used to extract content and find links
 * @example
 * ```typescript
 * const selectors = {
 *   links: 'a[href^="/docs"]',  // Find documentation links
 *   content: "article.prose"    // Extract main content
 * };
 * ```
 */
export const SelectorSchema = z.object({
  /** CSS selector for finding links to follow (optional, only needed for crawl mode) */
  links: z.string().min(1, "Links selector is required.").optional(),
  /** CSS selector for extracting main content from pages. Can be a single selector or an array of selectors to try in order. */
  content: z.union([
    z.string().min(1, "Content selector cannot be empty."),
    z
      .array(z.string().min(1, "Content selector cannot be empty."))
      .min(1, "Content selector array cannot be empty."),
  ]),
});

/**
 * Comprehensive crawler configuration schema
 * Exposes most of Crawlee's PlaywrightCrawler options for fine-grained control
 */
export const CrawlerConfigSchema = z.object({
  // Core crawler options
  /** Maximum number of pages to crawl before stopping */
  maxRequestsPerCrawl: z.number().positive().optional(),
  /** Maximum number of concurrent browser instances */
  maxConcurrency: z.number().positive().optional(),
  /** Minimum number of concurrent browser instances */
  minConcurrency: z.number().positive().optional(),
  /** Number of times to retry failed requests */
  maxRequestRetries: z.number().min(0).optional(),
  /** Rate limiting: maximum requests per minute */
  maxRequestsPerMinute: z.number().positive().optional(),

  // Navigation and timing options
  /** Timeout for page navigation in seconds */
  navigationTimeoutSecs: z.number().positive().optional(),
  /** Timeout for request handler execution in seconds */
  requestHandlerTimeoutSecs: z.number().positive().optional(),
  /** Delay between requests to the same domain in seconds */
  sameDomainDelaySecs: z.number().min(0).optional(),

  // Browser configuration
  /** Run browser in headless mode, or specify 'new'/'old' for specific modes */
  headless: z
    .union([z.boolean(), z.literal("new"), z.literal("old")])
    .optional(),

  // Session and blocking management
  /** Enable session management for handling cookies and state */
  useSessionPool: z.boolean().optional(),
  /** Automatically retry when blocked by anti-bot measures */
  retryOnBlocked: z.boolean().optional(),
  /** Persist cookies across sessions */
  persistCookiesPerSession: z.boolean().optional(),

  // Browser launch context - controls how browser instances are created
  launchContext: z
    .object({
      /** Browser viewport configuration */
      viewport: z
        .object({
          width: z.number().positive().optional(),
          height: z.number().positive().optional(),
        })
        .optional(),
      /** Custom user agent string */
      userAgent: z.string().optional(),
      /** Browser locale (e.g., 'en-US') */
      locale: z.string().optional(),
      /** Timezone ID (e.g., 'America/New_York') */
      timezoneId: z.string().optional(),
      /** Additional HTTP headers to send with requests */
      extraHTTPHeaders: z.record(z.string(), z.string()).optional(),
      /** Whether to ignore HTTPS certificate errors */
      ignoreHTTPSErrors: z.boolean().optional(),
      /** Whether JavaScript execution is enabled */
      javaScriptEnabled: z.boolean().optional(),
    })
    .optional(),

  // Proxy configuration for IP rotation
  /** Array of proxy URLs for rotation */
  proxyUrls: z.array(z.string().url("Invalid proxy URL format")).optional(),

  // Advanced autoscaled pool options for fine-tuning concurrency
  autoscaledPoolOptions: z
    .object({
      /** Maximum concurrency for the autoscaled pool */
      maxConcurrency: z.number().positive().optional(),
      /** Minimum concurrency for the autoscaled pool */
      minConcurrency: z.number().positive().optional(),
      /** Desired concurrency level */
      desiredConcurrency: z.number().positive().optional(),
      /** Ratio for scaling up concurrency */
      scaleUpStepRatio: z.number().positive().optional(),
      /** Ratio for scaling down concurrency */
      scaleDownStepRatio: z.number().positive().optional(),
      /** Interval for checking if tasks should run */
      maybeRunIntervalSecs: z.number().positive().optional(),
      /** Interval for logging statistics */
      loggingIntervalSecs: z.number().positive().optional(),
    })
    .optional(),

  // Content processing options
  /** Whether to ignore iframe content when parsing */
  ignoreIframes: z.boolean().optional(),
  /** Whether to ignore shadow DOM content when parsing */
  ignoreShadowRoots: z.boolean().optional(),
});

/**
 * Content processing and filtering configuration
 */
export const ContentConfigSchema = z.object({
  // Content filtering by URL patterns
  /** URL patterns to exclude from indexing */
  excludePatterns: z.array(z.string()).optional(),
  /** URL patterns to include (if specified, only these URLs will be indexed) */
  includePatterns: z.array(z.string()).optional(),

  // Markdown conversion options
  /** Configuration for HTML to Markdown conversion */
  turndownOptions: z
    .object({
      /** Heading style: ATX (#) or Setext (underlines) */
      headingStyle: z.enum(["atx", "setext"]).optional(),
      /** Character to use for bullet lists */
      bulletListMarker: z.enum(["-", "*", "+"]).optional(),
      /** Code block style: fenced (```) or indented (4 spaces) */
      codeBlockStyle: z.enum(["indented", "fenced"]).optional(),
      /** Delimiter for emphasis text */
      emDelimiter: z.enum(["_", "*"]).optional(),
      /** Delimiter for strong text */
      strongDelimiter: z.enum(["__", "**"]).optional(),
      /** Link style: inline or reference */
      linkStyle: z.enum(["inlined", "referenced"]).optional(),
      /** Reference link style when using referenced links */
      linkReferenceStyle: z.enum(["full", "collapsed", "shortcut"]).optional(),
    })
    .optional(),
});

/**
 * Enhanced page configuration supporting both simple strings and complex objects
 *
 * @example Simple string usage:
 * ```typescript
 * "https://docs.example.com"
 * ```
 *
 * @example Full configuration object:
 * ```typescript
 * {
 *   url: "https://api.example.com/reference",
 *   mode: "single-page",
 *   selectors: { content: ".api-docs" },
 *   waitForSelector: ".api-loaded"
 * }
 * ```
 */
export const PageConfigSchema = z.union([
  // Simple string URL (backwards compatibility)
  z.string().url("Invalid URL format"),

  // Full configuration object with per-page overrides
  z.object({
    /** The URL to process */
    url: z.string().url("Invalid URL format"),

    /**
     * Processing mode:
     * - 'crawl': Follow links and recursively index discovered pages
     * - 'single-page': Extract content only from this specific page
     */
    mode: z.enum(["crawl", "single-page"]).default("crawl").optional(),

    // Per-page configuration overrides
    /** Selectors specific to this page (overrides global selectors) */
    selectors: SelectorSchema.optional(),
    /** Crawler configuration specific to this page */
    crawler: CrawlerConfigSchema.optional(),
    /** Content processing configuration specific to this page */
    content: ContentConfigSchema.optional(),

    // Single-page mode specific options
    /** CSS selector to wait for before extracting content (useful for dynamic content) */
    waitForSelector: z.string().optional(),
    /** Time to wait for the selector in milliseconds */
    waitTime: z.number().positive().optional(),
  }),
]);

/**
 * Main configuration schema for the documentation indexer
 *
 * @example Basic usage:
 * ```typescript
 * const config: IndexerConfig = {
 *   pages: ["https://docs.example.com"],
 *   selectors: {
 *     links: 'a[href^="/docs"]',
 *     content: "article"
 *   },
 *   outputFile: "docs-index.json"
 * };
 * ```
 *
 * @example Advanced usage with per-page configuration:
 * ```typescript
 * const config: IndexerConfig = {
 *   pages: [
 *     {
 *       url: "https://docs.example.com",
 *       mode: "crawl",
 *       crawler: { maxConcurrency: 5 }
 *     },
 *     {
 *       url: "https://api.example.com/reference",
 *       mode: "single-page",
 *       waitForSelector: ".api-loaded"
 *     }
 *   ],
 *   outputFile: "docs-index.json"
 * };
 * ```
 */
export const IndexerConfigSchema = z.object({
  /** Array of pages to process - can be simple strings or configuration objects */
  pages: z.array(PageConfigSchema).min(1, "At least one page is required."),

  // Global default configurations (can be overridden per page)
  /** Global default selectors for content extraction */
  selectors: SelectorSchema.optional(),
  /** Global default crawler configuration */
  crawler: CrawlerConfigSchema.optional(),
  /** Global default content processing configuration */
  content: ContentConfigSchema.optional(),

  /** Path where the generated search index will be saved */
  outputFile: z.string().min(1, "Output file path is required."),
});

// Export TypeScript types for better developer experience
export type IndexerConfig = z.infer<typeof IndexerConfigSchema>;
export type PageConfig = z.infer<typeof PageConfigSchema>;
export type SelectorConfig = z.infer<typeof SelectorSchema>;
export type CrawlerConfig = z.infer<typeof CrawlerConfigSchema>;
export type ContentConfig = z.infer<typeof ContentConfigSchema>;

/**
 * Internal document structure used by FlexSearch
 * @internal
 */
export interface Doc {
  /** Unique URL identifier for the document */
  url: string;
  /** Markdown content extracted from the page */
  content: string;
}

/**
 * Universal search provider interface
 *
 * This interface defines the contract that all search providers must implement,
 * allowing seamless switching between different search engines (FlexSearch, Vectra, etc.)
 */
export interface ISearchProvider {
  /** The type of search provider (flexsearch, vectra, etc.) */
  readonly type: string;

  /** Initialize the search provider with configuration */
  initialize(config: ProviderConfig): Promise<void>;

  /** Create a new search index */
  createIndex(documents: Doc[], outputPath: string): Promise<void>;

  /** Load an existing search index */
  loadIndex(indexPath: string): Promise<ISearchIndex>;

  /** Get default configuration for this provider */
  getDefaultConfig(): ProviderConfig;
}

/**
 * Universal search index interface
 *
 * This interface provides a consistent API for searching across different
 * search engine implementations.
 */
export interface ISearchIndex {
  /** Search the index with the given query */
  search(options: SearchOptions): Promise<SearchResult[]>;

  /** Debug search functionality */
  debugSearch?(query: string): Promise<void>;

  /** Get index statistics */
  getStats?(): Promise<IndexStats>;
}

/**
 * Search options that work across all providers
 */
export interface SearchOptions {
  /** The search query string */
  query: string;

  /** Maximum number of results to return */
  limit?: number;

  /** Search strategy (exact, fuzzy, semantic, etc.) */
  strategy?: "exact" | "fuzzy" | "semantic" | "auto";

  /** Minimum similarity score (for vector-based searches) */
  minScore?: number;

  /** Include document content in results */
  includeContent?: boolean;

  /** Maximum tokens to return (for token-limited responses) */
  tokenLimit?: number;
}

/**
 * Standardized search result format
 */
export interface SearchResult {
  /** Document URL */
  url: string;

  /** Document content */
  content: string;

  /** Relevance score (0-1) */
  score: number;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Index statistics
 */
export interface IndexStats {
  /** Total number of documents */
  documentCount: number;

  /** Index size in bytes */
  indexSize: number;

  /** Average document length */
  avgDocumentLength: number;

  /** Provider-specific stats */
  providerStats?: Record<string, any>;
}

/**
 * Provider-specific configuration
 */
export type ProviderConfig = FlexSearchConfig | VectraConfig;

/**
 * FlexSearch provider configuration
 */
export const FlexSearchConfigSchema = z.object({
  type: z.literal("flexsearch"),

  /** FlexSearch index options */
  indexOptions: z
    .object({
      charset: z.string().optional(),
      tokenize: z.string().optional(),
      resolution: z.number().optional(),
      context: z
        .object({
          resolution: z.number().optional(),
          depth: z.number().optional(),
          bidirectional: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Vectra provider configuration
 */
export const VectraConfigSchema = z.object({
  type: z.literal("vectra"),

  /** Embedding configuration */
  embeddings: z.object({
    /** Provider (openai, huggingface, etc.) */
    provider: z.enum(["openai", "huggingface", "cohere"]),

    /** Model name */
    model: z.string(),

    /** API key */
    apiKey: z.string().optional(),

    /** API endpoint for custom providers */
    endpoint: z.string().optional(),

    /** Dimensions of the embedding vectors */
    dimensions: z.number().optional(),
  }),

  /** Vectra index options */
  indexOptions: z
    .object({
      /** Metadata fields to index for filtering */
      metadataFields: z.array(z.string()).optional(),

      /** Similarity metric */
      metric: z.enum(["cosine", "euclidean", "dot"]).optional(),
    })
    .optional(),

  /** Chunking configuration for document processing */
  chunking: z
    .object({
      /** Chunking strategy */
      strategy: z
        .enum(["traditional", "late-chunking", "semantic", "sentence"])
        .optional(),

      /** Target chunk size in tokens */
      chunkSize: z.number().optional(),

      /** Overlap between chunks in tokens */
      chunkOverlap: z.number().optional(),

      /** Minimum chunk size */
      minChunkSize: z.number().optional(),

      /** Maximum chunk size */
      maxChunkSize: z.number().optional(),

      /** Use case for automatic configuration */
      useCase: z.enum(["documentation", "articles", "code", "qa"]).optional(),
    })
    .optional(),
});

export type FlexSearchConfig = z.infer<typeof FlexSearchConfigSchema>;
export type VectraConfig = z.infer<typeof VectraConfigSchema>;

/**
 * Enhanced indexer configuration with provider support
 */
export const EnhancedIndexerConfigSchema = IndexerConfigSchema.extend({
  /** Search provider configuration */
  provider: z.union([FlexSearchConfigSchema, VectraConfigSchema]).optional(),
});

export type EnhancedIndexerConfig = z.infer<typeof EnhancedIndexerConfigSchema>;
