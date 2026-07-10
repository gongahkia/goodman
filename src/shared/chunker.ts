import { DEFAULT_CHUNK_MAX_TOKENS, DEFAULT_CHUNK_OVERLAP_TOKENS } from '@shared/constants';

export function chunkText(
  text: string,
  maxTokens: number = DEFAULT_CHUNK_MAX_TOKENS,
  overlapTokens: number = DEFAULT_CHUNK_OVERLAP_TOKENS
): string[] {
  const estimatedTokens = estimateTokens(text);
  const safeMax = Math.floor(maxTokens * 0.85); // safety margin for token estimation variance
  if (estimatedTokens <= safeMax) {
    return [text];
  }

  const sectionHeaders = collectSectionHeaders(text);
  const paragraphs = splitIntoStructuralBlocks(text);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    if (paragraphTokens > maxTokens) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const sentenceChunks = splitOversizedBlock(paragraph, maxTokens);
      chunks.push(...sentenceChunks);
      continue;
    }

    const combined = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (estimateTokens(combined) > maxTokens) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk = combined;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return addReferenceContext(addOverlap(chunks, overlapTokens), sectionHeaders);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

interface SectionHeader {
  ref: string;
  title: string;
}

function splitIntoStructuralBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let sawStructuralHeader = false;

  for (const line of lines) {
    if (isStructuralHeader(line) && current.some(item => item.trim())) {
      blocks.push(current.join('\n').trim());
      current = [line];
      sawStructuralHeader = true;
    } else {
      if (isStructuralHeader(line)) sawStructuralHeader = true;
      current.push(line);
    }
  }

  if (current.some(item => item.trim())) {
    blocks.push(current.join('\n').trim());
  }

  if (sawStructuralHeader) {
    return blocks.filter(Boolean);
  }

  return text.split(/\n\n+/).map(item => item.trim()).filter(Boolean);
}

function isStructuralHeader(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(?:section\s+|clause\s+)?\d+(?:\.\d+)*[.)]?\s+[A-Z][^\n]{2,}$/i.test(trimmed) ||
    /^[A-Z][.)]\s+[A-Z][^\n]{2,}$/.test(trimmed) ||
    /^\([a-z]\)\s+[A-Z][^\n]{2,}$/.test(trimmed) ||
    /^[IVX]+[.)]\s+[A-Z][^\n]{2,}$/i.test(trimmed)
  );
}

function splitOversizedBlock(text: string, maxTokens: number): string[] {
  const { header, body } = extractLeadingHeader(text);
  const prefix = header ? `${header}\n\n` : '';
  const paragraphs = body.split(/\n\n+/).map(item => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const combined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (estimateTokens(`${prefix}${combined}`) > maxTokens && current) {
      chunks.push(`${prefix}${current}`.trim());
      current = paragraph;
    } else if (estimateTokens(`${prefix}${paragraph}`) > maxTokens) {
      if (current) {
        chunks.push(`${prefix}${current}`.trim());
        current = '';
      }
      chunks.push(...splitBySentence(paragraph, maxTokens, header));
    } else {
      current = combined;
    }
  }

  if (current.trim()) {
    chunks.push(`${prefix}${current}`.trim());
  }

  return chunks;
}

function extractLeadingHeader(text: string): { header: string; body: string } {
  const lines = text.split('\n');
  const first = lines[0]?.trim() ?? '';
  if (!first || !isStructuralHeader(first)) return { header: '', body: text };
  return {
    header: first,
    body: lines.slice(1).join('\n').trim(),
  };
}

function splitBySentence(text: string, maxTokens: number, header = ''): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';
  const prefix = header ? `${header}\n\n` : '';

  for (const sentence of sentences) {
    const combined = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(`${prefix}${combined}`) > maxTokens && current) {
      chunks.push(`${prefix}${current}`.trim());
      current = sentence;
    } else {
      current = combined;
    }
  }

  if (current.trim()) {
    chunks.push(`${prefix}${current}`.trim());
  }

  return chunks;
}

function addOverlap(chunks: string[], overlapTokens: number): string[] {
  if (chunks.length <= 1) return chunks;

  const overlapBudget = Math.floor(overlapTokens * 3.5);
  const result: string[] = [chunks[0] ?? ''];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1] ?? '';
    const overlap = getOverlapText(prevChunk, overlapBudget);
    const chunk = chunks[i] ?? '';
    result.push(`${overlap} ${chunk}`.trim());
  }

  return result;
}

function getOverlapText(chunk: string, overlapChars: number): string {
  if (overlapChars <= 0) return '';
  const paragraphs = chunk.split(/\n\n+/).map(item => item.trim()).filter(Boolean);
  const selected: string[] = [];
  let total = 0;

  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const paragraph = paragraphs[i] ?? '';
    if (total + paragraph.length > overlapChars && selected.length > 0) break;
    selected.unshift(paragraph);
    total += paragraph.length;
    if (total >= overlapChars) break;
  }

  const overlap = selected.join('\n\n');
  return overlap.length > overlapChars * 1.5
    ? overlap.slice(-overlapChars)
    : overlap;
}

function collectSectionHeaders(text: string): SectionHeader[] {
  return text
    .split('\n')
    .map(line => extractSectionHeader(line))
    .filter((header): header is SectionHeader => header !== null);
}

function extractSectionHeader(line: string): SectionHeader | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^(?:section\s+|clause\s+)?(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    ref: match[1],
    title: trimmed,
  };
}

function addReferenceContext(chunks: string[], sectionHeaders: SectionHeader[]): string[] {
  if (sectionHeaders.length === 0) return chunks;
  return chunks.map(chunk => {
    const context = getReferenceContext(chunk, sectionHeaders);
    return context ? `${context}\n\n${chunk}` : chunk;
  });
}

function getReferenceContext(chunk: string, sectionHeaders: SectionHeader[]): string {
  const references = new Set<string>();
  for (const match of chunk.matchAll(/\b(?:section|clause)\s+(\d+(?:\.\d+)*)\b/gi)) {
    if (match[1]) references.add(match[1]);
  }

  const lines = [...references]
    .flatMap(ref => {
      const header = sectionHeaders.find(item => item.ref === ref);
      if (!header || chunk.includes(header.title)) return [];
      return [`Clause ${ref} = ${header.title}`];
    });

  return lines.length > 0 ? `Reference context: ${lines.join('; ')}.` : '';
}
