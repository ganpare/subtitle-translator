"use client";

import { useState, useEffect, useCallback } from "react";
import { message } from "antd";
import { loadFromLocalStorage, saveToLocalStorage } from "@/app/utils/localStorageUtils";
import { downloadFile } from "@/app/utils";
import { defaultConfigs } from "@/app/components/translateAPI";
import { useTranslations } from "next-intl";

const DEFAULT_SYS_PROMPT = "You are a professional translator. Respond only with the content, either translated or rewritten. Do not add explanations, comments, or any extra text.";
const DEFAULT_USER_PROMPT = "Please respect the original meaning, maintain the original format, and rewrite the following content in ${targetLanguage}.\n\n${content}";

const DEFAULT_API = "server";

const useTranslateData = () => {
  const tLanguages = useTranslations("languages");
  const t = useTranslations("common");
  const translationMethod = DEFAULT_API; // server 固定
  const [translationConfigs, setTranslationConfigs] = useState(defaultConfigs);
  const [sysPrompt, setSysPrompt] = useState<string>(DEFAULT_SYS_PROMPT);
  const [userPrompt, setUserPrompt] = useState<string>(DEFAULT_USER_PROMPT);

  const [sourceLanguage, setSourceLanguage] = useState<string>("auto");
  const [targetLanguage, setTargetLanguage] = useState<string>("zh");
  const [target_langs, setTarget_langs] = useState<string[]>(["zh"]);

  const [translatedText, setTranslatedText] = useState<string>("");
  const [extractedText, setExtractedText] = useState<string>("");

  const [isClient, setIsClient] = useState(false);
  const [translateInProgress, setTranslateInProgress] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [multiLanguageMode, setMultiLanguageMode] = useState<boolean>(false);
  // Server-specific controls
  const [serverJobMethod, setServerJobMethod] = useState<'single' | 'batch'>('single');
  const [serverUseContext, setServerUseContext] = useState<boolean>(true);
  const [serverPromptTemplateId, setServerPromptTemplateId] = useState<string>('subtitle_professional');

  // Load from localStorage (force default API to 'server' regardless of saved value)
  useEffect(() => {
    const loadState = () => {
      const savedConfigs = loadFromLocalStorage("translationConfigs");
      if (savedConfigs) {
        setTranslationConfigs(savedConfigs);
      }

      setSysPrompt(loadFromLocalStorage("sysPrompt") || DEFAULT_SYS_PROMPT);
      setUserPrompt(loadFromLocalStorage("userPrompt") || DEFAULT_USER_PROMPT);
      setSourceLanguage(loadFromLocalStorage("sourceLanguage") || "auto");
      setTargetLanguage(loadFromLocalStorage("targetLanguage") || "zh");
      setTarget_langs(loadFromLocalStorage("target_langs") || ["zh"]);
      setMultiLanguageMode(loadFromLocalStorage("multiLanguageMode") ?? false);
      // server controls
      const savedMethod = (loadFromLocalStorage("serverJobMethod") as any) || 'single';
      setServerJobMethod(savedMethod === 'batch' ? 'batch' : 'single');
      const savedCtx = loadFromLocalStorage("serverUseContext");
      setServerUseContext(savedCtx === undefined ? true : !!savedCtx);

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
      saveToLocalStorage("sourceLanguage", sourceLanguage);
      saveToLocalStorage("targetLanguage", targetLanguage);
      saveToLocalStorage("target_langs", target_langs);
      saveToLocalStorage("multiLanguageMode", multiLanguageMode);
      // server controls
      saveToLocalStorage("serverJobMethod", serverJobMethod);
      saveToLocalStorage("serverUseContext", serverUseContext);
    }
  }, [translationConfigs, sysPrompt, userPrompt, sourceLanguage, targetLanguage, target_langs, multiLanguageMode, serverJobMethod, serverUseContext, isClient]);

  // Helper: get auth token & server URL for server mode
  const getAuthToken = () => (typeof window !== "undefined" ? localStorage.getItem("authToken") : null);
  const getServerUrl = () => {
    const cfg = getCurrentConfig();
    // server config stored in translationConfigs.server.url
    if ((cfg as any)?.url) return (cfg as any).url as string;
    return "http://localhost:4000";
  };

  const handleConfigChange = (_method: string, field: string, value: string | number) => {
    setTranslationConfigs((prev) => ({
      ...prev,
      server: {
        ...prev.server,
        [field]: value,
      },
    }));
  };

  const getCurrentConfig = () => {
    return translationConfigs.server || defaultConfigs.server;
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
    // server 固定: トークン必須のみ確認
    const token = getAuthToken();
    if (!token) {
      message.error("Please sign in to the server first");
      return false;
    }
    return true;
  };

  // New: server-side translation job submitter
  const handleServerTranslate = async (
    fileIds?: string[],
    opts?: { bilingualSubtitle?: boolean; bilingualPosition?: "above" | "below"; exportFormat?: "srt" | "vtt" | "ass" }
  ) => {
    try {
      const token = getAuthToken();
      const baseUrl = getServerUrl();
      if (!token) {
        message.error("Please sign in to the server first");
        return;
      }
      if (!fileIds || fileIds.length === 0) {
        message.error(t("noFileUploaded"));
        return;
      }

      setTranslateInProgress(true);
      setProgressPercent(1);

      const uploadedFileIds: string[] = fileIds;

      // create jobs per file
      const targetLanguagesToUse = multiLanguageMode ? target_langs : [targetLanguage];
      // ensure target languages
      if (!targetLanguagesToUse || targetLanguagesToUse.length === 0) {
        message.error(t("noTargetLanguage"));
        return;
      }

      for (let i = 0; i < uploadedFileIds.length; i++) {
        const fileId = uploadedFileIds[i];
        const cfg = getCurrentConfig();
        const cwRaw = Number((cfg as any)?.limit);
        const cw = Number.isFinite(cwRaw) && cwRaw > 0 ? Math.min(200, Math.round(cwRaw)) : undefined;
        const tempRaw = Number((cfg as any)?.temperature);
        const temp = Number.isFinite(tempRaw) ? tempRaw : undefined;
        const opt: any = { useContext: serverUseContext };
        if (cw !== undefined) opt.contextWindow = cw;
        if ((cfg as any)?.model) opt.model = (cfg as any).model;
        if (temp !== undefined) opt.temperature = temp;
        if (sysPrompt) opt.sysPrompt = sysPrompt;
        if (userPrompt) opt.userPrompt = userPrompt;
        if (serverPromptTemplateId) opt.promptTemplateId = serverPromptTemplateId;
        const resp = await fetch(`${baseUrl}/api/translate/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            fileId,
            sourceLang: sourceLanguage,
            targetLangs: targetLanguagesToUse,
            method: serverJobMethod,
            options: opt,
          }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err?.error || `Job create failed ${resp.status}`);
        }
        const { jobId } = await resp.json();

        // Single は完了まで待機、Batch は投入したら即終了
        if (serverJobMethod === 'single') {
          let progress = 10;
          while (true) {
            await delay(800);
            const s = await fetch(`${baseUrl}/api/translate/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
            const status = await s.json();
            if (status.status === "completed" || status.status === "partial") {
              // treat partial as terminal: allow export with whatever is available
              break;
            }
            if (status.status === "failed") throw new Error(status.error || "Job failed");
            progress = Math.min(progress + 5, 95);
            setProgressPercent(progress);
          }
        }

        // download/export は Single 完了時のみ実行
        if (serverJobMethod === 'single') {
          const bi = opts?.bilingualSubtitle ?? false;
          const exportFormat = opts?.exportFormat || (bi ? "ass" : "srt");
          const pos = opts?.bilingualPosition || "below";
          for (const lang of targetLanguagesToUse) {
            const dl = await fetch(
              `${baseUrl}/api/files/${fileId}/export?format=${exportFormat}&lang=${encodeURIComponent(lang)}&bilingual=${bi ? 1 : 0}&position=${bi ? pos : "below"}`,
              { headers: { Authorization: `Bearer ${token}` } });
            if (!dl.ok) {
              throw new Error(`Export failed ${dl.status}`);
            }
            const cd = dl.headers.get("Content-Disposition") || dl.headers.get("content-disposition") || "";
            let suggested = "";
            const mStar = cd.match(/filename\*=(?:UTF-8''|)([^;]+)$/i);
            if (mStar) {
              try { suggested = decodeURIComponent(mStar[1]); } catch {}
            }
            if (!suggested) {
              const m = cd.match(/filename="([^"]+)"/i);
              if (m) suggested = m[1];
            }
            const text = await dl.text();
            // Update UI with first language only
            if (i === 0 && lang === targetLanguagesToUse[0]) setTranslatedText(text);
            const fallback = `subtitle_${fileId}_${lang}.${exportFormat}`;
            const finalName = suggested && suggested.trim() ? suggested : fallback;
            await downloadFile(text, finalName);
          }
        }
      }

      if (serverJobMethod === 'single') {
        setProgressPercent(100);
        message.success(t("translationComplete"));
      } else {
        // Batch は投入完了で通知して終了（結果はジョブ一覧から確認）
        setProgressPercent(100);
        message.success("Batch submitted. You can track it in Job list.");
      }
    } catch (e) {
      console.error(e);
      message.error((e as Error).message);
    } finally {
      setTranslateInProgress(false);
    }
  };

  return {
    translationMethod,
    getCurrentConfig,
    handleConfigChange,
    sysPrompt,
    setSysPrompt,
    userPrompt,
    setUserPrompt,
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
    handleServerTranslate,
    serverJobMethod,
    setServerJobMethod,
    serverUseContext,
    setServerUseContext,
    serverPromptTemplateId,
    setServerPromptTemplateId,
  };
};

export default useTranslateData;
