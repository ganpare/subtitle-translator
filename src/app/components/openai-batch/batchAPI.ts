/**
 * OpenAI Batch API utilities for cost-effective bulk translation
 * Reduces costs by ~50% using asynchronous batch processing
 */

export interface BatchRequest {
  custom_id: string;
  method: "POST";
  url: "/v1/chat/completions";
  body: {
    model: string;
    messages: Array<{
      role: "system" | "user";
      content: string;
    }>;
    temperature: number;
  };
}

export interface BatchJob {
  id: string;
  input_file_id: string;
  status: "validating" | "failed" | "in_progress" | "finalizing" | "completed" | "expired" | "cancelling" | "cancelled";
  created_at: number;
  completion_window: "24h";
  output_file_id?: string;
  error_file_id?: string;
}

export interface BatchStatus {
  jobId: string;
  status: BatchJob["status"];
  createdAt: number;
  chunkIds: string[];
  source?: BatchSourceMeta;
  progress?: {
    total: number;
    completed: number;
    failed: number;
  };
}

export interface BatchSourceMeta {
  name?: string;
  hash?: string; // MD5 or other fingerprint of contentLines or full text
  size?: number; // optional original file size in bytes
  fileType?: string; // srt | vtt | ass | lrc
  lineCount?: number; // number of translated content lines
  targetLanguage?: string;
  bilingual?: boolean;
  bilingualPosition?: 'above' | 'below';
}

/**
 * Generate JSONL content for batch API
 */
export const generateBatchJSONL = (
  chunks: Array<{ id: string; text: string }>,
  config: {
    model: string;
    temperature: number;
    sysPrompt: string;
    userPrompt: string;
    targetLanguage: string;
    sourceLanguage: string;
  }
): string => {
  const requests: BatchRequest[] = chunks.map((chunk) => ({
    custom_id: chunk.id,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: config.model,
      messages: [
        { role: "system", content: config.sysPrompt },
        { 
          role: "user", 
          content: config.userPrompt
            .replace("${sourceLanguage}", config.sourceLanguage)
            .replace("${targetLanguage}", config.targetLanguage)
            .replace("${content}", chunk.text)
        },
      ],
      temperature: config.temperature,
    },
  }));

  return requests.map(req => JSON.stringify(req)).join('\n');
};

/**
 * Upload file to OpenAI Files API
 */
export const uploadBatchFile = async (
  jsonlContent: string,
  apiKey: string
): Promise<{ file_id: string }> => {
  const formData = new FormData();
  const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
  formData.append('file', blob, 'batch_requests.jsonl');
  formData.append('purpose', 'batch');

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`File upload failed: ${error.error?.message || response.status}`);
  }

  const data = await response.json();
  return { file_id: data.id };
};

/**
 * Create batch job
 */
export const createBatchJob = async (
  inputFileId: string,
  apiKey: string
): Promise<BatchJob> => {
  const response = await fetch('https://api.openai.com/v1/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Batch creation failed: ${error.error?.message || response.status}`);
  }

  return await response.json();
};

/**
 * Get batch job status
 */
export const getBatchStatus = async (
  batchId: string,
  apiKey: string
): Promise<BatchJob> => {
  const response = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Batch status check failed: ${error.error?.message || response.status}`);
  }

  return await response.json();
};

/**
 * Download and parse batch results
 */
export const downloadBatchResults = async (
  outputFileId: string,
  apiKey: string
): Promise<Record<string, string>> => {
  const response = await fetch(`https://api.openai.com/v1/files/${outputFileId}/content`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Results download failed: ${response.status}`);
  }

  const content = await response.text();
  const results: Record<string, string> = {};
  
  content.split('\n').forEach(line => {
    if (line.trim()) {
      try {
        const result = JSON.parse(line);
        if (result.custom_id && result.response?.body?.choices?.[0]?.message?.content) {
          results[result.custom_id] = result.response.body.choices[0].message.content.trim();
        }
      } catch (e) {
        console.warn('Failed to parse result line:', line);
      }
    }
  });

  return results;
};

/**
 * Storage keys for batch status persistence
 */
export const BATCH_STORAGE_KEY = 'openai_batch_jobs';

/**
 * Save batch status to server
 */
export const saveBatchStatus = async (status: BatchStatus, sessionId?: string) => {
  try {
    const response = await fetch('/api/batch/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: status.jobId,
        status: status.status,
        chunkIds: status.chunkIds,
        source: status.source,
        userId: sessionId || 'anonymous',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save batch status: ${response.status}`);
    }

    return await response.json();
  } catch (e) {
    console.error('Failed to save batch status:', e);
    throw e;
  }
};

/**
 * Get all batch statuses from server
 */
export const getBatchStatuses = async (sessionId?: string): Promise<BatchStatus[]> => {
  try {
    const response = await fetch(`/api/batch/jobs?userId=${sessionId || 'anonymous'}`);
    if (response.ok) {
      const data = await response.json();
      return data.jobs || [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Remove batch status from server
 */
export const removeBatchStatus = async (jobId: string, sessionId?: string) => {
  try {
    const response = await fetch(`/api/batch/jobs?jobId=${jobId}&userId=${sessionId || 'anonymous'}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to remove batch status: ${response.status}`);
    }

    return await response.json();
  } catch (e) {
    console.error('Failed to remove batch status:', e);
    throw e;
  }
};
