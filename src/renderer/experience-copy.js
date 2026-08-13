(() => {
  'use strict';

  const COPY = Object.freeze({
    'brand.eyebrow': { english: 'LOCAL CONTROL CENTER', cantonese: '本機控制中心' },
    'nav.createServer': { english: 'Create server', cantonese: '建立伺服器' },
    'nav.findServer': { english: 'Find a server', cantonese: '搵伺服器' },
    'nav.searchPlaceholder': { english: 'Filter by name or software', cantonese: '按名稱或軟件篩選' },
    'nav.refresh': { english: 'Refresh local data', cantonese: '重新整理本機資料' },
    'nav.changelog': { english: 'Offline changelog', cantonese: '離線更新記錄' },
    'nav.preferences': { english: 'Studio preferences', cantonese: 'Studio 偏好設定' },
    'changelog.eyebrow': { english: 'BUNDLED VERSION RECORD', cantonese: '已內置版本記錄' },
    'changelog.title': { english: 'Offline changelog', cantonese: '離線更新記錄' },
    'changelog.description': { english: 'This destination parses the version records bundled with this installed app. It never fetches release notes, tags, dates, or commit links from a network service.', cantonese: '呢個位置會分析已安裝程式內置嘅版本記錄。佢唔會由網絡服務攞更新說明、標籤、日期或者提交連結。' },
    'changelog.back': { english: 'Back to server workspace', cantonese: '返回伺服器工作區' },
    'changelog.stateLabel': { english: 'Record state', cantonese: '記錄狀態' },
    'changelog.recordsLabel': { english: 'Version records', cantonese: '版本記錄' },
    'changelog.sourceLabel': { english: 'Source', cantonese: '來源' },
    'changelog.filterTitle': { english: 'Find version records', cantonese: '搵版本記錄' },
    'changelog.filterDescription': { english: 'Plain-text search is the default. Date fields accept ISO dates and the local numeric date order; records with no recorded date are excluded only while a date filter is active.', cantonese: '預設用普通文字搜尋。日期欄接受 ISO 日期同本機數字日期次序；只有啟用日期篩選時，冇記錄日期嘅項目先會被排除。' },
    'changelog.startDate': { english: 'Start date', cantonese: '開始日期' },
    'changelog.endDate': { english: 'End date', cantonese: '結束日期' },
    'changelog.search': { english: 'Search changelog', cantonese: '搜尋更新記錄' },
    'changelog.regexTitle': { english: 'Regex builder', cantonese: '正則表達式建立器' },
    'changelog.regexDescription': { english: 'Patterns are bounded and apply only to the bundled changelog records currently in this window.', cantonese: '模式有長度限制，而且只會套用喺而家呢個視窗入面內置嘅更新記錄。' },
    'changelog.rawPattern': { english: 'Raw pattern', cantonese: '原始模式' },
    'changelog.regexFlags': { english: 'Flags', cantonese: '旗標' },
    'changelog.caseInsensitive': { english: 'Case-insensitive', cantonese: '唔分大小寫' },
    'changelog.multiline': { english: 'Multiline', cantonese: '多行' },
    'changelog.dotAll': { english: 'Dot matches newlines', cantonese: '點號包括換行' },
    'changelog.literal': { english: 'Literal', cantonese: '文字' },
    'changelog.characterClass': { english: 'Character class', cantonese: '字元類別' },
    'changelog.anchor': { english: 'Anchor', cantonese: '錨點' },
    'changelog.group': { english: 'Group', cantonese: '群組' },
    'changelog.alternation': { english: 'Alternation', cantonese: '或選' },
    'changelog.quantifier': { english: 'Quantifier', cantonese: '數量詞' },
    'changelog.sample': { english: 'Sample text', cantonese: '示例文字' },
    'changelog.applyRegex': { english: 'Apply regex to changelog', cantonese: '將正則套用去更新記錄' },
    'changelog.plainText': { english: 'Return to plain text', cantonese: '返回普通文字' },
    'changelog.exportTitle': { english: 'Copy or export the current filtered view', cantonese: '複製或者匯出目前篩選畫面' },
    'changelog.exportDescription': { english: 'Copy and export use exactly the records currently visible above. A native save dialog chooses the destination; no release data is fetched.', cantonese: '複製同匯出只會用上面而家睇到嘅記錄。由系統儲存對話框揀目的地；唔會攞任何網絡更新資料。' },
    'changelog.copy': { english: 'Copy filtered changelog', cantonese: '複製已篩選更新記錄' },
    'changelog.exportMarkdown': { english: 'Export Markdown', cantonese: '匯出 Markdown' },
    'changelog.exportText': { english: 'Export plain text', cantonese: '匯出普通文字' },
    'changelog.datePlaceholder': { english: 'YYYY-MM-DD or local date', cantonese: 'YYYY-MM-DD 或本機日期' },
    'changelog.searchPlaceholder': { english: 'Plain text by default', cantonese: '預設普通文字' },
    'changelog.regexExample': { english: 'Example: ^0\\.1\\.0$', cantonese: '例子：^0\\.1\\.0$' },
    'changelog.samplePlaceholder': { english: 'Try the pattern against local sample text', cantonese: '用本機示例文字試吓個模式' },
    'changelog.openRegexAria': { english: 'Open the changelog search regex builder', cantonese: '開啟更新記錄搜尋 regex 建立器' },
    'changelog.closeRegexAria': { english: 'Close the changelog search regex builder', cantonese: '關閉更新記錄搜尋 regex 建立器' },
    'changelog.regexBuilderAria': { english: 'Changelog search regex builder', cantonese: '更新記錄搜尋 regex 建立器' },
    'changelog.tokenToolsAria': { english: 'Guided pattern tokens', cantonese: '引導模式符號' },
    'changelog.loading': { english: 'Loading', cantonese: '載入中' },
    'changelog.notLoaded': { english: 'Not loaded', cantonese: '未載入' },
    'changelog.bundledFile': { english: 'Bundled file', cantonese: '已內置檔案' },
    'changelog.bundledLocalRecords': { english: 'Bundled local records', cantonese: '已內置本機記錄' },
    'changelog.loadingBoundary': { english: 'Loading the bundled changelog…', cantonese: '載入內置更新記錄中…' },
    'changelog.versionNotRecorded': { english: 'Version not recorded', cantonese: '未記錄版本' },
    'changelog.dateNotRecorded': { english: 'Date not recorded', cantonese: '未記錄日期' },
    'changelog.noCategorizedChanges': { english: 'No categorized changes are recorded for this bundled version entry.', cantonese: '呢個內置版本項目冇分類更新記錄。' },
    'changelog.changes': { english: 'Changes', cantonese: '更新內容' },
    'changelog.recordedCommit': { english: 'Recorded commit {sha}', cantonese: '已記錄提交 {sha}' },
    'changelog.openCommit': { english: 'Open recorded commit', cantonese: '開啟已記錄提交' },
    'changelog.missingCommit': { english: 'No commit link is recorded in the bundled changelog.', cantonese: '內置更新記錄冇記錄提交連結。' },
    'changelog.fixFilter': { english: 'Correct the active filter before copying or exporting the filtered changelog.', cantonese: '修正目前篩選之後先可以複製或者匯出已篩選更新記錄。' },
    'changelog.unavailableEmpty': { english: 'No bundled changelog record can be shown because the fixed local source is unavailable.', cantonese: '固定本機來源而家唔可用，所以未能顯示內置更新記錄。' },
    'changelog.dateEmpty': { english: 'No bundled version records match the current date range and search.', cantonese: '冇內置版本記錄符合而家日期範圍同搜尋。' },
    'changelog.regexEmpty': { english: 'No bundled version records match the current regex.', cantonese: '冇內置版本記錄符合而家 regex。' },
    'changelog.plainEmpty': { english: 'No bundled version records match the current plain-text search.', cantonese: '冇內置版本記錄符合而家普通文字搜尋。' },
    'changelog.undatedExcludedOne': { english: '1 record without a recorded date was excluded by the active date filter.', cantonese: '有 1 項冇記錄日期嘅記錄被目前日期篩選排除。' },
    'changelog.undatedExcludedMany': { english: '{count} records without a recorded date were excluded by the active date filter.', cantonese: '有 {count} 項冇記錄日期嘅記錄被目前日期篩選排除。' },
    'changelog.recordCountOne': { english: '1 recorded', cantonese: '已記錄 1 項' },
    'changelog.recordCountMany': { english: '{count} recorded', cantonese: '已記錄 {count} 項' },
    'changelog.matchCountOne': { english: '1 record', cantonese: '1 項記錄' },
    'changelog.matchCountMany': { english: '{count} records', cantonese: '{count} 項記錄' },
    'changelog.regexInactive': { english: 'Regex mode is off. Plain-text search is active.', cantonese: 'Regex 模式已關閉。普通文字搜尋而家啟用。' },
    'changelog.regexSampleMatch': { english: 'Regex mode is active. The local sample contains a match.', cantonese: 'Regex 模式已啟用。本機示例有符合項目。' },
    'changelog.regexSampleNoMatch': { english: 'Regex mode is active. The local sample has no match.', cantonese: 'Regex 模式已啟用。本機示例冇符合項目。' },
    'changelog.regexSamplePrompt': { english: 'Regex mode is active. Add local sample text to preview matches.', cantonese: 'Regex 模式已啟用。加入本機示例文字去預覽符合項目。' },
    'changelog.copySuccess': { english: 'The filtered local changelog was copied.', cantonese: '已複製篩選咗嘅本機更新記錄。' },
    'changelog.clipboardUnavailable': { english: 'Clipboard access was unavailable. Use a local export instead.', cantonese: '而家用唔到剪貼簿，請改用本機匯出。' },
    'changelog.copyBeforeFilter': { english: 'Correct the changelog filters before copying the current view.', cantonese: '請先修正更新記錄篩選，然後先複製目前畫面。' },
    'changelog.exportBeforeFilter': { english: 'Correct the changelog filters before exporting the current view.', cantonese: '請先修正更新記錄篩選，然後先匯出目前畫面。' },
    'changelog.exportCancelled': { english: 'The changelog export was cancelled before any file was written.', cantonese: '匯出喺寫入任何檔案之前已取消。' },
    'heading.noServer': { english: 'NO SERVER SELECTED', cantonese: '未揀伺服器' },
    'heading.firstServer': { english: 'Create your first Minecraft server', cantonese: '建立你第一個 Minecraft 伺服器' },
    'heading.serverType': { english: '{software} SERVER', cantonese: '{software} 伺服器' },
    'dependency.description': { english: 'Paper needs Java. Spigot setup also needs Git. {appName} detects both and can install missing tools using Windows package managers after you select the action.', cantonese: 'Paper 需要 Java，Spigot 設定亦都需要 Git。你揀咗動作之後，{appName} 會偵測兩樣工具，並且可以用 Windows 套件管理員安裝缺少嘅工具。' },
    'plugins.description': { english: 'Select a local plugin JAR. {appName} copies it into the selected server\'s plugins folder without opening a shell.', cantonese: '揀一個本機 plugin JAR。{appName} 會將佢複製去已揀伺服器嘅 plugins 資料夾，唔會開 shell。' },
    'empty.title': { english: 'Build a local server, not a pile of terminal commands.', cantonese: '整個本機伺服器，唔使砌一堆終端指令。' },
    'empty.description': { english: 'Create a Paper or Spigot server, choose its world and network settings with structured controls, then run it from the same console.', cantonese: '建立 Paper 或 Spigot 伺服器，用結構化控制項揀世界同網絡設定，再喺同一個主控台開動。' },
    'tab.general': { english: 'General', cantonese: '一般' },
    'tab.world': { english: 'World', cantonese: '世界' },
    'tab.gameplay': { english: 'Gameplay', cantonese: '遊戲玩法' },
    'tab.network': { english: 'Network', cantonese: '網絡' },
    'tab.runtime': { english: 'Runtime', cantonese: '執行環境' },
    'tab.buildtools': { english: 'BuildTools', cantonese: 'BuildTools' },
    'tab.live': { english: 'Live management', cantonese: '即時管理' },
    'tab.commands': { english: 'Command Center', cantonese: '指令中心' },
    'tab.status': { english: 'Local status', cantonese: '本機狀態' },
    'tab.advanced': { english: 'Advanced', cantonese: '進階' },
    'tab.plugins': { english: 'Plugins', cantonese: '外掛' },
    'tab.console': { english: 'Console', cantonese: '主控台' },
    'dialog.createEyebrow': { english: 'NEW LOCAL SERVER', cantonese: '新本機伺服器' },
    'dialog.createTitle': { english: 'Create a Minecraft server', cantonese: '建立 Minecraft 伺服器' },
    'dialog.createDescription': { english: 'Choose the server software, version, folder, and initial capacity. All other settings remain editable after creation.', cantonese: '揀伺服器軟件、版本、資料夾同初始容量；建立之後仍然可以改其他設定。' },
    'dialog.cancel': { english: 'Cancel', cantonese: '取消' },
    'dialog.create': { english: 'Create server', cantonese: '建立伺服器' },
    'dialog.confirmTitle': { english: 'Confirm {action}', cantonese: '確認 {action}' },
    'dialog.confirmBackup': { english: 'This action can change world or server state. Review the affected server, create the required backup, operate both confirmation controls, then move the slider to authorize it.', cantonese: '呢個動作可以改變世界或伺服器狀態。請檢視受影響伺服器、建立所需備份、操作兩個確認控制項，再推動滑桿授權。' },
    'dialog.confirmImpact': { english: 'This action can affect the selected server or connected players. Review the affected server, operate both confirmation controls, then move the slider to authorize it.', cantonese: '呢個動作可以影響已揀伺服器或已連線玩家。請檢視受影響伺服器、操作兩個確認控制項，再推動滑桿授權。' },
    'dialog.affectedResource': { english: 'Affected resource: {server} · command /{command}', cantonese: '受影響資源：{server} · 指令 /{command}' },
    'settings.title': { english: 'Studio preferences', cantonese: 'Studio 偏好設定' },
    'settings.subtitle': { english: 'Personal presentation controls', cantonese: '個人呈現控制項' },
    'settings.languageMode': { english: 'Language mode', cantonese: '語言模式' },
    'settings.languageTitle': { english: 'Language and message style', cantonese: '語言同訊息風格' },
    'settings.languageDescription': { english: 'Choose how app-owned navigation, headings, dialog framing, and notification framing are presented. Dynamic server facts and external error text stay exact.', cantonese: '揀應用程式本身嘅導覽、標題、對話框框架同通知框架點樣呈現。動態伺服器資料同外部錯誤文字會保持準確。' },
    'settings.languageEnglish': { english: 'English', cantonese: '英文' },
    'settings.languageCantonese': { english: 'Playful Hong Kong-style Cantonese', cantonese: '玩味港式廣東話' },
    'settings.languageBilingual': { english: 'Bilingual', cantonese: '雙語' },
    'settings.englishFunny': { english: 'English message playfulness', cantonese: '英文訊息玩味程度' },
    'settings.cantoneseFunny': { english: 'Cantonese message playfulness', cantonese: '廣東話訊息玩味程度' },
    'settings.funnyDescription': { english: 'This styles all app-owned messages, including errors and warnings, without changing facts. You can reset it at any time.', cantonese: '呢個設定會改變所有應用程式本身嘅訊息風格，包括錯誤同警告，但唔會改變事實。你隨時可以重設。' },
    'settings.dialogEmoji': { english: 'Show emoji decorations in dialogs and message boxes', cantonese: '喺對話框同訊息框顯示 emoji 裝飾' },
    'settings.dialogEmojiDescription': { english: 'Decorative emoji never replace the factual message or control labels.', cantonese: '裝飾 emoji 唔會代替事實訊息或控制項標籤。' },
    'settings.displayName': { english: 'Display name', cantonese: '顯示名稱' },
    'settings.displayNameDescription': { english: 'Changes only what this app shows in its title and app-owned copy. Package identity, data location, installer identity, and update identity do not change.', cantonese: '只會改變程式標題同應用程式本身顯示嘅名稱。封裝身分、資料位置、安裝程式身分同更新身分都唔會改。' },
    'settings.savePresentation': { english: 'Save presentation settings', cantonese: '儲存呈現設定' },
    'settings.logoTitle': { english: 'App logo', cantonese: '程式標誌' },
    'settings.logoDescription': { english: 'Choose a shipped visual preset or a bounded local PNG or JPEG. This changes only app presentation; package, executable, installer, data, and update identities stay fixed.', cantonese: '揀一個內建視覺預設，或者受限嘅本機 PNG 或 JPEG。只會改程式外觀；封裝、執行檔、安裝程式、資料同更新身分都保持不變。' },
    'settings.logoPreview': { english: 'Live logo preview', cantonese: '即時標誌預覽' },
    'settings.logoSource': { english: 'Shipped presets and local image', cantonese: '內建預設同本機圖片' },
    'settings.logoSearch': { english: 'Find a shipped preset', cantonese: '搵內建預設' },
    'settings.logoSearchPlaceholder': { english: 'Search shipped presets', cantonese: '搜尋內建預設' },
    'settings.logoPresetList': { english: 'Shipped app logo presets', cantonese: '內建程式標誌預設' },
    'settings.logoRegexButton': { english: 'Build regex', cantonese: '建立 regex' },
    'settings.logoRegexTitle': { english: 'Preset regex builder', cantonese: '預設 regex 建立器' },
    'settings.logoRegexDescription': { english: 'Build a bounded pattern for this preset search only. Plain text remains the default.', cantonese: '只為呢個預設搜尋建立受限模式。預設仍然係純文字。' },
    'settings.logoRegexPattern': { english: 'Raw pattern', cantonese: '原始模式' },
    'settings.logoRegexFlags': { english: 'Flags', cantonese: '旗標' },
    'settings.logoRegexIgnoreCase': { english: 'Ignore case', cantonese: '忽略大小寫' },
    'settings.logoRegexCaseSensitive': { english: 'Case sensitive', cantonese: '區分大小寫' },
    'settings.logoRegexIgnoreCaseMultiline': { english: 'Ignore case + multiline', cantonese: '忽略大小寫 + 多行' },
    'settings.logoRegexSample': { english: 'Sample text', cantonese: '範例文字' },
    'settings.logoRegexTokens': { english: 'Regex construction tokens', cantonese: 'Regex 建構符號' },
    'settings.logoRegexLiteral': { english: 'Literal', cantonese: '文字' },
    'settings.logoRegexClass': { english: 'Character class', cantonese: '字元類別' },
    'settings.logoRegexAnchor': { english: 'Anchor', cantonese: '錨點' },
    'settings.logoRegexGroup': { english: 'Group', cantonese: '群組' },
    'settings.logoRegexAlternation': { english: 'Alternation', cantonese: '分支' },
    'settings.logoRegexQuantifier': { english: 'Quantifier', cantonese: '量詞' },
    'settings.logoRegexCopy': { english: 'Copy pattern', cantonese: '複製模式' },
    'settings.logoRegexApply': { english: 'Apply regex search', cantonese: '套用 regex 搜尋' },
    'settings.logoRegexEmpty': { english: 'Enter a pattern to preview matches and capture groups.', cantonese: '輸入模式去預覽比對同捕捉群組。' },
    'settings.logoRegexValid': { english: '{matches} matches and {captures} capture groups in the bounded sample.', cantonese: '受限範例入面有 {matches} 個比對同 {captures} 個捕捉群組。' },
    'settings.logoRegexInvalid': { english: 'The regex pattern is invalid.', cantonese: 'Regex 模式唔正確。' },
    'settings.logoCustomImage': { english: 'Custom local raster image', cantonese: '自訂本機點陣圖片' },
    'settings.logoPick': { english: 'Choose image', cantonese: '揀圖片' },
    'settings.logoCustomHint': { english: 'PNG and JPEG are checked for actual bytes, dimensions, pixel limits, static-image safety, and decoder support before a private cache is updated. The source path is never saved.', cantonese: '更新私用快取之前，PNG 同 JPEG 會檢查真實位元組、尺寸、像素限制、靜態圖片安全同解碼器支援。來源路徑永遠唔會儲存。' },
    'settings.logoNoCustom': { english: 'No custom image selected', cantonese: '未揀自訂圖片' },
    'settings.logoCustomLoaded': { english: 'Validated local raster image is active', cantonese: '已啟用經驗證嘅本機點陣圖片' },
    'settings.logoCustomUnavailable': { english: 'Saved custom image is unavailable; a shipped preset is shown', cantonese: '已儲存嘅自訂圖片唔可用；正顯示內建預設' },
    'settings.logoCustomPreview': { english: 'Current custom app logo preview', cantonese: '目前自訂程式標誌預覽' },
    'settings.logoPresetPreview': { english: 'Current {name} app logo preview', cantonese: '目前 {name} 程式標誌預覽' },
    'settings.logoPreset.studio-aqua.title': { english: 'Studio Aqua', cantonese: 'Studio 水藍' },
    'settings.logoPreset.studio-aqua.description': { english: 'The shipped Minecraft Server Studio mark.', cantonese: 'Minecraft Server Studio 內建標誌。' },
    'settings.logoPreset.server-slate.title': { english: 'Server Slate', cantonese: '伺服器石板' },
    'settings.logoPreset.server-slate.description': { english: 'A quiet server-console mark.', cantonese: '安靜伺服器主控台標誌。' },
    'settings.logoPreset.world-spruce.title': { english: 'World Spruce', cantonese: '世界雲杉' },
    'settings.logoPreset.world-spruce.description': { english: 'A green world-management mark.', cantonese: '綠色世界管理標誌。' },
    'settings.logoSearchResults': { english: '{count} shipped presets shown.', cantonese: '正顯示 {count} 個內建預設。' },
    'settings.logoSearchNoResults': { english: 'No shipped presets match this search.', cantonese: '冇內建預設符合呢個搜尋。' },
    'settings.logoPresentation': { english: 'Rendering controls', cantonese: '顯示控制' },
    'settings.logoPresentationDescription': { english: 'These values change the visible preview and saved app branding without changing installed product identity.', cantonese: '呢啲數值會改變可見預覽同已儲存嘅程式外觀，但唔會改已安裝產品身分。' },
    'settings.logoFit': { english: 'Fit mode', cantonese: '適應模式' },
    'settings.logoFitContain': { english: 'Contain', cantonese: '完整顯示' },
    'settings.logoFitCover': { english: 'Fill and crop', cantonese: '填滿並裁剪' },
    'settings.logoFitFill': { english: 'Stretch to bounds', cantonese: '拉伸至邊界' },
    'settings.logoFitCustom': { english: 'Fit mode applies to the selected custom raster image.', cantonese: '適應模式會套用至已揀嘅自訂點陣圖片。' },
    'settings.logoFitPreset': { english: 'Fit mode is saved for a future custom raster image; shipped marks use their fixed vector-like layout.', cantonese: '適應模式會為將來嘅自訂點陣圖片儲存；內建標誌會使用固定嘅向量式版面。' },
    'settings.logoBackground': { english: 'Background', cantonese: '背景' },
    'settings.logoBackgroundTransparent': { english: 'Transparent', cantonese: '透明' },
    'settings.logoBackgroundColorMode': { english: 'Solid color', cantonese: '純色' },
    'settings.logoCropX': { english: 'Crop horizontal position', cantonese: '裁剪水平位置' },
    'settings.logoCropY': { english: 'Crop vertical position', cantonese: '裁剪垂直位置' },
    'settings.logoZoom': { english: 'Crop zoom', cantonese: '裁剪縮放' },
    'settings.logoFocalX': { english: 'Focal point horizontal position', cantonese: '焦點水平位置' },
    'settings.logoFocalY': { english: 'Focal point vertical position', cantonese: '焦點垂直位置' },
    'settings.logoBackgroundColor': { english: 'Background color', cantonese: '背景顏色' },
    'settings.logoBackgroundHex': { english: 'Background color hexadecimal value', cantonese: '背景顏色十六進制數值' },
    'settings.logoApply': { english: 'Apply logo rendering', cantonese: '套用標誌顯示' },
    'settings.logoReset': { english: 'Reset shipped logo', cantonese: '重設內建標誌' },
    'settings.logoStoragePending': { english: 'Loading app-private logo settings…', cantonese: '正在載入程式私用標誌設定…' },
    'settings.schoolTitle': { english: '{label} control', cantonese: '{label} 控制' },
    'settings.schoolEyebrow': { english: 'SHARED LOCAL EXPERIENCE CONTROL', cantonese: '共用本機使用體驗控制' },
    'settings.schoolDescription': { english: '{label} is a shared local user-experience control, not a security boundary. It forces English while active and hides language and message-playfulness controls. It does not encrypt data or prevent a local reset.', cantonese: '{label} 係共用本機使用體驗控制，唔係保安界線。啟用時會強制英文，同時隱藏語言同訊息玩味控制。佢唔會加密資料，亦唔會阻止本機重設。' },
    'settings.schoolLabel': { english: 'Mode label', cantonese: '模式名稱' },
    'settings.saveSchoolLabel': { english: 'Save mode label', cantonese: '儲存模式名稱' },
    'settings.schoolEnabled': { english: 'Enable {label}', cantonese: '啟用 {label}' },
    'settings.schoolToggleDescription': { english: 'Turning it off requires the shared unlock password or PIN. While the shared record is unavailable, English safety presentation remains active.', cantonese: '關閉時需要共用解鎖密碼或 PIN。共用記錄唔可用時，英文安全呈現會保持啟用。' },
    'settings.schoolRecordMissing': { english: 'The shared local mode record is missing. Create it before configuring this control; English safety presentation stays active until then.', cantonese: '共用本機模式記錄唔見咗。請先建立記錄先可以設定；到時之前英文安全呈現會保持啟用。' },
    'settings.schoolRecordUnavailable': { english: 'The shared local mode record is unavailable. English safety presentation stays active; repair local application-data access and refresh this dialog.', cantonese: '共用本機模式記錄唔可用。英文安全呈現會保持啟用；請修復本機應用程式資料存取，然後重新開啟呢個對話框。' },
    'settings.createSchoolRecord': { english: 'Create shared local record', cantonese: '建立共用本機記錄' },
    'settings.unlockTitle': { english: 'Shared unlock password or PIN', cantonese: '共用解鎖密碼或 PIN' },
    'settings.unlockDescription': { english: 'The credential is stored through operating-system protection, never in the shared record. To reset after losing it, delete the shared local application-data record yourself; this is a user-experience recovery route, not account support.', cantonese: '憑證會透過作業系統保護儲存，唔會寫入共用記錄。忘記之後要重設，請你自己刪除共用本機應用程式資料記錄；呢個係使用體驗復原方法，唔係帳戶支援。' },
    'settings.recoveryFolder': { english: 'Recovery folder:', cantonese: '復原資料夾：' },
    'settings.currentCredential': { english: 'Current password or PIN', cantonese: '目前密碼或 PIN' },
    'settings.newCredential': { english: 'New password or PIN', cantonese: '新密碼或 PIN' },
    'settings.confirmCredential': { english: 'Confirm new password or PIN', cantonese: '確認新密碼或 PIN' },
    'settings.saveCredential': { english: 'Save unlock credential', cantonese: '儲存解鎖憑證' },
    'settings.credentialUnavailable': { english: 'Operating-system credential protection is unavailable. This control cannot change the mode until it is restored.', cantonese: '作業系統憑證保護唔可用。未修復之前，呢個控制唔可以改變模式。' },
    'settings.credentialRequired': { english: 'Create an unlock password or PIN before enabling this mode.', cantonese: '啟用呢個模式之前，請先建立解鎖密碼或 PIN。' },
    'settings.credentialReady': { english: 'A shared unlock credential is configured.', cantonese: '已設定共用解鎖憑證。' },
    'settings.schoolActive': { english: '{label} is active. English safety presentation is currently applied.', cantonese: '{label} 已啟用。目前正套用英文安全呈現。' },
    'settings.schoolInactive': { english: '{label} is off. Saved presentation preferences are available.', cantonese: '{label} 已關閉。已儲存嘅呈現偏好可以使用。' },
    'settings.close': { english: 'Close preferences', cantonese: '關閉偏好設定' },
    'toast.presentationSaved': { english: 'Presentation settings saved.', cantonese: '已儲存呈現設定。' },
    'toast.schoolRecordCreated': { english: 'The shared local mode record is ready.', cantonese: '共用本機模式記錄已準備好。' },
    'toast.schoolLabelSaved': { english: 'The shared mode label was saved.', cantonese: '已儲存共用模式名稱。' },
    'toast.credentialSaved': { english: 'The shared unlock credential was saved.', cantonese: '已儲存共用解鎖憑證。' },
    'toast.schoolEnabled': { english: '{label} is now on. English safety presentation is active.', cantonese: '{label} 已啟用。英文安全呈現已生效。' },
    'toast.schoolDisabled': { english: '{label} is now off. Your saved presentation preferences are restored.', cantonese: '{label} 已關閉。你已儲存嘅呈現偏好已恢復。' },
    'toast.logoPresetSaved': { english: 'Shipped logo preset saved.', cantonese: '已儲存內建標誌預設。' },
    'toast.logoImported': { english: 'Validated local logo saved privately.', cantonese: '已私下儲存經驗證嘅本機標誌。' },
    'toast.logoPresentationSaved': { english: 'Logo rendering saved.', cantonese: '已儲存標誌顯示。' },
    'toast.logoReset': { english: 'The shipped Studio Aqua logo is active again.', cantonese: 'Studio 水藍內建標誌已再次啟用。' },
    'toast.logoRegexCopied': { english: 'Preset regex pattern copied.', cantonese: '已複製預設 regex 模式。' },
    'toast.logoRegexCopyUnavailable': { english: 'Clipboard access is unavailable. Select the raw pattern to copy it.', cantonese: '剪貼簿存取唔可用。請揀原始模式去複製。' },
    'toast.error': { english: 'Attention', cantonese: '留意' },
    'toast.success': { english: 'Updated', cantonese: '已更新' },
    'toast.info': { english: 'Notice', cantonese: '提示' }
  });

  const ENGLISH_TONES = Object.freeze([
    'Professional',
    'Friendly',
    'Bright',
    'Playful',
    'Maximum block-party'
  ]);
  const CANTONESE_TONES = Object.freeze([
    '正式',
    '親切',
    '醒神',
    '玩味',
    '方塊派對最大火力'
  ]);
  const ENGLISH_BRAND_TONES = Object.freeze([
    'LOCAL CONTROL CENTER',
    'LOCAL CONTROL DESK',
    'LOCAL BLOCK CONTROL DESK',
    'LOCAL BLOCK COMMAND POST',
    'MAXIMUM BLOCK-PARTY CONTROL HQ'
  ]);
  const CANTONESE_BRAND_TONES = Object.freeze([
    '本機控制中心',
    '本機控制站',
    '本機方塊控制站',
    '本機方塊指揮站',
    '本機方塊派對總部'
  ]);

  function interpolate(template, values = {}) {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => String(values[key] ?? ''));
  }

  function entry(key) {
    return COPY[key] || { english: key, cantonese: key };
  }

  function format(key, mode, values) {
    const value = entry(key);
    const english = interpolate(value.english, values);
    const cantonese = interpolate(value.cantonese, values);
    if (mode === 'cantonese') return cantonese;
    if (mode === 'bilingual') return `${english} · ${cantonese}`;
    return english;
  }

  function tone(language, level) {
    const values = language === 'cantonese' ? CANTONESE_TONES : ENGLISH_TONES;
    return values[Math.max(1, Math.min(5, Number(level) || 1)) - 1];
  }

  function toastPrefix(mode, levels, kind) {
    const englishBase = format(`toast.${kind}`, 'english');
    const cantoneseBase = format(`toast.${kind}`, 'cantonese');
    const english = `${englishBase} — ${tone('english', levels?.english)}`;
    const cantonese = `${cantoneseBase} — ${tone('cantonese', levels?.cantonese)}`;
    if (mode === 'cantonese') return cantonese;
    if (mode === 'bilingual') return `${english} · ${cantonese}`;
    return english;
  }

  function brandingEyebrow(mode, levels) {
    const english = ENGLISH_BRAND_TONES[Math.max(1, Math.min(5, Number(levels?.english) || 1)) - 1];
    const cantonese = CANTONESE_BRAND_TONES[Math.max(1, Math.min(5, Number(levels?.cantonese) || 1)) - 1];
    if (mode === 'cantonese') return cantonese;
    if (mode === 'bilingual') return `${english} · ${cantonese}`;
    return english;
  }

  window.StudioExperienceCopy = Object.freeze({ COPY, brandingEyebrow, format, tone, toastPrefix });
})();
