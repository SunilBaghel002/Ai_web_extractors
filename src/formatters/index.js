/**
 * Formatters barrel export
 */

import { formatAsMarkdown } from "./markdown-formatter.js";
import { formatAsText } from "./text-formatter.js";
import { formatAsStructured } from "./structured-formatter.js";
import { OUTPUT_FORMATS } from "../constants.js";

/**
 * Format output according to specified format
 */
export function formatOutput(data, format) {
  switch (format) {
    case OUTPUT_FORMATS.MARKDOWN:
      return formatAsMarkdown(data);
    case OUTPUT_FORMATS.TEXT:
      return formatAsText(data);
    case OUTPUT_FORMATS.HTML:
      return data.htmlContent;
    case OUTPUT_FORMATS.STRUCTURED:
      return formatAsStructured(data);
    default:
      return formatAsMarkdown(data);
  }
}

export { formatAsMarkdown } from "./markdown-formatter.js";
export { formatAsText } from "./text-formatter.js";
export { formatAsStructured } from "./structured-formatter.js";
