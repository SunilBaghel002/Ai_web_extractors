/**
 * Content extraction logic
 */

/**
 * Extract structured content from the page
 */
export async function extractContent(page, options = {}) {
  const content = await page.evaluate((opts) => {
    const result = {
      headings: [],
      paragraphs: [],
      links: [],
      tables: [],
      codeBlocks: [],
      lists: [],
    };

    // Extract headings
    document
      .querySelectorAll("h1, h2, h3, h4, h5, h6")
      .forEach((heading, index) => {
        result.headings.push({
          level: parseInt(heading.tagName[1]),
          text: heading.innerText.trim(),
          id: heading.id || `heading-${index}`,
        });
      });

    // Extract paragraphs
    document.querySelectorAll("p").forEach((p) => {
      const text = p.innerText.trim();
      if (text.length > 20) {
        // Filter out short fragments
        result.paragraphs.push(text);
      }
    });

    // Extract links
    if (opts.includeLinks) {
      document.querySelectorAll("a[href]").forEach((link) => {
        const href = link.href;
        const text = link.innerText.trim();

        if (
          href &&
          text &&
          !href.startsWith("javascript:") &&
          !href.startsWith("#")
        ) {
          result.links.push({
            url: href,
            text: text,
            isExternal: !href.includes(window.location.hostname),
            title: link.title || null,
          });
        }
      });
    }

    // Extract tables
    if (opts.includeTables) {
      document.querySelectorAll("table").forEach((table, tableIndex) => {
        const tableData = {
          index: tableIndex,
          headers: [],
          rows: [],
        };

        // Get headers
        table.querySelectorAll("th").forEach((th) => {
          tableData.headers.push(th.innerText.trim());
        });

        // Get rows
        table.querySelectorAll("tbody tr").forEach((tr) => {
          const row = [];
          tr.querySelectorAll("td").forEach((td) => {
            row.push(td.innerText.trim());
          });
          if (row.length > 0) {
            tableData.rows.push(row);
          }
        });

        if (tableData.headers.length > 0 || tableData.rows.length > 0) {
          result.tables.push(tableData);
        }
      });
    }

    // Extract code blocks
    if (opts.includeCode) {
      document.querySelectorAll("pre, code").forEach((code, index) => {
        const text = code.innerText.trim();
        if (text.length > 10) {
          const language =
            code.className.match(/language-(\w+)/)?.[1] ||
            code.className.match(/(\w+)/)?.[1] ||
            "plaintext";

          result.codeBlocks.push({
            index,
            language,
            code: text,
          });
        }
      });
    }

    // Extract lists
    document.querySelectorAll("ul, ol").forEach((list, index) => {
      const items = [];
      list.querySelectorAll(":scope > li").forEach((li) => {
        items.push(li.innerText.trim());
      });

      if (items.length > 0) {
        result.lists.push({
          type: list.tagName.toLowerCase(),
          items,
        });
      }
    });

    return result;
  }, options);

  return content;
}
