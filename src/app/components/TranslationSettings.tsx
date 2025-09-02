"use client";

import { Tabs, Form, Input, Card, Typography, Button, Space, Tooltip, message, Select, Modal, Popconfirm, Switch } from "antd";
import React from "react";
import { TRANSLATION_SERVICES, LLM_MODELS, CACHE_PREFIX } from "@/app/components/translateAPI";
import { listModels } from "@/app/components/translateAPI";
import useTranslateData from "@/app/hooks/useTranslateData";
import { useTranslations } from "next-intl";
import BatchStatusPanel from "@/app/components/openai-batch/BatchStatusPanel";

const { Text, Link } = Typography;
const { TextArea } = Input;

const TranslationSettings = () => {
  const tCommon = useTranslations("common");
  const t = useTranslations("TranslationSettings");
  const [messageApi, contextHolder] = message.useMessage();
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [modelOptions, setModelOptions] = React.useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = React.useState<string | undefined>(undefined);
  const [userPresets, setUserPresets] = React.useState<Array<{ id: string; label: string; sys: string; user: string }>>([]);
  const [presetModalOpen, setPresetModalOpen] = React.useState(false);
  const [newPresetName, setNewPresetName] = React.useState("");
  const USER_PRESET_KEY = React.useRef("prompt_presets_user_v1");

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_PRESET_KEY.current);
      if (raw) setUserPresets(JSON.parse(raw));
    } catch {}
  }, []);
  const persistUserPresets = (list: Array<{ id: string; label: string; sys: string; user: string }>) => {
    setUserPresets(list);
    try {
      localStorage.setItem(USER_PRESET_KEY.current, JSON.stringify(list));
    } catch {}
  };
  const characterPresets = React.useMemo(
    () => [
      {
        id: "faithful",
        label: "忠実翻訳（説明なし）",
        sys: "You are a professional subtitle translator. Translate from ${sourceLanguage} to ${targetLanguage}. Keep original meaning, tone and style. Preserve speaker voice and subtle nuances. Keep bracketed tags and placeholders (e.g. [SFX], {var}, <tag>) unchanged. Do not add explanations, comments, or extra text. Respond only with the translated line.",
        user:
          "Translate the following line from ${sourceLanguage} into ${targetLanguage}. Output only the translation without quotes or notes.\n${content}",
      },
      {
        id: "casual",
        label: "口語・くだけた",
        sys: "You are a subtitle translator. Translate into ${targetLanguage} with casual, conversational tone while keeping the original intent. Keep it natural and concise for subtitles. Do not add any extra text.",
        user: "Casually translate this line into ${targetLanguage}. Output only the translated line.\n${content}",
      },
      {
        id: "polite",
        label: "敬語・丁寧",
        sys: "You are a subtitle translator. Translate into ${targetLanguage} using polite and respectful speech (丁寧語) while keeping the original meaning. Keep bracketed tags and placeholders unchanged. No extra text.",
        user: "Translate politely into ${targetLanguage}. Output only the translated line.\n${content}",
      },
      {
        id: "kansai",
        label: "関西弁ニュアンス",
        sys: "You are a subtitle translator. Translate into ${targetLanguage} with a light Kansai dialect nuance while keeping meaning and readability. Avoid over-exaggeration; prioritize naturalness. No extra text.",
        user: "Translate with a gentle Kansai flavor into ${targetLanguage}. Output only the translated line.\n${content}",
      },
      {
        id: "samurai",
        label: "時代劇っぽい（侍口調・控えめ）",
        sys: "You are a subtitle translator. Translate into ${targetLanguage} with a restrained period‑drama samurai tone (～でござる/申す etc. used sparingly). Keep it readable and not comical. No extra text.",
        user: "Translate with a subtle samurai tone into ${targetLanguage}. Output only the translated line.\n${content}",
      },
      {
        id: "elder",
        label: "年配・渋い",
        sys: "You are a subtitle translator. Translate into ${targetLanguage} in a mature, reserved tone as spoken by an elderly person. Keep meaning intact. No extra text.",
        user: "Translate in a mature, modest tone into ${targetLanguage}. Output only the translated line.\n${content}",
      },
      {
        id: "cute",
        label: "やわらか・かわいい",
        sys: "You are a subtitle translator. Translate into ${targetLanguage} with a soft and cute tone while keeping the original intent. Avoid overuse of symbols; keep it readable for subtitles. No extra text.",
        user: "Translate softly into ${targetLanguage}. Output only the translated line.\n${content}",
      },
      {
        id: "character_keep",
        label: "キャラクター維持（口癖・一人称・関係性）",
        sys: "You are a subtitle translator focused on character voice preservation. Translate into ${targetLanguage} while keeping the character's habitual phrases, first‑person pronoun, relationship nuances, and tone consistent. Keep placeholders and SFX tags unchanged. No extra text.",
        user:
          "Preserve the character's voice and quirks while translating into ${targetLanguage}. Output only the translated line.\n${content}",
      },
    ],
    []
  );
  const allPresetOptions = React.useMemo(() => {
    // ユーザープリセットは先頭に表示
    const userOpts = userPresets.map((p) => ({ label: `${p.label}（ユーザー）`, value: p.id }));
    const builtInOpts = characterPresets.map((p) => ({ label: p.label, value: p.id }));
    return [...userOpts, ...builtInOpts];
  }, [userPresets, characterPresets]);
  const findPresetById = (id?: string) => {
    if (!id) return undefined;
    return userPresets.find((p) => p.id === id) || characterPresets.find((p) => p.id === id);
  };
  const isUserPresetSelected = React.useMemo(() => userPresets.some((p) => p.id === selectedPreset), [userPresets, selectedPreset]);
  const { translationMethod, setTranslationMethod, getCurrentConfig, handleConfigChange, resetTranslationConfig, sysPrompt, setSysPrompt, userPrompt, setUserPrompt } = useTranslateData();
  const resetTranslationCache = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
    messageApi.success("Translation cache has been reset");
  };
  const handleTabChange = (key: string) => {
    setTranslationMethod(key);
  };
  const renderSettings = (service: string) => {
    const currentService = TRANSLATION_SERVICES.find((s) => s.value === service);
    const config = getCurrentConfig();
    const isLLMModel = LLM_MODELS.includes(service);

    return (
      <div className="p-4">
        <Card
          title={
            <Space>
              {currentService?.label}
              {currentService?.docs && (
                <Link type="secondary" href={currentService.docs} target="_blank">
                  {`API ${t("docs")}`}
                </Link>
              )}
            </Space>
          }
          extra={
            <Space wrap>
              <Tooltip title={t("resetCacheTooltip")}>
                <Button onClick={resetTranslationCache}>{t("resetCache")}</Button>
              </Tooltip>
              <Button onClick={() => resetTranslationConfig(service)}>{t("resetConfig")}</Button>
            </Space>
          }>
          <Form layout="vertical">
            {config?.url !== undefined && (
              <Form.Item
                label={`API ${t("url")}`}
                extra={service === "llm" ? t("urlExtra") : service === "azureopenai" ? undefined : t("deeplxUrlExtra")}
                required={service === "llm" || service === "azureopenai"}>
                <Input
                  placeholder={
                    service === "llm"
                      ? `${tCommon("example")}: http://127.0.0.1:11434/v1/chat/completions`
                      : service === "azureopenai"
                      ? `${tCommon("example")}: https://your-resource-name.openai.azure.com`
                      : `${tCommon("example")}: http://192.168.2.3:32770/translate`
                  }
                  value={config?.url}
                  onChange={(e) => handleConfigChange(service, "url", e.target.value)}
                />
              </Form.Item>
            )}

            {config?.apiKey !== undefined && (
              <Form.Item label={`${currentService?.label} API Key`} required={service !== "llm"}>
                <Input.Password
                  autoComplete="off"
                  placeholder={`${tCommon("enter")} ${currentService?.label} API Key`}
                  value={config.apiKey}
                  onChange={(e) => handleConfigChange(service, "apiKey", e.target.value)}
                />
              </Form.Item>
            )}

            {config?.region !== undefined && (
              <Form.Item label="Azure Region" required>
                <Input placeholder={`${tCommon("enter")} Azure API Region`} value={config?.region} onChange={(e) => handleConfigChange(service, "region", e.target.value)} />
              </Form.Item>
            )}

            {config?.model !== undefined && (
              <Form.Item label={`LLM ${tCommon("model")}`} extra={t("modelExtra")}>
                {LLM_MODELS.includes(service) ? (
                  <Space.Compact className="w-full">
                    <Select
                      showSearch
                      className="w-full"
                      placeholder={tCommon("select")}
                      value={config.model}
                      onChange={(v) => handleConfigChange(service, "model", v)}
                      options={modelOptions.map((m) => ({ label: m, value: m }))}
                      filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                    />
                    <Button
                      loading={loadingModels}
                      onClick={async () => {
                        try {
                          setLoadingModels(true);
                          const opts = await listModels(service, config);
                          setModelOptions(opts);
                          if (opts.length && !opts.includes(config.model)) {
                            handleConfigChange(service, "model", opts[0]);
                          }
                          messageApi.success(`${opts.length} models loaded`);
                        } catch (e: any) {
                          messageApi.error(e?.message || "Failed to load models");
                        } finally {
                          setLoadingModels(false);
                        }
                      }}>
                      {tCommon("refresh")}
                    </Button>
                  </Space.Compact>
                ) : (
                  <Input value={config.model} onChange={(e) => handleConfigChange(service, "model", e.target.value)} />
                )}
              </Form.Item>
            )}

            {config?.apiVersion !== undefined && (
              <Form.Item label={`LLM API Version`} extra={`${tCommon("example")}: 2024-07-18`}>
                <Input value={config.apiVersion} onChange={(e) => handleConfigChange(service, "apiVersion", e.target.value)} />
              </Form.Item>
            )}
            {config?.temperature !== undefined && (
              <Form.Item label="Temperature" extra={t("temperatureExtra")}>
                <Input type="number" value={config.temperature} onChange={(e) => handleConfigChange(service, "temperature", e.target.value)} />
              </Form.Item>
            )}
            {service === "openai" && config?.batchMode !== undefined && (
              <Form.Item label="バッチモード（実験的）" extra="非同期処理で約50%コスト削減。完了まで数分～24時間">
                <Switch 
                  checked={config.batchMode} 
                  onChange={(checked) => handleConfigChange(service, "batchMode", checked)}
                  checkedChildren="有効"
                  unCheckedChildren="無効"
                />
              </Form.Item>
            )}
            {isLLMModel && (
              <>
                <Form.Item label={t("preset")}>
                  <Select
                    allowClear
          placeholder={t("presetPlaceholder")}
                    value={selectedPreset}
                    onChange={(val) => {
                      setSelectedPreset(val || undefined);
                      const preset = findPresetById(val || undefined);
                      if (preset) {
                        setSysPrompt(preset.sys);
                        setUserPrompt(preset.user);
            messageApi.success(t("presetApplied"));
                      }
                    }}
                    options={allPresetOptions}
                    style={{ width: 360 }}
                  />
                </Form.Item>
                <Space className="mb-2" wrap>
                  <Button
                    onClick={() => {
                      setNewPresetName("");
                      setPresetModalOpen(true);
                    }}>
                    {t("savePreset")}
                  </Button>
                  <Button
                    disabled={!isUserPresetSelected}
                    onClick={() => {
                      if (!selectedPreset) return;
                      const idx = userPresets.findIndex((p) => p.id === selectedPreset);
                      if (idx >= 0) {
                        const next = [...userPresets];
                        next[idx] = { ...next[idx], sys: sysPrompt, user: userPrompt };
                        persistUserPresets(next);
                        messageApi.success(t("presetUpdated"));
                      }
                    }}>
                    {t("overwritePreset")}
                  </Button>
                  <Popconfirm
                    title={t("confirmDelete")}
                    okText={tCommon("confirm")}
                    cancelText={tCommon("resetUpload")}
                    onConfirm={() => {
                      if (!selectedPreset) return;
                      const next = userPresets.filter((p) => p.id !== selectedPreset);
                      persistUserPresets(next);
                      setSelectedPreset(undefined);
                      messageApi.success(t("presetDeleted"));
                    }}>
                    <Button danger disabled={!isUserPresetSelected}>
                      {t("deletePreset")}
                    </Button>
                  </Popconfirm>
                </Space>
                <Form.Item label={t("systemPrompt")} extra={t("systemPromptExtra")}>
                  <TextArea value={sysPrompt} onChange={(e) => setSysPrompt(e.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} />
                </Form.Item>
                <Form.Item
                  label={t("userPrompt")}
                  extra={`${t("userPromptExtra")}: \${sourceLanguage} ${t("for")} ${tCommon("sourceLanguage")}, \${targetLanguage} ${t("for")} ${tCommon("targetLanguage")}, \${content} ${t(
                    "for"
                  )} ${t("textToTranslate")}`}>
                  <TextArea value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} />
                </Form.Item>
              </>
            )}

            {config?.chunkSize !== undefined && (
              <Form.Item label={t("chunkSize")} extra={t("chunkSizeExtra")}>
                <Input type="number" value={config.chunkSize} onChange={(e) => handleConfigChange(service, "chunkSize", e.target.value)} />
              </Form.Item>
            )}

            {config?.delayTime !== undefined && (
              <Form.Item label={`${t("delayTime")} (ms)`}>
                <Input type="number" value={config.delayTime} onChange={(e) => handleConfigChange(service, "delayTime", e.target.value)} />
              </Form.Item>
            )}

            <Form.Item label={t("limit")} extra={t("limitExtra")}>
              <Input type="number" value={config?.limit} onChange={(e) => handleConfigChange(service, "limit", e.target.value)} />
            </Form.Item>

            <div className="mt-4 pt-4 border-t">
              <Text type="secondary">
                {t("CurrentTransConfig")}: {currentService?.label}
              </Text>
            </div>
          </Form>
        </Card>
        {service === "openai" && config?.apiKey && (
          <BatchStatusPanel 
            apiKey={config.apiKey}
            onResultsReady={(results, jobId) => {
              console.log(`Batch results ready for job ${jobId}:`, results);
              messageApi.success(`Batch translation completed! Job: ${jobId}`);
            }}
          />
        )}
        <Modal
          title={t("savePreset")}
          open={presetModalOpen}
          onCancel={() => setPresetModalOpen(false)}
          onOk={() => {
            const name = newPresetName.trim();
            if (!name) return;
            const id = `user:${Date.now()}`;
            const next = [{ id, label: name, sys: sysPrompt, user: userPrompt }, ...userPresets];
            persistUserPresets(next);
            setSelectedPreset(id);
            setPresetModalOpen(false);
            messageApi.success(t("presetSaved"));
          }}
        >
          <Form layout="vertical">
            <Form.Item label={t("presetName")}>
              <Input placeholder={t("presetNamePlaceholder")} value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    );
  };

  return (
    <div className="flex">
      {contextHolder}
      <Tabs
        activeKey={translationMethod}
        onChange={handleTabChange}
        tabPosition="left"
        className="w-full"
        items={TRANSLATION_SERVICES.map((service) => ({
          key: service.value,
          label: service.label,
          children: renderSettings(service.value),
        }))}
      />
    </div>
  );
};

export default TranslationSettings;
