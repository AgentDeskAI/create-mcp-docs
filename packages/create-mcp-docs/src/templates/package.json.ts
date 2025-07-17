import { createRequire } from "module";
import { readFileSync } from "fs";
import { TemplateConfig } from "../utils/templates.js";
const require = createRequire(import.meta.url);

function getMcpDocsVersion(): string {
  try {
    const mcpDocsPackageJsonPath = require.resolve(
      "@agentdesk/mcp-docs/package.json"
    );
    const mcpDocsPackageJson = JSON.parse(
      readFileSync(mcpDocsPackageJsonPath, "utf-8")
    );
    return mcpDocsPackageJson.version;
  } catch (error) {
    // Fallback version if package can't be resolved (e.g., not yet published)
    console.warn(
      "Could not resolve @agentdesk/mcp-docs version, using fallback"
    );
    return "0.1.0";
  }
}

export function generatePackageJson(config: TemplateConfig): string {
  // Set dependency based on environment
  let mcpDocsDep: string;

  if (config.isLocalDevelopment) {
    // For local monorepo development, use workspace dependency
    mcpDocsDep = "workspace:*";
  } else {
    // For published packages, use version range
    mcpDocsDep = `^${getMcpDocsVersion()}`;
  }

  const packageJson = {
    name: `${config.projectName}-mcp-docs`,
    version: "0.1.0",
    description:
      config.description ||
      `MCP documentation server for ${config.projectName}`,
    main: "dist/server.js",
    type: "module",
    files: ["dist/**/*", "README.md"],
    scripts: {
      build: "tsc && node dist/build-index.js",
      "build:index": "node dist/build-index.js",
      "build:server": "tsc",
      dev: "tsc --watch",
      start: "node dist/server.js",
      test: "vitest",
    },
    dependencies: {
      "@agentdesk/mcp-docs": mcpDocsDep,
      "@modelcontextprotocol/sdk": "^1.15.1",
      zod: "^3.23.8",
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      typescript: "^5.0.4",
      vitest: "^1.0.0",
    },
  };

  return JSON.stringify(packageJson, null, 2);
}
