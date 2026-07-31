/**
 * Utilities turning LeetCode's HTML problem statements into Markdown READMEs.
 *
 * Bulk synchronization runs inside the MV3 service worker, where no DOM is
 * available, so every transformation here is purely string based.
 */
export default class ReadmeUtils {
  /**
   * Build the full README content for a problem folder.
   *
   * @param {object} submission - Submission data enriched with question metadata
   * @returns {string} Markdown README, or an empty string when no description is available
   */
  static build(submission) {
    if (!submission) {
      return "";
    }

    const description = this.htmlToMarkdown(submission.content);

    // Premium problems return a null description to non-subscribers: without a
    // statement to write, a README would be pure noise.
    if (!description) {
      return "";
    }

    const number = submission.questionFrontendId || submission.questionId;
    const title = submission.problemTitle || submission.title || "";
    const heading = [number, title].filter(Boolean).join(". ");

    const sections = [`# ${heading || "Problem"}`];
    const metadata = [];

    if (submission.difficulty) {
      metadata.push(`**Difficulty:** ${submission.difficulty}`);
    }

    if (submission.titleSlug) {
      metadata.push(
        `[View on LeetCode](https://leetcode.com/problems/${submission.titleSlug}/)`
      );
    }

    if (metadata.length) {
      // Two trailing spaces force a line break inside a single Markdown block.
      sections.push(metadata.join("  \n"));
    }

    sections.push("---", description);

    return `${sections.join("\n\n")}\n`;
  }

  /**
   * Convert a LeetCode HTML statement into Markdown.
   *
   * Algorithm:
   * 1. Set aside <pre> examples and <table> markup, whose content must survive untouched
   * 2. Convert media, then inline markup, then block structure
   * 3. Drop the remaining presentational tags and decode HTML entities
   * 4. Restore the preserved blocks and normalize blank lines
   *
   * @param {string} html - Raw HTML statement from the LeetCode API
   * @returns {string} Markdown representation, empty when the input is blank
   */
  static htmlToMarkdown(html) {
    if (!html || !html.trim()) {
      return "";
    }

    const preserved = [];

    // NUL delimits the placeholders: it cannot appear in a statement.
    const keep = (value) => {
      preserved.push(value);
      return `\n\n\u0000BLOCK${preserved.length - 1}\u0000\n\n`;
    };

    let markdown = html.replace(/\r\n?/g, "\n");

    // Examples rely on their exact line breaks, and their inner tags are only
    // decoration, so they become fenced code blocks kept out of the pipeline.
    markdown = markdown.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, inner) =>
      keep(
        `\`\`\`\n${this.decodeEntities(this.stripTags(inner)).replace(
          /^\n+|\n+$/g,
          ""
        )}\n\`\`\``
      )
    );

    // Markdown pipe tables cannot express the tables LeetCode ships, and GitHub
    // renders inline HTML, so they are passed through verbatim.
    markdown = markdown.replace(/<table[\s\S]*?<\/table>/gi, (match) =>
      keep(match)
    );

    // Decoded early so it counts as whitespace when trimming emphasis below.
    markdown = markdown.replace(/&nbsp;/gi, " ");

    markdown = this.convertMedia(markdown);
    markdown = this.convertInline(markdown);
    markdown = this.convertBlocks(markdown);

    // Whatever is left is presentational (<font>, <span>, ...).
    markdown = this.decodeEntities(this.stripTags(markdown));

    markdown = markdown
      // Trailing whitespace is noise, except the two spaces of a hard break.
      .replace(/[ \t]+$/gm, (spaces) => (spaces === "  " ? spaces : ""))
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return markdown.replace(
      /\u0000BLOCK(\d+)\u0000/g,
      (match, index) => preserved[Number(index)] ?? ""
    );
  }

  /**
   * Convert images and links, both of which carry absolute leetcode.com URLs.
   *
   * @param {string} html - Partially converted markup
   * @returns {string} Markup with media converted to Markdown
   */
  static convertMedia(html) {
    return html
      .replace(/<img[^>]*>/gi, (tag) => {
        const source = this.attribute(tag, "src");
        if (!source) {
          return "";
        }
        return `![${this.attribute(tag, "alt") || "image"}](${source})`;
      })
      .replace(/(<a[^>]*>)([\s\S]*?)<\/a>/gi, (match, openingTag, inner) => {
        const text = this.stripTags(inner).trim();
        const href = this.attribute(openingTag, "href");

        if (!href) {
          return text;
        }

        // LeetCode links to other problems with root-relative paths.
        const url = href.startsWith("/") ? `https://leetcode.com${href}` : href;
        return `[${text || url}](${url})`;
      });
  }

  /**
   * Convert inline markup. Runs before block conversion so that list items and
   * paragraphs already contain Markdown when their structure is rewritten.
   *
   * @param {string} html - Partially converted markup
   * @returns {string} Markup with inline elements converted to Markdown
   */
  static convertInline(html) {
    return html
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (match, inner) => {
        const text = inner.trim();
        return text ? `\`${text}\`` : "";
      })
      .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (match, inner) =>
        this.emphasize(inner, "**")
      )
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (match, inner) =>
        this.emphasize(inner, "*")
      )
      .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (match, inner) =>
        inner.trim() ? `^${this.stripTags(inner).trim()}` : ""
      )
      .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (match, inner) =>
        inner.trim() ? `_${this.stripTags(inner).trim()}` : ""
      );
  }

  /**
   * Convert block level structure: headings, lists and paragraphs.
   *
   * @param {string} html - Partially converted markup
   * @returns {string} Markup with block elements converted to Markdown
   */
  static convertBlocks(html) {
    return (
      html
        .replace(
          /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
          (match, level, inner) =>
            `\n\n${"#".repeat(Number(level))} ${this.collapse(inner)}\n\n`
        )
        // Lists are rebuilt as a whole: the indentation LeetCode puts before
        // each <li> would otherwise turn the items into code blocks.
        .replace(
          /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi,
          (match, tag, inner) =>
            `\n\n${this.convertListItems(inner, tag.toLowerCase() === "ol")}\n\n`
        )
        // Items left behind by nested or malformed lists.
        .replace(
          /<li[^>]*>([\s\S]*?)<\/li>/gi,
          (match, inner) => `\n- ${this.collapse(inner)}`
        )
        .replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n\n")
        // Two trailing spaces: a bare newline is only a soft break in Markdown.
        .replace(/<br\s*\/?>/gi, "  \n")
        .replace(/<\/(?:p|div)>/gi, "\n\n")
        .replace(/<(?:p|div)[^>]*>/gi, "")
    );
  }

  /**
   * Rebuild the items of a list as tight Markdown, one item per line.
   *
   * @param {string} html - Inner markup of a <ul> or <ol> element
   * @param {boolean} ordered - Whether items should be numbered
   * @returns {string} Markdown list
   */
  static convertListItems(html, ordered) {
    const items = [];

    html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (match, inner) => {
      items.push(this.collapse(inner));
      return "";
    });

    return items
      .map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`))
      .join("\n");
  }

  /**
   * Wrap content in emphasis markers, moving surrounding whitespace outside of
   * them: Markdown does not render `** bold **`.
   *
   * @param {string} inner - Content of the emphasis element
   * @param {string} marker - Markdown marker to apply
   * @returns {string} Emphasized Markdown
   */
  static emphasize(inner, marker) {
    const text = inner.trim();

    if (!text) {
      return /\s/.test(inner) ? " " : "";
    }

    const leading = /^\s/.test(inner) ? " " : "";
    const trailing = /\s$/.test(inner) ? " " : "";

    return `${leading}${marker}${text}${marker}${trailing}`;
  }

  /**
   * Collapse whitespace into single spaces, for content that must fit on one line.
   *
   * @param {string} value - Text to normalize
   * @returns {string} Single line text
   */
  static collapse(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  /**
   * Remove every remaining HTML tag from a string.
   *
   * @param {string} value - Markup to clean
   * @returns {string} Tag free text
   */
  static stripTags(value) {
    return value.replace(/<[^>]*>/g, "");
  }

  /**
   * Read an attribute from an opening tag, supporting both quoting styles.
   *
   * @param {string} tag - Opening tag markup
   * @param {string} name - Attribute name to read
   * @returns {string} Attribute value, empty when absent
   */
  static attribute(tag, name) {
    const match = tag.match(
      new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
    );

    if (!match) {
      return "";
    }

    return this.decodeEntities(match[1] ?? match[2] ?? "").trim();
  }

  /**
   * Decode the HTML entities LeetCode statements rely on.
   * `&amp;` is decoded last so that escaped entities survive the other rules.
   *
   * @param {string} value - Text containing HTML entities
   * @returns {string} Decoded text
   */
  static decodeEntities(value) {
    return value
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&(?:apos|#0*39);/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (match, code) =>
        String.fromCodePoint(parseInt(code, 16))
      )
      .replace(/&#(\d+);/g, (match, code) =>
        String.fromCodePoint(parseInt(code, 10))
      )
      .replace(/&amp;/gi, "&");
  }
}
