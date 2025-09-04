import { NextRequest, NextResponse } from 'next/server';

/**
 * Batch completion notification API
 * This can be used to notify users when batch jobs are completed
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, apiKey, webhookUrl, email } = body;

    if (!jobId || !apiKey) {
      return NextResponse.json(
        { error: 'Missing jobId or apiKey' },
        { status: 400 }
      );
    }

    // Check if batch is completed
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
    
    if (batchStatus.status === 'completed') {
      // Send notification if webhook URL is provided
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jobId,
              status: 'completed',
              outputFileId: batchStatus.output_file_id,
              message: `Batch job ${jobId} has completed successfully!`,
            }),
          });
        } catch (error) {
          console.error('Failed to send webhook notification:', error);
        }
      }

      // TODO: Add email notification if email is provided
      // This would require an email service integration
      
      return NextResponse.json({
        jobId,
        status: 'completed',
        message: 'Batch completed and notification sent',
        outputFileId: batchStatus.output_file_id,
      });
    } else {
      return NextResponse.json({
        jobId,
        status: batchStatus.status,
        message: `Batch is still ${batchStatus.status}`,
      });
    }

  } catch (error: any) {
    console.error('Batch notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
