import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generatePackageJson } from "../templates/package.json.js";
import { generateTsConfig } from "../templates/tsconfig.js";
import { generateEnvFile } from "../templates/env.js";
import { generateBuildIndexFile } from "../templates/build-index.js";
import { generateServerFile } from "../templates/server.js";
import { generateReadme } from "../templates/readme.js";
import {
  generateRootPackageJson,
  generateWorkspaceFile,
  generateRootReadme,
  generateRootGitignore,
} from "../templates/root.js";
import {
  githubWorkflowTemplate,
  docsRepoWorkflowTemplate,
  setupInstructionsTemplate,
} from "../templates/automation.js";
import { SearchProvider } from "../types.js";

// --- Robust Environment Detection ---

// Check if we're running in the actual create-mcp-docs workspace
// by looking for the pnpm-workspace.yaml file that defines this as a monorepo
function isInWorkspace(): boolean {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  // Walk up the directory tree looking for pnpm-workspace.yaml
  let dir = currentDir;
  for (let i = 0; i < 10; i++) {
    // Limit search depth
    try {
      const workspaceFile = path.join(dir, "pnpm-workspace.yaml");
      if (
        readFileSync(workspaceFile, "utf-8").includes(
          "packages/create-mcp-docs"
        )
      ) {
        return true;
      }
    } catch {
      // File doesn't exist, continue searching
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break; // Reached root
    dir = parentDir;
  }
  return false;
}

const IS_LOCAL_DEVELOPMENT = isInWorkspace();

export interface TemplateConfig {
  projectName: string;
  description?: string;
  urls: string[];
  contentSelector?: string;
  linkSelector?: string;
  excludePatterns?: string[];
  includePatterns?: string[];
  isLocalDevelopment?: boolean; // Add flag for local testing
  providerType?: SearchProvider;
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/[-\s]+/g, "_")
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

export interface ProjectTemplate {
  name: string;
  description: string;
  files: Record<string, string>;
  rootFiles: Record<string, string>; // Add root files
}

export function getProjectTemplate(config: TemplateConfig): ProjectTemplate {
  const configWithLocalFlag = {
    ...config,
    isLocalDevelopment: IS_LOCAL_DEVELOPMENT,
  };

  return {
    name: config.projectName,
    description:
      config.description ||
      `MCP documentation server for ${config.projectName}`,
    files: {
      "package.json": generatePackageJson(configWithLocalFlag),
      "tsconfig.json": generateTsConfig(),
      ".env": generateEnvFile(),
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
      "automation-examples/github-workflows/auto-publish.yml":
        githubWorkflowTemplate,
      "automation-examples/SETUP.md": setupInstructionsTemplate,
      "automation-examples/docs-repo-trigger.yml": docsRepoWorkflowTemplate,
    },
    rootFiles: {
      "package.json": generateRootPackageJson(),
      "pnpm-workspace.yaml": generateWorkspaceFile(),
      "README.md": generateRootReadme(),
      ".gitignore": generateRootGitignore(),
    },
  };
}
