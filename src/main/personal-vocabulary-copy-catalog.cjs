'use strict';

// This is a deliberately small, shipped-text-only allowlist.  It contains no
// user vocabulary entries and lets the privileged process produce a bounded
// final display projection without exposing the private replacement map.

const PERSONAL_VOCABULARY_COPY_CATALOG = Object.freeze({
  'settings.personalVocabularyTitle': Object.freeze({ english: 'Private vocabulary', cantonese: '私用詞彙' }),
  'settings.personalVocabularyDescription': Object.freeze({ english: 'Choose a local JSON replacement map for app-owned wording. The complete file is validated before local use; no source name or location is retained.', cantonese: '揀一個本機 JSON 替換對照表，套用到程式本身嘅文字。完整檔案驗證後先會喺本機使用；唔會保留來源名稱或位置。' }),
  'settings.personalVocabularyStatus': Object.freeze({ english: 'Private vocabulary status', cantonese: '私用詞彙狀態' }),
  'settings.personalVocabularySelect': Object.freeze({ english: 'Choose private JSON', cantonese: '揀私用 JSON' }),
  'settings.personalVocabularySelectHint': Object.freeze({ english: 'Only a validated private local cache is kept. The selected file name, location, and contents never enter history, exports, status, telemetry, or a network request.', cantonese: '只會保留經驗證嘅私用本機快取。已揀檔案嘅名稱、位置同內容永遠唔會進入歷史、匯出、狀態、遙測或者網絡請求。' }),
  'settings.personalVocabularyClear': Object.freeze({ english: 'Clear private vocabulary', cantonese: '清除私用詞彙' }),
  'settings.personalVocabularyClearHint': Object.freeze({ english: 'Clearing removes the app-private validated cache and restores shipped wording. It requires the full destructive-action confirmation.', cantonese: '清除會移除程式私用嘅已驗證快取，並還原內建文字。需要完成完整破壞性動作確認。' }),
  'settings.personalVocabularySearch': Object.freeze({ english: 'Find private-vocabulary controls', cantonese: '搵私用詞彙控制項' }),
  'settings.personalVocabularySearchPlaceholder': Object.freeze({ english: 'Search this setting', cantonese: '搜尋呢個設定' }),
  'settings.personalVocabularyRegexButton': Object.freeze({ english: 'Build regex', cantonese: '建立 regex' }),
  'settings.personalVocabularyRegexTitle': Object.freeze({ english: 'Private-vocabulary search regex builder', cantonese: '私用詞彙搜尋 regex 建立器' }),
  'settings.personalVocabularyRegexDescription': Object.freeze({ english: 'Build a bounded local pattern for this settings card. Plain text remains the default.', cantonese: '為呢張設定卡建立受限本機模式。預設仍然係普通文字。' }),
  'settings.personalVocabularyRegexPattern': Object.freeze({ english: 'Raw pattern', cantonese: '原始模式' }),
  'settings.personalVocabularyRegexFlags': Object.freeze({ english: 'Flags', cantonese: '旗標' }),
  'settings.personalVocabularyRegexIgnoreCase': Object.freeze({ english: 'Ignore case', cantonese: '忽略大小寫' }),
  'settings.personalVocabularyRegexCaseSensitive': Object.freeze({ english: 'Case sensitive', cantonese: '區分大小寫' }),
  'settings.personalVocabularyRegexIgnoreCaseMultiline': Object.freeze({ english: 'Ignore case + multiline', cantonese: '忽略大小寫 + 多行' }),
  'settings.personalVocabularyRegexSample': Object.freeze({ english: 'Sample text', cantonese: '範例文字' }),
  'settings.personalVocabularyRegexTokens': Object.freeze({ english: 'Regex construction tokens', cantonese: 'Regex 建構符號' }),
  'settings.personalVocabularyRegexLiteral': Object.freeze({ english: 'Literal', cantonese: '文字' }),
  'settings.personalVocabularyRegexClass': Object.freeze({ english: 'Character class', cantonese: '字元類別' }),
  'settings.personalVocabularyRegexAnchor': Object.freeze({ english: 'Anchor', cantonese: '錨點' }),
  'settings.personalVocabularyRegexGroup': Object.freeze({ english: 'Group', cantonese: '群組' }),
  'settings.personalVocabularyRegexAlternation': Object.freeze({ english: 'Alternation', cantonese: '分支' }),
  'settings.personalVocabularyRegexQuantifier': Object.freeze({ english: 'Quantifier', cantonese: '量詞' }),
  'settings.personalVocabularyRegexApply': Object.freeze({ english: 'Apply regex search', cantonese: '套用 regex 搜尋' }),
  'settings.personalVocabularyRegexPlain': Object.freeze({ english: 'Return to plain search', cantonese: '返回普通文字搜尋' }),
  'settings.personalVocabularyRegexEmpty': Object.freeze({ english: 'Enter a pattern to preview local matches.', cantonese: '輸入模式去預覽本機符合項目。' }),
  'settings.personalVocabularyRegexValid': Object.freeze({ english: 'The bounded regex is valid for this settings card.', cantonese: '受限 regex 對呢張設定卡有效。' }),
  'settings.personalVocabularyRegexInvalid': Object.freeze({ english: 'The regex pattern is invalid.', cantonese: 'Regex 模式唔正確。' }),
  'settings.personalVocabularySearchMatched': Object.freeze({ english: 'Private-vocabulary controls match the active search.', cantonese: '私用詞彙控制項符合目前搜尋。' }),
  'settings.personalVocabularySearchEmpty': Object.freeze({ english: 'No private-vocabulary controls match the active search.', cantonese: '冇私用詞彙控制項符合目前搜尋。' }),
  'settings.personalVocabularyStateReady': Object.freeze({ english: 'Validated private vocabulary is active locally.', cantonese: '已啟用經驗證嘅本機私用詞彙。' }),
  'settings.personalVocabularyStateMissing': Object.freeze({ english: 'No private vocabulary is active; shipped wording is shown.', cantonese: '未啟用私用詞彙；正顯示內建文字。' }),
  'settings.personalVocabularyStateInvalid': Object.freeze({ english: 'Saved private vocabulary is invalid or unsupported; shipped wording is shown until a new valid file is selected.', cantonese: '已儲存嘅私用詞彙無效或者唔支援；揀新有效檔案之前會顯示內建文字。' }),
  'settings.personalVocabularyStateUnavailable': Object.freeze({ english: 'App-private vocabulary storage is unavailable; shipped wording is shown.', cantonese: '程式私用詞彙儲存空間唔可用；正顯示內建文字。' }),
  'settings.personalVocabularyStateLoading': Object.freeze({ english: 'Loading private vocabulary status…', cantonese: '正在載入私用詞彙狀態…' }),
  'settings.personalVocabularyStateSchool': Object.freeze({ english: 'The shared mode is active, so private-vocabulary controls and replacements are unavailable.', cantonese: '共用模式已啟用，所以私用詞彙控制項同替換內容暫時唔可用。' }),
  'settings.personalVocabularyPaletteTitle': Object.freeze({ english: 'Private vocabulary', cantonese: '私用詞彙' }),
  'settings.personalVocabularyPaletteDetail': Object.freeze({ english: 'Reveal the local validated replacement-map picker, status, clear control, and its attached regex builder.', cantonese: '顯示本機已驗證替換對照表嘅選擇器、狀態、清除控制項同附屬 regex 建立器。' }),
  'settings.personalVocabularyErrorValidation': Object.freeze({ english: 'This private vocabulary selection cannot be used. Shipped wording remains active.', cantonese: '呢個私用詞彙選擇唔可以使用。會繼續顯示內建文字。' }),
  'settings.personalVocabularyErrorStorage': Object.freeze({ english: 'Private vocabulary storage is unavailable. Shipped wording remains active.', cantonese: '私用詞彙儲存空間唔可用。會繼續顯示內建文字。' }),
  'settings.personalVocabularyErrorConfirmation': Object.freeze({ english: 'Review the private-vocabulary clear confirmation and try again.', cantonese: '請重新檢查私用詞彙清除確認，再試一次。' }),
  'settings.personalVocabularyErrorClear': Object.freeze({ english: 'Private vocabulary could not be cleared. Shipped wording remains active until local storage is repaired.', cantonese: '未能清除私用詞彙。本機儲存空間修復前會繼續顯示內建文字。' }),
  'settings.personalVocabularyErrorGeneric': Object.freeze({ english: 'Private vocabulary could not be updated. Shipped wording remains active.', cantonese: '未能更新私用詞彙。會繼續顯示內建文字。' }),
  'toast.personalVocabularyImported': Object.freeze({ english: 'Validated private vocabulary is active locally.', cantonese: '已啟用經驗證嘅本機私用詞彙。' }),
  'toast.personalVocabularyCleared': Object.freeze({ english: 'Private vocabulary was cleared and shipped wording is restored.', cantonese: '已清除私用詞彙，並還原內建文字。' })
});

module.exports = Object.freeze({ PERSONAL_VOCABULARY_COPY_CATALOG });
