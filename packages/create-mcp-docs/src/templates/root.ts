export function generateRootPackageJson(): string {
  const packageJson = {
    name: "mcp-docs-monorepo",
    version: "0.1.0",
    private: true,
    scripts: {
      "build:all": "pnpm -r build",
      dev: "pnpm -r dev",
      test: "pnpm -r test",
    },
    devDependencies: {
      typescript: "^5.0.4",
    },
  };

  return JSON.stringify(packageJson, null, 2);
}

export function generateWorkspaceFile(): string {
  return `packages:
  - "packages/*"
`;
}

export function generateRootReadme(): string {
  return `# MCP Documentation Servers

This monorepo contains MCP (Model Context Protocol) documentation servers.

## Structure

- \`packages/\` - Individual MCP server packages

## Development

Install dependencies for all packages:
\`\`\`bash
pnpm install
\`\`\`

Build all packages:
\`\`\`bash
pnpm build:all
\`\`\`

## Adding New Documentation Servers

Use the create-mcp-docs CLI to add new documentation servers to this monorepo.

## Learn More

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Documentation](https://docs.modelcontextprotocol.io/)
`;
}

export function generateRootGitignore(): string {
  return `node_modules/
dist/
*.log
.env
.DS_Store
docs-index.json
*.tgz
`;
}
