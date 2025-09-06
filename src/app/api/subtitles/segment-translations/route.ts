import { NextRequest, NextResponse } from 'next/server';
import { 
  createSubtitleSegmentTranslations, 
  getSubtitleSegmentTranslations 
} from '@/lib/db-operations';

// GET /api/subtitles/segment-translations?segmentId=xxx&targetLanguage=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const segmentId = searchParams.get('segmentId');
    const targetLanguage = searchParams.get('targetLanguage');

    if (!segmentId) {
      return NextResponse.json({ error: 'segmentId is required' }, { status: 400 });
    }

    const translations = getSubtitleSegmentTranslations(segmentId, targetLanguage || undefined);

    return NextResponse.json({
      success: true,
      data: translations,
      count: translations.length,
    });
  } catch (error: any) {
    console.error('Error fetching segment translations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch segment translations', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/subtitles/segment-translations - Create segment translation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      segmentId, 
      batchJobId, 
      targetLanguage, 
      translatedText, 
      version = 1 
    } = body;

    if (!segmentId || !targetLanguage || !translatedText) {
      return NextResponse.json({ 
        error: 'segmentId, targetLanguage, and translatedText are required' 
      }, { status: 400 });
    }

    const translation = createSubtitleSegmentTranslations(
      segmentId,
      batchJobId || null,
      targetLanguage,
      translatedText,
      version
    );

    return NextResponse.json({
      success: true,
      data: translation,
    });
  } catch (error: any) {
    console.error('Error creating segment translation:', error);
    return NextResponse.json(
      { error: 'Failed to create segment translation', details: error.message },
      { status: 500 }
    );
  }
}
