import { LocalIndex } from "vectra";
import { promises as fs } from "fs";
import path from "path";
import {
  ISearchProvider,
  ISearchIndex,
  Doc,
  VectraConfig,
  SearchOptions,
  SearchResult,
  IndexStats,
} from "../types.js";
import {
  ChunkingService,
  getChunkingConfig,
  type DocumentChunk,
} from "../chunking/index.js";

/**
 * Embedding service interface
 */
interface EmbeddingService {
  getEmbedding(text: string): Promise<number[]>;
}

/**
 * OpenAI embedding service implementation
 */
class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(
    apiKey: string,
    model: string = "text-embedding-ada-002",
    endpoint?: string
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint || "https://api.openai.com/v1/embeddings";
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}

/**
 * Vectra provider implementation using vector embeddings
 */
export class VectraProvider implements ISearchProvider {
  readonly type = "vectra";
  private config: VectraConfig | null = null;
  private embeddingService: EmbeddingService | null = null;

  async initialize(config: VectraConfig): Promise<void> {
    this.config = config;
    this.embeddingService = this.createEmbeddingService(config);
  }

  private createEmbeddingService(config: VectraConfig): EmbeddingService {
    switch (config.embeddings.provider) {
      case "openai":
        const apiKey = config.embeddings.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error("OpenAI API key is required for Vectra provider");
        }
        return new OpenAIEmbeddingService(
          apiKey,
          config.embeddings.model,
          config.embeddings.endpoint
        );
      default:
        throw new Error(
          `Unsupported embedding provider: ${config.embeddings.provider}`
        );
    }
  }

  getDefaultConfig(): VectraConfig {
    return {
      type: "vectra" as const,
      embeddings: {
        provider: "openai" as const,
        model: "text-embedding-ada-002",
      },
      indexOptions: {
        metadataFields: ["url"],
        metric: "cosine",
      },
      chunking: {
        strategy: "late-chunking",
        useCase: "documentation",
      },
    };
  }

  async createIndex(documents: Doc[], outputPath: string): Promise<void> {
    if (!this.embeddingService) {
      throw new Error("Embedding service not initialized");
    }

    console.log(
      `🧠 Creating Vectra index with chunking from ${documents.length} documents...`
    );

    // Setup chunking service
    const chunkingConfig = this.config?.chunking?.useCase
      ? getChunkingConfig(this.config.chunking.useCase)
      : getChunkingConfig("documentation");

    // Override with specific config if provided
    if (this.config?.chunking) {
      Object.assign(chunkingConfig, {
        strategy: this.config.chunking.strategy || chunkingConfig.strategy,
        chunkSize: this.config.chunking.chunkSize || chunkingConfig.chunkSize,
        chunkOverlap:
          this.config.chunking.chunkOverlap || chunkingConfig.chunkOverlap,
        minChunkSize:
          this.config.chunking.minChunkSize || chunkingConfig.minChunkSize,
        maxChunkSize:
          this.config.chunking.maxChunkSize || chunkingConfig.maxChunkSize,
      });
    }

    const chunkingService = new ChunkingService(chunkingConfig);
    console.log(`📝 Using ${chunkingConfig.strategy} chunking strategy`);

    // Create the output directory if it doesn't exist
    const indexDir = path.dirname(outputPath);
    const indexName = path.basename(outputPath, ".json");
    const vectraIndexPath = path.join(indexDir, indexName);

    // Initialize the Vectra index
    const index = new LocalIndex(vectraIndexPath);

    if (!(await index.isIndexCreated())) {
      await index.createIndex();
    }

    // Process documents with chunking
    let totalChunks = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(
        `📄 Processing document ${i + 1}/${documents.length}: ${doc.url}`
      );

      try {
        // Chunk the document using the configured strategy
        const chunks = await chunkingService.chunkDocument(
          doc.content,
          doc.url
        );
        console.log(`   ✂️  Created ${chunks.length} chunks from document`);

        // Process each chunk
        for (let j = 0; j < chunks.length; j++) {
          const chunk = chunks[j];

          try {
            // For late chunking, we can include context in the embedding
            const embeddingText =
              chunkingConfig.strategy === "late-chunking" &&
              chunk.metadata.context
                ? this.createContextualEmbeddingText(chunk)
                : chunk.content;

            // Get embedding for the chunk
            const embedding = await this.embeddingService.getEmbedding(
              embeddingText
            );

            // Add chunk to Vectra index with rich metadata
            await index.insertItem({
              vector: embedding,
              metadata: {
                url: chunk.metadata.url,
                content: chunk.content,
                chunkIndex: chunk.index,
                chunkType: chunk.metadata.type,
                tokenCount: chunk.tokenCount,
                startOffset: chunk.startOffset,
                endOffset: chunk.endOffset,
                // Include context for late chunking
                ...(chunk.metadata.context && {
                  contextBefore: chunk.metadata.context.before,
                  contextAfter: chunk.metadata.context.after,
                  documentLength: chunk.metadata.context.documentLength,
                }),
              },
            });

            totalChunks++;

            // Add a small delay to avoid rate limiting
            if (j < chunks.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          } catch (chunkError) {
            console.error(
              `Failed to process chunk ${j} from ${doc.url}:`,
              chunkError
            );
            // Continue with other chunks
          }
        }

        // Longer delay between documents
        if (i < documents.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Failed to process document ${doc.url}:`, error);
        // Continue with other documents rather than failing completely
      }
    }

    console.log(
      `✅ Vectra index created with ${totalChunks} chunks at ${vectraIndexPath}`
    );
  }

  /**
   * Create contextual embedding text for late chunking
   * Combines chunk content with surrounding context for better embeddings
   */
  private createContextualEmbeddingText(chunk: DocumentChunk): string {
    let contextualText = chunk.content;

    // Add preceding context if available
    if (chunk.metadata.context?.before) {
      contextualText = `${chunk.metadata.context.before}\n\n${contextualText}`;
    }

    // Add following context if available
    if (chunk.metadata.context?.after) {
      contextualText = `${contextualText}\n\n${chunk.metadata.context.after}`;
    }

    return contextualText;
  }

  async loadIndex(indexPath: string): Promise<ISearchIndex> {
    const config = this.config || this.getDefaultConfig();
    return new VectraIndex(indexPath, config, this.embeddingService!);
  }
}

/**
 * Vectra index implementation
 */
export class VectraIndex implements ISearchIndex {
  private index: LocalIndex | null = null;
  private indexPath: string;
  private config: VectraConfig;
  private embeddingService: EmbeddingService;

  constructor(
    indexPath: string,
    config: VectraConfig,
    embeddingService: EmbeddingService
  ) {
    // Remove .json extension if present since Vectra uses directory paths
    this.indexPath = indexPath.replace(/\.json$/, "");
    this.config = config;
    this.embeddingService = embeddingService;
  }

  private async loadIndex(): Promise<LocalIndex> {
    if (this.index) {
      return this.index;
    }

    try {
      this.index = new LocalIndex(this.indexPath);

      if (!(await this.index.isIndexCreated())) {
        throw new Error(`Vectra index not found at ${this.indexPath}`);
      }

      return this.index;
    } catch (error) {
      throw new Error(
        `Failed to load Vectra index from ${this.indexPath}: ${error}`
      );
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const {
      query,
      limit = 15,
      minScore = 0.7,
      includeContent = true,
    } = options;

    const index = await this.loadIndex();

    try {
      // Get embedding for the query
      const queryEmbedding = await this.embeddingService.getEmbedding(query);

      // Search the Vectra index
      const results = await index.queryItems(queryEmbedding, "", limit);

      // Convert to standardized format with chunk information
      const searchResults: SearchResult[] = results
        .filter((result: any) => result.score >= minScore)
        .map((result: any) => ({
          url: result.item.metadata.url,
          content: includeContent ? result.item.metadata.content : "",
          score: result.score,
          metadata: {
            provider: "vectra",
            similarity: result.score,
            chunkIndex: result.item.metadata.chunkIndex,
            chunkType: result.item.metadata.chunkType,
            tokenCount: result.item.metadata.tokenCount,
            // Include context information if available
            ...(result.item.metadata.contextBefore && {
              contextBefore: result.item.metadata.contextBefore,
            }),
            ...(result.item.metadata.contextAfter && {
              contextAfter: result.item.metadata.contextAfter,
            }),
          },
        }));

      return searchResults;
    } catch (error) {
      throw new Error(`Vectra search failed: ${error}`);
    }
  }

  async debugSearch(query: string): Promise<void> {
    console.log(`\n=== Vectra DEBUG: "${query}" ===`);

    try {
      const results = await this.search({
        query,
        limit: 5,
        includeContent: false,
      });

      console.log(`Found ${results.length} results`);

      results.forEach((result: SearchResult, i: number) => {
        console.log(`\nResult ${i + 1}:`);
        console.log(`URL: ${result.url}`);
        console.log(`Similarity Score: ${result.score.toFixed(4)}`);
        console.log(`Content preview: ${result.content.substring(0, 200)}...`);
      });
    } catch (error) {
      console.error("Vectra debug search failed:", error);
    }

    console.log("\n=== END Vectra DEBUG ===\n");
  }

  async getStats(): Promise<IndexStats> {
    const index = await this.loadIndex();

    try {
      // Get all items to calculate stats (this is a simple approach)
      // For a more efficient implementation, Vectra would need to expose index metadata
      const allResults = await index.queryItems(
        new Array(1536).fill(0),
        "",
        10000
      );

      const totalContentLength = allResults.reduce(
        (sum: number, result: any) =>
          sum + (result.item.metadata.content?.length || 0),
        0
      );

      return {
        documentCount: allResults.length,
        indexSize: 0, // Vectra doesn't expose index size easily
        avgDocumentLength:
          allResults.length > 0 ? totalContentLength / allResults.length : 0,
        providerStats: {
          provider: "vectra",
          config: this.config,
          embeddingModel: this.config.embeddings.model,
        },
      };
    } catch (error) {
      console.warn("Could not get Vectra stats:", error);
      return {
        documentCount: 0,
        indexSize: 0,
        avgDocumentLength: 0,
        providerStats: {
          provider: "vectra",
          error: "Stats unavailable",
        },
      };
    }
  }
}
