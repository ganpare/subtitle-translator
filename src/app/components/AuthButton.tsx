"use client";

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button, Avatar, Dropdown, Space, Typography } from 'antd';
import { UserOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';

const { Text } = Typography;

export default function AuthButton() {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydration エラーを回避するため、マウント前は静的なボタンを表示
  if (!mounted) {
    return <Button loading>読み込み中...</Button>;
  }

  if (status === 'loading') {
    return <Button loading>読み込み中...</Button>;
  }

  if (session?.user) {
    return (
      <Dropdown
        menu={{
          items: [
            {
              key: 'profile',
              label: (
                <Space>
                  <UserOutlined />
                  <Text strong>{session.user.name || session.user.email}</Text>
                </Space>
              ),
              disabled: true,
            },
            {
              type: 'divider',
            },
            {
              key: 'signout',
              label: (
                <Space>
                  <LogoutOutlined />
                  サインアウト
                </Space>
              ),
              onClick: () => signOut(),
            },
          ],
        }}
        trigger={['click']}
        placement="bottomRight"
      >
        <Button type="text" style={{ padding: '4px 8px' }}>
          <Space>
            <Avatar 
              size="small" 
              src={session.user.image} 
              icon={<UserOutlined />}
            />
            <Text>{session.user.name || 'ユーザー'}</Text>
          </Space>
        </Button>
      </Dropdown>
    );
  }

  return (
    <Button 
      type="primary" 
      icon={<LoginOutlined />}
      onClick={() => signIn('google')}
    >
      Googleでサインイン
    </Button>
  );
}
