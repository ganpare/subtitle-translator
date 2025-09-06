/**
 * 翻訳品質検証ユーティリティ
 */

export interface TranslationValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * 翻訳結果の品質を検証する
 */
export function validateTranslation(
  originalText: string,
  translatedText: string,
  targetLanguage: string
): TranslationValidationResult {
  // 空の翻訳結果
  if (!translatedText || translatedText.trim() === '') {
    return {
      isValid: false,
      reason: '翻訳結果が空です'
    };
  }

  // 原文と全く同じ（翻訳されていない）
  if (originalText.trim() === translatedText.trim()) {
    return {
      isValid: false,
      reason: '翻訳されていません（原文と同じ）'
    };
  }

  // 翻訳品質が良好
  return {
    isValid: true
  };
}
