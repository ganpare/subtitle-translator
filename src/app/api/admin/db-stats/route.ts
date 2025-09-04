import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseStats, cleanupOldData } from '@/lib/db-operations';

/**
 * Database statistics and management API
 * Provides insights into database usage and cleanup functionality
 */

export async function GET(request: NextRequest) {
  try {
    const stats = getDatabaseStats();
    
    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Database stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, daysOld = 30 } = body;

    if (action === 'cleanup') {
      cleanupOldData(daysOld);
      
      return NextResponse.json({
        success: true,
        message: `Cleanup completed for data older than ${daysOld} days`,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Database management error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
