import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side batch status monitoring API
 * This allows background monitoring of batch jobs even when browser is closed
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const enabled = process.env.ENABLE_SERVER_BATCH !== 'false';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!enabled) {
      return NextResponse.json(
        { error: 'Server batch status is disabled' },
        { status: 403 }
      );
    }

    if (!jobId || !apiKey) {
      return NextResponse.json(
        { error: 'Missing jobId or server OPENAI_API_KEY' },
        { status: 400 }
      );
    }

    // Check batch status from OpenAI
    const response = await fetch(`https://api.openai.com/v1/batches/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: `Failed to check batch status: ${error.error?.message || response.status}` },
        { status: response.status }
      );
    }

    const batchStatus = await response.json();
    
    return NextResponse.json({
      jobId,
      status: batchStatus.status,
      createdAt: batchStatus.created_at,
      completionWindow: batchStatus.completion_window,
      outputFileId: batchStatus.output_file_id,
      errorFileId: batchStatus.error_file_id,
    });

  } catch (error: any) {
    console.error('Batch status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const enabled = process.env.ENABLE_SERVER_BATCH !== 'false';
    const body = await request.json();
    const { jobIds } = body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!enabled) {
      return NextResponse.json(
        { error: 'Server batch status is disabled' },
        { status: 403 }
      );
    }

    if (!jobIds || !Array.isArray(jobIds) || !apiKey) {
      return NextResponse.json(
        { error: 'Missing jobIds array or server OPENAI_API_KEY' },
        { status: 400 }
      );
    }

    // Check multiple batch statuses
    const statusPromises = jobIds.map(async (jobId: string) => {
      try {
        const response = await fetch(`https://api.openai.com/v1/batches/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          return { jobId, error: `Failed to check status: ${response.status}` };
        }

        const batchStatus = await response.json();
        return {
          jobId,
          status: batchStatus.status,
          createdAt: batchStatus.created_at,
          outputFileId: batchStatus.output_file_id,
          errorFileId: batchStatus.error_file_id,
        };
      } catch (error: any) {
        return { jobId, error: error.message };
      }
    });

    const results = await Promise.all(statusPromises);
    
    return NextResponse.json({ results });

  } catch (error: any) {
    console.error('Batch status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
