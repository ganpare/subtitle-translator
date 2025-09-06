"use client";

import { useState, useEffect } from "react";
import { message } from "antd";
import { loadFromLocalStorage, saveToLocalStorage } from "@/app/utils/localStorageUtils";
import useFileUpload from "@/app/hooks/useFileUpload";
import { downloadFile } from "@/app/utils";
import { generateCacheSuffix, checkLanguageSupport, splitTextIntoChunks, testTranslation, useTranslation, defaultConfigs, isConfigStructureValid, LLM_MODELS } from "@/app/components/translateAPI";
import pLimit from "p-limit";
import pRetry from "p-retry";
import { useTranslations } from "next-intl";
import { splitTextIntoLines, detectSubtitleFormat, filterSubLines, LRC_TIME_REGEX } from "@/app/utils/subtitle-parser";
import { createContextChunks } from "@/app/utils/contextChunker";
import { BatchSourceMeta } from "@/app/components/openai-batch/batchAPI";
import SparkMD5 from "spark-md5";

const DEFAULT_SYS_PROMPT = "You are a professional translator. Respond only with the content, either translated or rewritten. Do not add explanations, comments, or any extra text.";
const DEFAULT_USER_PROMPT = "Please respect the original meaning, maintain the original format, and rewrite the following content in ${targetLanguage}.\n\n${content}";

const DEFAULT_API = "gtxFreeAPI";

const useTranslateData = () => {
  const tLanguages = useTranslations("languages");
  const t = useTranslations("common");
  const { translate, translateBatch } = useTranslation();
  const [translationMethod, setTranslationMethod] = useState<string>(DEFAULT_API);
  // ["google", "gtxFreeAPI", "webgoogletranslate", "deepseek"] 没有 chuckSize 则逐行翻译
  const [translationConfigs, setTranslationConfigs] = useState(defaultConfigs);
  const [sysPrompt, setSysPrompt] = useState<string>(DEFAULT_SYS_PROMPT);
  const [userPrompt, setUserPrompt] = useState<string>(DEFAULT_USER_PROMPT);

  const [sourceLanguage, setSourceLanguage] = useState<string>("auto");
  const [targetLanguage, setTargetLanguage] = useState<string>("zh");
  const [target_langs, setTarget_langs] = useState<string[]>(["zh"]);
  const [useCache, setUseCache] = useState<boolean>(true);

  const [translatedText, setTranslatedText] = useState<string>("");
  const [extractedText, setExtractedText] = useState<string>("");

  const [isClient, setIsClient] = useState(false);
  const [translateInProgress, setTranslateInProgress] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [multiLanguageMode, setMultiLanguageMode] = useState<boolean>(false);

  // Load from localStorage
  useEffect(() => {
    const loadState = () => {
      const savedConfigs = loadFromLocalStorage("translationConfigs");
      if (savedConfigs) {
        setTranslationConfigs(savedConfigs);
      }

      setSysPrompt(loadFromLocalStorage("sysPrompt") || DEFAULT_SYS_PROMPT);
      setUserPrompt(loadFromLocalStorage("userPrompt") || DEFAULT_USER_PROMPT);
      setTranslationMethod(loadFromLocalStorage("translationMethod") || DEFAULT_API);
      setSourceLanguage(loadFromLocalStorage("sourceLanguage") || "auto");
      setTargetLanguage(loadFromLocalStorage("targetLanguage") || "zh");
      setTarget_langs(loadFromLocalStorage("target_langs") || ["zh"]);
      setMultiLanguageMode(loadFromLocalStorage("multiLanguageMode") ?? false);

      setIsClient(true);
    };
    loadState();
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (isClient) {
      saveToLocalStorage("translationConfigs", translationConfigs);
      saveToLocalStorage("sysPrompt", sysPrompt);
      saveToLocalStorage("userPrompt", userPrompt);
      saveToLocalStorage("translationMethod", translationMethod);
      saveToLocalStorage("sourceLanguage", sourceLanguage);
      saveToLocalStorage("targetLanguage", targetLanguage);
      saveToLocalStorage("target_langs", target_langs);
      saveToLocalStorage("multiLanguageMode", multiLanguageMode);
    }
  }, [translationConfigs, sysPrompt, userPrompt, translationMethod, sourceLanguage, targetLanguage, target_langs, multiLanguageMode, isClient]);

  const exportSettings = async () => {
    try {
      const settings = {
        translationConfigs: loadFromLocalStorage("translationConfigs"),
        sysPrompt: loadFromLocalStorage("sysPrompt"),
        userPrompt: loadFromLocalStorage("userPrompt"),
        translationMethod: loadFromLocalStorage("translationMethod"),
        sourceLanguage: loadFromLocalStorage("sourceLanguage"),
        targetLanguage: loadFromLocalStorage("targetLanguage"),
        target_langs: loadFromLocalStorage("target_langs"),
        multiLanguageMode: loadFromLocalStorage("multiLanguageMode"),
        exportDate: new Date().toISOString(),
        version: "1.0",
      };

      const jsonString = JSON.stringify(settings, null, 2);
      const fileName = `translation-settings-${new Date().toISOString().split("T")[0]}.json`;

      await downloadFile(jsonString, fileName, "application/json");
      message.success(t("exportSettingSuccess"));
    } catch (error) {
      console.error(t("exportSettingError"), error);
      message.error(t("exportSettingError"));
    }
  };

  const { readFile } = useFileUpload();
  const importSettings = () => {
    return new Promise((resolve, reject) => {
      try {
        // 创建隐藏的文件输入元素
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.style.display = "none";

        fileInput.onchange = (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (!file) {
            message.warning(t("importSettingparseError"));
            reject(new Error(t("importSettingparseError")));
            return;
          }

          // 使用 useFileUpload 的 readFile 方法
          readFile(file, (content) => {
            try {
              const settings = JSON.parse(content);

              // 验证文件格式
              if (!settings || typeof settings !== "object") {
                throw new Error(t("importSettingparseError"));
              }

              // 导入设置到 localStorage 并更新状态
              if (settings.translationConfigs !== undefined) {
                saveToLocalStorage("translationConfigs", settings.translationConfigs);
                setTranslationConfigs(settings.translationConfigs);
              }

              if (settings.sysPrompt !== undefined) {
                saveToLocalStorage("sysPrompt", settings.sysPrompt);
                setSysPrompt(settings.sysPrompt);
              }

              if (settings.userPrompt !== undefined) {
                saveToLocalStorage("userPrompt", settings.userPrompt);
                setUserPrompt(settings.userPrompt);
              }

              if (settings.translationMethod !== undefined) {
                saveToLocalStorage("translationMethod", settings.translationMethod);
                setTranslationMethod(settings.translationMethod);
              }

              if (settings.sourceLanguage !== undefined) {
                saveToLocalStorage("sourceLanguage", settings.sourceLanguage);
                setSourceLanguage(settings.sourceLanguage);
              }

              if (settings.targetLanguage !== undefined) {
                saveToLocalStorage("targetLanguage", settings.targetLanguage);
                setTargetLanguage(settings.targetLanguage);
              }

              if (settings.target_langs !== undefined) {
                saveToLocalStorage("target_langs", settings.target_langs);
                setTarget_langs(settings.target_langs);
              }

              if (settings.multiLanguageMode !== undefined) {
                saveToLocalStorage("multiLanguageMode", settings.multiLanguageMode);
                setMultiLanguageMode(settings.multiLanguageMode);
              }

              message.success(t("importSettingSuccess"));
              resolve(settings);
            } catch (parseError) {
              console.error(t("importSettingparseError"), parseError);
              message.error(t("importSettingparseError"));
              reject(new Error(t("importSettingparseError")));
            }
          });
        };

        fileInput.onerror = () => {
          message.error(t("importSettingreadFileError"));
          reject(new Error(t("importSettingreadFileError")));
        };

        // 添加到DOM并触发点击
        document.body.appendChild(fileInput);
        fileInput.click();

        // 清理DOM元素
        setTimeout(() => {
          if (document.body.contains(fileInput)) {
            document.body.removeChild(fileInput);
          }
        }, 1000);
      } catch (error) {
        console.error(t("importSettingError"), error);
        message.error(t("importSettingError"));
        reject(error);
      }
    });
  };

  const handleConfigChange = (method: string, field: string, value: string | number | boolean) => {
    setTranslationConfigs((prev) => {
      const currentConfig = prev[method] || defaultConfigs[method] || {};
      return {
        ...prev,
        [method]: {
          ...currentConfig,
          [field]: value,
        },
      };
    });
  };

  const getCurrentConfig = () => {
    let effectiveMethod = translationMethod;
    if (!translationConfigs[effectiveMethod] && !defaultConfigs[effectiveMethod]) {
      setTranslationMethod(DEFAULT_API);
      effectiveMethod = DEFAULT_API;
    }

    const currentConfig = translationConfigs[effectiveMethod];
    const defaultConfig = defaultConfigs[effectiveMethod];

    // 如果 currentConfig 不存在或结构与默认配置不一致，则重置配置并返回默认配置
    if (!currentConfig || !isConfigStructureValid(currentConfig, defaultConfig)) {
      resetTranslationConfig(effectiveMethod);
      return defaultConfig;
    }

    return currentConfig;
  };

  const resetTranslationConfig = (key: string) => {
    setTranslationConfigs((prevConfigs) => ({
      ...prevConfigs,
      [key]: defaultConfigs[key],
    }));
  };

  const handleLanguageChange = (type: "source" | "target", value: string) => {
    const otherValue = type === "source" ? targetLanguage : sourceLanguage;
    if (value === otherValue) {
      if (type === "source") {
        const newTargetValue = value === "zh" ? "en" : "zh";
        setSourceLanguage(value);
        setTargetLanguage(newTargetValue);
        message.error(`${t("sameLanguageTarget")} ${newTargetValue === "zh" ? tLanguages("chinese") : tLanguages("english")}`);
      } else {
        setTargetLanguage(value);
        setSourceLanguage("auto");
        message.error(`${t("sameLanguageSource")} ${tLanguages("auto")}`);
      }
      return;
    }
    if (type === "source" && value !== sourceLanguage) {
      setSourceLanguage(value);
    } else if (type === "target" && value !== targetLanguage) {
      setTargetLanguage(value);
    }
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const validateTranslate = async () => {
    const config = getCurrentConfig();
    if (config && "apiKey" in config && !config.apiKey && translationMethod !== "llm") {
      message.error(t("enterApiKey"));
      return false;
    }

    if (translationMethod === "llm" && !config.url) {
      message.error(t("enterLlmUrl"));
      return false;
    }

    if (!multiLanguageMode) {
      if (!checkLanguageSupport(translationMethod, sourceLanguage, targetLanguage)) {
        setTranslationMethod(DEFAULT_API);
        return false;
      }
    } else {
      for (let lang of target_langs) {
        if (!checkLanguageSupport(translationMethod, sourceLanguage, lang)) {
          setTranslationMethod(DEFAULT_API);
          return false;
        }
      }
    }

    if (["deepl", "deeplx", "llm", "gtxFreeAPI"].includes(translationMethod)) {
      setTranslateInProgress(true);
      setProgressPercent(1);
      const tempSysPrompt = translationMethod === "llm" ? sysPrompt : undefined;
      const tempUserPrompt = translationMethod === "llm" ? userPrompt : undefined;
      const testResult = await testTranslation(translationMethod, config, tempSysPrompt, tempUserPrompt);
      if (testResult !== true) {
        let errorMessage;
        switch (translationMethod) {
          case "deeplx":
            errorMessage = t("deepLXUnavailable");
            setTranslationMethod(DEFAULT_API);
            break;
          case "deepl":
            errorMessage = t("deeplUnavailable");
            break;
          case "llm":
            errorMessage = t("llmUnavailable");
            break;
          case "gtxFreeAPI":
            errorMessage = "GTX Free 接口当前不可用，请检查您的网络连接。The free Google Translate API (GTX) is currently unavailable. Please check your network connection.";
            break;
          default:
            errorMessage = t("translationError");
        }
        message.open({
          type: "error",
          content: errorMessage,
          duration: 10,
        });

        setTranslateInProgress(false);
        return false;
      }
      setTranslateInProgress(false);
    }

    return true;
  };

  const handleTranslate = async (performTranslation: Function, sourceText: string, isSubtitleMode: boolean = false) => {
    setTranslatedText("");
    if (!sourceText.trim()) {
      message.error("No source text provided.");
      return;
    }

    const isValid = await validateTranslate();
    if (!isValid) {
      return;
    }

    setTranslateInProgress(true);
    setProgressPercent(0);

    await performTranslation(sourceText, undefined, undefined, undefined, isSubtitleMode);
    setTranslateInProgress(false);
    setExtractedText("");
  };

  // データベース保存付き翻訳用のハンドラー
  const handleTranslateWithDB = async (performTranslation: Function, sourceText: string, isSubtitleMode: boolean = false) => {
    setTranslatedText("");
    if (!sourceText.trim()) {
      message.error("No source text provided.");
      return;
    }

    const isValid = await validateTranslate();
    if (!isValid) {
      return;
    }

    setTranslateInProgress(true);
    setProgressPercent(0);

    await performTranslation(sourceText, undefined, undefined, undefined, isSubtitleMode);
    setTranslateInProgress(false);
    setExtractedText("");
  };

  // バッチ翻訳専用の関数
  const handleBatchTranslate = async (sourceText: string, isSubtitleMode: boolean = false, bilingualSubtitle: boolean = false, bilingualPosition: string = "below", contextAwareTranslation: boolean = true) => {
    setTranslatedText("");
    if (!sourceText.trim()) {
      message.error("No source text provided.");
      return;
    }

    // バッチ翻訳の場合は認証チェックのみ
    const config = getCurrentConfig();
    if (translationMethod !== 'openai' || !config?.batchMode) {
      message.error("バッチ翻訳はOpenAIのバッチモードでのみ利用可能です。");
      return;
    }

    setTranslateInProgress(true);
    setProgressPercent(0);

    try {
      // バッチ翻訳の処理を直接実行
      await performBatchTranslation(sourceText, undefined, undefined, undefined, isSubtitleMode, bilingualSubtitle, bilingualPosition, contextAwareTranslation);
    } catch (error) {
      console.error("Batch translation error:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      message.error(`バッチ翻訳中にエラーが発生しました: ${error.message}`);
    } finally {
      setTranslateInProgress(false);
      setExtractedText("");
    }
  };

  // ログイン時通常翻訳用の関数（データベース保存付き）
  const translateContentWithDB = async (
    contentLines: string[],
    translationMethod: string,
    currentTargetLang: string,
    fileIndex: number = 0,
    totalFiles: number = 1,
    isSubtitleMode: boolean = false,
    batchSourceMeta?: import("@/app/components/openai-batch/batchAPI").BatchSourceMeta
  ) => {
    // 既存のtranslateContent関数を呼び出し
    const translatedLines = await translateContent(
      contentLines,
      translationMethod,
      currentTargetLang,
      fileIndex,
      totalFiles,
      isSubtitleMode,
      batchSourceMeta
    );

    // 翻訳履歴をデータベースに保存
    try {
      await saveTranslationHistory(
        contentLines,
        translatedLines,
        translationMethod,
        currentTargetLang,
        batchSourceMeta
      );
    } catch (error) {
      console.error("Failed to save translation history:", error);
      // エラーが発生しても翻訳結果は返す
    }

    return translatedLines;
  };

  // 翻訳履歴をデータベースに保存する関数
  const saveTranslationHistory = async (
    sourceLines: string[],
    translatedLines: string[],
    translationMethod: string,
    targetLanguage: string,
    batchSourceMeta?: import("@/app/components/openai-batch/batchAPI").BatchSourceMeta
  ) => {
    try {
      // ログイン状態をチェック
      const sessionResponse = await fetch('/api/auth/session');
      if (!sessionResponse.ok) {
        console.log("User not logged in, skipping database save");
        return;
      }

      const session = await sessionResponse.json();
      if (!session?.user?.id) {
        console.log("No user ID found, skipping database save");
        return;
      }

      // 翻訳履歴を保存
      const response = await fetch('/api/translation/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceText: sourceLines.join('\n'),
          translatedText: translatedLines.join('\n'),
          service: translationMethod,
          targetLanguage: targetLanguage,
          sourceLanguage: sourceLanguage,
          usage: null, // 通常翻訳では使用量情報なし
          batchJobId: null, // 通常翻訳ではバッチジョブIDなし
          sourceMeta: batchSourceMeta || {
            name: "normal-translation",
            hash: SparkMD5.hash(sourceLines.join('\n')),
            fileType: "text",
            lineCount: sourceLines.length,
            targetLanguage: targetLanguage,
            bilingual: false,
            bilingualPosition: "below"
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save translation history: ${response.status}`);
      }

      console.log("Translation history saved successfully");
    } catch (error) {
      console.error("Error saving translation history:", error);
      throw error;
    }
  };

  // バッチ翻訳の実行関数（バッチジョブ作成専用）
  const performBatchTranslation = async (sourceText: string, fileNameSet?: string, fileIndex?: number, totalFiles?: number, isSubtitleMode: boolean = true, bilingualSubtitle: boolean = false, bilingualPosition: string = "below", contextAwareTranslation: boolean = true) => {
    console.log("🚀 Creating batch translation job...", {
      sourceTextLength: sourceText.length,
      fileNameSet,
      fileIndex,
      totalFiles,
      isSubtitleMode
    });

    const lines = splitTextIntoLines(sourceText);
    const fileType = detectSubtitleFormat(lines);
    console.log("📝 File analysis:", { fileType, lineCount: lines.length });
    
    if (fileType === "error") {
      console.error("❌ Unsupported subtitle format");
      message.error("サポートされていない字幕形式です。");
      return;
    }

    const { contentLines, contentIndices } = filterSubLines(lines, fileType);
    
    // 対象言語の決定
    const targetLanguagesToUse = multiLanguageMode ? target_langs : [targetLanguage];
    if (multiLanguageMode && targetLanguagesToUse.length === 0) {
      message.error("対象言語が選択されていません。");
      return;
    }

    // バッチ翻訳用のメタデータ
    const batchSourceMeta: BatchSourceMeta = {
      name: fileNameSet || "batch-translation",
      hash: SparkMD5.hash(contentLines.join("\n")),
      fileType: fileType,
      lineCount: contentLines.length,
      targetLanguage: multiLanguageMode ? undefined : targetLanguage,
      bilingual: bilingualSubtitle,
      bilingualPosition: bilingualPosition as any,
    };

    // 各対象言語でバッチジョブを作成
    for (const currentTargetLang of targetLanguagesToUse) {
      try {
        console.log(`📤 Creating batch job for ${currentTargetLang}...`);
        
        // バッチ翻訳のAPIを呼び出し（翻訳は実行せず、ジョブのみ作成）
        const response = await fetch('/api/batch/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chunks: contentLines.map((line, index) => ({
              id: `chunk-${fileIndex || 0}-${index.toString().padStart(4, '0')}`,
              text: line
            })),
            model: getCurrentConfig()?.model || 'gpt-4o-mini',
            temperature: getCurrentConfig()?.temperature || 1.0,
            sysPrompt: getCurrentConfig()?.sysPrompt,
            userPrompt: getCurrentConfig()?.userPrompt,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            sourceMeta: {
              ...batchSourceMeta,
              contextChunks: isSubtitleMode && contentLines.length > 1,
              contextWindow: isSubtitleMode && contentLines.length > 1 ? (getCurrentConfig()?.batchLimit || 20) : 1,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ Batch job created for ${currentTargetLang}:`, result);
        
        message.success(`${currentTargetLang}のバッチ翻訳ジョブが作成されました。完了まで数分～24時間かかる場合があります。`);

      } catch (error) {
        console.error(`Batch job creation error for ${currentTargetLang}:`, error);
        message.error(`${currentTargetLang}のバッチジョブ作成中にエラーが発生しました: ${error.message}`);
      }
    }
  };

  async function retryTranslate(text, cacheSuffix, config) {
    try {
      return await pRetry(
        async () => {
          return translate({
            text,
            cacheSuffix,
            ...config,
          });
        },
        {
          retries: 3,
          onFailedAttempt: (error: any) => {
            const msg = error?.message ?? String(error);
            const attempt = error?.attemptNumber ?? "?";
            const left = error?.retriesLeft ?? "?";
            console.log(`${text.substring(0, 30)} ... Translation failed: ${msg} (attempt ${attempt}, left ${left})`);
          },
        }
      );
    } catch (error) {
      console.log(`${text.substring(0, 30)} ... All translation attempts failed. Using original text.`);
      return text; // 返回原文作为兜底
    }
  }

  const translateContent = async (
    contentLines: string[],
    translationMethod: string,
    currentTargetLang: string,
    fileIndex: number = 0,
    totalFiles: number = 1,
    isSubtitleMode: boolean = false,
    batchSourceMeta?: import("@/app/components/openai-batch/batchAPI").BatchSourceMeta
  ) => {
    const config = getCurrentConfig();
    // 限制并发数，确保至少为 1
    const concurrency = Math.max(Number(config?.limit) || 10, 1);
    const limit = pLimit(concurrency);

    try {
      if (!contentLines.length) {
        return [];
      }

      const updateProgress = (current: number, total: number) => {
        const progress = ((fileIndex + current / total) / totalFiles) * 100;
        setProgressPercent(progress);
      };

      const translationConfig = {
        translationMethod,
        targetLanguage: currentTargetLang,
        sourceLanguage,
        useCache: useCache,
        sysPrompt: sysPrompt,
        userPrompt: userPrompt,
        ...config,
      };

      // Handle OpenAI Batch Mode
      if (translationMethod === 'openai' && config?.batchMode) {
        console.log("🚀 Using OpenAI Batch Mode for cost reduction");
        console.log("🔍 Batch mode config:", { 
          translationMethod, 
          batchMode: config?.batchMode, 
          batchLimit: config?.batchLimit,
          isSubtitleMode,
          contentLinesLength: contentLines.length
        });
        
        // 共通のチャンク作成関数を使用
        let chunks: Array<{ id: string; text: string }> = [];
        
        if (isSubtitleMode && contentLines.length > 1) {
          // 字幕翻訳の場合：文脈維持チャンク分割
          const contextWindow = Math.min(config?.batchLimit || 20, contentLines.length);
          console.log(`📝 Using batch context window: ${contextWindow} lines`);
          
          // 共通のチャンク作成関数を使用
          const contextChunks = createContextChunks(contentLines, contextWindow, 'batch');
          chunks = contextChunks.map(chunk => ({
            id: `chunk-${fileIndex}-${chunk.id}`,
            text: chunk.text
          }));
        } else {
          // 通常の行単位処理
          chunks = contentLines.map((line, index) => ({
            id: `chunk-${fileIndex}-${index.toString().padStart(4, '0')}`,
            text: line
          }));
        }

        try {
          console.log("📤 Sending batch request to server...");
          console.log("📦 Chunks:", chunks.length, "chunks");
          
          // Use server-side batch API for authenticated users
          const response = await fetch('/api/batch/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chunks,
              model: config?.model || 'gpt-4o-mini',
              temperature: config?.temperature || 1.0,
              sysPrompt,
              userPrompt,
              targetLanguage: currentTargetLang,
              sourceLanguage,
              sourceMeta: {
                ...batchSourceMeta,
                contextChunks: isSubtitleMode && contentLines.length > 1,
                contextWindow: isSubtitleMode && contentLines.length > 1 ? (config?.batchLimit || 20) : 1,
              },
            }),
          });
          
          console.log("📥 Server response status:", response.status);

          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }

          const batchResult = await response.json();

          // Show success message and return placeholder results
          // Actual translation will be available later via BatchStatusPanel
          if (batchResult.type === 'batch') {
            message.success(`Batch job created: ${batchResult.jobId}. Check the Batch Status panel for progress.`);
            // Return original content as placeholder until batch completes
            return contentLines;
          }
        } catch (error: any) {
          console.error("Batch mode failed, falling back to regular API:", error);
          message.warning(`Batch mode failed (${error.message}), falling back to regular translation`);
          // Continue with regular translation below
        }
      }

      const cacheSuffix = await generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, {
        model: config?.model,
        temperature: config?.temperature,
        sysPrompt,
        userPrompt,
      });

      // 对于字幕翻译且使用AI模型时，启用上下文感知翻译
      if (isSubtitleMode && LLM_MODELS.includes(translationMethod) && contentLines.length > 1) {
        return await translateWithContext(contentLines, translationConfig, cacheSuffix, updateProgress);
      }

      if (config?.chunkSize === undefined) {
        // 按行并发翻译，每一行翻译出错时通过 p-retry 进行重试
        const translatedLines = new Array(contentLines.length);
        const promises = contentLines.map((line, index) =>
          limit(async () => {
            translatedLines[index] = await retryTranslate(line, cacheSuffix, translationConfig);
            updateProgress(index, contentLines.length);
          })
        );

        await Promise.all(promises);
        return translatedLines;
      }

      const delimiter = translationMethod === "deeplx" ? "<>" : "\n";
      // 将空行替换为 delimiter，保证分块时不丢失空行
      const nonEmptyLines = contentLines.map((line) => (line.trim() ? line : delimiter));
      const text = nonEmptyLines.join(delimiter);
      const chunkSize = config?.chunkSize || 5000;
      const chunks = splitTextIntoChunks(text, chunkSize, delimiter);
      const translatedChunks: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const translatedContent = await retryTranslate(chunks[i], cacheSuffix, translationConfig);
        // 如果是 deeplx 翻译方法，需要将特殊换行符号替换回来
        translatedChunks.push(translationMethod === "deeplx" ? translatedContent?.replace(/<>/g, "\n") : translatedContent);
        updateProgress(i, chunks.length);
        if (i < chunks.length - 1) {
          await delay(config?.delayTime || 200);
        }
      }

      const result = translatedChunks.join("\n").split("\n");
      return result.map((line, index) => (contentLines[index].trim() ? line : contentLines[index]));
    } catch (error) {
      console.error("Error translating content:", error);
      throw error;
    }
  };

  // 共通の文脈維持チャンク作成関数
  const createContextChunks = (contentLines: string[], contextWindow: number, mode: 'batch' | 'normal' = 'normal') => {
    const chunks: Array<{ 
      id: string; 
      text: string; 
      startIndex: number; 
      endIndex: number;
      isContextChunk?: boolean;
    }> = [];

    if (mode === 'batch') {
      // バッチモード：固定サイズのチャンク
      for (let i = 0; i < contentLines.length; i += contextWindow) {
        const contextLines = contentLines.slice(i, i + contextWindow);
        const contextText = contextLines.join('\n');
        
        chunks.push({
          id: `chunk-${i.toString().padStart(4, '0')}`,
          text: contextText,
          startIndex: i,
          endIndex: Math.min(i + contextWindow, contentLines.length),
          isContextChunk: true
        });
      }
    } else {
      // 通常モード：オーバーラップ付きチャンク
      for (let i = 0; i < contentLines.length; i += contextWindow) {
        const batchEnd = Math.min(i + contextWindow, contentLines.length);
        const contextStart = Math.max(0, i - Math.floor(contextWindow / 2));
        const contextEnd = Math.min(contentLines.length, batchEnd + Math.floor(contextWindow / 2));
        
        const contextLines = contentLines.slice(contextStart, contextEnd);
        const targetStartIndex = i - contextStart;
        const targetEndIndex = batchEnd - contextStart;
        
        // マーカー付きで文脈を構築
        const contextWithMarkers = contextLines
          .map((line, index) => {
            if (index >= targetStartIndex && index < targetEndIndex) {
              return `[TRANSLATE_${index - targetStartIndex}]${line}[/TRANSLATE_${index - targetStartIndex}]`;
            }
            return `[CONTEXT]${line}[/CONTEXT]`;
          })
          .join("\n");
        
        chunks.push({
          id: `chunk-${i.toString().padStart(4, '0')}`,
          text: contextWithMarkers,
          startIndex: i,
          endIndex: batchEnd,
          isContextChunk: true
        });
      }
    }

    return chunks;
  };

  // 統合された文脈維持翻訳関数
  const translateWithContext = async (contentLines: string[], translationConfig: any, cacheSuffix: string, updateProgress: (current: number, total: number) => void) => {
    const contextWindow = Math.min(translationConfig.limit || 20, contentLines.length);
    const translatedLines = new Array(contentLines.length);
    
    // 共通のチャンク作成関数を使用
    const chunks = createContextChunks(contentLines, contextWindow, 'normal');

    // 各チャンクを処理
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      
      try {
        const result = await retryTranslate(chunk.text, cacheSuffix, {
          ...translationConfig,
          userPrompt: userPrompt.replace(
            "${content}",
            `Context: This is part of a subtitle file. Only translate the lines marked with [TRANSLATE_X][/TRANSLATE_X] tags (where X is the line number). Use the [CONTEXT][/CONTEXT] lines for understanding but do not translate them. Maintain the natural flow of dialogue and keep the same numbering in your response.\n\n${chunk.text}`
          ),
        });

        // 解析结果，提取翻译的行
        const translatedBatch = extractTranslatedLinesWithNumbers(result, chunk.endIndex - chunk.startIndex);

        // 将翻译结果放入对应位置
        for (let j = 0; j < translatedBatch.length; j++) {
          if (chunk.startIndex + j < contentLines.length && translatedBatch[j]) {
            translatedLines[chunk.startIndex + j] = translatedBatch[j];
          }
        }

        updateProgress(chunk.endIndex, contentLines.length);

        // 添加延迟以避免API限制
        if (chunkIndex < chunks.length - 1) {
          await delay(translationConfig.delayTime || 500);
        }
      } catch (error) {
        console.warn(`Context translation failed for chunk ${chunkIndex}, falling back to individual translation`);
        // 回退到逐行翻译
        for (let j = chunk.startIndex; j < chunk.endIndex; j++) {
          try {
            translatedLines[j] = await retryTranslate(contentLines[j], cacheSuffix, translationConfig);
          } catch (lineError) {
            console.error(`Failed to translate line ${j}:`, lineError);
            translatedLines[j] = contentLines[j]; // 保持原文
          }
          updateProgress(j + 1, contentLines.length);
        }
      }
    }

    // 填补任何缺失的翻译（使用原文）
    for (let i = 0; i < translatedLines.length; i++) {
      if (!translatedLines[i]) {
        translatedLines[i] = contentLines[i];
      }
    }

    return translatedLines;
  };

  // 辅助函数：清理翻译内容中的标记
  const cleanTranslatedContent = (content: string): string => {
    return (
      content
        // 移除所有TRANSLATE标记（带编号和不带编号），支持变形格式
        .replace(/\[TRANSLATE_\d+\]/gi, "")
        .replace(/\[\/TRANSLTranslate_\d+\]/gi, "") // 处理常见错误格式 [/TRANSLTranslate_X]
        .replace(/\[\/TRANSLATE_\d+\]/gi, "")
        .replace(/\[TRANSLATE\]/gi, "")
        .replace(/\[\/TRANSLATE\]/gi, "")
        // 移除CONTEXT标记
        .replace(/\[CONTEXT\]/gi, "")
        .replace(/\[\/CONTEXT\]/gi, "")
        .trim()
    );
  };

  // 辅助函数：从AI响应中提取带编号的翻译行
  const extractTranslatedLinesWithNumbers = (response: string, expectedCount: number): string[] => {
    const results = new Array(expectedCount);

    // 尝试匹配带编号的翻译标记，使用更宽松的正则表达式
    for (let i = 0; i < expectedCount; i++) {
      // 先尝试正确格式
      let regex = new RegExp(`\\[TRANSLATE_${i}\\]([\\s\\S]*?)\\[/TRANSLATE_${i}\\]`, "i");
      let match = response.match(regex);

      // 如果正确格式没匹配到，尝试常见错误格式
      if (!match) {
        regex = new RegExp(`\\[TRANSLATE_${i}\\]([\\s\\S]*?)\\[/TRANSLTranslate_${i}\\]`, "i");
        match = response.match(regex);
      }

      if (match) {
        // 清理提取的内容，移除可能残留的标记
        results[i] = cleanTranslatedContent(match[1].trim());
      }
    }

    // 如果部分匹配成功，返回结果
    const successCount = results.filter((r) => r).length;
    if (successCount > 0) {
      return results;
    }

    // 回退：尝试无编号的匹配
    return extractTranslatedLines(response, expectedCount);
  };

  // 辅助函数：从AI响应中提取翻译的行
  const extractTranslatedLines = (response: string, expectedCount: number): string[] => {
    // 尝试匹配翻译标记之间的内容
    const translateRegex = /\[TRANSLATE\]([\s\S]*?)\[\/TRANSLATE\]/g;
    const matches: string[] = [];
    let match;

    while ((match = translateRegex.exec(response)) !== null) {
      matches.push(cleanTranslatedContent(match[1].trim()));
    }

    // 如果匹配的数量正确，返回匹配结果
    if (matches.length === expectedCount) {
      return matches;
    }

    // 否则，尝试按行分割并取前几行，同时清理每行内容
    const lines = response
      .split("\n")
      .filter((line) => line.trim())
      .slice(0, expectedCount)
      .map((line) => cleanTranslatedContent(line));
    return lines.length === expectedCount ? lines : new Array(expectedCount).fill("");
  };

  return {
    exportSettings,
    importSettings,
    translationMethod,
    setTranslationMethod,
    translationConfigs,
    getCurrentConfig,
    handleConfigChange,
    resetTranslationConfig,
    sysPrompt,
    setSysPrompt,
    userPrompt,
    setUserPrompt,
    useCache,
    setUseCache,
    retryTranslate,
    translateContent,
    translateContentWithDB,
    handleTranslate,
    handleTranslateWithDB,
    handleBatchTranslate,
    sourceLanguage,
    targetLanguage,
    target_langs,
    setTarget_langs,
    multiLanguageMode,
    setMultiLanguageMode,
    translatedText,
    setTranslatedText,
    translateInProgress,
    setTranslateInProgress,
    isClient,
    setIsClient,
    progressPercent,
    setProgressPercent,
    extractedText,
    setExtractedText,
    handleLanguageChange,
    delay,
    validateTranslate,
  };
};

export default useTranslateData;
