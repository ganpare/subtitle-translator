import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserBySessionId, upsertSubtitleSource } from '@/lib/db-operations';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    if (!sessionId) return NextResponse.json({ error: 'Session not found' }, { status: 401 });
    const user = getUserBySessionId(sessionId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { filename, file_type, hash, size_bytes, line_count, content } = body || {};
    const { id } = upsertSubtitleSource(user.id, { filename, file_type, hash, size_bytes, line_count, content });
    return NextResponse.json({ success: true, sourceId: id });
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


