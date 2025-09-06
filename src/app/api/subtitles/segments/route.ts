import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseStats, getSubtitleSegments, getSubtitleSegmentsByTimeRange, getSubtitleSegmentsWithTranslations } from '@/lib/db-operations';

// GET /api/subtitles/segments?sourceId=xxx&targetLanguage=xxx&startTime=xxx&endTime=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');
    const targetLanguage = searchParams.get('targetLanguage');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');

    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
    }

    let segments;
    
    if (startTime && endTime) {
      // Get segments within time range
      segments = getSubtitleSegmentsByTimeRange(sourceId, startTime, endTime);
    } else if (targetLanguage) {
      // Get segments with translations
      segments = getSubtitleSegmentsWithTranslations(sourceId, targetLanguage);
    } else {
      // Get all segments
      segments = getSubtitleSegments(sourceId);
    }

    return NextResponse.json({
      success: true,
      data: segments,
      count: segments.length,
    });
  } catch (error: any) {
    console.error('Error fetching subtitle segments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subtitle segments', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/subtitles/segments - Create segments from subtitle content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceId, content, fileType } = body;

    if (!sourceId || !content) {
      return NextResponse.json({ error: 'sourceId and content are required' }, { status: 400 });
    }

    // Parse subtitle content into segments
    const { parseSubtitleToSegments } = await import('@/lib/subtitle-parser');
    const { createSubtitleSegments } = await import('@/lib/db-operations');
    
    const parsed = parseSubtitleToSegments(content);
    const segments = createSubtitleSegments(sourceId, parsed.segments);

    return NextResponse.json({
      success: true,
      data: segments,
      count: segments.length,
      fileType: parsed.fileType,
    });
  } catch (error: any) {
    console.error('Error creating subtitle segments:', error);
    return NextResponse.json(
      { error: 'Failed to create subtitle segments', details: error.message },
      { status: 500 }
    );
  }
}
