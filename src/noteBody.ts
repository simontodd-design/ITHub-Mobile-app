const COLLAPSE_LINES = 8;
const COLLAPSE_CHARS = 420;
const MIN_PREVIEW = 1;
const MIN_FOOTER = 20;

const quoteMarkers = [
  /^-{3,}\s*original message\b/i,
  /^_{3,}\s*original message\b/i,
  /^from\s+["“']/i,
  /^from:\s+/i,
  /^sent:\s+/i,
  /^on .{8,160}wrote:\s*$/i,
];

const footerMarkers = [
  /^--\s*$/,
  /^_{3,}\s*$/,
  /^-{3,}\s*$/,
  ...quoteMarkers,
  /^kind regards\b/i,
  /^best regards\b/i,
  /^warm regards\b/i,
  /^regards\b/i,
  /^thanks[,.]?\s*$/i,
  /^thank you[,.]?\s*$/i,
  /^cheers[,.]?\s*$/i,
  /^many thanks\b/i,
  /^sent from my (iphone|ipad|android)/i,
  /^get outlook for\b/i,
  /^this (e-?mail|communication|message) (is|may contain)/i,
  /^confidential(ity)? notice\b/i,
  /^disclaimer\b/i,
  /^privileged and confidential\b/i,
  /^the information (contained|in this)/i,
];

const HTML_TAG =
  /<\s*\/?\s*(?:a|b|strong|i|em|u|s|br|p|div|span|ul|ol|li|table|thead|tbody|tr|th|td|h[1-6]|hr|blockquote|pre|code|img)\b(?=[\s>/])/i;

export type NoteParts = {
  preview: string;
  hidden: string;
  collapsible: boolean;
  hasFooter: boolean;
};

function findFooterCut(lines: string[]): number {
  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();

    if (!line) {
      continue;
    }

    if (footerMarkers.some((pattern) => pattern.test(line))) {
      return i;
    }

    if (
      i >= 2 &&
      (lines[i - 1] ?? '').trim() === '' &&
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(line) &&
      i <= lines.length - 3
    ) {
      const next = (lines[i + 1] ?? '').trim();

      if (/^(t:|tel:|m:|mobile:|e:|email:|w:|www\.|http)/i.test(next) || /\b(designer|developer|engineer|director|manager|support)\b/i.test(next)) {
        return i;
      }
    }
  }

  return -1;
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToPlain(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<hr\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
  ).trim();
}

function inlineFooter(text: string): { preview: string; footer: string } | null {
  const match = text.match(
    /\b(kind regards|best regards|warm regards|sent from my |this (?:e-?mail|communication|message) (?:is|may contain)|confidential(?:ity)? notice|original message)\b/i,
  );

  if (!match || match.index === undefined || match.index < 8) {
    return null;
  }

  const preview = text.slice(0, match.index).trim();
  const footer = text.slice(match.index).trim();

  if (preview.length < MIN_PREVIEW || footer.length < MIN_FOOTER) {
    return null;
  }

  return { preview, footer };
}

function footerSplit(lines: string[]): { preview: string; footer: string } | null {
  const cut = findFooterCut(lines);

  if (cut <= 0 || cut >= lines.length) {
    return null;
  }

  const preview = lines.slice(0, cut).join('\n').trim();
  const footer = lines.slice(cut).join('\n').trim();

  if (preview.length < MIN_PREVIEW || footer.length < MIN_FOOTER) {
    return null;
  }

  return { preview, footer };
}

export function splitNote(body: string | null | undefined): NoteParts {
  const raw = (body ?? '').replace(/\r\n/g, '\n').trim();

  if (!raw) {
    return { preview: '', hidden: '', collapsible: false, hasFooter: false };
  }

  const text = HTML_TAG.test(raw) ? htmlToPlain(raw) : decode(raw);
  const lines = text.split('\n');
  const footer = footerSplit(lines) ?? inlineFooter(text);

  if (footer) {
    return { preview: footer.preview, hidden: footer.footer, collapsible: true, hasFooter: true };
  }

  if (lines.length > COLLAPSE_LINES || text.length > COLLAPSE_CHARS) {
    let preview = lines.slice(0, COLLAPSE_LINES).join('\n').trim();

    if (preview.length > COLLAPSE_CHARS) {
      preview = text.slice(0, COLLAPSE_CHARS).replace(/\s+\S*$/, '').trim();
    }

    const rest = text.slice(preview.length).trim();

    if (rest.length > 40) {
      return { preview, hidden: rest, collapsible: true, hasFooter: false };
    }
  }

  return { preview: text, hidden: '', collapsible: false, hasFooter: false };
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}
