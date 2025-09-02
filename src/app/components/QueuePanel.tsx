"use client";
import React from "react";
import { Card, List, Space, Tag, Button, Typography, Tooltip } from "antd";
import { PauseOutlined, PlayCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { QueueItem } from "@/app/hooks/useTranslationQueue";

const { Text } = Typography;

export default function QueuePanel({
  items,
  stats,
  running,
  onStart,
  onPause,
  onClear,
  onRemove,
}: {
  items: QueueItem[];
  stats: { total: number; queued: number; processing: number; done: number; error: number };
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
}) {

  const statusColor = (s: QueueItem["status"]) =>
    ({ queued: "default", processing: "processing", done: "success", error: "error", cancelled: "warning" }[s] || "default");

  return (
    <Card
      size="small"
      title={<Space><Text strong>Queue</Text><Tag>{stats.total} items</Tag></Space>}
      extra={
        <Space>
          {!running ? (
            <Button icon={<PlayCircleOutlined />} size="small" type="primary" onClick={onStart} disabled={items.length === 0}>
              Start
            </Button>
          ) : (
            <Button icon={<PauseOutlined />} size="small" onClick={onPause}>
              Pause
            </Button>
          )}
          <Tooltip title="Clear finished">
            <Button icon={<DeleteOutlined />} size="small" onClick={onClear} disabled={items.every((i) => i.status === "queued" || i.status === "processing")} />
          </Tooltip>
        </Space>
      }
    >
      <List
        size="small"
        dataSource={items}
        renderItem={(it) => (
          <List.Item actions={[<Button key={`rm_${it.id}`} size="small" icon={<DeleteOutlined />} onClick={() => onRemove(it.id)} disabled={it.status === "processing"} />]}>
            <List.Item.Meta
              title={<Space><Text ellipsis style={{ maxWidth: 280 }}>{it.name}</Text><Tag color={statusColor(it.status)}>{it.status}</Tag></Space>}
              description={<Text type="secondary">{(it.file.size / 1024).toFixed(1)} KB</Text>}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
