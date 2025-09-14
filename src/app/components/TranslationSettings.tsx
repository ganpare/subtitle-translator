"use client";

import React from "react";
import { Tabs, Form, Input, Card, Typography, Button, Space, Tooltip, message, Select } from "antd";
import { TRANSLATION_SERVICES, LLM_MODELS, CACHE_PREFIX } from "@/app/components/translateAPI";
import useTranslateData from "@/app/hooks/useTranslateData";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";

const { Text, Link } = Typography;
const { TextArea } = Input;

const TranslationSettings = () => {
  const tCommon = useTranslations("common");
  const t = useTranslations("TranslationSettings");
  const [messageApi, contextHolder] = message.useMessage();
  const { translationMethod, setTranslationMethod, getCurrentConfig, handleConfigChange, resetTranslationConfig, sysPrompt, setSysPrompt, userPrompt, setUserPrompt, isClient, serverPromptTemplateId, setServerPromptTemplateId } = useTranslateData();
  const { baseUrl, token: authToken } = useAuth();
  const [serverModels, setServerModels] = React.useState<{ id: string; label: string }[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [promptTemplates, setPromptTemplates] = React.useState<{ id: string; name: string; description: string; category: string; systemPrompt: string; userPrompt: string; isSystem: boolean }[]>([]);
  const [promptTemplatesLoading, setPromptTemplatesLoading] = React.useState(false);
  const [selectedPromptTemplate, setSelectedPromptTemplate] = React.useState<{ id: string; name: string; description: string; category: string; systemPrompt: string; userPrompt: string; isSystem: boolean } | null>(null);
  const [isEditingTemplate, setIsEditingTemplate] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<{ id?: string; name: string; description: string; category: string; systemPrompt: string; userPrompt: string } | null>(null);

  const fetchServerModels = React.useCallback(async () => {
    if (!isClient || translationMethod !== "server" || !authToken) return;
    setModelsLoading(true);
    try {
      const resp = await fetch(`${baseUrl}/api/models`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await resp.json();
      setServerModels(data?.models || []);
    } catch (e) {
      console.warn("Failed to load models", e);
    } finally {
      setModelsLoading(false);
    }
  }, [translationMethod, baseUrl, isClient, authToken]);

  const fetchPromptTemplates = React.useCallback(async () => {
    console.log("fetchPromptTemplates called - isClient:", isClient, "translationMethod:", translationMethod);
    if (!isClient || translationMethod !== "server") return;
    setPromptTemplatesLoading(true);
    try {
      console.log("Fetching prompt templates from:", `${baseUrl}/api/prompts`);
      const resp = await fetch(`${baseUrl}/api/prompts`);
      const data = await resp.json();
      console.log("Prompt templates response:", data);
      setPromptTemplates(data?.templates || []);
    } catch (e) {
      console.warn("Failed to load prompt templates", e);
    } finally {
      setPromptTemplatesLoading(false);
    }
  }, [translationMethod, baseUrl, isClient]);

  // プロンプトテンプレートが選択されたときに詳細情報を更新
  const handlePromptTemplateChange = (templateId: string) => {
    setServerPromptTemplateId(templateId);
    const selectedTemplate = promptTemplates.find(template => template.id === templateId);
    setSelectedPromptTemplate(selectedTemplate || null);
  };

  React.useEffect(() => {
    fetchServerModels();
    fetchPromptTemplates();
  }, [fetchServerModels, fetchPromptTemplates]);

  // プロンプトテンプレートが読み込まれたときに、現在選択されているテンプレートの詳細を設定
  React.useEffect(() => {
    if (promptTemplates.length > 0 && serverPromptTemplateId) {
      const selectedTemplate = promptTemplates.find(template => template.id === serverPromptTemplateId);
      setSelectedPromptTemplate(selectedTemplate || null);
    }
  }, [promptTemplates, serverPromptTemplateId]);

  // プロンプトテンプレートのCRUD操作
  const createPromptTemplate = async (templateData: { name: string; description: string; category: string; systemPrompt: string; userPrompt: string }) => {
    if (!authToken) return;
    try {
      const resp = await fetch(`${baseUrl}/api/prompts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(templateData)
      });
      if (resp.ok) {
        await fetchPromptTemplates();
        messageApi.success('プロンプトテンプレートを作成しました');
      } else {
        messageApi.error('プロンプトテンプレートの作成に失敗しました');
      }
    } catch (error) {
      messageApi.error('プロンプトテンプレートの作成に失敗しました');
    }
  };

  const updatePromptTemplate = async (id: string, templateData: { name: string; description: string; category: string; systemPrompt: string; userPrompt: string }) => {
    if (!authToken) return;
    try {
      const resp = await fetch(`${baseUrl}/api/prompts/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(templateData)
      });
      if (resp.ok) {
        await fetchPromptTemplates();
        messageApi.success('プロンプトテンプレートを更新しました');
      } else {
        messageApi.error('プロンプトテンプレートの更新に失敗しました');
      }
    } catch (error) {
      messageApi.error('プロンプトテンプレートの更新に失敗しました');
    }
  };

  const deletePromptTemplate = async (id: string) => {
    if (!authToken) return;
    try {
      const resp = await fetch(`${baseUrl}/api/prompts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (resp.ok) {
        await fetchPromptTemplates();
        messageApi.success('プロンプトテンプレートを削除しました');
      } else {
        messageApi.error('プロンプトテンプレートの削除に失敗しました');
      }
    } catch (error) {
      messageApi.error('プロンプトテンプレートの削除に失敗しました');
    }
  };

  const handleEditTemplate = (template: any) => {
    setEditingTemplate({
      id: template.id,
      name: template.name,
      description: template.description || '',
      category: template.category,
      systemPrompt: template.systemPrompt,
      userPrompt: template.userPrompt
    });
    setIsEditingTemplate(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate({
      name: '',
      description: '',
      category: 'custom',
      systemPrompt: '',
      userPrompt: ''
    });
    setIsEditingTemplate(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    
    if (editingTemplate.id) {
      await updatePromptTemplate(editingTemplate.id, editingTemplate);
    } else {
      await createPromptTemplate(editingTemplate);
    }
    
    setIsEditingTemplate(false);
    setEditingTemplate(null);
  };
  const resetTranslationCache = async () => {
    try {
      // 异步分批删除缓存，避免UI阻塞
      const allKeys = Object.keys(localStorage);
      const cacheKeys = allKeys.filter((key) => key.startsWith(CACHE_PREFIX));

      // 分批处理，每批删除100个
      const batchSize = 100;
      for (let i = 0; i < cacheKeys.length; i += batchSize) {
        const batch = cacheKeys.slice(i, i + batchSize);
        batch.forEach((key) => localStorage.removeItem(key));

        // 让出控制权给UI线程
        if (i + batchSize < cacheKeys.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      messageApi.success(`Translation cache has been reset (${cacheKeys.length} entries cleared)`);
    } catch (error) {
      console.error("Failed to clear cache:", error);
      messageApi.error("Failed to clear translation cache");
    }
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
                {service === "server" && isClient ? (
                  <Space>
                    <Select
                      showSearch
                      loading={modelsLoading}
                      placeholder="Select server model"
                      style={{ minWidth: 260 }}
                      value={config.model}
                      onChange={(v) => handleConfigChange(service, "model", v)}
                      options={serverModels.map((m) => ({ value: m.id, label: m.label }))}
                      optionFilterProp="label"
                    />
                    <Button onClick={fetchServerModels}>{tCommon("refresh") || "Refresh"}</Button>
                  </Space>
                ) : (
                  <Input value={config.model} onChange={(e) => handleConfigChange(service, "model", e.target.value)} />
                )}
              </Form.Item>
            )}

            {service === "server" && (
              <>
                <Form.Item label="プロンプトテンプレート" extra="翻訳に使用するプロンプトテンプレートを選択してください">
                  <Space>
                    <Select
                      showSearch
                      loading={promptTemplatesLoading}
                      placeholder="プロンプトテンプレートを選択"
                      style={{ minWidth: 300 }}
                      value={serverPromptTemplateId}
                      onChange={handlePromptTemplateChange}
                      options={promptTemplates.map((template) => ({ 
                        value: template.id, 
                        label: `${template.name} (${template.category})`,
                        description: template.description
                      }))}
                      optionFilterProp="label"
                    />
                    <Button onClick={fetchPromptTemplates}>{tCommon("refresh") || "Refresh"}</Button>
                  </Space>
                </Form.Item>

                {selectedPromptTemplate && (
                  <Form.Item label="選択されたプロンプト内容">
                    <Card size="small" style={{ marginTop: 8 }}>
                      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>テンプレート名:</strong> {selectedPromptTemplate.name}
                          <br />
                          <strong>カテゴリ:</strong> {selectedPromptTemplate.category}
                          <br />
                          <strong>説明:</strong> {selectedPromptTemplate.description}
                          <br />
                          <strong>タイプ:</strong> {selectedPromptTemplate.isSystem ? 'システムデフォルト' : 'ユーザーカスタム'}
                        </div>
                        <Space>
                          {!selectedPromptTemplate.isSystem && (
                            <>
                              <Button size="small" onClick={() => handleEditTemplate(selectedPromptTemplate)}>
                                編集
                              </Button>
                              <Button size="small" danger onClick={() => deletePromptTemplate(selectedPromptTemplate.id)}>
                                削除
                              </Button>
                            </>
                          )}
                        </Space>
                      </div>
                      
                      <div style={{ marginBottom: 12 }}>
                        <strong>システムプロンプト:</strong>
                        <div style={{ 
                          background: '#f5f5f5', 
                          padding: '8px 12px', 
                          borderRadius: '4px', 
                          marginTop: '4px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '150px',
                          overflowY: 'auto'
                        }}>
                          {selectedPromptTemplate.systemPrompt}
                        </div>
                      </div>

                      <div>
                        <strong>ユーザープロンプト:</strong>
                        <div style={{ 
                          background: '#f5f5f5', 
                          padding: '8px 12px', 
                          borderRadius: '4px', 
                          marginTop: '4px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '150px',
                          overflowY: 'auto'
                        }}>
                          {selectedPromptTemplate.userPrompt}
                        </div>
                      </div>
                    </Card>
                  </Form.Item>
                )}

                {/* プロンプトテンプレート編集モーダル */}
                {isEditingTemplate && editingTemplate && (
                  <Form.Item label="プロンプトテンプレート編集">
                    <Card size="small" style={{ marginTop: 8 }}>
                      <Form layout="vertical">
                        <Form.Item label="テンプレート名">
                          <Input 
                            value={editingTemplate.name}
                            onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                            placeholder="テンプレート名を入力"
                          />
                        </Form.Item>
                        
                        <Form.Item label="説明">
                          <Input.TextArea 
                            value={editingTemplate.description}
                            onChange={(e) => setEditingTemplate({...editingTemplate, description: e.target.value})}
                            placeholder="説明を入力"
                            rows={2}
                          />
                        </Form.Item>
                        
                        <Form.Item label="カテゴリ">
                          <Select 
                            value={editingTemplate.category}
                            onChange={(value) => setEditingTemplate({...editingTemplate, category: value})}
                            options={[
                              { value: 'subtitle', label: '字幕翻訳' },
                              { value: 'general', label: '一般翻訳' },
                              { value: 'technical', label: '技術文書' },
                              { value: 'creative', label: 'クリエイティブ' },
                              { value: 'custom', label: 'カスタム' }
                            ]}
                          />
                        </Form.Item>
                        
                        <Form.Item label="システムプロンプト">
                          <Input.TextArea 
                            value={editingTemplate.systemPrompt}
                            onChange={(e) => setEditingTemplate({...editingTemplate, systemPrompt: e.target.value})}
                            placeholder="システムプロンプトを入力"
                            rows={4}
                          />
                        </Form.Item>
                        
                        <Form.Item label="ユーザープロンプト">
                          <Input.TextArea 
                            value={editingTemplate.userPrompt}
                            onChange={(e) => setEditingTemplate({...editingTemplate, userPrompt: e.target.value})}
                            placeholder="ユーザープロンプトを入力"
                            rows={4}
                          />
                        </Form.Item>
                        
                        <Form.Item>
                          <Space>
                            <Button type="primary" onClick={handleSaveTemplate}>
                              保存
                            </Button>
                            <Button onClick={() => {
                              setIsEditingTemplate(false);
                              setEditingTemplate(null);
                            }}>
                              キャンセル
                            </Button>
                          </Space>
                        </Form.Item>
                      </Form>
                    </Card>
                  </Form.Item>
                )}

                {/* プロンプトテンプレート管理ボタン */}
                <Form.Item>
                  <Space>
                    <Button onClick={handleCreateTemplate}>
                      新しいテンプレートを作成
                    </Button>
                    <Button onClick={fetchPromptTemplates}>
                      テンプレート一覧を更新
                    </Button>
                  </Space>
                </Form.Item>
              </>
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
            {isLLMModel && (
              <>
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
