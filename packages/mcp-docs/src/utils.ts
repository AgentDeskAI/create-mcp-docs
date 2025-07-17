import { fileURLToPath } from "url";
import path from "path";

/**
 * Gets the directory name of the current ES module.
 * This is a common replacement for the `__dirname` global variable in CommonJS modules.
 * @param metaUrl - Pass `import.meta.url` from the calling module.
 * @returns The directory path of the module.
 *
 * @example
 * ```typescript
 * import { getModuleDir } from '@agentdesk/mcp-docs';
 * const currentDir = getModuleDir(import.meta.url);
 * ```
 */
export function getModuleDir(metaUrl: string): string {
  const filename = fileURLToPath(metaUrl);
  return path.dirname(filename);
}

/**
 * Parses command-line arguments to extract configuration values.
 * Currently supports extracting an API key.
 *
 * @param argv - The `process.argv` array.
 * @returns An object containing the parsed configuration, e.g., { apiKey: '...' }.
 *
 * @example
 * ```typescript
 * import { getConfigFromArgs } from '@agentdesk/mcp-docs';
 * const config = getConfigFromArgs(process.argv);
 * const apiKey = config.apiKey;
 * ```
 */
export function getConfig(argv: string[]): { apiKey?: string } {
  const apiKey = argv
    .find((arg) => arg.startsWith("OPENAI_API_KEY="))
    ?.split("=")[1];

  return { apiKey };
}
