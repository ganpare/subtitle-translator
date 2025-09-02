"use client";

import React, { useState, useEffect } from 'react';
import { Card, List, Button, Progress, Tag, Space, Typography, message, Modal, Spin } from 'antd';
import { ReloadOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { 
  BatchStatus, 
  getBatchStatuses, 
  getBatchStatus, 
  downloadBatchResults, 
  removeBatchStatus 
} from './batchAPI';

const { Text } = Typography;

interface BatchStatusPanelProps {
  apiKey: string;
  onResultsReady?: (results: Record<string, string>, jobId: string) => void;
}

const BatchStatusPanel: React.FC<BatchStatusPanelProps> = ({ apiKey, onResultsReady }) => {
  const [batches, setBatches] = useState<BatchStatus[]>([]);
  const [loading, setLoading] = useState<string[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

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
    </>
  );
};

export default BatchStatusPanel;