import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createTranslationHistory } from '@/lib/db-operations';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sourceText,
      translatedText,
      service,
      targetLanguage,
      sourceLanguage,
      usage,
      batchJobId,
      sourceMeta
    } = body;

    if (!sourceText || !translatedText || !service || !targetLanguage) {
      return NextResponse.json({ 
        error: 'Missing required fields: sourceText, translatedText, service, targetLanguage' 
      }, { status: 400 });
    }

    // 翻訳履歴をデータベースに保存
    const historyId = await createTranslationHistory({
      userId: session.user.id,
      sourceText,
      translatedText,
      service,
      targetLanguage,
      sourceLanguage: sourceLanguage || 'auto',
      usage: usage || null,
      batchJobId: batchJobId || null,
      sourceMeta: sourceMeta || null
    });

    return NextResponse.json({ 
      success: true, 
      historyId,
      message: 'Translation history saved successfully' 
    });

  } catch (error) {
    console.error('Error saving translation history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ユーザーの翻訳履歴を取得
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // TODO: 翻訳履歴取得機能を実装
    return NextResponse.json({ 
      message: 'Translation history retrieval not implemented yet',
      limit,
      offset
    });

  } catch (error) {
    console.error('Error fetching translation history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
