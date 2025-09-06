"use client";

import React, { useState, useEffect } from 'react';
import { Card, List, Button, Progress, Tag, Space, Typography, message, Modal, Upload } from 'antd';
import { ReloadOutlined, DownloadOutlined, DeleteOutlined, FileTextOutlined, PaperClipOutlined } from '@ant-design/icons';
import { 
  BatchStatus, 
  getBatchStatus, 
  downloadBatchResults
} from './batchAPI';
import { downloadFile } from '@/app/utils';
import SparkMD5 from 'spark-md5';
import { detectSubtitleFormat, filterSubLines } from '@/app/[locale]/subtitleUtils';
import { useBatchPolling } from '@/app/hooks/useBatchPolling';

const { Text } = Typography;

interface BatchStatusPanelProps {
  onResultsReady?: (results: Record<string, string>, jobId: string) => void;
}

const BatchStatusPanel: React.FC<BatchStatusPanelProps> = ({ onResultsReady }) => {
  const [batches, setBatches] = useState<BatchStatus[]>([]);
  const [loading, setLoading] = useState<string[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBatch, setMergeBatch] = useState<BatchStatus | null>(null);
  const [mergeFile, setMergeFile] = useState<File | null>(null);
  const [merging, setMerging] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [sessionId, setSessionId] = useState<string>('');

  // 自動ポーリング機能（10分ごと）
  const { manualPoll } = useBatchPolling(true, 10 * 60 * 1000);

  const loadBatches = async () => {
    try {
      // Load batches from server (session is handled by cookies)
      const response = await fetch('/api/batch/jobs');
      if (response.ok) {
        const data = await response.json();
        setBatches(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to load batches:', error);
    }
  };

  useEffect(() => {
    loadBatches();
    const interval = setInterval(loadBatches, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Request notification permission on component mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          setNotificationPermission(permission);
        });
      }
    }
  }, []);

  // Check for completed batches and show notifications
  useEffect(() => {
    const checkCompletedBatches = () => {
      batches.forEach(async (batch) => {
        if (batch.status === 'completed') {
          // Show browser notification if permission is granted
          if (Notification.permission === 'granted') {
            new Notification('Batch Translation Completed', {
              body: `Batch job ${batch.jobId.slice(-8)} has completed successfully!`,
              icon: '/logo.png',
            });
          }
        }
      });
    };

    if (batches.length > 0) {
      checkCompletedBatches();
    }
  }, [batches]);

  const refreshBatch = async (batch: BatchStatus) => {
    setLoading(prev => [...prev, batch.jobId]);
    try {
      // 手動でポーリングを実行
      await manualPoll();
      
      // Use server-side API for better reliability (server reads key from env)
      const response = await fetch(`/api/batch/status?jobId=${batch.jobId}`);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const status = await response.json();
      const updatedBatch = {
        ...batch,
        status: status.status,
        progress: {
          total: batch.chunkIds.length,
          completed: status.status === 'completed' ? batch.chunkIds.length : 0,
          failed: status.status === 'failed' ? batch.chunkIds.length : 0,
        }
      };

      // Update server-side storage
      await fetch('/api/batch/jobs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: batch.jobId,
          status: status.status,
          usage: status.usage || undefined,
        }),
      });
      
      // Reload batches from server
      await loadBatches();

      if (status.status === 'completed' && status.outputFileId) {
        messageApi.success(`Batch ${batch.jobId} completed!`);
        
        // Auto-download results using server-side API
        const resultsResponse = await fetch(`/api/batch/results?jobId=${batch.jobId}`);
        if (resultsResponse.ok) {
          const results = await resultsResponse.json();
          onResultsReady?.(results, batch.jobId);
        }
      } else if (status.status === 'failed') {
        messageApi.error(`Batch ${batch.jobId} failed`);
      }
    } catch (error: any) {
      messageApi.error(`Failed to refresh batch: ${error.message}`);
    } finally {
      setLoading(prev => prev.filter(id => id !== batch.jobId));
    }
  };

  const downloadResults = async (batch: BatchStatus) => {
    try {
      const response = await fetch(`/api/batch/results?jobId=${batch.jobId}`);
      if (response.ok) {
        const results = await response.json();
        onResultsReady?.(results, batch.jobId);
        messageApi.success('Results downloaded successfully');
      } else {
        messageApi.warning('Batch is not completed yet');
      }
    } catch (error: any) {
      messageApi.error(`Failed to download results: ${error.message}`);
    }
  };

  const exportAsText = async (batch: BatchStatus) => {
    try {
      const response = await fetch(`/api/batch/results?jobId=${batch.jobId}`);
      if (!response.ok) {
        messageApi.warning('Batch is not completed yet');
        return;
      }

      const results = await response.json();
      
      // 文脈チャンクの場合は結果を分割して結合
      let ordered: string;
      if (batch.sourceMeta?.contextChunks && batch.sourceMeta?.contextWindow > 1) {
        // 文脈チャンクの場合：各チャンクの結果を分割して結合
        const allLines: string[] = [];
        for (const id of batch.chunkIds) {
          const chunkResult = results[id] ?? '';
          const lines = chunkResult.split('\n');
          allLines.push(...lines);
        }
        ordered = allLines.join('\n');
      } else {
        // 通常の行単位処理
        ordered = batch.chunkIds.map((id) => results[id] ?? '').join('\n');
      }
      
      const fileName = `batch_${batch.jobId.slice(-8)}.txt`;
      await downloadFile(ordered, fileName);
      messageApi.success(`Exported ${fileName}`);
    } catch (error: any) {
      messageApi.error(`Failed to export text: ${error.message}`);
    }
  };

  const openMerge = (batch: BatchStatus) => {
    setMergeBatch(batch);
    setMergeFile(null);
    setMergeOpen(true);
  };

  const readFileText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });

  const handleMerge = async () => {
    if (!mergeBatch || !mergeFile) return;
    setMerging(true);
    try {
      const response = await fetch(`/api/batch/results?jobId=${mergeBatch.jobId}`);
      if (!response.ok) {
        messageApi.warning('Batch is not completed yet');
        return;
      }

      const results = await response.json();
      const raw = (await readFileText(mergeFile)).replace(/\r\n/g, '\n');
      const lines = raw.split('\n');
      const fileType = detectSubtitleFormat(lines);
      if (!(fileType === 'srt' || fileType === 'vtt')) {
        messageApi.error('Only SRT/VTT merge is supported currently');
        return;
      }
      const { contentLines, contentIndices } = filterSubLines(lines, fileType);

      // Compare hash if available
      const currentHash = SparkMD5.hash(contentLines.join('\n'));
      if (mergeBatch.source?.hash && mergeBatch.source.hash !== currentHash) {
        messageApi.warning('Selected file content differs from the original used for this batch');
      }

      // 文脈チャンクの場合は結果を分割
      let translatedOrdered: string[];
      if (mergeBatch.sourceMeta?.contextChunks && mergeBatch.sourceMeta?.contextWindow > 1) {
        // 文脈チャンクの場合：各チャンクの結果を分割
        const allLines: string[] = [];
        for (const id of mergeBatch.chunkIds) {
          const chunkResult = results[id] ?? '';
          const lines = chunkResult.split('\n');
          allLines.push(...lines);
        }
        translatedOrdered = allLines;
      } else {
        // 通常の行単位処理
        translatedOrdered = mergeBatch.chunkIds.map((id) => results[id] ?? '');
      }
      
      if (translatedOrdered.length !== contentIndices.length) {
        messageApi.warning(`Line count mismatch: src ${contentIndices.length} vs results ${translatedOrdered.length}. Will merge by index.`);
      }

      const merged = [...lines];
      const count = Math.min(contentIndices.length, translatedOrdered.length);
      for (let i = 0; i < count; i++) {
        merged[contentIndices[i]] = translatedOrdered[i] || '';
      }

      const ext = fileType === 'vtt' ? '.vtt' : '.srt';
      const base = (mergeFile.name.replace(/\.[^/.]+$/, '')) || `subtitle_${mergeBatch.jobId.slice(-8)}`;
      const outName = `${base}_translated${ext}`;
      const mergedText = merged.join('\n');
      await downloadFile(mergedText, outName);

      // Save source and translation to server
      try {
        const sourceResp = await fetch('/api/subtitles/source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            filename: mergeFile.name,
            file_type: fileType,
            hash: currentHash,
            size_bytes: mergeFile.size,
            line_count: contentIndices.length,
            content: raw,
          })
        });
        if (sourceResp.ok) {
          const { sourceId } = await sourceResp.json();
          const lang = mergeBatch.source?.targetLanguage || 'unknown';
          await fetch('/api/subtitles/translation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              source_id: sourceId,
              batch_job_id: mergeBatch.jobId,
              target_language: lang,
              content: mergedText,
              status: 'final'
            })
          });
        }
      } catch (e) {
        console.warn('Failed to save subtitles to server', e);
      }
      messageApi.success(`Merged and exported: ${outName}`);
      setMergeOpen(false);
    } catch (e: any) {
      messageApi.error(e?.message || 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const removeBatch = (jobId: string) => {
    Modal.confirm({
      title: 'Remove Batch Job',
      content: 'Are you sure you want to remove this batch job from the list?',
      onOk: async () => {
        try {
          await fetch(`/api/batch/jobs?jobId=${jobId}`, {
            method: 'DELETE',
          });
          await loadBatches();
          messageApi.success('Batch job removed');
        } catch (error) {
          messageApi.error('Failed to remove batch job');
        }
      }
    });
  };

  const getStatusColor = (status: BatchStatus['status']) => {
    const colors = {
      'validating': 'processing',
      'in_progress': 'processing', 
      'finalizing': 'processing',
      'completed': 'success',
      'failed': 'error',
      'expired': 'warning',
      'cancelled': 'default',
      'cancelling': 'warning'
    };
    return colors[status] || 'default';
  };

  const getProgress = (batch: BatchStatus) => {
    if (batch.status === 'completed') return 100;
    if (batch.status === 'failed') return 100;
    if (batch.status === 'in_progress') return 50;
    if (batch.status === 'finalizing') return 90;
    return 10;
  };

  // Always render panel, even if there are no jobs yet

  return (
    <>
      {contextHolder}
      <Card 
        title="OpenAI Batch Jobs" 
        size="small" 
        style={{ marginTop: 16 }}
        extra={
          <Space>
            {notificationPermission === 'granted' && (
              <Tag color="green" size="small">通知有効</Tag>
            )}
            {notificationPermission === 'denied' && (
              <Tag color="red" size="small">通知無効</Tag>
            )}
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadBatches}
              size="small"
            >
              Refresh
            </Button>
          </Space>
        }
      >
        <List
          size="small"
          dataSource={batches}
          renderItem={(batch) => (
            <List.Item
              actions={[
                <Button
                  key="refresh"
                  icon={<ReloadOutlined />}
                  loading={loading.includes(batch.jobId)}
                  onClick={() => refreshBatch(batch)}
                  size="small"
                />,
                <Button
                  key="download"
                  icon={<DownloadOutlined />}
                  disabled={batch.status !== 'completed'}
                  onClick={() => downloadResults(batch)}
                  size="small"
                  type="primary"
                />,
                <Button
                  key="export"
                  icon={<FileTextOutlined />}
                  disabled={batch.status !== 'completed'}
                  onClick={() => exportAsText(batch)}
                  size="small"
                />,
                <Button
                  key="merge"
                  icon={<PaperClipOutlined />}
                  disabled={batch.status !== 'completed'}
                  onClick={() => openMerge(batch)}
                  size="small"
                />,
                <Button
                  key="remove"
                  icon={<DeleteOutlined />}
                  onClick={() => removeBatch(batch.jobId)}
                  size="small"
                  danger
                />
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>Job {batch.jobId.slice(-8)}</Text>
                    <Tag color={getStatusColor(batch.status)}>
                      {batch.status.toUpperCase()}
                    </Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Text type="secondary">
                      {batch.chunkIds.length} chunks • Created: {new Date(batch.createdAt).toLocaleString()}
                    </Text>
                    {batch.usage && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        Tokens: {batch.usage.input_tokens || 0} in • {batch.usage.output_tokens || 0} out • {batch.usage.total_tokens || 0} total
                      </Text>
                    )}
                    <Progress
                      percent={getProgress(batch)}
                      size="small"
                      status={batch.status === 'failed' ? 'exception' : undefined}
                    />
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title="Merge with Source (SRT/VTT)"
        open={mergeOpen}
        onCancel={() => setMergeOpen(false)}
        onOk={handleMerge}
        okButtonProps={{ disabled: !mergeFile, loading: merging }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Select the original SRT/VTT used for this batch to rebuild the subtitle.
          </Typography.Text>
          <Upload.Dragger
            accept=".srt,.vtt"
            beforeUpload={(file) => {
              setMergeFile(file as File);
              return false; // prevent auto upload
            }}
            maxCount={1}
            fileList={mergeFile ? [{ uid: '1', name: mergeFile.name, status: 'done' as const } as any] : []}
            onRemove={() => setMergeFile(null)}
          >
            <p className="ant-upload-drag-icon"><PaperClipOutlined /></p>
            <p className="ant-upload-text">Click or drag file to this area</p>
            <p className="ant-upload-hint">Only .srt and .vtt are supported for now.</p>
          </Upload.Dragger>
        </Space>
      </Modal>
    </>
  );
};

export default BatchStatusPanel;
