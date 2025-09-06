/**
 * Context-aware chunking utilities
 * Groups multiple lines for better translation context
 */

export interface ContextChunk {
  id: string;
  text: string;
  lineIndices: number[];
}

/**
 * Create context-aware chunks from content lines
 */
export function createContextChunks(
  contentLines: string[],
  contextWindow: number = 20
): ContextChunk[] {
  if (contentLines.length === 0) return [];
  
  const chunks: ContextChunk[] = [];
  
  // If content is small enough, create single chunk
  if (contentLines.length <= contextWindow) {
    return [{
      id: 'chunk-0',
      text: contentLines.join('\n'),
      lineIndices: Array.from({ length: contentLines.length }, (_, i) => i)
    }];
  }
  
  // Create overlapping chunks for better context
  for (let i = 0; i < contentLines.length; i += Math.max(1, Math.floor(contextWindow / 2))) {
    const endIndex = Math.min(i + contextWindow, contentLines.length);
    const chunkLines = contentLines.slice(i, endIndex);
    const lineIndices = Array.from({ length: chunkLines.length }, (_, j) => i + j);
    
    chunks.push({
      id: `chunk-${i}`,
      text: chunkLines.join('\n'),
      lineIndices
    });
    
    // Stop if we've covered all lines
    if (endIndex >= contentLines.length) break;
  }
  
  return chunks;
}

/**
 * Merge translated chunks back to original structure
 */
export function mergeTranslatedChunks(
  chunks: ContextChunk[],
  translatedTexts: string[]
): string[] {
  if (chunks.length !== translatedTexts.length) {
    throw new Error('Chunks and translated texts count mismatch');
  }
  
  const result: string[] = [];
  const usedIndices = new Set<number>();
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const translatedText = translatedTexts[i];
    const translatedLines = translatedText.split('\n');
    
    // Map translated lines back to original indices
    for (let j = 0; j < Math.min(chunk.lineIndices.length, translatedLines.length); j++) {
      const originalIndex = chunk.lineIndices[j];
      if (!usedIndices.has(originalIndex)) {
        result[originalIndex] = translatedLines[j];
        usedIndices.add(originalIndex);
      }
    }
  }
  
  return result;
}
