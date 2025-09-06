import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBatchJobsByUserId, updateBatchJobStatus, markBatchJobAsCompleted } from '@/lib/db-operations';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all batch jobs for the user
    const batchJobs = getBatchJobsByUserId(session.user.id);
    
    // Check status for each job
    for (const job of batchJobs) {
      if (job.status === 'validating' || job.status === 'in_progress') {
        try {
          // Check status with OpenAI
          const response = await fetch(`https://api.openai.com/v1/batches/${job.job_id}`, {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            const newStatus = data.status;
            
            // Update status in database
            updateBatchJobStatus(job.id, newStatus);
            
            // If job is completed, trigger download and processing
            if (newStatus === 'completed') {
              await processCompletedBatch(job, data);
              // 完了したバッチジョブにフラグを設定
              markBatchJobAsCompleted(job.id);
            }
          }
        } catch (error) {
          console.error(`Error checking status for job ${job.job_id}:`, error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Batch polling error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processCompletedBatch(job: any, batchData: any) {
  try {
    // Download batch results
    const response = await fetch(`https://api.openai.com/v1/batches/${job.job_id}/files/${job.job_id}-results.jsonl`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const results = await response.text();
      const lines = results.trim().split('\n');
      
      // Process each result and save to translation history
      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          const customId = result.custom_id;
          const translatedText = result.response?.body?.choices?.[0]?.message?.content;
          
          if (customId && translatedText) {
            // Save translation to segment translations table
            const { createSubtitleSegmentTranslation } = await import('@/lib/db-operations');
            await createSubtitleSegmentTranslation(
              job.user_id,
              customId,
              translatedText,
              'ja' // target language
            );

            // Save to translation history with batch job info and token usage
            const { createTranslationHistory } = await import('@/lib/db-operations');
            await createTranslationHistory(
              job.user_id,
              customId, // source text (segment ID)
              translatedText,
              'batch', // translation method
              'openai', // service
              'ja', // target language
              batchData.usage ? {
                input_tokens: batchData.usage.prompt_tokens || 0,
                output_tokens: batchData.usage.completion_tokens || 0,
                total_tokens: batchData.usage.total_tokens || 0,
                usage_details: JSON.stringify(batchData.usage)
              } : undefined,
              job.id // batch job ID
            );
          }
        } catch (parseError) {
          console.error('Error parsing result line:', parseError);
        }
      }
    }
  } catch (error) {
    console.error('Error processing completed batch:', error);
  }
}

