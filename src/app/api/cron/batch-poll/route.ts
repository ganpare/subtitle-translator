import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the batch polling endpoint
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3010';
    const response = await fetch(`${baseUrl}/api/batch/poll`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return NextResponse.json({ success: true, message: 'Batch polling completed' });
    } else {
      return NextResponse.json({ error: 'Batch polling failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
