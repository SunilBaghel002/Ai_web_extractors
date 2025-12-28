/**
 * Code Extraction from Various Platforms
 * StackOverflow, GitLab, CodePen, etc.
 */

import { PlaywrightCrawler } from "crawlee";

// ============================================================
// PLATFORM DETECTION
// ============================================================

export function detectCodePlatform(url) {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes("github.com")) return "github";
  if (hostname.includes("gitlab.com")) return "gitlab";
  if (hostname.includes("bitbucket.org")) return "bitbucket";
  if (
    hostname.includes("stackoverflow.com") ||
    hostname.includes("stackexchange.com")
  )
    return "stackoverflow";
  if (hostname.includes("codepen.io")) return "codepen";
  if (hostname.includes("jsfiddle.net")) return "jsfiddle";
  if (hostname.includes("replit.com")) return "replit";
  if (hostname.includes("codesandbox.io")) return "codesandbox";
  if (hostname.includes("gist.github.com")) return "gist";

  return "website";
}

/**
 * Check if URL is a code platform
 */
export function isCodePlatform(url) {
  const platform = detectCodePlatform(url);
  return platform !== "website";
}

/**
 * Extract code content from page (unified interface)
 * This works with the page object directly
 */
export async function extractCodeContent(page, url) {
  const platform = detectCodePlatform(url);

  console.log(`📂 Detected platform: ${platform}`);

  try {
    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    switch (platform) {
      case "stackoverflow":
        return await extractFromStackOverflowPage(page, url);
      case "github":
      case "gist":
        return await extractFromGitHubPage(page, url);
      default:
        return await extractCodeFromWebsitePage(page, url);
    }
  } catch (error) {
    console.error(`Error extracting code: ${error.message}`);
    return null;
  }
}

/**
 * Extract from StackOverflow (page-based)
 */
async function extractFromStackOverflowPage(page, url) {
  const data = await page.evaluate(() => {
    // Get question
    const questionTitle =
      document.querySelector("#question-header h1")?.innerText?.trim() || "";
    const questionBody =
      document.querySelector(".question .s-prose")?.innerText?.trim() || "";

    // Get code from question
    const questionCode = [];
    document.querySelectorAll(".question .s-prose pre code").forEach((code) => {
      const text = code.innerText?.trim();
      if (text && text.length > 10) {
        questionCode.push({
          code: text,
          language:
            code.className
              .replace("language-", "")
              .replace("hljs", "")
              .trim() || "unknown",
        });
      }
    });

    // Get answers with code
    const answers = [];
    document.querySelectorAll(".answer").forEach((answer) => {
      const isAccepted = answer.classList.contains("accepted-answer");
      const votes = parseInt(
        answer.querySelector(".js-vote-count")?.innerText || "0"
      );

      const answerCode = [];
      answer.querySelectorAll(".s-prose pre code").forEach((code) => {
        const text = code.innerText?.trim();
        if (text && text.length > 10) {
          answerCode.push({
            code: text,
            language:
              code.className
                .replace("language-", "")
                .replace("hljs", "")
                .trim() || "unknown",
          });
        }
      });

      if (answerCode.length > 0) {
        answers.push({
          code: answerCode,
          isAccepted,
          votes,
        });
      }
    });

    // Get tags
    const tags = [];
    document.querySelectorAll(".post-tag").forEach((tag) => {
      tags.push(tag.innerText);
    });

    return {
      title: questionTitle,
      question: questionBody.substring(0, 1000),
      questionCode,
      answers: answers.sort((a, b) => b.votes - a.votes),
      tags,
    };
  });

  // Combine all code
  const allCode = [
    ...data.questionCode.map(
      (c) => `// Question Code (${c.language})\n${c.code}`
    ),
    ...data.answers.flatMap((a, i) =>
      a.code.map(
        (c) =>
          `// Answer ${i + 1} (${c.language})${a.isAccepted ? " [ACCEPTED]" : ""}\n${c.code}`
      )
    ),
  ].join("\n\n// ---\n\n");

  return {
    name: data.title,
    type: "stackoverflow",
    title: data.title,
    question: data.question,
    tags: data.tags,
    code: allCode,
    codeBlocks: [...data.questionCode, ...data.answers.flatMap((a) => a.code)],
    answers: data.answers,
    metadata: {
      answerCount: data.answers.length,
      hasAcceptedAnswer: data.answers.some((a) => a.isAccepted),
      languages: [
        ...new Set([
          ...data.questionCode.map((c) => c.language),
          ...data.answers.flatMap((a) => a.code.map((c) => c.language)),
        ]),
      ],
    },
  };
}

/**
 * Extract from GitHub (page-based)
 */
async function extractFromGitHubPage(page, url) {
  const data = await page.evaluate(() => {
    const result = {
      type: "github",
      repository: {},
      files: [],
      readme: null,
      codeBlocks: [],
    };

    // Repository info
    const repoName =
      document.querySelector('strong[itemprop="name"] a')?.innerText?.trim() ||
      document.querySelector("h1 strong a")?.innerText?.trim();
    const repoOwner =
      document.querySelector('span[itemprop="author"] a')?.innerText?.trim() ||
      document.querySelector("h1 a")?.innerText?.trim();
    const description = document
      .querySelector('p[itemprop="description"]')
      ?.innerText?.trim();

    result.repository = {
      name: repoName,
      owner: repoOwner,
      fullName: repoOwner && repoName ? `${repoOwner}/${repoName}` : null,
      description,
      url: window.location.href,
    };

    // Extract README content
    const readmeElement =
      document.querySelector('article[itemprop="text"]') ||
      document.querySelector(".markdown-body") ||
      document.querySelector("#readme");

    if (readmeElement) {
      result.readme = {
        text: readmeElement.innerText.trim(),
      };
    }

    // Extract file content (if viewing a file)
    const fileContent =
      document.querySelector(".blob-wrapper table") ||
      document.querySelector(".react-code-lines");

    if (fileContent) {
      const fileName =
        document.querySelector(".final-path")?.innerText?.trim() ||
        document.querySelector("strong.final-path")?.innerText?.trim();
      const language = fileName?.split(".").pop();

      const codeLines = [];

      const lineElements =
        fileContent.querySelectorAll("tr") ||
        fileContent.querySelectorAll(".react-code-text");

      lineElements.forEach((line) => {
        const codeCell =
          line.querySelector("td.blob-code") ||
          line.querySelector(".react-line-number + span");
        if (codeCell) {
          codeLines.push(codeCell.innerText);
        }
      });

      if (codeLines.length > 0) {
        result.files.push({
          name: fileName,
          language,
          content: codeLines.join("\n"),
          lines: codeLines.length,
        });
      }
    }

    // Extract code blocks from README
    document.querySelectorAll("pre code, .highlight").forEach((codeBlock) => {
      const code = codeBlock.innerText.trim();
      if (code.length > 10) {
        const language =
          codeBlock.className.match(/language-(\w+)/)?.[1] ||
          codeBlock.className.match(/highlight-source-(\w+)/)?.[1] ||
          "plaintext";

        result.codeBlocks.push({
          language,
          code,
          lines: code.split("\n").length,
        });
      }
    });

    return result;
  });

  return data;
}

/**
 * Extract code from generic website (page-based)
 */
async function extractCodeFromWebsitePage(page, url) {
  const data = await page.evaluate(() => {
    const title =
      document.querySelector("h1")?.innerText?.trim() ||
      document.title ||
      "Untitled";

    // Common code block selectors
    const codeSelectors = [
      "pre code",
      "pre.code",
      ".highlight code",
      ".code-block",
      '[class*="language-"]',
      ".CodeMirror-code",
      ".ace_content",
      'code[class*="language"]',
      ".prism-code",
      ".hljs",
    ];

    const codeBlocks = [];
    const seen = new Set();

    codeSelectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const code = el.innerText?.trim();
          if (code && code.length > 20) {
            const hash = code.substring(0, 100);
            if (!seen.has(hash)) {
              seen.add(hash);

              let language = "unknown";
              const classMatch = el.className.match(/language-(\w+)/);
              if (classMatch) {
                language = classMatch[1];
              }

              codeBlocks.push({
                code,
                language,
                length: code.length,
              });
            }
          }
        });
      } catch (e) {
        // Ignore selector errors
      }
    });

    return { title, codeBlocks };
  });

  if (data.codeBlocks.length === 0) {
    return null;
  }

  const allCode = data.codeBlocks
    .map((b) => `// ${b.language}\n${b.code}`)
    .join("\n\n// ---\n\n");

  return {
    name: data.title,
    type: "website",
    title: data.title,
    code: allCode,
    codeBlocks: data.codeBlocks,
    metadata: {
      totalCodeBlocks: data.codeBlocks.length,
      languages: [...new Set(data.codeBlocks.map((b) => b.language))],
    },
  };
}

// ============================================================
// STACKOVERFLOW EXTRACTION (URL-based - legacy)
// ============================================================

export async function extractFromStackOverflow(url) {
  let result = null;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    headless: true,
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ page }) {
      result = await extractFromStackOverflowPage(page, url);
    },
  });

  await crawler.run([url]);
  return result;
}

// ============================================================
// GENERIC CODE EXTRACTION FROM WEBSITES (URL-based - legacy)
// ============================================================

export async function extractCodeFromWebsite(url) {
  let result = null;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    headless: true,
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ page }) {
      result = await extractCodeFromWebsitePage(page, url);
    },
  });

  await crawler.run([url]);
  return result;
}
