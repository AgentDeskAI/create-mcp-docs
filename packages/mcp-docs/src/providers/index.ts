import { ISearchProvider, ProviderConfig } from "../types.js";

/**
 * Factory for creating search providers with lazy loading
 */
export class SearchProviderFactory {
  /**
   * Create a search provider based on configuration
   * Uses dynamic imports to avoid loading unused providers
   */
  static async createProvider(
    config: ProviderConfig
  ): Promise<ISearchProvider> {
    switch (config.type) {
      case "flexsearch": {
        const { FlexSearchProvider } = await import("./flexsearch.js");
        return new FlexSearchProvider();
      }
      case "vectra": {
        const { VectraProvider } = await import("./vectra.js");
        return new VectraProvider();
      }
      default:
        throw new Error(
          `Unsupported search provider type: ${(config as any).type}`
        );
    }
  }

  /**
   * Get default provider configuration
   */
  static getDefaultConfig(): ProviderConfig {
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

  /**
   * Get available provider types
   */
  static getAvailableProviders(): string[] {
    return ["flexsearch", "vectra"];
  }
}

// Dynamic exports - providers are loaded on-demand
// export * from "./flexsearch.js";
// export * from "./vectra.js";
