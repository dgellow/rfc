// RFC cross-reference pattern: matches "RFC 1234", "[RFC1234]", "[RFC 1234]"
const RFC_REF_PATTERN = /\[?RFC\s*(\d{1,5})\]?/gi;

export interface RfcReference {
  number: number;
  start: number;
  end: number;
}

export function findReferences(line: string): RfcReference[] {
  const refs: RfcReference[] = [];
  let match;
  RFC_REF_PATTERN.lastIndex = 0;
  while ((match = RFC_REF_PATTERN.exec(line)) !== null) {
    refs.push({
      number: parseInt(match[1]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return refs;
}

export function prepareRfcText(raw: string): string[] {
  // Strip form-feed characters (page breaks)
  const cleaned = raw.replace(/\f/g, "");
  return cleaned.split("\n");
}

export function findMatchingLines(
  lines: string[],
  query: string,
): number[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lower)) {
      matches.push(i);
    }
  }
  return matches;
}
