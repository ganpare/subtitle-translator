import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserBySessionId, upsertSubtitleTranslation } from '@/lib/db-operations';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    if (!sessionId) return NextResponse.json({ error: 'Session not found' }, { status: 401 });
    const user = getUserBySessionId(sessionId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { source_id, batch_job_id, target_language, content, status } = body || {};
    if (!source_id || !target_language || !content) {
      return NextResponse.json({ error: 'Missing fields: source_id, target_language, content' }, { status: 400 });
    }
    const { id } = upsertSubtitleTranslation(source_id, { batch_job_id, target_language, content, status });
    return NextResponse.json({ success: true, translationId: id });
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


