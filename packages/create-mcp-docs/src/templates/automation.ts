export const githubWorkflowTemplate = `name: Auto-publish MCP Server on Docs Update
on:
  repository_dispatch:
    types: [docs-updated]
  workflow_dispatch: # Allow manual trigger

jobs:
  rebuild-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
          
      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest
          
      - name: Install dependencies
        run: pnpm install
        
      - name: Rebuild docs index
        run: pnpm build
        
      - name: Check if docs index changed
        id: changes
        run: |
          git add dist/docs-index.json
          if ! git diff --cached --quiet; then
            echo "changed=true" >> $GITHUB_OUTPUT
            echo "📚 Docs index has changes"
          else
            echo "changed=false" >> $GITHUB_OUTPUT
            echo "📚 No changes to docs index"
          fi
          
      - name: Bump patch version and publish
        if: steps.changes.outputs.changed == 'true'
        run: |
          npm version patch --no-git-tag-version
          npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
          
      - name: Commit and tag version
        if: steps.changes.outputs.changed == 'true'
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add package.json dist/docs-index.json
          VERSION=$(node -p "require('./package.json').version")
          git commit -m "docs: update index to v$VERSION"
          git tag "v$VERSION"
          git push origin main --tags
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

export const docsRepoWorkflowTemplate = `name: Trigger MCP Server Update
on:
  push:
    branches: [main]
    paths: 
      - 'docs/**'
      - '**/*.md'
      - '**/*.mdx'

jobs:
  trigger-mcp-update:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger MCP Server Rebuild
        uses: peter-evans/repository-dispatch@v3
        with:
          token: \${{ secrets.MCP_TRIGGER_TOKEN }}
          repository: YOUR_ORG/YOUR_MCP_SERVER_REPO
          event-type: docs-updated
          client-payload: |
            {
              "docs_commit": "\${{ github.sha }}",
              "docs_branch": "\${{ github.ref_name }}",
              "triggered_by": "\${{ github.actor }}"
            }
`;

export const setupInstructionsTemplate = `# 🤖 Auto-Publishing Setup

Your MCP server can automatically republish when your documentation changes!

## 📋 Setup Steps

### 1. In your MCP Server Repository

1. Add the provided GitHub workflow: \`automation-examples/github-workflows/auto-publish.yml\`
2. Add these repository secrets:
   - \`NPM_TOKEN\`: Your npm publish token
   - \`GITHUB_TOKEN\`: Automatically available

### 2. In your Documentation Repository (Optional)

1. Add the provided GitHub workflow: \`.github/workflows/trigger-mcp-update.yml\`
2. Update \`YOUR_ORG/YOUR_MCP_SERVER_REPO\` with your actual repository
3. Add repository secret:
   - \`MCP_TRIGGER_TOKEN\`: GitHub personal access token with \`repo\` scope

### 3. NPM Token Setup

1. Go to [npmjs.com](https://www.npmjs.com) → Profile → Access Tokens
2. Create "Automation" token
3. Add as \`NPM_TOKEN\` secret in your MCP repo

## 🚀 How It Works

- **Docs change** → Triggers workflow → **Auto-publishes new MCP version**
- **Patch version bump** (1.0.0 → 1.0.1) for docs-only changes
- **Manual control** via \`workflow_dispatch\` if needed

## 🧪 Testing

Test the automation:
\`\`\`bash
# Trigger manually first
gh workflow run auto-publish.yml

# Or make a docs change and push
\`\`\`
`;
