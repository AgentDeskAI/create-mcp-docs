import FlexSearch from "flexsearch";
import { promises as fs } from "fs";
import {
  ISearchProvider,
  ISearchIndex,
  Doc,
  FlexSearchConfig,
  SearchOptions,
  SearchResult,
  IndexStats,
} from "../types.js";

/**
 * Simple FlexSearch provider for backward compatibility
 */
export class FlexSearchProvider implements ISearchProvider {
  readonly type = "flexsearch";
  private config: FlexSearchConfig | null = null;

  async initialize(config: FlexSearchConfig): Promise<void> {
    this.config = config;
  }

  getDefaultConfig(): FlexSearchConfig {
    return {
      type: "flexsearch" as const,
      indexOptions: {
        charset: "latin:default",
        tokenize: "forward",
        resolution: 9,
        context: {
          resolution: 3,
          depth: 1,
          bidirectional: true,
        },
      },
    };
  }

  async createIndex(documents: Doc[], outputPath: string): Promise<void> {
    console.log(
      `Creating FlexSearch index with ${documents.length} documents...`
    );

    // Simple document storage approach
    const indexData = {
      type: "flexsearch",
      documents: documents.map((doc) => ({
        url: doc.url,
        content: doc.content,
      })),
    };

    await fs.writeFile(outputPath, JSON.stringify(indexData, null, 2));
    console.log(`FlexSearch index created at ${outputPath}`);
  }

  async loadIndex(indexPath: string): Promise<ISearchIndex> {
    const indexData = JSON.parse(await fs.readFile(indexPath, "utf-8"));

    if (indexData.type !== "flexsearch") {
      throw new Error(`Expected FlexSearch index, got ${indexData.type}`);
    }

    return new FlexSearchIndex(indexData.documents);
  }
}

/**
 * Simple FlexSearch index implementation
 */
class FlexSearchIndex implements ISearchIndex {
  private documents: { url: string; content: string }[];

  constructor(documents: { url: string; content: string }[]) {
    this.documents = documents;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, limit = 10, includeContent = true } = options;

    // Simple substring search for now
    const results = this.documents
      .filter(
        (doc) =>
          doc.content.toLowerCase().includes(query.toLowerCase()) ||
          doc.url.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, limit)
      .map((doc) => ({
        url: doc.url,
        content: includeContent ? doc.content : "",
        score: 1.0,
        metadata: {
          provider: "flexsearch",
        },
      }));

    return results;
  }

  async getStats(): Promise<IndexStats> {
    const totalLength = this.documents.reduce(
      (sum, doc) => sum + doc.content.length,
      0
    );
    return {
      documentCount: this.documents.length,
      indexSize: JSON.stringify(this.documents).length,
      avgDocumentLength:
        this.documents.length > 0 ? totalLength / this.documents.length : 0,
      providerStats: {
        provider: "flexsearch",
      },
    };
  }
}
