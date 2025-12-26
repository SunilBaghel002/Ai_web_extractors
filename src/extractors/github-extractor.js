/**
 * GitHub Repository and Code Extractor
 * Works with or without GitHub token
 */

import "dotenv/config";

// ============================================================
// GITHUB URL PARSER
// ============================================================

export function parseGitHubUrl(url) {
  const patterns = {
    // https://github.com/owner/repo
    repo: /github\.com\/([^\/]+)\/([^\/]+)\/?$/,
    // https://github.com/owner/repo/tree/branch/path
    tree: /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/?(.*)?/,
    // https://github.com/owner/repo/blob/branch/path
    blob: /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.*)/,
    // https://raw.githubusercontent.com/owner/repo/branch/path
    raw: /raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.*)/,
    // https://gist.github.com/owner/gistId
    gist: /gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    const match = url.match(pattern);
    if (match) {
      return {
        type,
        owner: match[1],
        repo: match[2],
        branch: match[3] || "main",
        path: match[4] || "",
        url,
      };
    }
  }

  return null;
}

// ============================================================
// MAIN EXTRACTION FUNCTION
// ============================================================

export async function extractFromGitHub(url, options = {}) {
  const {
    maxFiles = 50,
    extensions = [
      ".js",
      ".ts",
      ".py",
      ".jsx",
      ".tsx",
      ".java",
      ".go",
      ".rs",
      ".rb",
      ".php",
      ".c",
      ".cpp",
      ".h",
      ".md",
      ".json",
    ],
    includeTests = false,
  } = options;

  const parsed = parseGitHubUrl(url);

  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  console.log(`   📂 GitHub ${parsed.type}: ${parsed.owner}/${parsed.repo}`);

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AI-Web-Extractor/1.0",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  switch (parsed.type) {
    case "repo":
    case "tree":
      return await extractRepository(parsed, headers, {
        maxFiles,
        extensions,
        includeTests,
      });
    case "blob":
      return await extractSingleFile(parsed, headers);
    case "raw":
      return await extractRawFile(parsed);
    case "gist":
      return await extractGist(parsed, headers);
    default:
      throw new Error(`Unsupported GitHub URL type: ${parsed.type}`);
  }
}

// ============================================================
// REPOSITORY EXTRACTION
// ============================================================

async function extractRepository(parsed, headers, options) {
  const { owner, repo, branch, path } = parsed;
  const { maxFiles, extensions, includeTests } = options;

  // Get repo info
  let repoInfo = { name: repo, fullName: `${owner}/${repo}` };

  try {
    const infoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers }
    );
    if (infoResponse.ok) {
      const data = await infoResponse.json();
      repoInfo = {
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        language: data.language,
        stars: data.stargazers_count,
        forks: data.forks_count,
        topics: data.topics || [],
        defaultBranch: data.default_branch,
        license: data.license?.name,
      };
    }
  } catch (e) {
    console.log(`   ⚠️ Could not fetch repo info`);
  }

  // Get file tree
  const files = [];
  const treeBranch = branch || repoInfo.defaultBranch || "main";

  try {
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeBranch}?recursive=1`,
      { headers }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch tree: ${treeResponse.status}`);
    }

    const treeData = await treeResponse.json();

    // Filter files
    const codeFiles = treeData.tree.filter((item) => {
      if (item.type !== "blob") return false;

      const ext = "." + item.path.split(".").pop()?.toLowerCase();
      if (!extensions.includes(ext)) return false;

      // Skip test files if not wanted
      if (!includeTests) {
        const lowPath = item.path.toLowerCase();
        if (
          lowPath.includes("test") ||
          lowPath.includes("spec") ||
          lowPath.includes("__tests__")
        ) {
          return false;
        }
      }

      // Skip common non-source directories
      if (
        item.path.includes("node_modules/") ||
        item.path.includes("dist/") ||
        item.path.includes("build/") ||
        item.path.includes(".min.") ||
        item.path.includes("vendor/")
      ) {
        return false;
      }

      return true;
    });

    console.log(`   📄 Found ${codeFiles.length} code files`);

    // Fetch file contents
    const filesToFetch = codeFiles.slice(0, maxFiles);

    for (const file of filesToFetch) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${treeBranch}/${file.path}`;
        const fileResponse = await fetch(rawUrl);

        if (fileResponse.ok) {
          const content = await fileResponse.text();
          files.push({
            path: file.path,
            name: file.path.split("/").pop(),
            content,
            size: content.length,
            language: detectLanguage(file.path),
          });
        }
      } catch (e) {
        console.log(`   ⚠️ Could not fetch: ${file.path}`);
      }
    }

    console.log(`   ✅ Fetched ${files.length} files`);
  } catch (error) {
    console.log(`   ⚠️ Tree fetch failed: ${error.message}`);

    // Fallback: try to get README
    try {
      const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${treeBranch}/README.md`;
      const readmeResponse = await fetch(readmeUrl);
      if (readmeResponse.ok) {
        files.push({
          path: "README.md",
          name: "README.md",
          content: await readmeResponse.text(),
          language: "markdown",
        });
      }
    } catch (e) {}
  }

  // Get README
  let readme = null;
  const readmeFile = files.find((f) => f.name.toLowerCase() === "readme.md");
  if (readmeFile) {
    readme = readmeFile.content;
  }

  // Combine all code
  const allCode = files
    .filter((f) => f.language !== "markdown")
    .map(
      (f) =>
        `// ============================================================\n// File: ${f.path}\n// ============================================================\n\n${f.content}`
    )
    .join("\n\n");

  return {
    name: repoInfo.fullName,
    type: "github_repo",
    ...repoInfo,
    readme,
    files,
    code: allCode,
    metadata: {
      totalFiles: files.length,
      languages: [...new Set(files.map((f) => f.language).filter(Boolean))],
      totalSize: files.reduce((sum, f) => sum + (f.size || 0), 0),
      branch: treeBranch,
    },
  };
}

// ============================================================
// SINGLE FILE EXTRACTION
// ============================================================

async function extractSingleFile(parsed, headers) {
  const { owner, repo, branch, path } = parsed;

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(rawUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const content = await response.text();

  return {
    name: path.split("/").pop(),
    type: "github_file",
    path,
    content,
    code: content,
    language: detectLanguage(path),
    size: content.length,
    metadata: {
      repo: `${owner}/${repo}`,
      branch,
      rawUrl,
    },
  };
}

// ============================================================
// RAW FILE EXTRACTION
// ============================================================

async function extractRawFile(parsed) {
  const { owner, repo, branch, path } = parsed;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

  const response = await fetch(rawUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch raw file: ${response.status}`);
  }

  const content = await response.text();

  return {
    name: path.split("/").pop(),
    type: "github_raw",
    path,
    content,
    code: content,
    language: detectLanguage(path),
    size: content.length,
    metadata: { repo: `${owner}/${repo}`, branch, rawUrl },
  };
}

// ============================================================
// GIST EXTRACTION
// ============================================================

async function extractGist(parsed, headers) {
  const { owner, repo: gistId } = parsed;

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch gist: ${response.status}`);
  }

  const data = await response.json();

  const files = Object.values(data.files).map((file) => ({
    name: file.filename,
    path: file.filename,
    content: file.content,
    language: file.language?.toLowerCase() || detectLanguage(file.filename),
    size: file.size,
  }));

  const allCode = files
    .map((f) => `// File: ${f.name}\n${f.content}`)
    .join("\n\n");

  return {
    name: data.description || `Gist by ${owner}`,
    type: "github_gist",
    description: data.description,
    owner: data.owner?.login,
    files,
    code: allCode,
    public: data.public,
    metadata: {
      gistId,
      fileCount: files.length,
      htmlUrl: data.html_url,
    },
  };
}

// ============================================================
// LANGUAGE DETECTION
// ============================================================

function detectLanguage(filepath) {
  const ext = filepath.split(".").pop()?.toLowerCase();

  const languageMap = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    pyw: "python",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    go: "go",
    rs: "rust",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    r: "r",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    ps1: "powershell",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    md: "markdown",
    markdown: "markdown",
    vue: "vue",
    svelte: "svelte",
  };

  return languageMap[ext] || ext || "unknown";
}
