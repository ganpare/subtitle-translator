import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Server-side batch translation API
 * Uses server-side OpenAI API key for security
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Batch translate API called");
    console.log("🔍 Environment check:", {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      nodeEnv: process.env.NODE_ENV
    });
    
    // Check authentication
    const session = await getServerSession(authOptions);
    console.log("🔍 Session check:", {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasEmail: !!session?.user?.email,
      hasId: !!session?.user?.id,
      user: session?.user
    });
    
    if (!session?.user?.email) {
      console.log("❌ Authentication failed - no email");
      return NextResponse.json(
        { error: 'Authentication required for batch translation' },
        { status: 401 }
      );
    }
    
    if (!session?.user?.id) {
      console.log("❌ Authentication failed - no user ID");
      return NextResponse.json(
        { error: 'User ID not found in session' },
        { status: 401 }
      );
    }
    
    console.log("✅ User authenticated:", {
      email: session.user.email,
      id: session.user.id,
      name: session.user.name
    });

    // Get server-side API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log("❌ OpenAI API key not configured");
      return NextResponse.json(
        { error: 'Server OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    console.log("✅ OpenAI API key configured");

    const body = await request.json();
    console.log("📦 Request body:", {
      chunksCount: body.chunks?.length || 0,
      model: body.model,
      targetLanguage: body.targetLanguage,
      sourceLanguage: body.sourceLanguage
    });
    
    const { 
      chunks, 
      model, 
      temperature, 
      sysPrompt, 
      userPrompt, 
      targetLanguage, 
      sourceLanguage,
      sourceMeta 
    } = body;

    if (!chunks || !Array.isArray(chunks)) {
      return NextResponse.json(
        { error: 'Missing or invalid chunks array' },
        { status: 400 }
      );
    }

    // Import batch utilities
    const { 
      generateBatchJSONL, 
      uploadBatchFile, 
      createBatchJob
    } = await import('@/app/components/openai-batch/batchAPI');

    // Import database operations
    const { createBatchJob: createBatchJobDB, createSubtitleSegments } = await import('@/lib/db-operations');
    
    // Import subtitle parser
    const { parseSubtitleFile } = await import('@/app/utils/subtitle-parser');
    
    // Helper function to format time for database storage
    const formatTimeForDB = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    // Generate batch JSONL
    const jsonl = generateBatchJSONL(chunks, {
      model: model || 'gpt-4o-mini',
      temperature: temperature || 1.0,
      sysPrompt: sysPrompt || 'You are a helpful translator.',
      userPrompt: userPrompt || 'Translate from ${sourceLanguage} to ${targetLanguage}: ${content}',
      targetLanguage: targetLanguage || 'ja',
      sourceLanguage: sourceLanguage || 'auto'
    });

    // Upload batch file
    const { file_id } = await uploadBatchFile(jsonl, apiKey);

    // Create batch job
    const job = await createBatchJob(file_id, apiKey);

    // Save batch job to database
    console.log("💾 Creating batch job in database...");
    createBatchJobDB(
      session.user.id,
      job.id,
      chunks.map(chunk => chunk.id),
      sourceMeta || {}
    );
    console.log("✅ Batch job created in database");

    // Parse subtitle file to extract timing information
    const sourceText = chunks.map(chunk => chunk.text).join('\n');
    const fileType = sourceMeta?.fileType || 'srt';
    console.log("🔍 Parsing subtitle file:", { fileType, sourceTextLength: sourceText.length });
    
    const segments = parseSubtitleFile(sourceText, fileType);
    console.log("📝 Parsed segments:", { count: segments.length, firstSegment: segments[0] });
    
    // Save original segment information to database with timing (using batch_job_id)
    const segmentData = chunks.map((chunk, index) => {
      // Find corresponding segment with timing info
      const segment = segments.find(s => s.text === chunk.text);
      const startTime = segment ? formatTimeForDB(segment.startTime) : null;
      const endTime = segment ? formatTimeForDB(segment.endTime) : null;
      
      console.log(`📊 Segment ${index}:`, { 
        chunkText: chunk.text.substring(0, 50) + '...', 
        startTime, 
        endTime,
        hasSegment: !!segment
      });
      
      return {
        segmentIndex: index,
        startTime,
        endTime,
        originalText: chunk.text
      };
    });
    
    console.log("💾 Saving segments to database...");
    await createSubtitleSegments(job.id, segmentData, true);

    return NextResponse.json({
      type: 'batch',
      jobId: job.id,
      status: 'validating',
      message: 'Batch job created successfully'
    });

  } catch (error: any) {
    console.error('Batch translation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
