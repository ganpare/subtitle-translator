/**
 * Subtitle file parser utilities
 * Supports SRT, ASS, VTT, and LRC formats
 */

export interface SubtitleSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  originalLine?: string;
}

export const LRC_TIME_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

/**
 * Split text into lines
 */
export function splitTextIntoLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Detect subtitle format from content
 */
export function detectSubtitleFormat(lines: string[]): 'srt' | 'ass' | 'vtt' | 'lrc' | 'error' {
  if (lines.length === 0) return 'error';
  
  // Check for SRT format
  if (lines.some(line => /^\d+$/.test(line.trim()))) {
    return 'srt';
  }
  
  // Check for ASS format
  if (lines.some(line => line.includes('[Script Info]') || line.includes('[V4+ Styles]'))) {
    return 'ass';
  }
  
  // Check for VTT format
  if (lines.some(line => line.includes('WEBVTT'))) {
    return 'vtt';
  }
  
  // Check for LRC format
  if (lines.some(line => /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g.test(line))) {
    return 'lrc';
  }
  
  return 'error';
}

/**
 * Filter subtitle content lines and get indices
 */
export function filterSubLines(lines: string[], fileType: string): {
  contentLines: string[];
  contentIndices: number[];
  styleBlockLines: string[];
} {
  const contentLines: string[] = [];
  const contentIndices: number[] = [];
  const styleBlockLines: string[] = [];
  
  if (fileType === 'srt') {
    // SRT: Skip sequence numbers and timestamps, keep dialogue
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !/^\d+$/.test(line) && !line.includes('-->')) {
        contentLines.push(line);
        contentIndices.push(i);
      }
    }
  } else if (fileType === 'ass') {
    // ASS: Keep Dialogue lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('Dialogue:')) {
        const parts = line.split(',');
        if (parts.length >= 10) {
          const text = parts.slice(9).join(',').trim();
          contentLines.push(text);
          contentIndices.push(i);
        }
      } else if (line.startsWith('Style:') || line.startsWith('Format:')) {
        styleBlockLines.push(line);
      }
    }
  } else if (fileType === 'vtt') {
    // VTT: Skip WEBVTT header and timestamps, keep cues
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.includes('WEBVTT') && !line.includes('-->') && !/^\d+$/.test(line)) {
        contentLines.push(line);
        contentIndices.push(i);
      }
    }
  } else if (fileType === 'lrc') {
    // LRC: Extract text from time-tagged lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g.test(line)) {
        const text = line.replace(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/g, '').trim();
        if (text) {
          contentLines.push(text);
          contentIndices.push(i);
        }
      }
    }
  }
  
  return { contentLines, contentIndices, styleBlockLines };
}

/**
 * Parse subtitle file into segments
 */
export function parseSubtitleFile(content: string, fileType: string): SubtitleSegment[] {
  const lines = splitTextIntoLines(content);
  const { contentLines, contentIndices } = filterSubLines(lines, fileType);
  
  const segments: SubtitleSegment[] = [];
  
  if (fileType === 'srt') {
    // Parse SRT format
    for (let i = 0; i < lines.length; i += 4) {
      if (i + 2 < lines.length) {
        const timeLine = lines[i + 1];
        const text = lines[i + 2];
        
        if (timeLine && text) {
          const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
          if (timeMatch) {
            const startTime = parseTimeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
            const endTime = parseTimeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
            
            segments.push({
              id: `srt-${i}`,
              startTime,
              endTime,
              text: text.trim(),
              originalLine: lines[i + 2]
            });
          }
        }
      }
    }
  } else if (fileType === 'ass') {
    // Parse ASS format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('Dialogue:')) {
        const parts = line.split(',');
        if (parts.length >= 10) {
          const startTime = parseAssTime(parts[1]);
          const endTime = parseAssTime(parts[2]);
          const text = parts.slice(9).join(',').trim();
          
          segments.push({
            id: `ass-${i}`,
            startTime,
            endTime,
            text,
            originalLine: line
          });
        }
      }
    }
  } else if (fileType === 'vtt') {
    // Parse VTT format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (timeMatch && i + 1 < lines.length) {
          const startTime = parseTimeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
          const endTime = parseTimeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
          const text = lines[i + 1].trim();
          
          segments.push({
            id: `vtt-${i}`,
            startTime,
            endTime,
            text,
            originalLine: lines[i + 1]
          });
        }
      }
    }
  } else if (fileType === 'lrc') {
    // Parse LRC format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g.test(line)) {
        const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/);
        if (timeMatch) {
          const startTime = parseTimeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], '0');
          const text = line.replace(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/g, '').trim();
          
          segments.push({
            id: `lrc-${i}`,
            startTime,
            endTime: startTime + 3, // Default 3 seconds duration
            text,
            originalLine: line
          });
        }
      }
    }
  }
  
  return segments;
}

/**
 * Parse time to seconds
 */
function parseTimeToSeconds(hours: string, minutes: string, seconds: string, milliseconds: string): number {
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
}

/**
 * Parse ASS time format
 */
function parseAssTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return parseTimeToSeconds(hours, minutes, seconds, '0');
  }
  return 0;
}
