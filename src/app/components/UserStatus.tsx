"use client";

import { useSession } from "next-auth/react";
import { Button, Avatar, Dropdown, Space } from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";
import { signOut } from "next-auth/react";

const UserStatus = () => {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-500">読み込み中...</span>
      </div>
    );
  }

  if (status === "unauthenticated" || !session) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
          <UserOutlined className="text-red-500 text-xs" />
        </div>
        <span className="text-sm text-red-600">未ログイン</span>
      </div>
    );
  }

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  const menuItems = [
    {
      key: "profile",
      label: (
        <div className="px-2 py-1">
          <div className="font-medium">{session.user?.name || "ユーザー"}</div>
          <div className="text-xs text-gray-500">{session.user?.email}</div>
        </div>
      ),
    },
    {
      type: "divider" as const,
    },
    {
      key: "signout",
      label: (
        <div className="flex items-center space-x-2 px-2 py-1">
          <LogoutOutlined />
          <span>サインアウト</span>
        </div>
      ),
      onClick: handleSignOut,
    },
  ];

  return (
    <div className="flex items-center space-x-2">
      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
        <UserOutlined className="text-green-500 text-xs" />
      </div>
      <Dropdown
        menu={{ items: menuItems }}
        placement="bottomRight"
        trigger={["click"]}
      >
        <Button type="text" className="p-0 h-auto">
          <Space>
            <Avatar size="small" src={session.user?.image}>
              {session.user?.name?.[0] || "U"}
            </Avatar>
            <span className="text-sm text-green-600">
              {session.user?.name || "ユーザー"}
            </span>
          </Space>
        </Button>
      </Dropdown>
    </div>
  );
};

export default UserStatus;
