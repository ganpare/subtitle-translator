import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getBatchJobsByUserId, 
  createBatchJob, 
  updateBatchJobStatus, 
  deleteBatchJob,
  updateBatchUsage
} from '@/lib/db-operations';

/**
 * Server-side batch jobs management API with SQLite database
 * Stores batch information in database for persistence and multi-device access
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const batchJobs = getBatchJobsByUserId(session.user.id).filter(job => !job.is_completed);
    
    // Convert database format to API format
    const jobs = batchJobs.map(job => ({
      id: job.id,
      jobId: job.openai_job_id,
      status: job.status,
      createdAt: job.created_at,
      chunkIds: job.chunk_ids,
      source: job.source_meta,
      userId: job.user_id,
      usage: job.usage_input_tokens ? {
        input_tokens: job.usage_input_tokens,
        output_tokens: job.usage_output_tokens,
        total_tokens: job.usage_total_tokens,
      } : undefined,
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
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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
    const batchJob = createBatchJob(session.user.id, jobId, chunkIds, source);

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
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      jobId, 
      status, 
      usage 
    } = body;

    if (!jobId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, status' },
        { status: 400 }
      );
    }

    // Update batch job status
    updateBatchJobStatus(jobId, status, usage);

    return NextResponse.json({
      success: true,
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
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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

    // Delete batch job
    deleteBatchJob(jobId);

    return NextResponse.json({
      success: true,
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