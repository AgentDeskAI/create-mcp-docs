import { JSDOM } from "jsdom";
// @ts-ignore - Mozilla Readability types may not be available
import { Readability } from "@mozilla/readability";

export interface ContentDetectionResult {
  contentSelector: string;
  linkSelector?: string;
  confidence: number;
  fallbacks: string[];
}

export interface HeuristicsConfig {
  url: string;
  html?: string;
  requireLinks?: boolean;
}

/**
 * Common content selectors ordered by specificity and reliability
 */
const CONTENT_SELECTORS = [
  // Semantic HTML5
  "main",
  "article",
  '[role="main"]',

  // Documentation-specific
  ".docs-content",
  ".documentation",
  ".content",
  ".markdown-body",
  ".prose",

  // CMS patterns
  ".entry-content",
  ".post-content",
  ".page-content",

  // Generic containers
  "#content",
  "#main",
  ".container main",
  ".wrapper main",
];

/**
 * Common link selectors for documentation sites
 */
const LINK_SELECTORS = [
  'a[href^="/docs"]',
  'a[href^="/guide"]',
  'a[href^="/tutorial"]',
  'a[href^="/reference"]',
  'a[href^="/api"]',
  "nav a",
  ".sidebar a",
  ".navigation a",
  ".docs-nav a",
  'a[href*="/docs/"]',
  'a[href*="/guide/"]',
];

/**
 * Analyzes a webpage and suggests optimal selectors for content extraction
 */
export async function detectContentSelectors(
  config: HeuristicsConfig
): Promise<ContentDetectionResult> {
  const { url, html, requireLinks = true } = config;

  let dom: JSDOM;

  if (html) {
    dom = new JSDOM(html, { url });
  } else {
    // Fetch the page if HTML not provided
    const response = await fetch(url);
    const pageHtml = await response.text();
    dom = new JSDOM(pageHtml, { url });
  }

  const document = dom.window.document;

  // Try Mozilla Readability first
  const readabilityResult = tryReadability(document, url);

  // Analyze content selectors
  const contentAnalysis = analyzeContentSelectors(document);

  // Analyze link selectors if needed
  const linkAnalysis = requireLinks
    ? analyzeLinkSelectors(document, url)
    : null;

  // Combine results and pick the best option
  const result = combineAnalysis({
    readability: readabilityResult,
    content: contentAnalysis,
    links: linkAnalysis,
    requireLinks,
  });

  return result;
}

/**
 * Uses Mozilla Readability to extract main content
 */
function tryReadability(
  document: Document,
  url: string
): { selector?: string; confidence: number } {
  try {
    const reader = new Readability(document.cloneNode(true) as Document);
    const article = reader.parse();

    if (article && article.content) {
      // Readability was successful, but we need to find a selector
      // This is a fallback approach - we'll use a generic selector with high confidence
      return { selector: "body", confidence: 0.8 };
    }
  } catch (error) {
    console.warn("Readability failed:", error);
  }

  return { confidence: 0 };
}

/**
 * Analyzes potential content selectors by scoring their quality
 */
function analyzeContentSelectors(
  document: Document
): Array<{ selector: string; confidence: number }> {
  const results: Array<{ selector: string; confidence: number }> = [];

  for (const selector of CONTENT_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);

      if (elements.length === 0) continue;

      // Prefer single elements
      if (elements.length > 1) {
        // Multiple elements found, lower confidence
        const confidence = Math.max(0.3, 0.8 - elements.length * 0.1);
        results.push({ selector, confidence });
        continue;
      }

      const element = elements[0];
      const confidence = scoreContentElement(element);

      if (confidence > 0.3) {
        results.push({ selector, confidence });
      }
    } catch (error) {
      // Invalid selector, skip
      continue;
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Scores a content element based on various factors
 */
function scoreContentElement(element: Element): number {
  let score = 0.5; // Base score

  const textContent = element.textContent || "";
  const textLength = textContent.trim().length;

  // Text length scoring
  if (textLength > 500) score += 0.3;
  else if (textLength > 200) score += 0.2;
  else if (textLength < 50) score -= 0.3;

  // Element type scoring
  const tagName = element.tagName.toLowerCase();
  if (["main", "article"].includes(tagName)) score += 0.2;
  if (element.getAttribute("role") === "main") score += 0.2;

  // Class name analysis
  const className = element.className.toLowerCase();
  if (className.includes("content")) score += 0.15;
  if (className.includes("docs") || className.includes("documentation"))
    score += 0.15;
  if (className.includes("markdown") || className.includes("prose"))
    score += 0.1;

  // Navigation/sidebar penalty
  if (
    className.includes("nav") ||
    className.includes("sidebar") ||
    className.includes("menu")
  ) {
    score -= 0.3;
  }

  // Header/footer penalty
  if (["header", "footer", "nav"].includes(tagName)) score -= 0.4;

  return Math.max(0, Math.min(1, score));
}

/**
 * Analyzes potential link selectors for crawling
 */
function analyzeLinkSelectors(
  document: Document,
  baseUrl: string
): Array<{ selector: string; confidence: number }> {
  const results: Array<{ selector: string; confidence: number }> = [];
  const parsedUrl = new URL(baseUrl);

  for (const selector of LINK_SELECTORS) {
    try {
      const links = document.querySelectorAll(selector);

      if (links.length === 0) continue;

      let validLinks = 0;
      let internalLinks = 0;

      for (const link of links) {
        const href = link.getAttribute("href");
        if (!href) continue;

        validLinks++;

        // Check if it's an internal link
        if (href.startsWith("/") || href.includes(parsedUrl.hostname)) {
          internalLinks++;
        }
      }

      if (validLinks === 0) continue;

      // Score based on link quality and quantity
      const internalRatio = internalLinks / validLinks;
      let confidence = 0.5;

      // Prefer selectors with more internal links
      confidence += internalRatio * 0.3;

      // Prefer reasonable number of links (not too few, not too many)
      if (validLinks >= 5 && validLinks <= 50) confidence += 0.2;
      else if (validLinks > 50) confidence -= 0.1;

      results.push({ selector, confidence });
    } catch (error) {
      continue;
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Combines all analysis results to determine the best selectors
 */
function combineAnalysis(analysis: {
  readability: { selector?: string; confidence: number };
  content: Array<{ selector: string; confidence: number }>;
  links: Array<{ selector: string; confidence: number }> | null;
  requireLinks: boolean;
}): ContentDetectionResult {
  const { readability, content, links, requireLinks } = analysis;

  // Pick the best content selector
  let contentSelector = "main"; // fallback
  let confidence = 0.3;
  const fallbacks: string[] = [];

  if (content.length > 0) {
    contentSelector = content[0].selector;
    confidence = content[0].confidence;

    // Add other good options as fallbacks
    fallbacks.push(...content.slice(1, 3).map((c) => c.selector));
  }

  // Add readability fallback if it was successful
  if (readability.confidence > 0.6) {
    fallbacks.unshift("body");
  }

  // Pick the best link selector
  let linkSelector: string | undefined;
  if (links && links.length > 0) {
    linkSelector = links[0].selector;
  } else if (requireLinks) {
    // Provide a reasonable default
    linkSelector = "a[href]";
    confidence *= 0.8; // Lower confidence since we couldn't find good link patterns
  }

  // Ensure we have reasonable fallbacks
  if (fallbacks.length === 0) {
    fallbacks.push("article", ".content", "#content");
  }

  return {
    contentSelector,
    linkSelector,
    confidence,
    fallbacks: [...new Set(fallbacks)], // Remove duplicates
  };
}

/**
 * Validates selectors by testing them on a sample page
 */
export async function validateSelectors(
  url: string,
  contentSelector: string,
  linkSelector?: string
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // Test content selector
    const contentElements = document.querySelectorAll(contentSelector);
    if (contentElements.length === 0) {
      issues.push(`Content selector "${contentSelector}" matches no elements`);
    } else if (contentElements.length > 1) {
      issues.push(
        `Content selector "${contentSelector}" matches ${contentElements.length} elements (prefer single match)`
      );
    } else {
      const content = contentElements[0].textContent?.trim();
      if (!content || content.length < 100) {
        issues.push(
          `Content selector "${contentSelector}" extracts very little text (${
            content?.length || 0
          } characters)`
        );
      }
    }

    // Test link selector if provided
    if (linkSelector) {
      const linkElements = document.querySelectorAll(linkSelector);
      if (linkElements.length === 0) {
        issues.push(`Link selector "${linkSelector}" matches no elements`);
      } else {
        const validLinks = Array.from(linkElements).filter((el) =>
          el.getAttribute("href")
        );
        if (validLinks.length === 0) {
          issues.push(
            `Link selector "${linkSelector}" matches elements but none have href attributes`
          );
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  } catch (error) {
    return {
      valid: false,
      issues: [
        `Failed to validate selectors: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
    };
  }
}
