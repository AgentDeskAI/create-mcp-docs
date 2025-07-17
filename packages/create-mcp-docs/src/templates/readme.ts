import { TemplateConfig } from "../utils/templates.js";
import { toSnakeCase } from "../utils/templates.js";

export function generateReadme(config: TemplateConfig): string {
  const toolName = toSnakeCase(config.projectName);

  const localDevSection = config.isLocalDevelopment
    ? `

## Local Development Setup

Since you're developing locally, this package uses workspace dependencies (\`workspace:*\`).

Simply install dependencies from the workspace root:

\`\`\`bash
# From the workspace root
pnpm install
\`\`\`

The \`@agentdesk/mcp-docs\` dependency will automatically link to your local version.

`
    : "";

  return `# ${config.projectName}

${config.description || `MCP documentation server for ${config.projectName}`}

This MCP server provides search capabilities for the following documentation sources:

${config.urls.map((url) => `- [${url}](${url})`).join("\n")}
${localDevSection}
## Setup

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Build the documentation index:
   \`\`\`bash
   pnpm build:index
   \`\`\`

3. Build the server:
   \`\`\`bash
   pnpm build:server
   \`\`\`

## Usage

Start the MCP server:

\`\`\`bash
pnpm start
\`\`\`

## Available Tools

### search_${toolName}_docs

Search through the documentation.

**Parameters:**
- \`query\` (string, required): Search query
- \`limit\` (number, optional): Maximum number of results (default: 10)

**Example:**
\`\`\`json
{
  "name": "search_${toolName}_docs",
  "arguments": {
    "query": "authentication",
    "limit": 5
  }
}
\`\`\`

## Configuration

The documentation sources and selectors are configured in \`src/build-index.ts\`. You can modify:

- URLs to crawl
- CSS selectors for content extraction
- Exclude/include patterns
- Crawler settings

After making changes, rebuild the index with \`pnpm build:index\`.

## 🤖 Automation

### 🚀 Quick Setup

To enable automation, choose your platform:

**GitHub Actions:**
\`\`\`bash
# Copy the workflow file
mkdir -p .github/workflows
cp automation-examples/github-workflows/auto-publish.yml .github/workflows/

# Set up repository secrets (see automation-examples/SETUP.md)
\`\`\`

**GitLab CI/Other:**
\`\`\`bash
# Use the examples as templates
# See automation-examples/SETUP.md for full instructions
\`\`\`

### Files Included
- \`automation-examples/github-workflows/auto-publish.yml\` - GitHub Actions workflow
- \`automation-examples/docs-repo-trigger.yml\` - Documentation repo trigger workflow
- \`automation-examples/SETUP.md\` - Complete setup instructions

### Optional: Keep It Simple
You can also ignore the automation entirely and manually republish when needed:
\`\`\`bash
pnpm build && npm publish
\`\`\`

This ensures your MCP server always has the latest documentation without manual intervention!
## �� Automation



`;
}
