"use client";

import React, { useState, useEffect } from 'react';
import { Card, List, Button, Progress, Tag, Space, Typography, message, Modal, Upload } from 'antd';
import { ReloadOutlined, DownloadOutlined, DeleteOutlined, FileTextOutlined, PaperClipOutlined } from '@ant-design/icons';
import { 
  BatchStatus, 
  getBatchStatuses, 
  getBatchStatus, 
  downloadBatchResults, 
  removeBatchStatus 
} from './batchAPI';
import { downloadFile } from '@/app/utils';
import SparkMD5 from 'spark-md5';
import { detectSubtitleFormat, filterSubLines } from '@/app/[locale]/subtitleUtils';

const { Text } = Typography;

interface BatchStatusPanelProps {
  apiKey: string;
  onResultsReady?: (results: Record<string, string>, jobId: string) => void;
}

const BatchStatusPanel: React.FC<BatchStatusPanelProps> = ({ apiKey, onResultsReady }) => {
  const [batches, setBatches] = useState<BatchStatus[]>([]);
  const [loading, setLoading] = useState<string[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBatch, setMergeBatch] = useState<BatchStatus | null>(null);
  const [mergeFile, setMergeFile] = useState<File | null>(null);
  const [merging, setMerging] = useState(false);

  const loadBatches = () => {
    setBatches(getBatchStatuses());
  };

  useEffect(() => {
    loadBatches();
    const interval = setInterval(loadBatches, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const refreshBatch = async (batch: BatchStatus) => {
    if (!apiKey) {
      messageApi.error('API key is required');
      return;
    }

    setLoading(prev => [...prev, batch.jobId]);
    try {
      const status = await getBatchStatus(batch.jobId, apiKey);
      const updatedBatch = {
        ...batch,
        status: status.status,
        progress: {
          total: batch.chunkIds.length,
          completed: status.status === 'completed' ? batch.chunkIds.length : 0,
          failed: status.status === 'failed' ? batch.chunkIds.length : 0,
        }
      };

      // Update localStorage
      const allBatches = getBatchStatuses();
      const updatedBatches = allBatches.map(b => 
        b.jobId === batch.jobId ? updatedBatch : b
      );
      localStorage.setItem('openai_batch_jobs', JSON.stringify(updatedBatches));
      
      setBatches(updatedBatches);

      if (status.status === 'completed' && status.output_file_id) {
        messageApi.success(`Batch ${batch.jobId} completed!`);
        
        // Auto-download results
        const results = await downloadBatchResults(status.output_file_id, apiKey);
        onResultsReady?.(results, batch.jobId);
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
    if (!apiKey) {
      messageApi.error('API key is required');
      return;
    }

    try {
      const status = await getBatchStatus(batch.jobId, apiKey);
      if (status.status === 'completed' && status.output_file_id) {
        const results = await downloadBatchResults(status.output_file_id, apiKey);
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
    if (!apiKey) {
      messageApi.error('API key is required');
      return;
    }

    try {
      const status = await getBatchStatus(batch.jobId, apiKey);
      if (status.status !== 'completed' || !status.output_file_id) {
        messageApi.warning('Batch is not completed yet');
        return;
      }

      const results = await downloadBatchResults(status.output_file_id, apiKey);
      // Merge by original order using saved chunkIds
      const ordered = batch.chunkIds.map((id) => results[id] ?? '').join('\n');
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
      const status = await getBatchStatus(mergeBatch.jobId, apiKey);
      if (status.status !== 'completed' || !status.output_file_id) {
        messageApi.warning('Batch is not completed yet');
        return;
      }

      const results = await downloadBatchResults(status.output_file_id, apiKey);
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

      const translatedOrdered = mergeBatch.chunkIds.map((id) => results[id] ?? '');
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
      await downloadFile(merged.join('\n'), outName);
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
      onOk: () => {
        removeBatchStatus(jobId);
        loadBatches();
        messageApi.success('Batch job removed');
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

  if (batches.length === 0) {
    return null;
  }

  return (
    <>
      {contextHolder}
      <Card 
        title="OpenAI Batch Jobs" 
        size="small" 
        style={{ marginTop: 16 }}
        extra={
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadBatches}
            size="small"
          >
            Refresh
          </Button>
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
