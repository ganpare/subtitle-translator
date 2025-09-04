import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserBySessionId, createUser } from '@/lib/db-operations';

/**
 * Session management API with database integration
 * Generates and manages user sessions for batch job tracking
 */

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    let sessionId = cookieStore.get('session_id')?.value;
    let user = null;

    if (sessionId) {
      // Try to get existing user
      user = getUserBySessionId(sessionId);
    }

    if (!sessionId || !user) {
      // Generate new session ID and create user
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userAgent = request.headers.get('user-agent') || undefined;
      const ipAddress = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       'unknown';
      
      user = createUser(sessionId, userAgent, ipAddress);
    }

    // Set session cookie (expires in 30 days)
    const response = NextResponse.json({
      sessionId,
      userId: user.id,
      message: 'Session created/retrieved successfully'
    });

    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;

  } catch (error: any) {
    console.error('Session management error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'refresh') {
      // Generate new session ID
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const response = NextResponse.json({
        sessionId: newSessionId,
        message: 'Session refreshed successfully'
      });

      response.cookies.set('session_id', newSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });

      return response;
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Session management error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
