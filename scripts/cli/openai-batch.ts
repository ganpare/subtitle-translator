#!/usr/bin/env ts-node
/*
  Minimal CLI for OpenAI Batch operations reusing app logic.
  Commands:
    - submit: Read a text file, split by lines into chunks, create batch, and persist a local JSON status file.
    - status: Check batch status by ID.
    - results: Download results for a completed batch ID and print JSON to stdout.

  Usage examples:
    yarn batch:submit --file input.txt --apiKey sk-... --model gpt-4o-mini \
      --sysPrompt "You are a translator." \
      --userPrompt "Translate from ${sourceLanguage} to ${targetLanguage}: ${content}" \
      --sourceLanguage en --targetLanguage ja

    yarn batch:status --jobId <batch_id> --apiKey sk-...
    yarn batch:results --jobId <batch_id> --apiKey sk-...
*/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Reuse browser-safe functions by duplicating minimal parts needed server-side
import {
  generateBatchJSONL,
  uploadBatchFile,
  createBatchJob,
  getBatchStatus,
  downloadBatchResults,
} from '../../src/app/components/openai-batch/batchAPI';

// Node compatibility: global fetch/FormData/Blob are available in Node 18+.
if (typeof (global as any).fetch !== 'function') {
  throw new Error('Node 18+ runtime with global fetch is required.');
}

// Simple args parser
function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    } else if (!args._) {
      args._ = a;
    }
  }
  return args as any;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);

  const apiKey = (args.apiKey as string) || process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    console.error('Missing --apiKey or OPENAI_API_KEY');
    process.exit(1);
  }

  if (cmd === 'submit') {
    const file = args.file as string;
    if (!file) {
      console.error('Required: --file <path>');
      process.exit(1);
    }

    const sourceLanguage = (args.sourceLanguage as string) || 'auto';
    const targetLanguage = (args.targetLanguage as string) || 'ja';
    const model = (args.model as string) || 'gpt-4o-mini';
    const temperature = Number(args.temperature ?? 1.0);
    const sysPrompt = (args.sysPrompt as string) || 'You are a helpful translator.';
    const userPrompt = (args.userPrompt as string) || 'Translate from ${sourceLanguage} to ${targetLanguage}: ${content}';
    const chunkSize = Number(args.chunkSize ?? 2000);

    const text = fs.readFileSync(path.resolve(file), 'utf8');
    // naive line-based chunking to keep CLI generic
    const lines = text.split(/\r?\n/);
    const chunks: Array<{ id: string; text: string }> = [];
    let buf: string[] = [];
    let idx = 0;
    function flush() {
      if (buf.length) {
        chunks.push({ id: `cli_${idx++}`, text: buf.join('\n') });
        buf = [];
      }
    }
    for (const line of lines) {
      if (buf.join('\n').length + line.length + 1 > chunkSize) flush();
      buf.push(line);
    }
    flush();

    const jsonl = generateBatchJSONL(chunks, { model, temperature, sysPrompt, userPrompt, targetLanguage, sourceLanguage });
    const { file_id } = await uploadBatchFile(jsonl, apiKey);
    const job = await createBatchJob(file_id, apiKey);

    // Minimal local state file under scripts/cli/.batch-state.json
    const stateFile = path.resolve(__dirname, '.batch-state.json');
    let state: any[] = [];
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
    state = state.filter((s) => s.jobId !== job.id);
    state.push({ jobId: job.id, createdAt: Date.now(), chunkIds: chunks.map(c => c.id), status: job.status });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    console.log(JSON.stringify({ jobId: job.id, inputFileId: job.input_file_id, status: job.status }, null, 2));
    return;
  }

  if (cmd === 'status') {
    const jobId = args.jobId as string;
    if (!jobId) {
      console.error('Required: --jobId <id>');
      process.exit(1);
    }
    const status = await getBatchStatus(jobId, apiKey);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (cmd === 'results') {
    const jobId = args.jobId as string;
    if (!jobId) {
      console.error('Required: --jobId <id>');
      process.exit(1);
    }
    const status = await getBatchStatus(jobId, apiKey);
    if (status.status !== 'completed' || !status.output_file_id) {
      console.error('Batch not completed or no output_file_id yet');
      process.exit(2);
    }
    const results = await downloadBatchResults(status.output_file_id, apiKey);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.error('Unknown command. Use one of: submit | status | results');
  process.exit(1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
