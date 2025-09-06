"use client";

import { useSession } from 'next-auth/react';
import { Card, Button, Space, Typography, Alert } from 'antd';
import { LockOutlined, LoginOutlined } from '@ant-design/icons';
import { signIn } from 'next-auth/react';

const { Title, Text } = Typography;

interface AuthRequiredProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  feature?: string;
}

export default function AuthRequired({ 
  children, 
  fallback,
  feature = "this feature"
}: AuthRequiredProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div>読み込み中...</div>;
  }

  if (!session) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <LockOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
          <div>
            <Title level={3}>認証が必要です</Title>
            <Text type="secondary">
              {feature}を使用するには、Googleでサインインしてください。ブラウザを閉じてもサーバー側でバッチジョブの状態を追跡し続けることができます。
            </Text>
          </div>
          <Button 
            type="primary" 
            size="large"
            icon={<LoginOutlined />}
            onClick={() => signIn('google')}
          >
            Googleでサインイン
          </Button>
          <Alert
            message="なぜサインインが必要ですか？"
            description="サインインすることで、ブラウザを閉じてもサーバー側でバッチ翻訳ジョブの状態を追跡し続けることができ、完了時に通知を受け取れます。"
            type="info"
            showIcon
          />
        </Space>
      </Card>
    );
  }

  return <>{children}</>;
}
