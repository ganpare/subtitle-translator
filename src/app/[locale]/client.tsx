"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Tabs, TabsProps, Typography } from "antd";
import { VideoCameraOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import TranslationSettings from "@/app/components/TranslationSettings";
import SubtitleTranslator from "./SubtitleTranslator";
import { useTranslations, useLocale } from "next-intl";

const { Title, Paragraph, Link } = Typography;

const ClientPage = () => {
  const tSubtitle = useTranslations("subtitle");
  const t = useTranslations("common");
  const locale = useLocale();
  const isChineseLocale = locale === "zh" || locale === "zh-hant";

  // Hydration 安定化: 初期は SSR と同一のシンプルな構造を出し、マウント後に AntD コンポーネントへ切替
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const userGuideUrl = useMemo(
    () => (isChineseLocale ? "https://docs.newzone.top/guide/translation/subtitle-translator/index.html" : "https://docs.newzone.top/en/guide/translation/subtitle-translator/index.html"),
    [isChineseLocale]
  );
  // 使用时间戳来强制重新渲染
  const [activeKey, setActiveKey] = useState("basic");
  // Use a stable initial value during SSR to prevent hydration mismatch
  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    setRefreshKey(Date.now());
  }, []);

  const handleTabChange = useCallback((key) => {
    setActiveKey(key);
    setRefreshKey(Date.now());
  }, []);

  const basicTab = <SubtitleTranslator key={`basic-${refreshKey}`} />;
  const advancedTab = <TranslationSettings key={`advanced-${refreshKey}`} />;
  const items: TabsProps["items"] = [
    {
      key: "basic",
      label: t("basicTab"),
      children: basicTab,
    },
    {
      key: "advanced",
      label: t("advancedTab"),
      children: advancedTab,
    },
  ];

  return (
    <>
      <h3 suppressHydrationWarning>
        <VideoCameraOutlined /> {tSubtitle("clientTitle")}
      </h3>

      <p suppressHydrationWarning>
        <a href={userGuideUrl} target="_blank" rel="noopener noreferrer">
          {t("userGuide")}
        </a>{" "}
        {tSubtitle("clientDescription")} {t("privacyNotice")}
      </p>

      <Tabs activeKey={activeKey} onChange={handleTabChange} items={items} type="card" className="w-full" destroyOnHidden={true} animated={{ inkBar: true, tabPane: true }} />
    </>
  );
};

export default ClientPage;
