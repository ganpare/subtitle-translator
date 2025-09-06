import { detectSubtitleFormat, filterSubLines } from '@/app/[locale]/subtitleUtils';

export interface SubtitleSegment {
  segment_index: number;
  start_time: string;
  end_time: string;
  original_text: string;
}

export interface ParsedSubtitle {
  segments: SubtitleSegment[];
  fileType: string;
  totalSegments: number;
}

// SRT/VTT time format regex
const VTT_SRT_TIME = /^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/;

// ASS time format regex
const ASS_TIME = /^Dialogue:\s*\d+,\s*(\d+:\d{2}:\d{2}\.\d{2}),\s*(\d+:\d{2}:\d{2}\.\d{2})/;

// LRC time format regex
const LRC_TIME = /^\[(\d{2}:\d{2}\.\d{2})\]/;

/**
 * Parse subtitle file content into segments
 */
export const parseSubtitleToSegments = (content: string): ParsedSubtitle => {
  const lines = content.split('\n');
  const fileType = detectSubtitleFormat(lines);
  
  if (fileType === 'error') {
    throw new Error('Unsupported subtitle format');
  }
  
  const { contentLines, contentIndices } = filterSubLines(lines, fileType);
  const segments: SubtitleSegment[] = [];
  
  if (fileType === 'srt' || fileType === 'vtt') {
    parseSRTVTTSegments(lines, contentIndices, segments);
  } else if (fileType === 'ass') {
    parseASSSegments(lines, contentIndices, segments);
  } else if (fileType === 'lrc') {
    parseLRCSegments(lines, contentIndices, segments);
  }
  
  return {
    segments,
    fileType,
    totalSegments: segments.length,
  };
};

/**
 * Parse SRT/VTT format segments
 */
const parseSRTVTTSegments = (
  lines: string[],
  contentIndices: number[],
  segments: SubtitleSegment[]
): void => {
  let segmentIndex = 0;
  
  for (let i = 0; i < contentIndices.length; i++) {
    const contentIndex = contentIndices[i];
    const contentLine = lines[contentIndex];
    
    // Look for timestamp line above the content
    let timeLine = '';
    let searchIndex = contentIndex - 1;
    
    while (searchIndex >= 0) {
      if (VTT_SRT_TIME.test(lines[searchIndex])) {
        timeLine = lines[searchIndex];
        break;
      }
      searchIndex--;
    }
    
    if (timeLine) {
      const match = timeLine.match(VTT_SRT_TIME);
      if (match) {
        const [, startTime, endTime] = match;
        segments.push({
          segment_index: segmentIndex++,
          start_time: normalizeTimeFormat(startTime),
          end_time: normalizeTimeFormat(endTime),
          original_text: contentLine,
        });
      }
    }
  }
};

/**
 * Parse ASS format segments
 */
const parseASSSegments = (
  lines: string[],
  contentIndices: number[],
  segments: SubtitleSegment[]
): void => {
  let segmentIndex = 0;
  
  for (let i = 0; i < contentIndices.length; i++) {
    const contentIndex = contentIndices[i];
    const dialogueLine = lines[contentIndex];
    
    if (dialogueLine.startsWith('Dialogue:')) {
      const match = dialogueLine.match(ASS_TIME);
      if (match) {
        const [, startTime, endTime] = match;
        // Extract text content (skip ASS format fields)
        const parts = dialogueLine.split(',');
        const textContent = parts.slice(9).join(',').trim();
        
        segments.push({
          segment_index: segmentIndex++,
          start_time: convertASSTimeToSRT(startTime),
          end_time: convertASSTimeToSRT(endTime),
          original_text: textContent,
        });
      }
    }
  }
};

/**
 * Parse LRC format segments
 */
const parseLRCSegments = (
  lines: string[],
  contentIndices: number[],
  segments: SubtitleSegment[]
): void => {
  let segmentIndex = 0;
  let currentTime = '00:00:00.000';
  
  for (let i = 0; i < contentIndices.length; i++) {
    const contentIndex = contentIndices[i];
    const line = lines[contentIndex];
    
    const timeMatch = line.match(LRC_TIME);
    if (timeMatch) {
      const [, timeStr] = timeMatch;
      currentTime = convertLRCTimeToSRT(timeStr);
    } else if (line.trim()) {
      // This is a text line, use current time
      const nextTime = calculateNextLRCTime(currentTime);
      segments.push({
        segment_index: segmentIndex++,
        start_time: currentTime,
        end_time: nextTime,
        original_text: line.trim(),
      });
      currentTime = nextTime;
    }
  }
};

/**
 * Normalize time format to SRT standard (HH:MM:SS.mmm)
 */
const normalizeTimeFormat = (time: string): string => {
  // Convert comma to dot for milliseconds
  return time.replace(',', '.');
};

/**
 * Convert ASS time format to SRT format
 */
const convertASSTimeToSRT = (assTime: string): string => {
  // ASS format: H:MM:SS.CC (centiseconds)
  // SRT format: HH:MM:SS.mmm (milliseconds)
  const parts = assTime.split(':');
  const hours = parts[0].padStart(2, '0');
  const minutes = parts[1].padStart(2, '0');
  const secondsParts = parts[2].split('.');
  const seconds = secondsParts[0].padStart(2, '0');
  const centiseconds = secondsParts[1] || '00';
  const milliseconds = centiseconds.padEnd(3, '0');
  
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

/**
 * Convert LRC time format to SRT format
 */
const convertLRCTimeToSRT = (lrcTime: string): string => {
  // LRC format: MM:SS.CC
  // SRT format: HH:MM:SS.mmm
  const parts = lrcTime.split(':');
  const minutes = parseInt(parts[0]);
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0]);
  const centiseconds = secondsParts[1] || '00';
  const milliseconds = centiseconds.padEnd(3, '0');
  
  const totalSeconds = minutes * 60 + seconds;
  const hours = Math.floor(totalSeconds / 3600);
  const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds}`;
};

/**
 * Calculate next LRC time (assume 3 seconds duration)
 */
const calculateNextLRCTime = (currentTime: string): string => {
  const parts = currentTime.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secondsParts = parts[2].split('.');
  const seconds = parseInt(secondsParts[0]);
  const milliseconds = parseInt(secondsParts[1]);
  
  let totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
  totalMs += 3000; // Add 3 seconds
  
  const newHours = Math.floor(totalMs / 3600000);
  const newMinutes = Math.floor((totalMs % 3600000) / 60000);
  const newSeconds = Math.floor((totalMs % 60000) / 1000);
  const newMilliseconds = totalMs % 1000;
  
  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}.${newMilliseconds.toString().padStart(3, '0')}`;
};

/**
 * Reconstruct subtitle file from segments
 */
export const reconstructSubtitleFromSegments = (
  segments: SubtitleSegment[],
  fileType: string
): string => {
  if (fileType === 'srt') {
    return reconstructSRT(segments);
  } else if (fileType === 'vtt') {
    return reconstructVTT(segments);
  } else if (fileType === 'ass') {
    return reconstructASS(segments);
  } else if (fileType === 'lrc') {
    return reconstructLRC(segments);
  }
  
  throw new Error(`Unsupported file type: ${fileType}`);
};

const reconstructSRT = (segments: SubtitleSegment[]): string => {
  return segments.map((segment, index) => 
    `${index + 1}\n${segment.start_time} --> ${segment.end_time}\n${segment.original_text}\n`
  ).join('\n');
};

const reconstructVTT = (segments: SubtitleSegment[]): string => {
  const header = 'WEBVTT\n\n';
  const content = segments.map(segment => 
    `${segment.start_time} --> ${segment.end_time}\n${segment.original_text}\n`
  ).join('\n');
  return header + content;
};

const reconstructASS = (segments: SubtitleSegment[]): string => {
  const header = `[Script Info]
Title: Generated Subtitle
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments.map(segment => {
    const startTime = convertSRTTimeToASS(segment.start_time);
    const endTime = convertSRTTimeToASS(segment.end_time);
    return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${segment.original_text}`;
  }).join('\n');

  return header + events;
};

const reconstructLRC = (segments: SubtitleSegment[]): string => {
  return segments.map(segment => {
    const timeStr = convertSRTTimeToLRC(segment.start_time);
    return `[${timeStr}]${segment.original_text}`;
  }).join('\n');
};

const convertSRTTimeToASS = (srtTime: string): string => {
  const parts = srtTime.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secondsParts = parts[2].split('.');
  const seconds = parseInt(secondsParts[0]);
  const milliseconds = parseInt(secondsParts[1]);
  
  const totalCentiseconds = (hours * 3600 + minutes * 60 + seconds) * 100 + Math.floor(milliseconds / 10);
  const newHours = Math.floor(totalCentiseconds / 360000);
  const newMinutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const newSeconds = Math.floor((totalCentiseconds % 6000) / 100);
  const newCentiseconds = totalCentiseconds % 100;
  
  return `${newHours}:${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}.${newCentiseconds.toString().padStart(2, '0')}`;
};

const convertSRTTimeToLRC = (srtTime: string): string => {
  const parts = srtTime.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secondsParts = parts[2].split('.');
  const seconds = parseInt(secondsParts[0]);
  const milliseconds = parseInt(secondsParts[1]);
  
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const newMinutes = Math.floor(totalSeconds / 60);
  const newSeconds = totalSeconds % 60;
  const centiseconds = Math.floor(milliseconds / 10);
  
  return `${newMinutes}:${newSeconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
};
