import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { 
  getUserBySessionId, 
  getBatchJobsByUserId, 
  createBatchJob, 
  updateBatchJobStatus, 
  deleteBatchJob 
} from '@/lib/db-operations';

/**
 * Server-side batch jobs management API with SQLite database
 * Stores batch information in database for persistence and multi-device access
 */

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 401 }
      );
    }

    const user = getUserBySessionId(sessionId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const batchJobs = getBatchJobsByUserId(user.id);
    
    // Convert database format to API format
    const jobs = batchJobs.map(job => ({
      id: job.id,
      jobId: job.openai_job_id,
      status: job.status,
      createdAt: job.created_at,
      chunkIds: JSON.parse(job.chunk_ids),
      source: job.source_meta ? JSON.parse(job.source_meta) : undefined,
      userId: job.user_id,
    }));
    
    return NextResponse.json({
      jobs,
      count: jobs.length
    });

  } catch (error: any) {
    console.error('Get batch jobs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 401 }
      );
    }

    const user = getUserBySessionId(sessionId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { 
      jobId, 
      status, 
      chunkIds, 
      source
    } = body;

    if (!jobId || !status || !chunkIds) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, status, chunkIds' },
        { status: 400 }
      );
    }

    // Create new batch job in database
    const batchJob = createBatchJob(user.id, jobId, chunkIds, source);

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Batch job saved successfully'
    });

  } catch (error: any) {
    console.error('Save batch job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 401 }
      );
    }

    const user = getUserBySessionId(sessionId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { jobId, status } = body;

    if (!jobId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, status' },
        { status: 400 }
      );
    }

    const success = updateBatchJobStatus(jobId, status);

    if (!success) {
      return NextResponse.json(
        { error: 'Batch job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status,
      message: 'Batch job updated successfully'
    });

  } catch (error: any) {
    console.error('Update batch job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 401 }
      );
    }

    const user = getUserBySessionId(sessionId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const success = deleteBatchJob(jobId, user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Batch job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Batch job deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete batch job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
