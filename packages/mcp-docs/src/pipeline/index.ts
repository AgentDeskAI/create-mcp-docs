import { PlaywrightCrawler } from "crawlee";
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import micromatch from "micromatch";
import { IndexerConfig, Doc } from "../types.js";

/**
 * Clean document extraction pipeline
 *
 * Separates crawling, parsing, and content processing from indexing.
 * This allows any search provider to work with the same processed documents.
 */

/**
 * Extract and process documents from configured pages
 *
 * @param config - Indexer configuration (without provider-specific settings)
 * @returns Promise resolving to array of processed documents
 */
export async function extractDocuments(config: IndexerConfig): Promise<Doc[]> {
  console.log("🕷️  Starting document extraction...");

  const documents: Doc[] = [];

  // Normalize page configurations
  const normalizedPages = config.pages.map((pageConfigRaw) => {
    const pageConfig =
      typeof pageConfigRaw === "string"
        ? { url: pageConfigRaw, mode: "crawl" as const }
        : pageConfigRaw;

    return {
      ...pageConfig,
      mode: pageConfig.mode || "crawl",
      selectors: pageConfig.selectors ||
        config.selectors || {
          links: "a[href]",
          content: "main",
        },
      crawler: { ...config.crawler, ...pageConfig.crawler },
      content: { ...config.content, ...pageConfig.content },
    };
  });

  // Setup crawler with sensible defaults
  const crawlerConfig = {
    maxRequestsPerCrawl: 500,
    maxConcurrency: 5,
    minConcurrency: 1,
    maxRequestRetries: 3,
    maxRequestsPerMinute: 120,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 60,
    sameDomainDelaySecs: 0,
    headless: true,
    useSessionPool: false,
    retryOnBlocked: false,
    persistCookiesPerSession: false,
    ignoreIframes: false,
    ignoreShadowRoots: false,
    ...config.crawler,
  };

  // Create page configuration lookup map
  const pageConfigMap = new Map();
  normalizedPages.forEach((config) => {
    pageConfigMap.set(config.url, config);
  });

  // Configure the Playwright crawler
  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: crawlerConfig.maxRequestsPerCrawl,
    maxConcurrency: crawlerConfig.maxConcurrency,
    minConcurrency: crawlerConfig.minConcurrency,
    maxRequestRetries: crawlerConfig.maxRequestRetries,
    maxRequestsPerMinute: crawlerConfig.maxRequestsPerMinute,
    navigationTimeoutSecs: crawlerConfig.navigationTimeoutSecs,
    requestHandlerTimeoutSecs: crawlerConfig.requestHandlerTimeoutSecs,
    sameDomainDelaySecs: crawlerConfig.sameDomainDelaySecs,
    headless: crawlerConfig.headless,
    useSessionPool: crawlerConfig.useSessionPool,
    retryOnBlocked: crawlerConfig.retryOnBlocked,
    persistCookiesPerSession: crawlerConfig.persistCookiesPerSession,
    ignoreIframes: crawlerConfig.ignoreIframes,
    ignoreShadowRoots: crawlerConfig.ignoreShadowRoots,

    async requestHandler({ request, page, log }) {
      log.info(`📄 Processing: ${request.url}`);

      try {
        // Find configuration for this URL
        let pageConfig = pageConfigMap.get(request.url);
        if (!pageConfig) {
          for (const [configUrl, config] of pageConfigMap.entries()) {
            if (request.url.startsWith(configUrl)) {
              pageConfig = config;
              break;
            }
          }
        }

        if (!pageConfig) {
          pageConfig = {
            mode: "crawl",
            selectors: config.selectors || {
              links: "a[href]",
              content: "main",
            },
            content: config.content || {},
          };
        }

        // Apply content filtering
        const excludePatterns = pageConfig.content?.excludePatterns || [];
        const includePatterns = pageConfig.content?.includePatterns || [];
        const urlPath = new URL(request.url).pathname;

        if (
          excludePatterns.length > 0 &&
          micromatch.isMatch(urlPath, excludePatterns)
        ) {
          log.info(`⏭️  Skipping excluded URL: ${request.url}`);
          return;
        }

        if (
          includePatterns.length > 0 &&
          !micromatch.isMatch(urlPath, includePatterns)
        ) {
          log.info(`⏭️  Skipping URL not in include patterns: ${request.url}`);
          return;
        }

        // Wait for dynamic content if specified
        if (pageConfig.waitForSelector) {
          try {
            await page.waitForSelector(pageConfig.waitForSelector, {
              timeout: pageConfig.waitTime || 10000,
            });
          } catch (error) {
            log.warning(`⏰ Wait selector timed out for ${request.url}`);
          }
        }

        // Extract content
        const htmlContent = await extractContentFromPage(
          page,
          pageConfig.selectors.content,
          log
        );

        if (!htmlContent || htmlContent.trim().length < 50) {
          throw new Error(`No content found on ${request.url}`);
        }

        // Convert to markdown
        const markdownContent = await convertToMarkdown(
          htmlContent,
          pageConfig.content
        );

        // Add to documents collection
        documents.push({
          url: request.url,
          content: markdownContent,
        });

        // Discover new links for crawling
        if (pageConfig.mode === "crawl" && pageConfig.selectors.links) {
          await discoverNewLinks(
            page,
            pageConfig.selectors.links,
            request.url,
            crawler
          );
        }
      } catch (error) {
        log.error(`❌ Error processing ${request.url}:`, error as Error);
        throw error;
      }
    },
  });

  // Start crawling
  const initialPages = normalizedPages.map((config) => config.url);
  await crawler.run(initialPages);

  console.log(`✅ Extracted ${documents.length} documents`);
  return documents;
}

/**
 * Extract content from a page using various fallback strategies
 */
async function extractContentFromPage(
  page: any,
  contentSelectors: string | string[],
  log: any
): Promise<string> {
  const selectors = Array.isArray(contentSelectors)
    ? contentSelectors
    : [contentSelectors];

  // Try configured selectors first
  for (const selector of selectors) {
    try {
      const content = await page.locator(selector).innerHTML({ timeout: 3000 });
      if (content && content.trim().length > 100) {
        log.info(`✅ Found content using selector: ${selector}`);
        return content;
      }
    } catch (e) {
      log.debug(`❌ Selector "${selector}" failed`);
    }
  }

  // Try common fallback selectors
  const fallbackSelectors = [
    "article",
    ".content",
    ".main-content",
    ".documentation",
    ".docs",
    ".container main",
    '[role="main"]',
    "#main",
    "#content",
    "main",
  ];

  for (const selector of fallbackSelectors) {
    try {
      const content = await page.locator(selector).innerHTML({ timeout: 2000 });
      if (content && content.trim().length > 100) {
        log.info(`✅ Found content using fallback: ${selector}`);
        return content;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  // Try Mozilla Readability as last resort
  try {
    log.info(`🔍 Trying Readability extraction...`);
    const fullHtml = await page.content();
    const dom = new JSDOM(fullHtml);
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.content) {
      log.info(`✅ Found content using Readability`);
      return article.content;
    }
  } catch (e) {
    log.warning(`❌ Readability extraction failed: ${e}`);
  }

  throw new Error("No content could be extracted");
}

/**
 * Convert HTML content to clean markdown
 */
async function convertToMarkdown(
  htmlContent: string,
  contentConfig: any = {}
): Promise<string> {
  const turndownService = new TurndownService({
    headingStyle: contentConfig?.turndownOptions?.headingStyle || "atx",
    bulletListMarker: contentConfig?.turndownOptions?.bulletListMarker || "-",
    codeBlockStyle: contentConfig?.turndownOptions?.codeBlockStyle || "fenced",
    emDelimiter: contentConfig?.turndownOptions?.emDelimiter || "_",
    strongDelimiter: contentConfig?.turndownOptions?.strongDelimiter || "**",
    linkStyle: contentConfig?.turndownOptions?.linkStyle || "inlined",
    linkReferenceStyle:
      contentConfig?.turndownOptions?.linkReferenceStyle || "full",
  });

  // Preserve link text for better search indexing
  turndownService.addRule("preserveLinkText", {
    filter: "a",
    replacement: function (content, node) {
      const element = node as HTMLElement;
      const href = element.getAttribute("href");

      if (
        href &&
        (href.startsWith("/") || href.startsWith("#")) &&
        content.trim()
      ) {
        return content; // Just return the text for internal links
      }

      return content ? `[${content}](${href})` : "";
    },
  });

  return turndownService.turndown(htmlContent);
}

/**
 * Discover and enqueue new links for crawling
 */
async function discoverNewLinks(
  page: any,
  linkSelector: string,
  currentUrl: string,
  crawler: any
): Promise<void> {
  const links = await page
    .locator(linkSelector)
    .evaluateAll((linkElements: HTMLAnchorElement[]) =>
      linkElements.map((a) => a.href)
    );

  const baseUrl = currentUrl.split("/").slice(0, 3).join("/");

  for (const link of links) {
    if (
      link.startsWith(baseUrl) ||
      (link.startsWith("/") && !link.startsWith("//"))
    ) {
      await crawler.addRequests([link]);
    }
  }
}
