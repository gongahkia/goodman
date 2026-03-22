import { DEFAULT_CHUNK_MAX_TOKENS, DEFAULT_CHUNK_OVERLAP_TOKENS } from '@shared/constants';

export function chunkText(
  text: string,
  maxTokens: number = DEFAULT_CHUNK_MAX_TOKENS,
  overlapTokens: number = DEFAULT_CHUNK_OVERLAP_TOKENS
): string[] {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return [text];
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    if (paragraphTokens > maxTokens) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const sentenceChunks = splitBySentence(paragraph, maxTokens);
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

  return addOverlap(chunks, overlapTokens);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function splitBySentence(text: string, maxTokens: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const combined = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(combined) > maxTokens && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = combined;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function addOverlap(chunks: string[], overlapTokens: number): string[] {
  if (chunks.length <= 1) return chunks;

  const overlapChars = Math.floor(overlapTokens * 3.5);
  const result: string[] = [chunks[0] ?? ''];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1] ?? '';
    const overlap = prevChunk.slice(-overlapChars);
    const chunk = chunks[i] ?? '';
    result.push(`${overlap} ${chunk}`.trim());
  }

  return result;
}
