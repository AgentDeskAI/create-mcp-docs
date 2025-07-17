#!/usr/bin/env tsx

/**
 * Test script to validate FlexSearch improvements
 *
 * This script tests the improved search functionality, specifically
 * checking if "rate limiting" queries now work correctly.
 *
 * Run with: npx tsx test-search.ts
 */

import { KnowledgeBase } from "./src/index.js";
import path from "path";

async function testSearch() {
  console.log("🔍 Testing FlexSearch improvements...\n");

  // Test with AgentKit docs
  const agentKitDocs = new KnowledgeBase({
    index: path.join(process.cwd(), "../agentkit-docs/docs-index.json"),
  });

  // Test queries that should work better now
  const testQueries = [
    "rate limiting",
    "concurrency per user",
    "multitenancy",
    "throttling",
    "steps",
    "workflows",
  ];

  for (const query of testQueries) {
    console.log(`\n🧪 Testing query: "${query}"`);
    console.log("=".repeat(50));

    try {
      // Run debug search to see detailed results
      await agentKitDocs.debugSearch(query);

      // Also run the normal search to see final results
      const results = await agentKitDocs.search({ query, tokenLimit: 2000 });

      console.log(`\nFinal search result (first 300 chars):`);
      console.log(results.substring(0, 300));
      console.log(results.length > 300 ? "..." : "");
    } catch (error) {
      console.error(`❌ Error testing "${query}":`, error);
    }

    console.log("\n" + "=".repeat(50));
  }

  console.log("\n✅ Search testing complete!");
}

// Handle both direct execution and module import
if (import.meta.url === `file://${process.argv[1]}`) {
  testSearch().catch(console.error);
}

export { testSearch };
