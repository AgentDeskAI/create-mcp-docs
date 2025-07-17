/**
 * Search Result Optimizer
 *
 * Implements hybrid document-centric search strategy that groups chunks by document
 * and returns full documents when multiple relevant chunks are found, optimizing
 * for both coherence and token budget utilization.
 */

import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import type { SearchResult } from "./types.js";

const tokenizer = new Tiktoken(o200k_base);

export interface DocumentGroup {
  url: string;
  chunks: SearchResult[];
  avgScore: number;
  relevanceScore: number; // chunk_count * avg_score
  totalTokens: number;
}

export interface OptimizedResult {
  url: string;
  content: string;
  type: "full_document" | "expanded_chunk" | "chunk";
  relevanceScore: number;
  tokenCount: number;
  chunksFound: number;
}

export interface OptimizationOptions {
  tokenBudget: number;
  fullDocumentThreshold: number; // Min chunks to return full document
  expandedChunkMultiplier: number; // How much to expand single chunks
  targetUtilization: number; // Target % of token budget to use (0.9 = 90%)
}

/**
 * Optimizes search results using document-centric strategy
 */
export class SearchOptimizer {
  private options: OptimizationOptions;

  constructor(options: Partial<OptimizationOptions> = {}) {
    this.options = {
      tokenBudget: 10000,
      fullDocumentThreshold: 3, // 3+ chunks = return full document
      expandedChunkMultiplier: 2, // Expand single chunks by 2x
      targetUtilization: 0.9, // Use 90% of token budget
      ...options,
    };
  }

  /**
   * Optimizes search results for better coherence and token utilization
   */
  async optimizeResults(results: SearchResult[]): Promise<{
    optimizedResults: OptimizedResult[];
    stats: {
      originalTokens: number;
      optimizedTokens: number;
      utilization: number;
      documentsReturned: number;
      strategy: string;
    };
  }> {
    // Step 1: Group chunks by document
    const documentGroups = this.groupByDocument(results);

    // Step 2: Calculate relevance scores
    const scoredGroups = this.calculateRelevanceScores(documentGroups);

    // Step 3: Sort by relevance score (descending)
    const sortedGroups = scoredGroups.sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );

    // Step 4: Apply optimization strategy
    const optimizedResults = await this.applyOptimizationStrategy(sortedGroups);

    // Step 5: Generate stats
    const stats = this.generateStats(results, optimizedResults);

    return { optimizedResults, stats };
  }

  /**
   * Groups search results by source document
   */
  private groupByDocument(results: SearchResult[]): DocumentGroup[] {
    const groups = new Map<string, DocumentGroup>();

    for (const result of results) {
      if (!groups.has(result.url)) {
        groups.set(result.url, {
          url: result.url,
          chunks: [],
          avgScore: 0,
          relevanceScore: 0,
          totalTokens: 0,
        });
      }

      const group = groups.get(result.url)!;
      group.chunks.push(result);
      group.totalTokens +=
        result.metadata?.tokenCount || tokenizer.encode(result.content).length;
    }

    return Array.from(groups.values());
  }

  /**
   * Calculates relevance scores for document groups
   */
  private calculateRelevanceScores(groups: DocumentGroup[]): DocumentGroup[] {
    return groups.map((group) => {
      // Average similarity score
      group.avgScore =
        group.chunks.reduce((sum, chunk) => sum + chunk.score, 0) /
        group.chunks.length;

      // Relevance score = chunk count × avg score × recency bonus
      group.relevanceScore = group.chunks.length * group.avgScore;

      // Bonus for documents with many high-quality chunks
      if (group.chunks.length >= 3 && group.avgScore > 0.8) {
        group.relevanceScore *= 1.5; // 50% bonus
      }

      return group;
    });
  }

  /**
   * Applies the hybrid optimization strategy
   */
  private async applyOptimizationStrategy(
    groups: DocumentGroup[]
  ): Promise<OptimizedResult[]> {
    const results: OptimizedResult[] = [];
    let usedTokens = 0;
    const maxTokens = this.options.tokenBudget * this.options.targetUtilization;

    for (const group of groups) {
      // Strategy decision based on chunk count
      const strategy = this.determineStrategy(group);

      let optimizedResult: OptimizedResult;

      switch (strategy) {
        case "full_document":
          optimizedResult = await this.createFullDocumentResult(group);
          break;
        case "expanded_chunk":
          optimizedResult = await this.createExpandedChunkResult(group);
          break;
        default:
          optimizedResult = this.createChunkResult(group);
      }

      // Check if we can fit this result
      if (usedTokens + optimizedResult.tokenCount <= maxTokens) {
        results.push(optimizedResult);
        usedTokens += optimizedResult.tokenCount;
      } else {
        // Try to fit a truncated version
        const remainingTokens = maxTokens - usedTokens;
        if (remainingTokens > 500) {
          // Only if we have reasonable space
          const truncatedResult = this.truncateResult(
            optimizedResult,
            remainingTokens
          );
          results.push(truncatedResult);
          usedTokens += truncatedResult.tokenCount;
        }
        break; // Stop adding more results
      }
    }

    return results;
  }

  /**
   * Determines the best strategy for a document group
   */
  private determineStrategy(
    group: DocumentGroup
  ): "full_document" | "expanded_chunk" | "chunk" {
    const chunkCount = group.chunks.length;
    const avgScore = group.avgScore;

    // High-relevance documents with multiple chunks get full treatment
    if (chunkCount >= this.options.fullDocumentThreshold && avgScore > 0.75) {
      return "full_document";
    }

    // Medium relevance or fewer chunks get expanded treatment
    if (chunkCount >= 2 || (chunkCount === 1 && avgScore > 0.85)) {
      return "expanded_chunk";
    }

    // Low relevance gets just the chunk
    return "chunk";
  }

  /**
   * Creates a full document result (attempts to fetch complete document)
   */
  private async createFullDocumentResult(
    group: DocumentGroup
  ): Promise<OptimizedResult> {
    // In a real implementation, this would fetch the full document
    // For now, we'll combine all chunks and add context
    const combinedContent = this.combineChunksWithContext(group.chunks);

    return {
      url: group.url,
      content: combinedContent,
      type: "full_document",
      relevanceScore: group.relevanceScore,
      tokenCount: tokenizer.encode(combinedContent).length,
      chunksFound: group.chunks.length,
    };
  }

  /**
   * Creates an expanded chunk result (chunks with more context)
   */
  private async createExpandedChunkResult(
    group: DocumentGroup
  ): Promise<OptimizedResult> {
    // Take the highest-scoring chunk and expand it with context
    const bestChunk = group.chunks.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    let expandedContent = bestChunk.content;

    // Add context before and after if available
    if (bestChunk.metadata?.contextBefore) {
      expandedContent =
        bestChunk.metadata.contextBefore + "\n\n" + expandedContent;
    }
    if (bestChunk.metadata?.contextAfter) {
      expandedContent =
        expandedContent + "\n\n" + bestChunk.metadata.contextAfter;
    }

    // If multiple chunks, combine the top ones
    if (group.chunks.length > 1) {
      const topChunks = group.chunks
        .sort((a, b) => b.score - a.score)
        .slice(0, 3); // Top 3 chunks max

      expandedContent = this.combineChunksWithContext(topChunks);
    }

    return {
      url: group.url,
      content: expandedContent,
      type: "expanded_chunk",
      relevanceScore: group.relevanceScore,
      tokenCount: tokenizer.encode(expandedContent).length,
      chunksFound: group.chunks.length,
    };
  }

  /**
   * Creates a basic chunk result
   */
  private createChunkResult(group: DocumentGroup): OptimizedResult {
    const bestChunk = group.chunks.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    return {
      url: group.url,
      content: bestChunk.content,
      type: "chunk",
      relevanceScore: group.relevanceScore,
      tokenCount: tokenizer.encode(bestChunk.content).length,
      chunksFound: group.chunks.length,
    };
  }

  /**
   * Combines multiple chunks with smooth transitions
   */
  private combineChunksWithContext(chunks: SearchResult[]): string {
    // Sort chunks by their position in the document (using chunkIndex if available)
    const sortedChunks = chunks.sort((a, b) => {
      const aIndex = a.metadata?.chunkIndex || 0;
      const bIndex = b.metadata?.chunkIndex || 0;
      return aIndex - bIndex;
    });

    return sortedChunks
      .map((chunk) => chunk.content.trim())
      .join("\n\n--- \n\n"); // Clear separators between chunks
  }

  /**
   * Truncates a result to fit within token limit
   */
  private truncateResult(
    result: OptimizedResult,
    maxTokens: number
  ): OptimizedResult {
    const tokens = tokenizer.encode(result.content);
    const truncatedTokens = tokens.slice(0, maxTokens - 20); // Leave some buffer
    const truncatedContent =
      tokenizer.decode(truncatedTokens) +
      "\n\n[Content truncated due to length...]";

    return {
      ...result,
      content: truncatedContent,
      tokenCount: truncatedTokens.length + 20, // Account for truncation message
    };
  }

  /**
   * Generates optimization statistics
   */
  private generateStats(
    original: SearchResult[],
    optimized: OptimizedResult[]
  ) {
    const originalTokens = original.reduce(
      (sum, result) =>
        sum +
        (result.metadata?.tokenCount ||
          tokenizer.encode(result.content).length),
      0
    );

    const optimizedTokens = optimized.reduce(
      (sum, result) => sum + result.tokenCount,
      0
    );

    const strategies = optimized.map((r) => r.type);
    const strategyCounts = strategies.reduce((counts, strategy) => {
      counts[strategy] = (counts[strategy] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      originalTokens,
      optimizedTokens,
      utilization: optimizedTokens / this.options.tokenBudget,
      documentsReturned: optimized.length,
      strategy: Object.entries(strategyCounts)
        .map(([strategy, count]) => `${count} ${strategy}`)
        .join(", "),
    };
  }
}
