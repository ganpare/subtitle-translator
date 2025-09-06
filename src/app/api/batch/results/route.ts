import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Server-side batch results download API
 * Uses server-side OpenAI API key for security
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required for batch results' },
        { status: 401 }
      );
    }

    // Get server-side API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server OpenAI API key not configured' },
        { status: 500 }
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

    // Check batch status first
    const statusResponse = await fetch(`https://api.openai.com/v1/batches/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get batch status' },
        { status: statusResponse.status }
      );
    }

    const status = await statusResponse.json();
    
    if (status.status !== 'completed' || !status.output_file_id) {
      return NextResponse.json(
        { error: 'Batch is not completed yet' },
        { status: 400 }
      );
    }

    // Download results
    const resultsResponse = await fetch(`https://api.openai.com/v1/files/${status.output_file_id}/content`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!resultsResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download results' },
        { status: resultsResponse.status }
      );
    }

    const content = await resultsResponse.text();
    const results: Record<string, string> = {};
    
    content.split('\n').forEach(line => {
      if (line.trim()) {
        try {
          const result = JSON.parse(line);
          const body = result.response?.body || {};
          const text = body?.choices?.[0]?.message?.content?.trim?.() || body?.output_text?.trim?.() || '';
          
          if (result.custom_id && text) {
            results[result.custom_id] = text;
          }
        } catch (e) {
          // Skip invalid lines
        }
      }
    });

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('Batch results error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

