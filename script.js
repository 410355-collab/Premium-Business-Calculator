    /* ─── DOM 元素快取中心 (避免高頻重複查詢 DOM) ─── */
    const DOM = {
        resultScreen: null,
        formulaScreen: null,
        convertedScreen: null,
        resultScaler: null,
        formulaScaler: null,
        convertedScaler: null,
        resultWrapper: null,
        formulaWrapper: null,
        convertedWrapper: null,
        headerArea: null,
        topCapsule: null,
        phoneContainer: null,
        init() {
            this.resultScreen = document.getElementById('result-screen');
            this.formulaScreen = document.getElementById('formula-screen');
            this.convertedScreen = document.getElementById('converted-screen');
            this.resultScaler = document.getElementById('result-scaler');
            this.formulaScaler = document.getElementById('formula-scaler');
            this.convertedScaler = document.getElementById('converted-scaler');
            this.resultWrapper = document.getElementById('result-wrapper');
            this.formulaWrapper = document.getElementById('formula-wrapper');
            this.convertedWrapper = document.getElementById('converted-wrapper');
            this.headerArea = document.getElementById('header-area');
            this.topCapsule = document.getElementById('top-capsule');
            this.phoneContainer = document.querySelector('.phone-container');
        }
    };

    /* ─── 效能優化：快取容器寬度，避免每次縮設強制 reflow ─── */
    let cachedWidths = {};
    function updateCachedWidths() {
        if (!DOM.resultWrapper) DOM.init();
        if (DOM.resultWrapper) cachedWidths['resultWrapper'] = DOM.resultWrapper.clientWidth;
        if (DOM.formulaWrapper) cachedWidths['formulaWrapper'] = DOM.formulaWrapper.clientWidth;
        if (DOM.convertedWrapper) cachedWidths['convertedWrapper'] = DOM.convertedWrapper.clientWidth;
    }

    function isScreenTooSmall() {
        const w = window.innerWidth;
        const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return (w < 340 || h < 340);
    }

    function checkSmallScreenThreshold() {
        const isTooSmall = isScreenTooSmall();
        ['btn-open-keyboard', 'btn-open-style', 'btn-open-tax', 'btn-open-rates'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (isTooSmall) {
                    el.classList.add('disabled-row');
                } else {
                    el.classList.remove('disabled-row');
                }
            }
        });
    }

    function guardSubMenuOpen(callback) {
        return function(e) {
            if (isScreenTooSmall()) {
                triggerVibration(true);
                showToastMsg(I18N[currentLang].toastScreenTooSmall || "Screen size too small");
                return;
            }
            if (typeof callback === 'function') callback(e);
        };
    }

    function handleWindowResize() {
        // 優先使用 window.visualViewport.height 獲取真實高度
        const actualHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--true-height', `${actualHeight}px`);

        updateCachedWidths();
        checkSmallScreenThreshold();

        // 螢幕方向改變時，即時同步當前模式之鍵盤佈局與網格
        syncKeyboardState();
        if (typeof updateGridCols === 'function') updateGridCols();
        if (typeof renderMainKeyboard === 'function') renderMainKeyboard();
        if (document.getElementById('keyboard-settings-menu')?.classList.contains('show')) {
            if (typeof renderCustomKeyboard === 'function') renderCustomKeyboard();
        }

        // 延遲約 100ms 確保系統轉場動畫完成後再進行重算與文字縮放
        setTimeout(() => {
            updateDisplay();
            autoScaleText('resultScaler', 'resultWrapper');
            autoScaleText('formulaScaler', 'formulaWrapper');
            autoScaleText('convertedScaler', 'convertedWrapper');
        }, 100);
    }
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleWindowResize);
    window.addEventListener('load', () => {
        handleWindowResize();
        checkSmallScreenThreshold();
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DOM.init();
            handleWindowResize();
            checkSmallScreenThreshold();
        });
    } else {
        DOM.init();
        handleWindowResize();
        checkSmallScreenThreshold();
    }

    /* 持久化 Keys 定義 */
    const KEY_HISTORY = 'bCalc_history';
    const KEY_RATES = 'bCalc_rates';
    const KEY_RATES_TIME = 'bCalc_rates_time';
    const KEY_TAX_RATES = 'bCalc_tax_rates';
    const KEY_THEME_COLOR = 'bCalc_theme_color';
    const KEY_LIGHT_MODE = 'bCalc_light_mode';
    const KEY_DECIMALS = 'bCalc_decimals';
    const KEY_HAPTIC = 'bCalc_haptic';
    const KEY_PERCENT_MODE = 'bCalc_percent_mode';
    const KEY_CURRENCY_FROM = 'bCalc_curr_from';
    const KEY_CURRENCY_TO = 'bCalc_curr_to';
    const KEY_TAX_EXCLUDED = 'bCalc_tax_excluded';
    const KEY_FONT_STYLE = 'bCalc_font_style';
    const KEY_LANG = 'bCalc_lang';
    const KEY_KEYBOARD_LAYOUT = 'bCalc_keyboard_layout';
    const KEY_CATEGORY_BUBBLE = 'bCalc_category_bubble';
    const KEY_LARGE_NUMBER_FORMAT = 'bCalc_large_number_format';

    let isCategoryBubbleEnabled = localStorage.getItem(KEY_CATEGORY_BUBBLE) !== 'false';
    let largeNumberFormat = localStorage.getItem(KEY_LARGE_NUMBER_FORMAT) || 'full';
    let memoryValue = 0;
    let percentMode = localStorage.getItem(KEY_PERCENT_MODE) || 'commercial';
    let cursorPos = null; // null represents insertion point at end of expression

    const ICONS = {
        backspace: `<svg viewBox="0 0 24 24"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>`,
        plus_minus: `<svg viewBox="0 0 24 24"><path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2zM5 19h14v2H5v-2z"/></svg>`,
        sqrt: `<svg viewBox="0 0 24 24"><path d="M4 13l3.5 7L13 4h7v2h-5.5L10 19l-4.5-9H2v-2h2z"/></svg>`,
        copy: `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`
    };

    const KEY_DEFINITIONS = {
        // 核心運算鍵
        'clear': { label: 'C', action: 'clearAll', type: 'cyan', category: 'util', name: 'Clear' },
        'backspace': { icon: 'backspace', action: 'backspace', type: 'red-back', category: 'util', name: 'Backspace' },
        'percent': { label: '%', action: 'inputOperator', param: '%', type: 'cyan', category: 'biz', name: 'Percent' },
        'divide': { label: '÷', action: 'inputOperator', param: '÷', type: 'operator', category: 'math', name: 'Divide' },
        
        'num_7': { label: '7', action: 'inputNum', param: '7', type: '', category: 'util', name: '7' },
        'num_8': { label: '8', action: 'inputNum', param: '8', type: '', category: 'util', name: '8' },
        'num_9': { label: '9', action: 'inputNum', param: '9', type: '', category: 'util', name: '9' },
        'multiply': { label: '×', action: 'inputOperator', param: '×', type: 'operator', category: 'math', name: 'Multiply' },
        
        'num_4': { label: '4', action: 'inputNum', param: '4', type: '', category: 'util', name: '4' },
        'num_5': { label: '5', action: 'inputNum', param: '5', type: '', category: 'util', name: '5' },
        'num_6': { label: '6', action: 'inputNum', param: '6', type: '', category: 'util', name: '6' },
        'subtract': { label: '-', action: 'inputOperator', param: '-', type: 'operator', category: 'math', name: 'Subtract' },
        
        'num_1': { label: '1', action: 'inputNum', param: '1', type: '', category: 'util', name: '1' },
        'num_2': { label: '2', action: 'inputNum', param: '2', type: '', category: 'util', name: '2' },
        'num_3': { label: '3', action: 'inputNum', param: '3', type: '', category: 'util', name: '3' },
        'add': { label: '+', action: 'inputOperator', param: '+', type: 'operator', category: 'math', name: 'Add' },
        
        'paren': { label: '()', action: 'inputParenthesis', type: 'paren-key', category: 'math', name: 'Parenthesis' },
        'num_0': { label: '0', action: 'inputNum', param: '0', type: '', category: 'util', name: '0' },
        'dot': { label: '.', action: 'inputNum', param: '.', type: '', category: 'math', name: 'Dot' },
        'equal': { label: '=', action: 'evaluateExpr', type: 'equal', category: 'math', name: 'Equal' },

        // 商務與實用
        'double_zero': { label: '00', action: 'inputNum', param: '00', type: '', category: 'biz', name: '00' },
        'triple_zero': { label: '000', action: 'inputNum', param: '000', type: 'small-text', category: 'biz', name: '000' },
        'plus_minus': { icon: 'plus_minus', action: 'toggleSign', type: 'cyan', category: 'biz', name: '±' },
        'tax_plus': { customHTML: '<span class="key-text" style="font-size:30cqmin;display:flex;flex-direction:column;line-height:0.95;"><span>+TAX</span><span style="font-size:16cqmin;opacity:0.8;">▲</span></span>', action: 'applyTaxAdd', type: 'cyan', category: 'biz', name: '+TAX' },
        'tax_minus': { customHTML: '<span class="key-text" style="font-size:30cqmin;display:flex;flex-direction:column;line-height:0.95;"><span>-TAX</span><span style="font-size:16cqmin;opacity:0.8;">▼</span></span>', action: 'applyTaxSub', type: 'cyan', category: 'biz', name: '-TAX' },
        'discount': { label: '-%', action: 'applyDiscount', type: 'cyan', category: 'biz', name: '-%' },

        // 科學與數學
        'sqrt': { icon: 'sqrt', action: 'inputFunction', param: 'sqrt(', type: 'cyan', category: 'math', name: '√x' },
        'square': { customHTML: '<span class="key-text" style="font-size:42cqmin;">x²</span>', action: 'inputPower', param: '^2', type: 'cyan', category: 'math', name: 'x²' },
        'cube': { customHTML: '<span class="key-text" style="font-size:42cqmin;">x³</span>', action: 'inputPower', param: '^3', type: 'cyan', category: 'math', name: 'x³' },
        'power': { customHTML: '<span class="key-text" style="font-size:42cqmin;">xʸ</span>', action: 'inputOperator', param: '^', type: 'operator', category: 'math', name: 'xʸ' },
        'reciprocal': { customHTML: '<span class="key-text" style="font-size:36cqmin;">1/x</span>', action: 'inputReciprocal', type: 'cyan', category: 'math', name: '1/x' },
        'abs': { customHTML: '<span class="key-text" style="font-size:40cqmin;">|x|</span>', action: 'inputFunction', param: 'abs(', type: 'cyan', category: 'math', name: '|x|' },
        'pi': { customHTML: '<span class="key-text" style="font-size:50cqmin;">π</span>', action: 'inputConstant', param: 'π', type: 'cyan', category: 'math', name: 'π' },
        'euler': { customHTML: '<span class="key-text" style="font-size:48cqmin;font-style:italic;">e</span>', action: 'inputConstant', param: 'e', type: 'cyan', category: 'math', name: 'e' },
        'factorial': { customHTML: '<span class="key-text" style="font-size:42cqmin;">x!</span>', action: 'inputOperator', param: '!', type: 'cyan', category: 'math', name: 'x!' },
        'sin': { label: 'sin', action: 'inputFunction', param: 'sin(', type: 'cyan small-text', category: 'math', name: 'sin' },
        'cos': { label: 'cos', action: 'inputFunction', param: 'cos(', type: 'cyan small-text', category: 'math', name: 'cos' },
        'tan': { label: 'tan', action: 'inputFunction', param: 'tan(', type: 'cyan small-text', category: 'math', name: 'tan' },
        'ln': { label: 'ln', action: 'inputFunction', param: 'ln(', type: 'cyan small-text', category: 'math', name: 'ln' },
        'log': { label: 'log', action: 'inputFunction', param: 'log(', type: 'cyan small-text', category: 'math', name: 'log' },

        // 記憶體
        'mem_clear': { label: 'MC', action: 'memoryClear', type: 'accent-mem small-text', category: 'mem', name: 'MC' },
        'mem_recall': { label: 'MR', action: 'memoryRecall', type: 'accent-mem small-text', category: 'mem', name: 'MR' },
        'mem_add': { label: 'M+', action: 'memoryAdd', type: 'accent-mem small-text', category: 'mem', name: 'M+' },
        'mem_sub': { label: 'M-', action: 'memorySub', type: 'accent-mem small-text', category: 'mem', name: 'M-' },
        'mem_store': { label: 'MS', action: 'memoryStore', type: 'accent-mem small-text', category: 'mem', name: 'MS' },

        // 輔助與自訂
        'ans': { label: 'ANS', action: 'inputAns', type: 'cyan small-text', category: 'util', name: 'ANS' },
        'rand': { label: 'RND', action: 'inputRand', type: 'cyan small-text', category: 'util', name: 'RAND' },
        'copy_key': { icon: 'copy', action: 'copyResult', type: 'accent-util', category: 'util', name: 'Copy' },
        'blank': { customHTML: '<span class="key-text" style="font-size:30cqmin;opacity:0.4;">⬚</span>', action: 'blank', type: 'blank', category: 'util', name: 'Blank' }
    };

    const PRESET_DEFAULT_LAYOUTS = {
        '6x4': [
            'clear', 'backspace', 'percent', 'divide', 'multiply', 'subtract',
            'num_7', 'num_8', 'num_9', 'add', 'paren', 'sqrt',
            'num_4', 'num_5', 'num_6', 'double_zero', 'plus_minus', 'power',
            'num_1', 'num_2', 'num_3', 'num_0', 'dot', 'equal'
        ],
        '5x4': [
            'clear', 'backspace', 'percent', 'divide', 'multiply',
            'num_7', 'num_8', 'num_9', 'subtract', 'add',
            'num_4', 'num_5', 'num_6', 'paren', 'equal',
            'num_1', 'num_2', 'num_3', 'num_0', 'dot'
        ],
        '4x6': [
            'sin', 'cos', 'tan', 'power',
            'clear', 'backspace', 'percent', 'divide',
            'num_7', 'num_8', 'num_9', 'multiply',
            'num_4', 'num_5', 'num_6', 'subtract',
            'num_1', 'num_2', 'num_3', 'add',
            'paren', 'num_0', 'dot', 'equal'
        ],
        '4x5': [
            'clear', 'backspace', 'percent', 'divide',
            'num_7', 'num_8', 'num_9', 'multiply',
            'num_4', 'num_5', 'num_6', 'subtract',
            'num_1', 'num_2', 'num_3', 'add',
            'paren', 'num_0', 'dot', 'equal'
        ],
        '4x4': [
            'clear', 'backspace', 'divide', 'multiply',
            'num_7', 'num_8', 'num_9', 'subtract',
            'num_4', 'num_5', 'num_6', 'add',
            'num_1', 'num_2', 'num_3', 'equal'
        ],
        '3x4': [
            'num_7', 'num_8', 'num_9',
            'num_4', 'num_5', 'num_6',
            'num_1', 'num_2', 'num_3',
            'clear', 'num_0', 'equal'
        ]
    };

    const DEFAULT_KEYBOARD_LAYOUT = PRESET_DEFAULT_LAYOUTS['4x5'];

    const GRID_CONFIGS = {
        '6x4': { cols: 6, rows: 4, total: 24 },
        '5x4': { cols: 5, rows: 4, total: 20 },
        '4x6': { cols: 4, rows: 6, total: 24 },
        '4x5': { cols: 4, rows: 5, total: 20 },
        '4x4': { cols: 4, rows: 4, total: 16 },
        '3x4': { cols: 3, rows: 4, total: 12 }
    };

    const KEY_KEYBOARD_GRID = 'bCalc_keyboard_grid';
    const KEY_KEYBOARD_LAYOUT_LANDSCAPE = 'bCalc_keyboard_layout_landscape';
    const KEY_KEYBOARD_GRID_LANDSCAPE = 'bCalc_keyboard_grid_landscape';

    function isLandscapeMode() {
        return window.innerWidth > window.innerHeight;
    }

    let activeEditOrientation = isLandscapeMode() ? 'landscape' : 'portrait';

    function getKeyboardGrid(orientation = (isLandscapeMode() ? 'landscape' : 'portrait')) {
        const isLand = (orientation === 'landscape');
        const defaultGrid = isLand ? '6x4' : '4x5';
        const key = isLand ? KEY_KEYBOARD_GRID_LANDSCAPE : KEY_KEYBOARD_GRID;
        let g = localStorage.getItem(key) || defaultGrid;
        if (!GRID_CONFIGS[g]) g = defaultGrid;
        return g;
    }

    function getKeyboardLayout(orientation = (isLandscapeMode() ? 'landscape' : 'portrait')) {
        const grid = getKeyboardGrid(orientation);
        const isLand = (orientation === 'landscape');
        const key = isLand ? KEY_KEYBOARD_LAYOUT_LANDSCAPE : KEY_KEYBOARD_LAYOUT;
        const saved = localStorage.getItem(key);
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }
        return [...(PRESET_DEFAULT_LAYOUTS[grid] || DEFAULT_KEYBOARD_LAYOUT)];
    }

    function autoSaveSnapshot(orientation = activeEditOrientation) {
        try {
            const KEY_KEYBOARD_SNAPSHOTS = 'bCalc_keyboard_snapshots';
            const snapshots = JSON.parse(localStorage.getItem(KEY_KEYBOARD_SNAPSHOTS)) || {};
            if (!snapshots[orientation]) snapshots[orientation] = {};
            const activeKey = snapshots[orientation].activeSnapshot || 'biz';
            snapshots[orientation][activeKey] = {
                grid: currentKeyboardGrid,
                layout: [...currentKeyboardLayout]
            };
            snapshots[orientation].activeSnapshot = activeKey;
            localStorage.setItem(KEY_KEYBOARD_SNAPSHOTS, JSON.stringify(snapshots));
        } catch (e) {}
    }

    function saveKeyboardGrid(grid, orientation = activeEditOrientation) {
        const key = (orientation === 'landscape') ? KEY_KEYBOARD_GRID_LANDSCAPE : KEY_KEYBOARD_GRID;
        localStorage.setItem(key, grid);
        autoSaveSnapshot(orientation);
    }

    function saveKeyboardLayout(layout, orientation = activeEditOrientation) {
        const key = (orientation === 'landscape') ? KEY_KEYBOARD_LAYOUT_LANDSCAPE : KEY_KEYBOARD_LAYOUT;
        localStorage.setItem(key, JSON.stringify(layout));
        autoSaveSnapshot(orientation);
    }

    let currentKeyboardGrid = getKeyboardGrid(isLandscapeMode() ? 'landscape' : 'portrait');
    let currentKeyboardLayout = getKeyboardLayout(isLandscapeMode() ? 'landscape' : 'portrait');

    function syncKeyboardState(targetOrientation = null) {
        const isCustomizerOpen = document.getElementById('keyboard-settings-menu')?.classList.contains('show');
        const orient = targetOrientation || (isCustomizerOpen ? activeEditOrientation : (isLandscapeMode() ? 'landscape' : 'portrait'));
        currentKeyboardGrid = getKeyboardGrid(orient);
        currentKeyboardLayout = getKeyboardLayout(orient);
    }

    const SUPPORTED_CURRENCIES = [
        { code: 'TWD', flag: 'tw' },
        { code: 'USD', flag: 'us' },
        { code: 'JPY', flag: 'jp' },
        { code: 'KRW', flag: 'kr' },
        { code: 'EUR', flag: 'eu' },
        { code: 'CNY', flag: 'cn' },
        { code: 'MYR', flag: 'my' },
        { code: 'SGD', flag: 'sg' },
        { code: 'AUD', flag: 'au' },
        { code: 'VND', flag: 'vn' },
        { code: 'THB', flag: 'th' }
    ];

    function renderCurrencyUI() {
        const fromOptions = document.getElementById('options-from');
        const toOptions = document.getElementById('options-to');
        const rateGrid = document.querySelector('.rate-grid');
        const taxGrid = document.querySelector('.tax-grid');

        if (!fromOptions || !toOptions) return;

        // 渲染下拉選單
        const optionsHTML = SUPPORTED_CURRENCIES.map(curr => `
            <div class="dropdown-option" data-code="${curr.code}" data-flag="${curr.flag}">
                <img src="./flags/${curr.flag}.svg" class="flag-img" alt="${curr.code}">
                <span data-currency-name="${curr.code}">${I18N[currentLang].currencies[curr.code]}</span>
            </div>
        `).join('');

        fromOptions.innerHTML = optionsHTML;
        toOptions.innerHTML = optionsHTML;

        // 渲染匯率設定輸入框
        if (rateGrid) {
            rateGrid.innerHTML = SUPPORTED_CURRENCIES.map(curr => `
                <div class="rate-input-group">
                    <div class="currency-btn-group" data-code="${curr.code}">
                        <img src="./flags/${curr.flag}.svg" class="flag-img" alt="${curr.code}">
                        <span data-currency-name="${curr.code}">${curr.code}</span>
                    </div>
                    <input type="number" step="any" id="rate-input-${curr.code}" readonly>
                </div>
            `).join('');
        }

        // 渲染稅率設定輸入框
        if (taxGrid) {
            taxGrid.innerHTML = SUPPORTED_CURRENCIES.map(curr => `
                <div class="tax-input-group">
                    <img src="./flags/${curr.flag}.svg" class="flag-img" alt="${curr.code}">
                    <span class="tax-currency-label" data-currency-name="${curr.code}">${curr.code}</span>
                    <input type="number" id="tax-input-${curr.code}" value="${customTaxRates[curr.code] || 0}" readonly>
                </div>
            `).join('');
        }
    }

    const DEFAULT_TAX_RATES = { TWD: 5, JPY: 10, KRW: 10, USD: 0, EUR: 20, CNY: 13, MYR: 8, SGD: 9, AUD: 10, VND: 10, THB: 7 };
    const THEME_COLORS = ['#29b6f6', '#00e676', '#fbc02d', '#ff80ab', '#b388ff'];

    let rates = { USD: 1, TWD: 32.5, JPY: 150.0, KRW: 1350.0, EUR: 0.92, CNY: 7.25, MYR: 4.45, SGD: 1.34, AUD: 1.55, VND: 25000.0, THB: 35.0 };
    const flags = { TWD: "tw", USD: "us", JPY: "jp", KRW: "kr", EUR: "eu", CNY: "cn", MYR: "my", SGD: "sg", AUD: "au", VND: "vn", THB: "th" };
    
    let baseRateCurrency = "USD"; 
    let lastValidConvertedValue = 0; 

    /* ─── IndexedDB 資料持久化備援模組 (保護計算歷史與重要偏好設定) ─── */
    const IDB_NAME = 'BusinessCalcDB';
    const IDB_VERSION = 1;
    const IDB_STORE = 'app_data';

    function openAppDB() {
        return new Promise((resolve) => {
            if (!window.indexedDB) { resolve(null); return; }
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
        });
    }

    async function saveToIDB(key, val) {
        try {
            const db = await openAppDB();
            if (!db) return;
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(val, key);
        } catch (e) { console.warn('IDB write error:', e); }
    }

    async function deleteFromIDB(key) {
        try {
            const db = await openAppDB();
            if (!db) return;
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
        } catch (e) { console.warn('IDB delete error:', e); }
    }

    async function loadFromIDB(key) {
        try {
            const db = await openAppDB();
            if (!db) return null;
            return new Promise((resolve) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const req = tx.objectStore(IDB_STORE).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }

    /* 從 localStorage / IndexedDB 初始化持久化資料 */
    let customTaxRates = JSON.parse(localStorage.getItem(KEY_TAX_RATES)) || {...DEFAULT_TAX_RATES};
    const rawLocalHistory = localStorage.getItem(KEY_HISTORY);
    let calcHistory = rawLocalHistory !== null ? JSON.parse(rawLocalHistory) : [];
    
    // 從 IndexedDB 非同步備份還原計算紀錄 (僅在全新安裝或 localStorage 遺失 null 時才還原，若使用者主動清空則不強行復原)
    if (rawLocalHistory === null) {
        loadFromIDB(KEY_HISTORY).then(idbHistory => {
            if (Array.isArray(idbHistory) && idbHistory.length > 0) {
                calcHistory = idbHistory;
                localStorage.setItem(KEY_HISTORY, JSON.stringify(calcHistory));
                if (typeof renderHistory === 'function') renderHistory();
            }
        });
    }

    function saveHistoryStorage() {
        localStorage.setItem(KEY_HISTORY, JSON.stringify(calcHistory));
        saveToIDB(KEY_HISTORY, calcHistory);
    }

    let decimals = localStorage.getItem(KEY_DECIMALS) !== null ? parseInt(localStorage.getItem(KEY_DECIMALS), 10) : 2;
    let isTaxExcluded = localStorage.getItem(KEY_TAX_EXCLUDED) === 'true';
    let fontStyle = localStorage.getItem(KEY_FONT_STYLE) || 'tech';
    let currentLang = localStorage.getItem(KEY_LANG) || 'en';
    
    let currentFrom = localStorage.getItem(KEY_CURRENCY_FROM) || "KRW";
    let currentTo = localStorage.getItem(KEY_CURRENCY_TO) || "TWD";

    /* 🌐 統一 IP 定位為主、GPS 定位為輔模組 (跨計算機全功能共享) */
    let detectedLocationMeta = null;
    function detectCurrencyFromCoords(lat, lng) {
        if (lat >= 24 && lat <= 46 && lng >= 122 && lng <= 154) return { locationName: "東京, 日本", currency: "JPY", flag: "🇯🇵", symbol: "¥" };
        if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 131) return { locationName: "首爾, 韓國", currency: "KRW", flag: "🇰🇷", symbol: "₩" };
        if (lat >= 35 && lat <= 70 && lng >= -10 && lng <= 30) return { locationName: "歐洲 (歐元區)", currency: "EUR", flag: "🇪🇺", symbol: "€" };
        if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) return { locationName: "美國", currency: "USD", flag: "🇺🇸", symbol: "$" };
        if (lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106) return { locationName: "曼谷, 泰國", currency: "🇹🇭", symbol: "฿" };
        if (lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110) return { locationName: "胡志明市, 越南", currency: "VND", flag: "🇻🇳", symbol: "₫" };
        if (lat >= 1.1 && lat <= 1.5 && lng >= 103.5 && lng <= 104.1) return { locationName: "新加坡", currency: "SGD", flag: "🇸🇬", symbol: "S$" };
        if (lat >= 1 && lat <= 7 && lng >= 99 && lng <= 119) return { locationName: "吉隆坡, 馬來西亞", currency: "MYR", flag: "🇲🇾", symbol: "RM" };
        if (lat <= -10 && lat >= -44 && lng >= 112 && lng <= 154) return { locationName: "雪梨, 澳洲", currency: "AUD", flag: "🇦🇺", symbol: "A$" };
        if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) return { locationName: "中國", currency: "CNY", flag: "🇨🇳", symbol: "¥" };
        if (lat >= 21.8 && lat <= 25.3 && lng >= 119.5 && lng <= 122.5) return { locationName: "台灣", currency: "TWD", flag: "🇹🇼", symbol: "NT$" };
        return { locationName: "國外目的地", currency: "USD", flag: "🌐", symbol: "$" };
    }

    function fetchUnifiedLocationAndCurrency(onSuccess) {
        // 1. IP 定位優先 (免權限彈窗、速度最快)
        fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                if (data && data.country_code) {
                    const countryCurrMap = {
                        TW: { locationName: "台灣", currency: "TWD", flag: "🇹🇼", symbol: "NT$" },
                        JP: { locationName: "日本", currency: "JPY", flag: "🇯🇵", symbol: "¥" },
                        KR: { locationName: "韓國", currency: "KRW", flag: "🇰🇷", symbol: "₩" },
                        US: { locationName: "美國", currency: "USD", flag: "🇺🇸", symbol: "$" },
                        EU: { locationName: "歐洲", currency: "EUR", flag: "🇪🇺", symbol: "€" },
                        CN: { locationName: "中國", currency: "CNY", flag: "🇨🇳", symbol: "¥" },
                        TH: { locationName: "泰國", currency: "THB", flag: "🇹🇭", symbol: "฿" },
                        VN: { locationName: "越南", currency: "VND", flag: "🇻🇳", symbol: "₫" },
                        SG: { locationName: "新加坡", currency: "SGD", flag: "🇸🇬", symbol: "S$" },
                        MY: { locationName: "馬來西亞", currency: "MYR", flag: "🇲🇾", symbol: "RM" },
                        AU: { locationName: "澳洲", currency: "AUD", flag: "🇦🇺", symbol: "A$" }
                    };
                    const meta = countryCurrMap[data.country_code] || {
                        locationName: data.city || data.country_name || "所在地",
                        currency: data.currency || "USD",
                        flag: "🌐",
                        symbol: "$"
                    };
                    detectedLocationMeta = { source: 'IP', ...meta };
                    if (typeof onSuccess === 'function') onSuccess(detectedLocationMeta);
                } else {
                    throw new Error('IP info missing');
                }
            })
            .catch(() => {
                // 2. IP 失敗時自動以 GPS 定位為輔
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const meta = detectCurrencyFromCoords(pos.coords.latitude, pos.coords.longitude);
                            detectedLocationMeta = { source: 'GPS', lat: pos.coords.latitude, lng: pos.coords.longitude, ...meta };
                            if (typeof onSuccess === 'function') onSuccess(detectedLocationMeta);
                        },
                        () => {
                            // 預設切回當前選擇之源幣別
                            detectedLocationMeta = { source: 'Default', currency: currentFrom };
                            if (typeof onSuccess === 'function') onSuccess(detectedLocationMeta);
                        },
                        { timeout: 3000, maximumAge: 60000 }
                    );
                } else {
                    detectedLocationMeta = { source: 'Default', currency: currentFrom };
                    if (typeof onSuccess === 'function') onSuccess(detectedLocationMeta);
                }
            });
    }
    window.fetchUnifiedLocationAndCurrency = fetchUnifiedLocationAndCurrency;

    let currentInput = "0", isEvaluated = false;
    let activeHistoryItem = null;
    let activeHistoryIndex = -1;
    let historyMenuEvent = null;
    let toastTimer = null;
    const menuTimers = {};

    function clearMenuTimer(menuId) {
        if (menuTimers[menuId]) {
            clearTimeout(menuTimers[menuId]);
            delete menuTimers[menuId];
        }
    }

    function updateMenuOpenState() {
        const isAnyMenuOpen = !!document.querySelector('.overlay-menu.show');
        document.querySelector('.phone-container')?.classList.toggle('menu-open', isAnyMenuOpen);
    }

    function closeAllMenus() {
        document.querySelectorAll('.overlay-menu').forEach(menu => {
            clearMenuTimer(menu.id);
            menu.classList.remove('show');
            menu.style.animation = 'none';
        });
        updateMenuOpenState();
    }

    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // 使用 BigNumber 避免 0.1+0.2 等二進位浮點誤差
    math.config({ number: 'BigNumber', precision: 64 });

    function autoCloseParentheses(expr) {
        const openCount = (expr.match(/\(/g) || []).length;
        const closeCount = (expr.match(/\)/g) || []).length;
        const missing = openCount - closeCount;
        return missing > 0 ? expr + ')'.repeat(missing) : expr;
    }

    function preprocessPercent(expr) {
        // Commercial mode (Casio style: 1000 + 10% = 1100, 1000 - 10% = 900, 1000 * 10% = 100, 1000 / 10% = 10000)
        let processed = expr;
        let prev = "";
        while (prev !== processed && /([+\-])([0-9.]+)%/.test(processed)) {
            prev = processed;
            processed = processed.replace(/(.+?)([+\-])([0-9.]+)%/g, (match, base, op, pct) => {
                if (/[\*\/]$/.test(base)) return match;
                return `(${base})${op}((${base})*(${pct}/100))`;
            });
        }
        processed = processed.replace(/([0-9.]+)%/g, "($1/100)");
        return processed;
    }

    function safeEvaluate(expr) {
        let prepared = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi');
        prepared = prepared.replace(/\bln\(/g, 'log(').replace(/\blog\(/g, 'log10(');
        const sanitized = prepared.replace(/[^0-9\+\-\*\/\(\)\.%\^!a-zA-Z]/g, '');
        if (!sanitized) return math.bignumber(NaN);
        const preprocessed = preprocessPercent(sanitized);
        return math.evaluate(preprocessed);
    }

    /* 🧼 浮點數尾數噪點過濾 (徹底消除 0.1 + 0.2 = 0.30000000000000004 等 IEEE 754 誤差) */
    function stripFloatEpsilon(val) {
        if (val === null || val === undefined) return "0";
        const bn = math.isBigNumber(val) ? val : math.bignumber(String(val));
        if (!bn.isFinite()) return "Error";
        let num = bn.toNumber();
        if (!isNaN(num) && Math.abs(num) < 1e14 && Math.abs(num) > 1e-14) {
            let rounded = parseFloat(num.toPrecision(14));
            if (!isNaN(rounded)) return rounded.toString();
        }
        let str = bn.toFixed(10);
        if (str.includes('.')) str = str.replace(/\.?0+$/, '');
        return str;
    }

    function resultToInputString(val) {
        const bn = math.isBigNumber(val) ? val : math.bignumber(String(val));
        if (!bn.isFinite()) return "Error";
        return stripFloatEpsilon(bn);
    }

    function getDetailedErrorMsg(expr, err) {
        const openCount = (expr.match(/\(/g) || []).length;
        const closeCount = (expr.match(/\)/g) || []).length;
        if (openCount !== closeCount) {
            return I18N[currentLang].errUnclosedParen || "UNCLOSED PARENTHESIS";
        }
        if (/\/\s*0(?![.\d])/.test(expr) || /\/\s*0\.0+(?![1-9])/.test(expr)) {
            return I18N[currentLang].errDivideZero || "CANNOT DIVIDE BY ZERO";
        }
        if (err && err.message && err.message.toLowerCase().includes('parenthes')) {
            return I18N[currentLang].errUnclosedParen || "UNCLOSED PARENTHESIS";
        }
        return I18N[currentLang].errSyntax || "SYNTAX ERROR";
    }

    function updateMemoryIndicator() {
        const memEl = document.getElementById('mem-indicator');
        if (!memEl) return;
        const hasMem = (memoryValue !== 0 && memoryValue !== '0' && memoryValue !== null && memoryValue !== undefined);
        memEl.classList.toggle('active', !!hasMem);
    }

    // 預快取 haptic toggle 參考，避免每次查詢 DOM
    let _hapticToggleEl = null;
    function getHapticToggle() {
        if (!_hapticToggleEl) _hapticToggleEl = document.getElementById('haptic-toggle');
        return _hapticToggleEl;
    }

    /* ─── Web Audio API 超短觸覺聲學脈衝 (針對 iOS Safari 不支援 navigator.vibrate 的完美跨平台觸覺解法) ─── */
    let _audioCtx = null;
    function getAudioContext() {
        if (!_audioCtx) {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (AudioCtxClass) {
                _audioCtx = new AudioCtxClass();
            }
        }
        if (_audioCtx && _audioCtx.state === 'suspended') {
            _audioCtx.resume().catch(() => {});
        }
        return _audioCtx;
    }

    // 在使用者首次點擊/觸摸網頁時解鎖 AudioContext (iOS 規範)
    function unlockAudioContextOnGesture() {
        const unlock = () => {
            getAudioContext();
            window.removeEventListener('touchstart', unlock, true);
            window.removeEventListener('pointerdown', unlock, true);
        };
        window.addEventListener('touchstart', unlock, { capture: true, passive: true });
        window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    }
    unlockAudioContextOnGesture();

    function playAcousticHaptic(isError = false) {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.onended = () => {
                try {
                    osc.disconnect();
                    gain.disconnect();
                } catch(e) {}
            };

            if (isError) {
                // 錯誤警示觸覺脈衝 (雙重鋸齒波 160Hz -> 50Hz)
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);

                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.08);
            } else {
                // 一般按鍵擬真觸覺脈衝 (14ms 超短低頻正弦波 130Hz -> 30Hz)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(130, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.014);

                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.014);
            }
        } catch (e) {}
    }

    /* ─── 觸覺震動引擎（支援 Android 實體震動 + iOS 擬巧觸覺雙引擎） ─── */
    function triggerVibration(isError = false) {
        const toggle = getHapticToggle();
        if (!toggle || !toggle.checked) return;

        let didVibrate = false;

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
                didVibrate = navigator.vibrate(isError ? [35, 40, 35] : 8);
            } catch (e) {}
        }

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS || !didVibrate) {
            playAcousticHaptic(isError);
        }

        const iosSwitch = document.getElementById('ios-haptic-switch');
        if (iosSwitch) {
            iosSwitch.checked = !iosSwitch.checked;
        }
    }

    /* ─── B. 智慧型點擊/觸控防誤觸機制 (精確區分滑動與點擊) ─── */
    function attachSmartTap(el, callback, options = {}) {
        if (!el) return;
        const distanceThreshold = options.threshold || 8;
        let startX = 0;
        let startY = 0;
        let isTracking = false;
        let hasMoved = false;
        let activePointerId = null;
        let targetEl = null;

        let initialScrollTop = 0;
        let initialScrollLeft = 0;
        let scrollParent = null;

        function getScrollParent(node) {
            let parent = node ? (node.parentElement || node.parentNode) : null;
            while (parent && parent !== document.body && parent !== document.documentElement) {
                if (parent.nodeType !== 1) break;
                const style = window.getComputedStyle(parent);
                if (['scroll', 'auto'].includes(style.overflowY) || ['scroll', 'auto'].includes(style.overflowX)) {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return null;
        }

        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return;

            if (options.selector) {
                targetEl = e.target.closest(options.selector);
                if (!targetEl) return;
            } else {
                targetEl = el;
            }

            isTracking = true;
            hasMoved = false;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;

            scrollParent = getScrollParent(targetEl) || (el.nodeType === 1 ? el : null);
            if (scrollParent) {
                initialScrollTop = scrollParent.scrollTop || 0;
                initialScrollLeft = scrollParent.scrollLeft || 0;
            }

            if (options.activeClass && targetEl) {
                targetEl.classList.add(options.activeClass);
            }

            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
        };

        const onPointerMove = (e) => {
            if (!isTracking || e.pointerId !== activePointerId) return;

            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);

            if (dx > distanceThreshold || dy > distanceThreshold) {
                hasMoved = true;
            }

            if (scrollParent) {
                if (Math.abs((scrollParent.scrollTop || 0) - initialScrollTop) > 3 ||
                    Math.abs((scrollParent.scrollLeft || 0) - initialScrollLeft) > 3) {
                    hasMoved = true;
                }
            }

            if (hasMoved && options.activeClass && targetEl) {
                targetEl.classList.remove(options.activeClass);
            }
        };

        const onPointerUp = (e) => {
            if (!isTracking || e.pointerId !== activePointerId) return;

            if (scrollParent) {
                if (Math.abs((scrollParent.scrollTop || 0) - initialScrollTop) > 3 ||
                    Math.abs((scrollParent.scrollLeft || 0) - initialScrollLeft) > 3) {
                    hasMoved = true;
                }
            }

            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            if (dx > distanceThreshold || dy > distanceThreshold) {
                hasMoved = true;
            }

            if (options.activeClass && targetEl) {
                targetEl.classList.remove(options.activeClass);
            }

            if (!hasMoved && targetEl) {
                if (options.preventDefault && e.cancelable) e.preventDefault();
                callback(e, targetEl);
            }

            cleanup();
        };

        const onPointerCancel = () => {
            if (options.activeClass && targetEl) {
                targetEl.classList.remove(options.activeClass);
            }
            cleanup();
        };

        const cleanup = () => {
            isTracking = false;
            activePointerId = null;
            targetEl = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
        };

        el.addEventListener('pointerdown', onPointerDown);

        el.addEventListener('contextmenu', (e) => {
            if (options.selector && e.target.closest(options.selector)) {
                e.preventDefault();
            } else if (!options.selector) {
                e.preventDefault();
            }
        });
    }

    function attachZeroLatencyTap(el, callback) {
        attachSmartTap(el, callback);
    }

    function triggerErrorFeedback(specificMsg) {
        triggerVibration(true);
        showToastMsg(specificMsg || I18N[currentLang].toastInvalidExpr);
    }

    /* ─── 動態文字自動縮放與水平滾動引擎（iOS 級漸進縮放與橫向滾動排程） ─── */
    const MIN_SCALE_RATIO = 0.48;
    let batchDisplayRaf = null;
    function requestBatchDisplayUpdate() {
        if (batchDisplayRaf) return;
        batchDisplayRaf = requestAnimationFrame(() => {
            batchDisplayRaf = null;
            if (!DOM.resultScaler) DOM.init();

            const items = [
                { s: DOM.resultScaler, w: DOM.resultWrapper, screen: DOM.resultScreen, key: 'resultWrapper' },
                { s: DOM.formulaScaler, w: DOM.formulaWrapper, screen: DOM.formulaScreen, key: 'formulaWrapper' },
                { s: DOM.convertedScaler, w: DOM.convertedWrapper, screen: DOM.convertedScreen, key: 'convertedWrapper' }
            ];

            // 1. [Read Phase: 集中批次讀取寬度，避免交錯 Reflow]
            const measurements = [];
            for (let i = 0; i < items.length; i++) {
                const { s, w, screen, key } = items[i];
                if (!s || !w) continue;
                const containerWidth = cachedWidths[key] || w.clientWidth;
                // s 為 width: max-content，其 scrollWidth 是字串真實未受限之排版寬度
                const contentWidth = s.scrollWidth;
                const ratio = (contentWidth > containerWidth && containerWidth > 0) ? Math.max(containerWidth / contentWidth, MIN_SCALE_RATIO) : 1;
                measurements.push({ s, w, ratio, contentWidth, containerWidth });
            }

            // 2. [Write Phase: 集中批次寫入樣式與滾動位置]
            for (let i = 0; i < measurements.length; i++) {
                const { s, w, ratio, contentWidth, containerWidth } = measurements[i];
                s.dataset.currentRatio = ratio;
                if (ratio < 1) {
                    // 當寬度大於容器時，LTR 排版下 margin-left: auto 會折疊為 0 (靠左對齊 x=0)
                    // 因此 transformOrigin 必須為 left center，縮放後右邊界正好延伸至 containerWidth，100% 貼滿整行且絕不吃字
                    s.style.transformOrigin = 'left center';
                    s.style.transform = `scale(${ratio}) translate3d(0, 0, 0)`;
                } else {
                    s.style.transformOrigin = 'right center';
                    s.style.transform = 'scale(1) translate3d(0, 0, 0)';
                }
                
                const visualContentWidth = contentWidth * ratio;
                // 僅在縮小至極限 (MIN_SCALE_RATIO) 且視覺寬度依然大於容器寬度時才開啟水平滾動
                if (visualContentWidth > containerWidth + 1 && ratio <= MIN_SCALE_RATIO + 0.001) {
                    const maxScroll = Math.max(0, visualContentWidth - containerWidth);
                    w.scrollLeft = maxScroll;
                } else {
                    // 動態縮放階段 (ratio = containerWidth / contentWidth)，視覺寬度正好 100% 填滿整行，滾動位置強制設為 0
                    w.scrollLeft = 0;
                }
            }
        });
    }

    function autoScaleText(scalerKey, wrapperKey) {
        requestBatchDisplayUpdate();
    }

    /* 🔥 高效能字串千分位格式化（防止大數精確度遺失與避免物件建立開銷） */
    function formatInputDisplay(inputStr) {
        return inputStr.replace(/(\d+)(\.\d*)?/g, (match, p1, p2) => {
            const formattedInt = p1.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return formattedInt + (p2 || '');
        });
    }

    // 將純文字字串中的 ^指數 轉換為右上角 <sup> 上標 HTML（手寫次方樣式）
    function renderSuperscript(str) {
        // 先 escape 特殊 HTML 字元（避免 XSS），再把 ^... 替換為 <sup>
        const escaped = str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // 匹配 ^ 後面所有連續的數字、負號、小數點（支援負指數與小數指數）
        return escaped.replace(/\^([\-\d.]+)/g, '<sup>$1</sup>');
    }

    function formatNumber(num) {
        if (num === null || num === undefined) return "0";
        if (num === "Error") return "Error";

        // 科學記號模式：當數值為大數 (|bn| >= 1e12 或非零極小數 |bn| < 1e-6) 時，以標準科學記號格式化
        if (largeNumberFormat === 'scientific') {
            try {
                const bn = math.isBigNumber(num) ? num : math.bignumber(String(num).replace(/,/g, ''));
                if (bn.isFinite()) {
                    const absBn = bn.abs();
                    if (absBn.gte(math.bignumber('1e12')) || (!absBn.isZero() && absBn.lt(math.bignumber('1e-6')))) {
                        return math.format(bn, { notation: 'exponential', precision: 10 });
                    }
                }
            } catch (e) {
                // fallback to regular format
            }
        }

        const str = stripFloatEpsilon(num);
        if (str === "Error") return "Error";
        const parts = str.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }

    function scrollDisplayToEnd() {
        requestBatchDisplayUpdate();
    }

    /* 🔥 即時運算與動態介面更新邏輯（極致批次排程，零佈局抖動） */
    function updateDisplay(animType = 'none') {
        if (!DOM.resultScreen) DOM.init();
        const { resultScreen, formulaScreen, convertedScreen } = DOM;
        if (!resultScreen) return;

        // 1. [Read Phase] 若為 append 動畫，在 DOM 變更前記錄舊右邊界座標
        const oldResultRight = (animType === 'append') ? resultScreen.getBoundingClientRect().right : 0;

        let formattedInput = "";
        if (isEvaluated) {
            formattedInput = formatNumber(currentInput);
        } else {
            formattedInput = formatInputDisplay(currentInput);
        }

        // 2. [Write Phase: Result Screen & Animation & Cursor]
        if (!isEvaluated && cursorPos !== null && cursorPos >= 0 && cursorPos <= currentInput.length) {
            // 在游標位置精確插入閃爍游標
            let rawIdx = 0, fmtIdx = 0;
            while (rawIdx < cursorPos && fmtIdx < formattedInput.length) {
                if (formattedInput[fmtIdx] === ',') fmtIdx++;
                else { rawIdx++; fmtIdx++; }
            }
            const before = formattedInput.slice(0, fmtIdx);
            const after = formattedInput.slice(fmtIdx);
            resultScreen.innerHTML = renderSuperscript(before) + '<span class="formula-cursor"></span>' + renderSuperscript(after);
        } else if (animType === 'append' && formattedInput.length > 0) {
            // 先對完整輸入做次方 HTML 轉換，再用 DOM 把最後可見字元包入 .new-digit
            const fullHTML = renderSuperscript(formattedInput);

            // 找到「最後一個可見字元」的分割點：倒著掃 HTML 找到最後一個非標籤字元
            // 策略：從 fullHTML 末尾找最後的文字字元（排除 HTML 結尾標籤）
            let splitIdx = fullHTML.length;
            for (let i = fullHTML.length - 1; i >= 0; i--) {
                if (fullHTML[i] === '>') break;   // 到了結尾標籤 > 就停
                if (fullHTML[i] !== '<') { splitIdx = i; break; }  // 找到文字字元
            }
            const baseHTML = fullHTML.slice(0, splitIdx);
            const lastCharHTML = fullHTML.slice(splitIdx);
            resultScreen.innerHTML = '<span class="existing-digits">' + baseHTML + '</span><span class="new-digit">' + lastCharHTML + '</span>';

            // 既有數字往左平順位移動畫 (僅在未縮放 100% 狀態下執行 FLIP 補幀，避免動態縮放/滾動時與容器縮放動畫衝突)
            const currentRatio = parseFloat(DOM.resultScaler?.dataset?.currentRatio || 1);
            if (baseHTML.length > 0 && oldResultRight > 0 && currentRatio >= 0.98) {
                const existingEl = resultScreen.querySelector('.existing-digits');
                if (existingEl) {
                    const newExistingRight = existingEl.getBoundingClientRect().right;
                    const shiftX = oldResultRight - newExistingRight;

                    if (Math.abs(shiftX) > 0.5 && Math.abs(shiftX) < 300) {
                        existingEl.animate([
                            { transform: `translate3d(${shiftX}px, 0, 0)` },
                            { transform: 'translate3d(0, 0, 0)' }
                        ], {
                            duration: 180,
                            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                            fill: 'none'
                        });
                    }
                }
            }
        } else {
            resultScreen.innerHTML = renderSuperscript(formattedInput);
            if (animType === 'delete') {
                resultScreen.classList.remove('anim-delete');
                requestAnimationFrame(() => {
                    resultScreen.classList.add('anim-delete');
                });
            } else if (animType === 'clear') {
                resultScreen.classList.remove('anim-clear');
                requestAnimationFrame(() => {
                    resultScreen.classList.add('anim-clear');
                });
            }
        }

        // Write Phase: Formula Screen
        if (!isEvaluated) {
            try {
                let evalVal = safeEvaluate(autoCloseParentheses(currentInput));
                if (math.isBigNumber(evalVal) && evalVal.isFinite()) {
                    formulaScreen.textContent = "= " + formatNumber(evalVal);
                } else {
                    formulaScreen.textContent = "";
                }
            } catch(e) {
                formulaScreen.textContent = "";
            }
        }

        // Batch Scale & Converted Update
        requestBatchDisplayUpdate();
        throttledExchange();

        if (isTaxExcluded) {
            convertedScreen.classList.add('tax-excluded-text');
        } else {
            convertedScreen.classList.remove('tax-excluded-text');
        }
    }

    function calculateExchange() {
        try {
            const evalResult = safeEvaluate(autoCloseParentheses(currentInput));
            if (math.isBigNumber(evalResult) && evalResult.isFinite()) {
                let val = evalResult;
                if (isTaxExcluded) {
                    const taxRate = math.divide(customTaxRates[currentFrom] || 0, 100);
                    val = math.divide(val, math.add(1, taxRate));
                }
                const fromRate = rates[currentFrom] || 1;
                const toRate = rates[currentTo] || 1;
                lastValidConvertedValue = parseFloat(
                    math.format(math.multiply(math.divide(val, fromRate), toRate), { notation: 'fixed', precision: decimals + 4 })
                );
            }
        } catch(e) {
            /* keep lastValidConvertedValue */
        }

        const toCurrText = I18N[currentLang].currShort[currentTo] || currentTo;
        if (DOM.convertedScreen) {
            DOM.convertedScreen.textContent = `≈ ${lastValidConvertedValue.toFixed(decimals)} ${toCurrText}`;
        }
        requestBatchDisplayUpdate();
    }

    // 節流版：連續輸入時限制匯率運算頻率（100ms 一次），使用者不會感知延遲
    const throttledExchange = throttle(calculateExchange, 100);

    function instantInput(e, funcName, param) {
        // 觸發物理回饋（統一使用新引擎，正常點擊一律 false）
        triggerVibration(false);

        if (funcName !== 'evaluateExpr') {
            hideCategoryBubble();
        }

        // B. 處理計算與 UI 邏輯
        requestAnimationFrame(() => {
            let animType = 'none';

            if (funcName === 'inputNum') {
                if (isEvaluated) { 
                    currentInput = param === "." ? "0." : param; 
                    isEvaluated = false; 
                    cursorPos = null;
                } else {
                    if (cursorPos !== null && cursorPos >= 0 && cursorPos <= currentInput.length) {
                        if (currentInput === "0" && cursorPos === 1 && param !== ".") {
                            currentInput = param;
                            cursorPos = 1;
                        } else {
                            currentInput = currentInput.slice(0, cursorPos) + param + currentInput.slice(cursorPos);
                            cursorPos += param.length;
                        }
                    } else {
                        if (param === ".") {
                            const currentTokens = currentInput.split(/[\+\-\×\÷\%\(\)]/);
                            const lastToken = currentTokens[currentTokens.length - 1];
                            if (lastToken.includes('.')) return; 

                            const lastChar = currentInput.slice(-1);
                            if (['+', '-', '×', '÷', '(', '%'].includes(lastChar) || currentInput === "") {
                                currentInput += "0.";
                            } else {
                                currentInput += ".";
                            }
                        } else {
                            if (currentInput === "0") currentInput = param;
                            else currentInput += param;
                        }
                    }
                }
                animType = 'append';
            } else if (funcName === 'inputOperator') {
                isEvaluated = false;
                if (cursorPos !== null && cursorPos >= 0 && cursorPos <= currentInput.length) {
                    currentInput = currentInput.slice(0, cursorPos) + param + currentInput.slice(cursorPos);
                    cursorPos += param.length;
                } else {
                    if (currentInput.endsWith('.')) {
                        currentInput = currentInput.slice(0, -1);
                    }
                    const lastChar = currentInput.slice(-1);
                    if (['+', '-', '×', '÷'].includes(lastChar) && param !== '%') {
                        currentInput = currentInput.slice(0, -1) + param;
                    } else {
                        currentInput += param;
                    }
                }
                animType = 'append';
            } else if (funcName === 'clearAll') {
                currentInput = "0"; isEvaluated = false; cursorPos = null;
                lastValidConvertedValue = 0;
                document.getElementById('formula-screen').textContent = "0";
                animType = 'clear';
            } else if (funcName === 'backspace') {
                if (isEvaluated) { currentInput = "0"; isEvaluated = false; cursorPos = null; animType = 'clear'; } 
                else if (cursorPos !== null) {
                    if (cursorPos > 0) {
                        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
                        cursorPos--;
                        if (currentInput === "" || currentInput === "-") { currentInput = "0"; cursorPos = null; animType = 'clear'; }
                        else animType = 'delete';
                    }
                } else {
                    currentInput = currentInput.slice(0, -1);
                    if (currentInput === "" || currentInput === "-") { currentInput = "0"; animType = 'clear'; } 
                    else animType = 'delete';
                }
            } else if (funcName === 'inputParenthesis') {
                if (isEvaluated) { currentInput = "("; isEvaluated = false; cursorPos = null; }
                else {
                    if (currentInput.endsWith('.')) {
                        currentInput = currentInput.slice(0, -1);
                    }
                    const openCount = (currentInput.match(/\(/g) || []).length;
                    const closeCount = (currentInput.match(/\)/g) || []).length;
                    const lastChar = currentInput.slice(-1);

                    if (openCount > closeCount && !['+', '-', '×', '÷', '('].includes(lastChar)) {
                        currentInput += ")";
                    } else {
                        if (/[0-9\)\%]/.test(lastChar)) {
                            currentInput += "×(";
                        } else {
                            if (currentInput === "0") currentInput = "(";
                            else currentInput += "(";
                        }
                    }
                    if (cursorPos !== null) cursorPos = currentInput.length;
                }
                animType = 'append';
            } else if (funcName === 'toggleSign') {
                if (isEvaluated) {
                    if (currentInput.startsWith('-')) currentInput = currentInput.slice(1);
                    else if (currentInput !== "0") currentInput = '-' + currentInput;
                } else {
                    if (currentInput === "0") currentInput = "-";
                    else if (currentInput === "-") currentInput = "0";
                    else if (currentInput.startsWith('-') && !/[\+\-\×\÷]/.test(currentInput.slice(1))) {
                        currentInput = currentInput.slice(1);
                    } else {
                        currentInput = '-(' + currentInput + ')';
                    }
                }
                cursorPos = null;
                animType = 'append';
            } else if (funcName === 'applyTaxAdd') {
                try {
                    let val = safeEvaluate(autoCloseParentheses(currentInput));
                    if (math.isBigNumber(val) && val.isFinite()) {
                        const tax = customTaxRates[currentFrom] || 0;
                        const taxMultiplier = math.add(1, math.divide(tax, 100));
                        val = math.multiply(val, taxMultiplier);
                        currentInput = resultToInputString(val);
                        isEvaluated = true;
                        cursorPos = null;
                        animType = 'append';
                        showToastMsg(`+${tax}% TAX`);
                    }
                } catch(e) {}
            } else if (funcName === 'applyTaxSub') {
                try {
                    let val = safeEvaluate(autoCloseParentheses(currentInput));
                    if (math.isBigNumber(val) && val.isFinite()) {
                        const tax = customTaxRates[currentFrom] || 0;
                        const taxMultiplier = math.add(1, math.divide(tax, 100));
                        val = math.divide(val, taxMultiplier);
                        currentInput = resultToInputString(val);
                        isEvaluated = true;
                        cursorPos = null;
                        animType = 'append';
                        showToastMsg(`-${tax}% TAX`);
                    }
                } catch(e) {}
            } else if (funcName === 'applyDiscount') {
                if (isEvaluated) isEvaluated = false;
                currentInput += "%";
                if (cursorPos !== null) cursorPos = currentInput.length;
                animType = 'append';
            } else if (funcName === 'inputFunction') {
                if (isEvaluated) {
                    currentInput = param + currentInput + ")";
                    isEvaluated = false;
                } else {
                    if (currentInput === "0") currentInput = param;
                    else {
                        const lastChar = currentInput.slice(-1);
                        if (/[0-9\)]/.test(lastChar)) currentInput += "×" + param;
                        else currentInput += param;
                    }
                }
                cursorPos = null;
                animType = 'append';
            } else if (funcName === 'inputConstant') {
                if (isEvaluated || currentInput === "0") {
                    currentInput = param;
                    isEvaluated = false;
                } else {
                    const lastChar = currentInput.slice(-1);
                    if (/[0-9\)]/.test(lastChar)) currentInput += "×" + param;
                    else currentInput += param;
                }
                cursorPos = null;
                animType = 'append';
            } else if (funcName === 'inputPower') {
                if (isEvaluated) isEvaluated = false;
                currentInput += param;
                if (cursorPos !== null) cursorPos = currentInput.length;
                animType = 'append';
            } else if (funcName === 'inputReciprocal') {
                if (isEvaluated) {
                    currentInput = "1/(" + currentInput + ")";
                    isEvaluated = false;
                } else {
                    if (currentInput === "0") currentInput = "1/(";
                    else {
                        const lastChar = currentInput.slice(-1);
                        if (/[0-9\)]/.test(lastChar)) currentInput = "1/(" + currentInput + ")";
                        else currentInput += "1/(";
                    }
                }
                cursorPos = null;
                animType = 'append';
            } else if (funcName === 'memoryClear') {
                memoryValue = 0;
                updateMemoryIndicator();
                showToastMsg(I18N[currentLang].toastMemCleared);
            } else if (funcName === 'memoryRecall') {
                if (memoryValue === 0) {
                    showToastMsg(I18N[currentLang].toastNoMem);
                } else {
                    const mStr = formatNumber(memoryValue).replace(/,/g, '');
                    if (isEvaluated || currentInput === "0") {
                        currentInput = mStr;
                        isEvaluated = false;
                    } else {
                        currentInput += mStr;
                    }
                    cursorPos = null;
                    animType = 'append';
                }
            } else if (funcName === 'memoryAdd') {
                try {
                    let val = safeEvaluate(autoCloseParentheses(currentInput));
                    if (math.isBigNumber(val) && val.isFinite()) {
                        memoryValue = math.add(math.bignumber(memoryValue || 0), val);
                        updateMemoryIndicator();
                        showToastMsg(I18N[currentLang].toastMemStored);
                    }
                } catch(e) {}
            } else if (funcName === 'memorySub') {
                try {
                    let val = safeEvaluate(autoCloseParentheses(currentInput));
                    if (math.isBigNumber(val) && val.isFinite()) {
                        memoryValue = math.subtract(math.bignumber(memoryValue || 0), val);
                        updateMemoryIndicator();
                        showToastMsg(I18N[currentLang].toastMemStored);
                    }
                } catch(e) {}
            } else if (funcName === 'memoryStore') {
                try {
                    let val = safeEvaluate(autoCloseParentheses(currentInput));
                    if (math.isBigNumber(val) && val.isFinite()) {
                        memoryValue = val;
                        updateMemoryIndicator();
                        showToastMsg(I18N[currentLang].toastMemStored);
                    }
                } catch(e) {}
            } else if (funcName === 'inputAns') {
                if (calcHistory.length > 0) {
                    currentInput = calcHistory[0].result.toString();
                    isEvaluated = true;
                    cursorPos = null;
                    animType = 'append';
                }
            } else if (funcName === 'inputRand') {
                currentInput = (Math.random()).toFixed(4);
                isEvaluated = true;
                cursorPos = null;
                animType = 'append';
            } else if (funcName === 'copyResult') {
                const copyVal = isEvaluated ? document.getElementById('result-screen').textContent.replace(/,/g, '') : currentInput;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(copyVal);
                }
                showToastMsg(I18N[currentLang].toastResultCopied);
            } else if (funcName === 'blank') {
                // Blank spacer key - does nothing
            } else if (funcName === 'evaluateExpr') {
                /* 🔥 真·FLIP 動態像素感應超絲滑對調動畫 */
                try {
                    currentInput = autoCloseParentheses(currentInput);
                    let res = safeEvaluate(currentInput);
                    
                    if (!math.isBigNumber(res) || !res.isFinite()) {
                        throw new Error("Invalid output");
                    }

                    const resultStr = resultToInputString(res);
                    cursorPos = null;

                    // 紀錄歷史 (含記帳分類與換算資料)
                    calcHistory.unshift({
                        formula: currentInput,
                        result: resultStr,
                        category: 'business',
                        timestamp: new Date().toISOString(),
                        currencyFrom: currentFrom,
                        currencyTo: currentTo,
                        convertedResult: lastValidConvertedValue,
                        isTaxExcluded: isTaxExcluded,
                        taxRate: customTaxRates[currentFrom] || 0
                    });
                    if (calcHistory.length > 50) calcHistory.pop();
                    saveHistoryStorage();
                    updateHistoryButtonUI();
                    showCategoryBubble();

                    // 1. [First] 擷取動畫前 DOM 座標
                    const formulaScreen = document.getElementById('formula-screen');
                    const resultScreen = document.getElementById('result-screen');
                    const fRect1 = formulaScreen.getBoundingClientRect();
                    const rRect1 = resultScreen.getBoundingClientRect();

                    // 2. [State Change] 立即更新 DOM 與文字狀態
                    const oldFormulaText = currentInput;
                    currentInput = resultStr;
                    isEvaluated = true;
                    formulaScreen.textContent = oldFormulaText + " =";
                    updateDisplay();

                    // 3. [Last] 擷取新 DOM 座標
                    const fRect2 = formulaScreen.getBoundingClientRect();
                    const rRect2 = resultScreen.getBoundingClientRect();

                    // 4. [Invert] 計算動態精準相對 Y 軸像素位移
                    const fOffset = rRect1.top - fRect2.top;
                    const rOffset = fRect1.top - rRect2.top;

                    // 5. [Play] 採用 120Hz 原生 WAAPI 補幀動畫 (GPU 3D 合成)
                    const duration = 280;
                    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

                    formulaScreen.animate([
                        { transform: `translate3d(0, ${fOffset}px, 0) scale(1.1)`, opacity: 0.9 },
                        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.5 }
                    ], { duration, easing, fill: 'none' });

                    resultScreen.animate([
                        { transform: `translate3d(0, ${rOffset}px, 0) scale(0.85)`, opacity: 0.6 },
                        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
                    ], { duration, easing, fill: 'none' });

                    return;
                } catch(err) {
                    const errorMsg = getDetailedErrorMsg(currentInput, err);
                    document.getElementById('formula-screen').textContent = errorMsg;
                    triggerErrorFeedback(errorMsg);
                }
            }
            updateDisplay(animType);
        });
    }

    let inactivityTimer = null;
    let capsuleAnimating = false;
    let activeCapsuleAnim = null;
    const CAPSULE_ANIM_MS = 380;
    const CAPSULE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function finishCapsuleAnimation(headerArea, capsule) {
        capsule.style.transform = '';
        headerArea.classList.remove('is-animating', 'is-expanding', 'is-collapsing');
        capsuleAnimating = false;
    }

    function setCapsuleCollapsed(collapsed, options = {}) {
        const { animate = true } = options;
        const headerArea = document.getElementById('header-area');
        const capsule = document.getElementById('top-capsule');
        if (!headerArea || !capsule) return;

        if (activeCapsuleAnim) {
            activeCapsuleAnim.cancel();
            activeCapsuleAnim = null;
        }

        const isCollapsed = headerArea.classList.contains('collapsed');
        if (isCollapsed === collapsed) return;

        if (!animate || prefersReducedMotion()) {
            headerArea.classList.toggle('collapsed', collapsed);
            headerArea.classList.remove('is-animating', 'is-expanding', 'is-collapsing');
            capsuleAnimating = false;
            return;
        }

        capsuleAnimating = true;
        headerArea.classList.add('is-animating');

        const first = capsule.getBoundingClientRect();

        if (collapsed) {
            headerArea.classList.add('is-collapsing');
            headerArea.classList.add('collapsed');
        } else {
            headerArea.classList.remove('collapsed');
            headerArea.classList.add('is-expanding');
        }

        const last = capsule.getBoundingClientRect();
        const scaleX = first.width / last.width || 1;
        const scaleY = first.height / last.height || 1;
        const dx = (first.left + first.width / 2) - (last.left + last.width / 2);
        const dy = (first.top + first.height / 2) - (last.top + last.height / 2);

        const animation = capsule.animate([
            { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})` },
            { transform: 'translate3d(0, 0, 0) scale(1.018, 1.018)', offset: 0.78 },
            { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
        ], { duration: CAPSULE_ANIM_MS, easing: CAPSULE_EASING, fill: 'both' });

        activeCapsuleAnim = animation;

        const onFinish = () => {
            if (activeCapsuleAnim === animation) {
                activeCapsuleAnim = null;
            }
            finishCapsuleAnimation(headerArea, capsule);
        };

        animation.onfinish = onFinish;
        animation.oncancel = onFinish;
    }

    function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        
        const headerArea = document.getElementById('header-area');
        if (!headerArea || headerArea.classList.contains('collapsed')) return;

        // 如果算式正在輸入中（尚未按下等於且不為0），或者選單/下拉選單是打開的，不要自動縮回
        const isFormulaActive = (currentInput !== "0" && !isEvaluated);
        const isAnyMenuOpen = document.querySelector('.overlay-menu.show') || 
                             document.querySelector('.dropdown-options.show');
        
        if (isFormulaActive || isAnyMenuOpen) return;

        inactivityTimer = setTimeout(() => {
            setCapsuleCollapsed(true);
        }, 15000); // 延長至 15 秒比較人性化
    }

    function updateMenuOpenState() {
        const anyMenuOpen = !!document.querySelector('.overlay-menu.show');
        const phoneContainer = document.querySelector('.phone-container');
        if (phoneContainer) {
            phoneContainer.classList.toggle('menu-open', anyMenuOpen);
        }
        resetInactivityTimer();
    }

    function checkSameCurrency() {
        const headerArea = document.getElementById('header-area');
        const phoneContainer = document.querySelector('.phone-container');
        if (!headerArea || !phoneContainer) return;
        if (currentFrom === currentTo) {
            headerArea.classList.add('same-currency');
            phoneContainer.classList.add('same-currency');
        } else {
            headerArea.classList.remove('same-currency');
            phoneContainer.classList.remove('same-currency');
        }
    }

    function updateDropdownBackdrop() {
        const hasOpenDropdown = !!(document.getElementById('options-from')?.classList.contains('show') || 
                                   document.getElementById('options-to')?.classList.contains('show'));
        const backdrop = document.getElementById('dropdown-backdrop');
        const phoneContainer = document.querySelector('.phone-container');
        const headerArea = document.getElementById('header-area');
        if (backdrop) backdrop.classList.toggle('show', hasOpenDropdown);
        if (phoneContainer) phoneContainer.classList.toggle('dropdown-open', hasOpenDropdown);
        if (headerArea) headerArea.classList.toggle('has-dropdown-open', hasOpenDropdown);
    }

    const toggleDropdown = throttle(function(type, event) {
        if (event) event.stopPropagation();
        triggerVibration();
        if (document.activeElement) document.activeElement.blur();
        const options = document.getElementById(`options-${type}`);
        const otherType = type === 'from' ? 'to' : 'from';
        document.getElementById(`options-${otherType}`).classList.remove('show');
        options.classList.toggle('show');
        updateDropdownBackdrop();
    }, 250);

    function selectCurrency(type, code, flag) {
        triggerVibration();
        if (type === 'from') {
            currentFrom = code;
            localStorage.setItem(KEY_CURRENCY_FROM, code);
        } else {
            currentTo = code;
            localStorage.setItem(KEY_CURRENCY_TO, code);
        }

        const codeText = (I18N[currentLang].currencies && I18N[currentLang].currencies[code]) ? I18N[currentLang].currencies[code] : code;
        document.getElementById(`trigger-${type}`).innerHTML = 
            `<img src="./flags/${flag}.svg" class="flag-img" alt="${code}"> <span id="label-${type}">${codeText}</span> <span class="arrow-down">▼</span>`;

        document.getElementById(`options-${type}`).classList.remove('show');
        updateDropdownBackdrop();
        checkSameCurrency();
        updateDisplay();
    }

    const swapCurrencies = throttle(function() {
        triggerVibration();
        const temp = currentFrom;
        currentFrom = currentTo;
        currentTo = temp;
        selectCurrency('from', currentFrom, flags[currentFrom]);
        selectCurrency('to', currentTo, flags[currentTo]);
    }, 350);

    const toggleTaxMode = throttle(function() {
        triggerVibration();
        isTaxExcluded = !isTaxExcluded;
        localStorage.setItem(KEY_TAX_EXCLUDED, isTaxExcluded ? 'true' : 'false');

        updateTaxBadgeUI();

        const convertedScreen = document.getElementById('converted-screen');
        convertedScreen.classList.remove('anim-eval');
        requestAnimationFrame(() => {
            convertedScreen.classList.add('anim-eval');
        });
        
        updateDisplay();
    }, 300);

    function updateTaxBadgeUI() {
        const btn = document.getElementById('tax-btn');
        if (isTaxExcluded) {
            btn.classList.add('tax-excluded');
            btn.textContent = I18N[currentLang].taxBadgeEx;
        } else {
            btn.classList.remove('tax-excluded');
            btn.textContent = I18N[currentLang].taxBadgeIn;
        }
    }

    const toggleMenu = throttle(function(menuType, event) {
        triggerVibration();
        if (document.activeElement) document.activeElement.blur();
        const menuId = menuType.endsWith('-menu') ? menuType : `${menuType}-menu`;
        const pureType = menuType.replace(/-menu$/, '');
        const menu = document.getElementById(menuId);
        const buttonEl = document.getElementById(`btn-${pureType}`) || document.getElementById(`btn-${menuType}`);
        
        if (!menu) return;

        document.getElementById('options-from')?.classList.remove('show');
        document.getElementById('options-to')?.classList.remove('show');
        updateDropdownBackdrop();

        clearMenuTimer(menuId);

        if (buttonEl) {
            const containerRect = document.querySelector('.phone-container').getBoundingClientRect();
            const btnRect = buttonEl.getBoundingClientRect();
            
            const x = (btnRect.left + btnRect.width / 2) - containerRect.left;
            const y = (btnRect.top + btnRect.height / 2) - containerRect.top;
            
            menu.style.setProperty('--origin-x', `${x}px`);
            menu.style.setProperty('--origin-y', `${y}px`);
        }

        if (menuType === 'history') renderHistory();
        if (menuType === 'settings') setTimeout(updateGliders, 50);

        if (menuType === 'settings') {
            ['keyboard-settings-menu', 'style-settings-menu', 'tax-settings-menu', 'rate-settings-menu', 'ai-scan-settings-menu'].forEach(subId => {
                const subMenu = document.getElementById(subId);
                if (subMenu && subMenu.classList.contains('show')) {
                    clearMenuTimer(subId);
                    subMenu.classList.remove('show');
                    subMenu.style.animation = 'none';
                }
            });
        }

        const animDuration = 180;
        const animCurve = `${animDuration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`;

        if (menu.classList.contains('show')) {
            if (pureType === 'ai-scan' && typeof window.stopWebcam === 'function') {
                window.stopWebcam();
            }
            menu.style.animation = `menuClose ${animCurve}`;
            menuTimers[menuId] = setTimeout(() => {
                menu.classList.remove('show');
                menu.style.animation = 'none';
                delete menuTimers[menuId];
                updateMenuOpenState();
            }, animDuration);
        } else {
            menu.classList.add('show');
            updateMenuOpenState();
            menu.style.animation = `menuOpen ${animCurve}`;
            menuTimers[menuId] = setTimeout(() => {
                menu.style.animation = 'none';
                delete menuTimers[menuId];
            }, animDuration);
        }
    }, 180);

    const navigateSubMenu = throttle(function(fromId, toId, direction) {
        triggerVibration();
        if (document.activeElement) document.activeElement.blur();
        const fromMenu = document.getElementById(fromId);
        const toMenu = document.getElementById(toId);
        if (!fromMenu || !toMenu) return;

        clearMenuTimer(fromId);
        clearMenuTimer(toId);

        const duration = 180;
        const curve = `${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`;

        if (direction === 'forward') {
            fromMenu.style.animation = `slideLeftOut ${curve}`;
            toMenu.classList.add('show');
            toMenu.style.animation = `slideLeftIn ${curve}`;
            menuTimers[fromId] = setTimeout(() => {
                fromMenu.classList.remove('show');
                fromMenu.style.animation = 'none';
                delete menuTimers[fromId];
            }, duration);
            menuTimers[toId] = setTimeout(() => {
                toMenu.style.animation = 'none';
                delete menuTimers[toId];
            }, duration);
        } else {
            fromMenu.style.animation = `slideRightOut ${curve}`;
            toMenu.classList.add('show');
            toMenu.style.animation = `slideRightIn ${curve}`;
            menuTimers[fromId] = setTimeout(() => {
                fromMenu.classList.remove('show');
                fromMenu.style.animation = 'none';
                delete menuTimers[fromId];
            }, duration);
            menuTimers[toId] = setTimeout(() => {
                toMenu.style.animation = 'none';
                delete menuTimers[toId];
            }, duration);
        }
    }, 180);

    function updateHistoryButtonUI() {
        const btn = document.getElementById('btn-history');
        if (!btn) return;
        if (calcHistory && calcHistory.length > 0) {
            btn.classList.add('has-history');
        } else {
            btn.classList.remove('has-history');
        }
    }

    /* ─── 記帳類別系統與即時分類氣泡 (Bookkeeping & Category System) ─── */
    let categoryBubbleTimer = null;

    const CATEGORY_MAP = {
        food: { emoji: '🍜', i18nKey: 'catFood', defaultZh: '食', defaultEn: 'Food' },
        shopping: { emoji: '🛍️', i18nKey: 'catShopping', defaultZh: '購物', defaultEn: 'Shopping' },
        transport: { emoji: '🚗', i18nKey: 'catTransport', defaultZh: '行', defaultEn: 'Transport' },
        other: { emoji: '🏷️', i18nKey: 'catOther', defaultZh: '其他', defaultEn: 'Other' },
        business: { emoji: '💼', i18nKey: 'catBusiness', defaultZh: '商務', defaultEn: 'Business' }
    };

    /* 🏷️ 長按快速設定稅率 (Casio SET Mode) */
    function openQuickTaxModal(currCode) {
        triggerVibration(false);
        const code = currCode || currentFrom;
        const modal = document.getElementById('quick-tax-modal');
        const flagImg = document.getElementById('quick-tax-flag');
        const codeSpan = document.getElementById('quick-tax-code');
        const input = document.getElementById('quick-tax-input');

        if (!modal) return;
        if (flagImg) flagImg.src = `./flags/${flags[code] || 'tw'}.svg`;
        if (codeSpan) codeSpan.textContent = code;
        if (input) {
            input.value = customTaxRates[code] !== undefined ? customTaxRates[code] : 0;
            setTimeout(() => { input.focus(); input.select(); }, 150);
        }
        modal.classList.add('show');
    }

    function closeQuickTaxModal() {
        triggerVibration(false);
        const modal = document.getElementById('quick-tax-modal');
        if (modal) modal.classList.remove('show');
    }

    function saveQuickTaxModal() {
        triggerVibration(false);
        const code = document.getElementById('quick-tax-code').textContent || currentFrom;
        const input = document.getElementById('quick-tax-input');
        const rateVal = input ? parseFloat(input.value) : (customTaxRates[code] || 0);
        const newRate = isNaN(rateVal) ? 0 : Math.max(0, rateVal);

        customTaxRates[code] = newRate;
        localStorage.setItem(KEY_TAX_RATES, JSON.stringify(customTaxRates));

        const taxInputEl = document.getElementById(`tax-input-${code}`);
        if (taxInputEl) taxInputEl.value = newRate;

        closeQuickTaxModal();
        const msg = (I18N[currentLang].toastTaxSaved || "{curr} TAX: {rate}% SAVED!").replace('{curr}', code).replace('{rate}', newRate);
        showToastMsg(msg);

        calculateExchange();
        updateDisplay();
    }

    function getCategoryEmoji(cat) {
        return (CATEGORY_MAP[cat] || CATEGORY_MAP.other).emoji;
    }

    function getCategoryName(cat) {
        const item = CATEGORY_MAP[cat] || CATEGORY_MAP.other;
        return (I18N[currentLang] && I18N[currentLang][item.i18nKey]) || item.defaultZh;
    }

    function showCategoryBubble() {
        if (!isCategoryBubbleEnabled) return;
        const bubble = document.getElementById('category-bubble');
        const headerArea = document.getElementById('header-area');
        if (!bubble) return;
        if (categoryBubbleTimer) {
            clearTimeout(categoryBubbleTimer);
            categoryBubbleTimer = null;
        }

        const currentCat = (calcHistory.length > 0 && calcHistory[0].category) || 'business';
        bubble.querySelectorAll('.cat-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.cat === currentCat);
        });

        bubble.classList.add('show');
        if (headerArea) headerArea.classList.add('bubble-active');
        categoryBubbleTimer = setTimeout(() => {
            hideCategoryBubble();
        }, 4500);
    }

    function hideCategoryBubble() {
        const bubble = document.getElementById('category-bubble');
        const headerArea = document.getElementById('header-area');
        if (categoryBubbleTimer) {
            clearTimeout(categoryBubbleTimer);
            categoryBubbleTimer = null;
        }
        if (bubble) {
            bubble.classList.remove('show');
        }
        if (headerArea) {
            headerArea.classList.remove('bubble-active');
        }
    }

    function setLatestHistoryCategory(catKey) {
        triggerVibration(false);
        if (calcHistory.length === 0) return;
        calcHistory[0].category = catKey;
        saveHistoryStorage();
        
        const bubble = document.getElementById('category-bubble');
        if (bubble) {
            bubble.querySelectorAll('.cat-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.cat === catKey);
            });
        }
        const catStr = `${getCategoryEmoji(catKey)} ${getCategoryName(catKey)}`;
        showToastMsg((I18N[currentLang].toastCategoryTagged || "Category: {cat}").replace('{cat}', catStr));
        setTimeout(() => {
            hideCategoryBubble();
        }, 320);
    }

    let currentHistoryMode = 'accounting'; // 'accounting' (含所有非商務分類) | 'business' (僅商務分類)

    function updateCategorySummaryVisibility() {
        const summaryCard = document.getElementById('history-summary-card');
        if (summaryCard) {
            summaryCard.classList.toggle('hidden', !isCategoryBubbleEnabled);
        }
    }

    function renderHistory() {
        updateHistoryButtonUI();
        updateCategorySummaryVisibility();
        const container = document.getElementById('history-container');
        const todayAmountEl = document.getElementById('history-today-amount');
        const totalCountEl = document.getElementById('history-total-count');
        const summaryTitleEl = document.getElementById('history-summary-title');

        if (summaryTitleEl) {
            summaryTitleEl.textContent = currentHistoryMode === 'accounting'
                ? (currentLang === 'zh' ? '今日記帳總計' : "TODAY'S EXPENSE")
                : (currentLang === 'zh' ? '今日商務總額' : "TODAY'S BIZ TOTAL");
        }

        if (!calcHistory || calcHistory.length === 0) {
            if (todayAmountEl) todayAmountEl.textContent = `0.00 ${currentFrom}`;
            if (totalCountEl) totalCountEl.textContent = (I18N[currentLang].historyListCount || "{count} records").replace('{count}', '0');
            container.innerHTML = `<div class="empty-history">${I18N[currentLang].noHistory}</div>`;
            return;
        }

        // 依據當前選取的歷史模式進行篩選
        // 記帳模式：包含除 'business' 以外的所有記帳分類 (food, shopping, transport, other)
        // 商務模式：僅包含 'business' 分類
        const filteredHistory = calcHistory.map((item, originalIndex) => ({ ...item, originalIndex })).filter(item => {
            const cat = item.category || 'business';
            if (currentHistoryMode === 'accounting') {
                return cat !== 'business';
            } else {
                return cat === 'business';
            }
        });

        // 計算今日總金額
        const todayStr = new Date().toDateString();
        let todayTotal = 0;
        filteredHistory.forEach(item => {
            const refDate = item.addedAt || item.timestamp;
            const itemDateStr = refDate ? new Date(refDate).toDateString() : todayStr;
            if (itemDateStr === todayStr) {
                const resVal = typeof item.result === 'number' ? item.result : parseFloat(String(item.result).replace(/,/g, '')) || 0;
                todayTotal += isNaN(resVal) ? 0 : resVal;
            }
        });

        if (todayAmountEl) todayAmountEl.textContent = `${formatNumber(todayTotal)} ${currentFrom}`;
        if (totalCountEl) totalCountEl.textContent = (I18N[currentLang].historyListCount || "{count} records").replace('{count}', filteredHistory.length);

        if (filteredHistory.length === 0) {
            const emptyMsg = currentHistoryMode === 'accounting' 
                ? (currentLang === 'zh' ? '無記帳紀錄' : 'NO ACCOUNTING RECORDS')
                : (currentLang === 'zh' ? '無商務紀錄' : 'NO BUSINESS RECORDS');
            container.innerHTML = `<div class="empty-history">${emptyMsg}</div>`;
            return;
        }

        container.innerHTML = filteredHistory.map((item) => {
            const index = item.originalIndex;
            const cat = item.category || 'business';
            const catEmoji = getCategoryEmoji(cat);
            const catName = getCategoryName(cat);
            const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString(currentLang === 'zh' ? 'zh-TW' : 'en-US', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit'
            }) : '';
            const currFrom = item.currencyFrom || currentFrom;
            const currTo = item.currencyTo || currentTo;
            const convertedText = (item.convertedResult !== undefined && currFrom !== currTo) 
                ? `≈ ${Number(item.convertedResult).toFixed(decimals)} ${I18N[currentLang].currShort[currTo] || currTo}` 
                : '';

            const hasSubItems = Array.isArray(item.items) && item.items.length > 0;
            const subItemsHtml = hasSubItems ? `
                <div class="h-sub-items-btn" data-toggle-index="${index}">
                    <span class="h-toggle-text">${(I18N[currentLang].toggleDetails || '👇 查看商品細項')}</span>
                </div>
                <div class="h-sub-items-wrap" id="h-sub-items-${index}">
                    <div class="h-sub-items-table">
                        ${item.items.map(sub => {
                            const subForeign = sub.nameForeign && sub.nameForeign !== sub.name ? `<span class="h-sub-item-foreign">(${sub.nameForeign})</span>` : '';
                            const subPriceStr = sub.origCurrency && sub.origCurrency !== 'TWD' 
                                ? `${sub.origCurrency} ${sub.origPrice || sub.price}`
                                : `NT$ ${Math.round(sub.twdAmount || sub.price || 0)}`;
                            return `
                                <div class="h-sub-item-row">
                                    <div class="h-sub-item-name">${sub.name}${subForeign}</div>
                                    <div class="h-sub-item-qty">x${sub.count || 1}</div>
                                    <div class="h-sub-item-price">${subPriceStr}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : '';

            return `
                <div class="history-item" data-index="${index}">
                    <div class="history-top-meta">
                        <span class="cat-badge cat-${cat}">${catEmoji} ${catName}</span>
                        <span class="history-time">${timeStr}</span>
                    </div>
                    <div class="h-formula">${item.formula}</div>
                    <div class="h-result-row">
                        <div class="h-result">= ${formatNumber(item.result)} <span style="font-size:12px;opacity:0.7">${currFrom}</span></div>
                        ${convertedText ? `<div class="h-converted">${convertedText}</div>` : ''}
                    </div>
                    ${subItemsHtml}
                </div>
            `;
        }).join('');

        container.querySelectorAll('.h-sub-items-btn').forEach(btn => {
            btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = btn.getAttribute('data-toggle-index');
                const wrap = document.getElementById(`h-sub-items-${idx}`);
                const textSpan = btn.querySelector('.h-toggle-text');
                if (wrap) {
                    const isOpen = wrap.classList.contains('open');
                    wrap.classList.toggle('open', !isOpen);
                    btn.classList.toggle('expanded', !isOpen);
                    if (textSpan) {
                        textSpan.textContent = !isOpen
                            ? (I18N[currentLang].hideDetails || '👆 收起細項') 
                            : (I18N[currentLang].toggleDetails || '👇 查看商品細項');
                    }
                }
            });
        });
    }

    const openHistoryModal = throttle(function(index, event) {
        triggerVibration();
        activeHistoryItem = calcHistory[index];
        activeHistoryIndex = index;
        historyMenuEvent = event;

        const currentCat = activeHistoryItem.category || 'business';
        const picker = document.getElementById('modal-category-picker');
        if (picker) {
            picker.querySelectorAll('.modal-cat-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.cat === currentCat);
            });
        }

        document.getElementById('history-modal').classList.add('show');
    }, 300);

    function closeHistoryModal() {
        triggerVibration();
        document.getElementById('history-modal').classList.remove('show');
    }

    function changeHistoryItemCategory(catKey) {
        triggerVibration(false);
        if (activeHistoryIndex < 0 || !calcHistory[activeHistoryIndex]) return;
        calcHistory[activeHistoryIndex].category = catKey;
        activeHistoryItem.category = catKey;
        saveHistoryStorage();
        
        const picker = document.getElementById('modal-category-picker');
        if (picker) {
            picker.querySelectorAll('.modal-cat-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.cat === catKey);
            });
        }
        renderHistory();
        const catStr = `${getCategoryEmoji(catKey)} ${getCategoryName(catKey)}`;
        showToastMsg((I18N[currentLang].toastCategoryTagged || "Category: {cat}").replace('{cat}', catStr));
    }

    function applyHistoryOption(type) {
        triggerVibration();
        if (!activeHistoryItem) return;
        if (type === 'result') {
            currentInput = activeHistoryItem.result.toString();
            isEvaluated = true;
            document.getElementById('formula-screen').textContent = "";
        } else if (type === 'formula') {
            currentInput = activeHistoryItem.formula;
            isEvaluated = false;
            document.getElementById('formula-screen').textContent = "";
        } else if (type === 'delete-single') {
            if (activeHistoryIndex >= 0) {
                calcHistory.splice(activeHistoryIndex, 1);
                saveHistoryStorage();
                renderHistory();
            }
            document.getElementById('history-modal').classList.remove('show');
            return;
        }
        document.getElementById('history-modal').classList.remove('show');
        toggleMenu('history', historyMenuEvent);
        updateDisplay();
    }

    /* 動態懶載入 SheetJS XLSX 函式庫 */
    function ensureXlsxLoaded() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './xlsx.full.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('XLSX load failed'));
            document.head.appendChild(script);
        });
    }

    /* 📊 輸出為正規 Excel (.xlsx) 檔案 (支援樞紐分析) */
    async function exportHistoryExcel() {
        triggerVibration(false);
        if (!calcHistory || calcHistory.length === 0) {
            showToastMsg(I18N[currentLang].noHistory || "NO HISTORY");
            return;
        }

        if (typeof XLSX === 'undefined') {
            try {
                await ensureXlsxLoaded();
            } catch (err) {
                showToastMsg("XLSX Library not loaded");
                return;
            }
        }

        // 篩選：分類「商務 (business)」不需要匯出成 Excel
        const exportItems = calcHistory.filter(item => (item.category || 'business') !== 'business');
        if (exportItems.length === 0) {
            showToastMsg(I18N[currentLang].toastNoExcelItems || "NO EXPENSE RECORDS (BUSINESS EXCLUDED)");
            return;
        }

        try {
            const summarySheetName = I18N[currentLang].excelSummarySheet || "分類統計圖表";
            const detailSheetName = I18N[currentLang].excelDetailSheet || "記帳明細";

            // 📋 1. 展平處理發票與明細（若為整張收據，將內含商品個別拆分為明細列）
            const flatDetailItems = [];
            let detailIndex = 1;
            exportItems.forEach(item => {
                if (Array.isArray(item.items) && item.items.length > 0) {
                    item.items.forEach(sub => {
                        const subOrigPrice = Number(sub.origPrice || sub.price) || 0;
                        const subTwdAmount = sub.twdAmount !== undefined ? sub.twdAmount : Math.round(subOrigPrice * (sub.rateToTWD || item.rateToTWD || 1) * 100) / 100;
                        flatDetailItems.push({
                            idx: detailIndex++,
                            timestamp: item.timestamp,
                            category: sub.category || item.category || 'shopping',
                            formula: sub.name || '商品細項',
                            nameForeign: sub.nameForeign || sub.name || '',
                            result: subOrigPrice,
                            currencyFrom: sub.origCurrency || item.currencyFrom || currentFrom,
                            convertedResult: subTwdAmount,
                            currencyTo: item.currencyTo || currentTo,
                            isTaxExcluded: item.isTaxExcluded
                        });
                    });
                } else {
                    const numResult = typeof item.result === 'number' ? item.result : parseFloat(String(item.result).replace(/,/g, '')) || 0;
                    const convResult = (item.convertedResult !== undefined && item.convertedResult !== '') ? parseFloat(item.convertedResult) : numResult;
                    flatDetailItems.push({
                        idx: detailIndex++,
                        timestamp: item.timestamp,
                        category: item.category || 'other',
                        formula: item.formula,
                        nameForeign: item.nameForeign || item.formula,
                        result: numResult,
                        currencyFrom: item.currencyFrom || currentFrom,
                        convertedResult: convResult,
                        currencyTo: item.currencyTo || currentTo,
                        isTaxExcluded: item.isTaxExcluded
                    });
                }
            });

            // 判斷匯出清單中是否有外語/外幣發票
            const hasForeignItems = flatDetailItems.some(item => {
                const curr = item.currencyFrom;
                return (curr && curr !== 'TWD') || (item.nameForeign && item.nameForeign !== item.formula);
            });

            // 📋 建立原始標準工作表
            const headers = [
                I18N[currentLang].excelColNo || "編號",
                I18N[currentLang].excelColDateTime || "日期時間",
                I18N[currentLang].excelColCategory || "分類",
                I18N[currentLang].excelColFormula || "項目/品名"
            ];

            if (hasForeignItems) {
                headers.push(I18N[currentLang].excelColForeignName || "外文品名");
                headers.push(I18N[currentLang].excelColTranslatedName || "中文翻譯");
            }

            headers.push(
                I18N[currentLang].excelColResult || "計算結果",
                I18N[currentLang].excelColCurrency || "原始幣別",
                I18N[currentLang].excelColConverted || "換算金額",
                I18N[currentLang].excelColTargetCurr || "目標幣別",
                I18N[currentLang].excelColTax || "稅率狀態"
            );

            const rows = flatDetailItems.map((item) => {
                const dt = item.timestamp ? new Date(item.timestamp).toLocaleString() : new Date().toLocaleString();
                const catName = `${getCategoryEmoji(item.category || 'other')} ${getCategoryName(item.category || 'other')}`;
                const numResult = item.result;
                const convResult = item.convertedResult !== undefined ? item.convertedResult : '';
                const taxMode = item.isTaxExcluded ? (I18N[currentLang].taxBadgeEx || "未稅") : (I18N[currentLang].taxBadgeIn || "含稅");
                const isForeign = (item.currencyFrom && item.currencyFrom !== 'TWD') && (item.nameForeign && item.nameForeign !== item.formula);

                const rowData = [
                    item.idx,
                    dt,
                    catName,
                    item.formula
                ];

                if (hasForeignItems) {
                    if (isForeign) {
                        rowData.push(item.nameForeign || item.formula);
                        rowData.push(item.formula);
                    } else {
                        rowData.push("");
                        rowData.push("");
                    }
                }

                rowData.push(
                    numResult,
                    item.currencyFrom || currentFrom,
                    convResult,
                    item.currencyTo || currentTo,
                    taxMode
                );

                return rowData;
            });

            // 📊 2. 建立包含明細與右側分類統計的完整工作表
            // 明細欄位：
            // A:編號, B:日期時間, C:分類, D:項目/品名
            // 若無外語欄位：E:計算結果, F:原始幣別, G:換算金額, H:目標幣別, I:稅率狀態 -> 換算金額在 G 欄！
            // 若有外語欄位：E:外文品名, F:中文翻譯, G:計算結果, H:原始幣別, I:換算金額, J:目標幣別, K:稅率狀態 -> 換算金額在 I 欄！
            const convertedColLetter = hasForeignItems ? 'I' : 'G';
            const defaultCats = ['food', 'shopping', 'transport', 'other'];
            const allCatKeys = Array.from(new Set([
                ...defaultCats,
                ...flatDetailItems.map(item => item.category || 'other')
            ])).filter(c => c !== 'business');

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

            // 寫入右側分類統計標題與動態公式
            // 若無外語欄位，資料用到 I 欄，留白 J 欄，統計表放在 K 欄與 L 欄
            // 若有外語欄位，資料用到 K 欄，留白 L 欄，統計表放在 M 欄與 N 欄
            const catColKey = hasForeignItems ? 'M' : 'K';
            const amtColKey = hasForeignItems ? 'N' : 'L';

            ws[`${catColKey}1`] = { v: "分類項目", t: 's' };
            ws[`${amtColKey}1`] = { v: "加總金額", t: 's' };

            allCatKeys.forEach((catKey, idx) => {
                const rowNum = idx + 2;
                const catLabel = `${getCategoryEmoji(catKey)} ${getCategoryName(catKey)}`;
                const formula = `SUMIF(C:C, ${catColKey}${rowNum}, ${convertedColLetter}:${convertedColLetter})`;

                ws[`${catColKey}${rowNum}`] = { v: catLabel, t: 's' };
                ws[`${amtColKey}${rowNum}`] = { f: formula, t: 'n' };
            });

            // 正確更新工作表範圍宣告
            const maxRow = Math.max(rows.length + 1, allCatKeys.length + 1, 10);
            const endColKey = hasForeignItems ? 'N' : 'L';
            ws['!ref'] = `A1:${endColKey}${maxRow}`;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, detailSheetName);

            ws['!cols'] = [
                { wch: 6 },
                { wch: 20 },
                { wch: 14 },
                { wch: 26 },
                ...(hasForeignItems ? [{ wch: 26 }, { wch: 26 }] : []),
                { wch: 14 },
                { wch: 10 },
                { wch: 14 },
                { wch: 10 },
                { wch: 12 },
                { wch: 4 },  // L 欄（留白隔開）
                { wch: 16 }, // M 欄（分類項目）
                { wch: 16 }  // N 欄（加總金額）
            ];

            const dateStr = new Date().toISOString().slice(0, 10);
            const fileName = `BusinessCalc_${dateStr}.xlsx`;

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            let shared = false;
            if (navigator.canShare && typeof File !== 'undefined') {
                try {
                    const testFile = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    if (navigator.canShare({ files: [testFile] })) {
                        navigator.share({
                            files: [testFile],
                            title: fileName
                        }).then(() => {
                            showToastMsg(I18N[currentLang].toastExcelExported || "EXCEL EXPORTED");
                        }).catch(err => {
                            if (err.name !== 'AbortError') {
                                downloadExcelBlob(blob, fileName);
                            }
                        });
                        shared = true;
                    }
                } catch (e) {
                    shared = false;
                }
            }

            if (!shared) {
                downloadExcelBlob(blob, fileName);
            }
        } catch(err) {
            console.error("Excel export error:", err);
            showToastMsg((I18N[currentLang].toastExcelFailed || "EXPORT FAILED") + ": " + err.message);
        }
    }

    /* 💾 通用二進位 Blob 下載輔助函數 */
    function downloadExcelBlob(blob, fileName) {
        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(blob, fileName);
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (a.parentNode) a.parentNode.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);
        }
        showToastMsg(I18N[currentLang].toastExcelExported || "EXCEL EXPORTED");
    }

    /* ✈️ 多幣別旅行總支出報告 (Multi-Currency Travel Expense Report) 引擎 */
    function renderTravelSummaryReport() {
        if (!calcHistory || calcHistory.length === 0) {
            showToastMsg(I18N[currentLang].noHistory || "無歷史紀錄");
            return false;
        }

        let totalTwdAll = 0;
        const byCurrency = {}; // { JPY: { origTotal: 15000, twdTotal: 3150, count: 2 } }
        const byCategory = { food: 0, shopping: 0, transport: 0, other: 0 };
        const categoryCounts = { food: 0, shopping: 0, transport: 0, other: 0 };
        const byLocation = {}; // { "東京, 日本": twdTotal }

        const flagIcons = { TWD: "🇹🇼", USD: "🇺🇸", JPY: "🇯🇵", KRW: "🇰🇷", EUR: "🇪🇺", CNY: "🇨🇳", MYR: "🇲🇾", SGD: "🇸🇬", AUD: "🇦🇺", VND: "🇻🇳", THB: "🇹🇭" };
        const currSymbols = { TWD: "NT$", USD: "$", JPY: "¥", KRW: "₩", EUR: "€", CNY: "¥", MYR: "RM", SGD: "S$", AUD: "A$", VND: "₫", THB: "฿" };

        calcHistory.forEach(item => {
            if (item.category === 'business') return; // 商務計算不算個人旅費

            const origCurr = item.origCurrency || item.currencyFrom || 'TWD';
            const numOrigPrice = typeof item.origPrice === 'number' ? item.origPrice : (typeof item.result === 'number' ? item.result : parseFloat(String(item.result).replace(/,/g, '')) || 0);

            // 計算 TWD 換算金額
            let twdVal = 0;
            if (item.twdAmount !== undefined && !isNaN(Number(item.twdAmount))) {
                twdVal = Number(item.twdAmount);
            } else if (origCurr === 'TWD') {
                twdVal = numOrigPrice;
            } else {
                const twdRate = rates['TWD'] || 32.5;
                const currRate = rates[origCurr] || 1;
                twdVal = Math.round((numOrigPrice * (twdRate / currRate)) * 100) / 100;
            }

            totalTwdAll += twdVal;

            // 依幣別累計
            if (!byCurrency[origCurr]) {
                byCurrency[origCurr] = { origTotal: 0, twdTotal: 0, count: 0 };
            }
            byCurrency[origCurr].origTotal += numOrigPrice;
            byCurrency[origCurr].twdTotal += twdVal;
            byCurrency[origCurr].count += 1;

            // 依分類累計
            const cat = item.category || 'other';
            if (byCategory[cat] !== undefined) {
                byCategory[cat] += twdVal;
                categoryCounts[cat] += 1;
            } else {
                byCategory.other += twdVal;
                categoryCounts.other += 1;
            }

            // 依地點累計
            const loc = item.gpsLocation || item.location || '一般消費';
            if (!byLocation[loc]) byLocation[loc] = { twdTotal: 0, count: 0 };
            byLocation[loc].twdTotal += twdVal;
            byLocation[loc].count += 1;
        });

        // 渲染總額 Hero
        const heroEl = document.getElementById('travel-hero-amount');
        if (heroEl) heroEl.textContent = `NT$ ${Math.round(totalTwdAll).toLocaleString()} TWD`;

        // 渲染多幣別明細
        const currListEl = document.getElementById('travel-curr-list');
        if (currListEl) {
            let html = '';
            Object.keys(byCurrency).forEach(code => {
                const info = byCurrency[code];
                const pct = totalTwdAll > 0 ? ((info.twdTotal / totalTwdAll) * 100).toFixed(1) : '0.0';
                const flag = flagIcons[code] || '🌐';
                const sym = currSymbols[code] || '';
                html += `
                    <div class="travel-item-row">
                        <div class="travel-item-left">
                            <span>${flag}</span>
                            <span>${code}</span>
                            <span class="travel-item-sub">(${info.count} 筆)</span>
                        </div>
                        <div class="travel-item-right">
                            <span class="travel-item-primary">${sym} ${info.origTotal.toLocaleString()} ${code}</span>
                            <span class="travel-item-sub">約 NT$ ${Math.round(info.twdTotal).toLocaleString()} TWD (${pct}%)</span>
                        </div>
                    </div>
                    <div class="travel-progress-bar"><div class="travel-progress-fill" style="width:${pct}%"></div></div>
                `;
            });
            currListEl.innerHTML = html || '<div class="travel-item-sub">尚無多幣別資料</div>';
        }

        // 渲染分類明細
        const catListEl = document.getElementById('travel-cat-list');
        if (catListEl) {
            let html = '';
            const catNames = { food: '食 🍜', shopping: '購物 🛍️', transport: '行 🚗', other: '其他 🏷️' };
            Object.keys(byCategory).forEach(catKey => {
                const twdSum = byCategory[catKey];
                const count = categoryCounts[catKey];
                if (twdSum > 0 || count > 0) {
                    const pct = totalTwdAll > 0 ? ((twdSum / totalTwdAll) * 100).toFixed(1) : '0.0';
                    html += `
                        <div class="travel-item-row">
                            <div class="travel-item-left">
                                <span>${catNames[catKey]}</span>
                                <span class="travel-item-sub">(${count} 筆)</span>
                            </div>
                            <div class="travel-item-right">
                                <span class="travel-item-primary">NT$ ${Math.round(twdSum).toLocaleString()}</span>
                                <span class="travel-item-sub">${pct}%</span>
                            </div>
                        </div>
                        <div class="travel-progress-bar"><div class="travel-progress-fill" style="width:${pct}%"></div></div>
                    `;
                }
            });
            catListEl.innerHTML = html || '<div class="travel-item-sub">尚無分類消費資料</div>';
        }

        // 渲染熱門地點
        const locListEl = document.getElementById('travel-loc-list');
        if (locListEl) {
            let html = '';
            Object.keys(byLocation).forEach(locName => {
                const info = byLocation[locName];
                html += `
                    <div class="travel-item-row">
                        <div class="travel-item-left">
                            <span>📍 ${locName}</span>
                        </div>
                        <div class="travel-item-right">
                            <span class="travel-item-primary">NT$ ${Math.round(info.twdTotal).toLocaleString()}</span>
                            <span class="travel-item-sub">${info.count} 筆交易</span>
                        </div>
                    </div>
                `;
            });
            locListEl.innerHTML = html || '<div class="travel-item-sub">尚無地點資料</div>';
        }

        return true;
    }

    function copyTravelReportText() {
        triggerVibration(false);
        if (!calcHistory || calcHistory.length === 0) return;

        let totalTwdAll = 0;
        const byCurrency = {};
        const currSymbols = { TWD: "NT$", USD: "$", JPY: "¥", KRW: "₩", EUR: "€", CNY: "¥", MYR: "RM", SGD: "S$", AUD: "A$", VND: "₫", THB: "฿" };

        calcHistory.forEach(item => {
            if (item.category === 'business') return;
            const origCurr = item.origCurrency || item.currencyFrom || 'TWD';
            const numOrigPrice = typeof item.origPrice === 'number' ? item.origPrice : (typeof item.result === 'number' ? item.result : parseFloat(String(item.result).replace(/,/g, '')) || 0);

            let twdVal = 0;
            if (item.twdAmount !== undefined && !isNaN(Number(item.twdAmount))) {
                twdVal = Number(item.twdAmount);
            } else if (origCurr === 'TWD') {
                twdVal = numOrigPrice;
            } else {
                const twdRate = rates['TWD'] || 32.5;
                const currRate = rates[origCurr] || 1;
                twdVal = Math.round((numOrigPrice * (twdRate / currRate)) * 100) / 100;
            }
            totalTwdAll += twdVal;

            if (!byCurrency[origCurr]) byCurrency[origCurr] = { origTotal: 0, twdTotal: 0, count: 0 };
            byCurrency[origCurr].origTotal += numOrigPrice;
            byCurrency[origCurr].twdTotal += twdVal;
            byCurrency[origCurr].count += 1;
        });

        const lines = [
            `✈️ 【旅行總支出報告 (已換算 TWD)】`,
            `📅 產生時間：${new Date().toLocaleString()}`,
            `💰 旅費總開銷：NT$ ${Math.round(totalTwdAll).toLocaleString()} TWD`,
            `────────────────────`,
            `🔱 多幣別消費統計：`
        ];

        Object.keys(byCurrency).forEach(code => {
            const info = byCurrency[code];
            const sym = currSymbols[code] || '';
            const pct = totalTwdAll > 0 ? ((info.twdTotal / totalTwdAll) * 100).toFixed(1) : '0.0';
            lines.push(`• ${code}: ${sym} ${info.origTotal.toLocaleString()} → 約 NT$ ${Math.round(info.twdTotal).toLocaleString()} TWD (${pct}%)`);
        });

        lines.push(`────────────────────`);
        lines.push(`📱 感謝使用 Premium 計算機 - 多幣別自動歸檔系統`);

        copyTextToClipboard(lines.join('\n'));
        showToastMsg(I18N[currentLang].toastReportCopied || "已複製旅行總支出報告！");
    }

    /* 💬 格式化純文字分享至 LINE / 原生系統分享 */
    function shareHistoryText() {
        triggerVibration(false);
        if (!calcHistory || calcHistory.length === 0) {
            showToastMsg(I18N[currentLang].noHistory || "NO HISTORY");
            return;
        }
        const lines = [
            `📊 【Business Calculator】記帳與計算清單`,
            `📅 匯出時間：${new Date().toLocaleString()}`,
            `────────────────────`
        ];
        let total = 0;
        calcHistory.forEach((item, idx) => {
            const catEmoji = getCategoryEmoji(item.category || 'other');
            const catName = getCategoryName(item.category || 'other');
            const resVal = typeof item.result === 'number' ? item.result : parseFloat(String(item.result).replace(/,/g, '')) || 0;
            total += isNaN(resVal) ? 0 : resVal;
            const currFrom = item.currencyFrom || currentFrom;
            lines.push(`${idx + 1}. [${catEmoji} ${catName}] ${item.formula} = ${formatNumber(item.result)} ${currFrom}`);
        });
        lines.push(`────────────────────`);
        lines.push(`💰 累計總額：${formatNumber(total)} ${currentFrom}`);
        const shareText = lines.join('\n');

        copyTextToClipboard(shareText);
    }

    function copyTextToClipboard(text) {
        const execFallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.width = '2em';
            ta.style.height = '2em';
            ta.style.padding = '0';
            ta.style.border = 'none';
            ta.style.outline = 'none';
            ta.style.boxShadow = 'none';
            ta.style.background = 'transparent';
            ta.setAttribute('readonly', '');
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, 999999);
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToastMsg(I18N[currentLang].toastHistoryShared || "ALL RECORDS COPIED!");
        };

        if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showToastMsg(I18N[currentLang].toastHistoryShared || "ALL RECORDS COPIED!");
            }).catch(() => {
                execFallback();
            });
        } else {
            execFallback();
        }
    }

    function showToastMsg(msg) {
        const toast = document.getElementById('global-toast');
        const headerArea = document.getElementById('header-area');
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        
        // 重置行內樣式，確保進場與離場動畫乾淨觸發
        toast.style.transition = '';
        toast.style.transform = '';
        toast.style.opacity = '';
        toast.style.filter = '';

        toast.textContent = msg;
        toast.classList.add('show');
        if (headerArea) headerArea.classList.add('toast-active');
        
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            if (headerArea) headerArea.classList.remove('toast-active');
        }, 2200); 
    }

    /* ─── iOS 風格正交三方位（正上 / 正左 / 正右，無斜向）快速關閉通知手勢 ─── */
    function setupToastSwipeDismiss() {
        const toast = document.getElementById('global-toast');
        const headerArea = document.getElementById('header-area');
        if (!toast) return;

        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let currentY = 0;
        let isDragging = false;
        let dragAxis = null; // 'horizontal' | 'vertical' | null
        let startTime = 0;
        let activePointerId = null;

        const onPointerDown = (e) => {
            if (!toast.classList.contains('show')) return;
            isDragging = true;
            dragAxis = null;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            currentX = e.clientX;
            currentY = e.clientY;
            startTime = performance.now();
            toast.style.transition = 'none';
            try {
                toast.setPointerCapture(e.pointerId);
            } catch (err) {}
        };

        const onPointerMove = (e) => {
            if (!isDragging || e.pointerId !== activePointerId) return;
            currentX = e.clientX;
            currentY = e.clientY;
            const deltaX = currentX - startX;
            const deltaY = currentY - startY;

            // 鎖定單一軸向（正交方位，禁止斜向拖曳）
            if (!dragAxis) {
                const totalDist = Math.hypot(deltaX, deltaY);
                if (totalDist >= 4) {
                    dragAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
                }
            }

            if (dragAxis === 'horizontal') {
                // 正左 / 正右（Y 軸嚴格鎖定在 -50%，無任何垂直偏移）
                const dist = Math.abs(deltaX);
                const progress = Math.min(1, dist / 70);
                const scale = 1 - progress * 0.12;
                const opacity = 1 - progress * 0.55;

                toast.style.transform = `translate(calc(-50% + ${deltaX}px), -50%) scale(${scale})`;
                toast.style.opacity = opacity;
            } else if (dragAxis === 'vertical') {
                // 正上 / 正下（X 軸嚴格鎖定在 -50%，無任何水平偏移）
                const effectiveY = deltaY < 0 ? deltaY : deltaY * 0.22;
                const dist = Math.abs(deltaY);
                const progress = Math.min(1, dist / 50);
                const scale = 1 - progress * 0.15;
                const opacity = deltaY < 0 ? (1 - progress * 0.6) : 1;

                toast.style.transform = `translate(-50%, calc(-50% + ${effectiveY}px)) scale(${scale})`;
                toast.style.opacity = opacity;
            }
        };

        const onPointerUp = (e) => {
            if (!isDragging || e.pointerId !== activePointerId) return;
            isDragging = false;
            try {
                toast.releasePointerCapture(e.pointerId);
            } catch (err) {}

            const deltaX = currentX - startX;
            const deltaY = currentY - startY;
            const elapsed = Math.max(1, performance.now() - startTime);
            const velocityX = deltaX / elapsed; // px/ms
            const velocityY = deltaY / elapsed; // px/ms

            // 判定主要方向（若未鎖定軸向但有快速撥動）
            const resolvedAxis = dragAxis || (Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical');

            if (resolvedAxis === 'vertical') {
                const isUpDismiss = deltaY < -12 || velocityY < -0.25;
                if (isUpDismiss) {
                    // 正向上滑動：觸發標準對稱倒放離場收回動畫
                    if (toastTimer) {
                        clearTimeout(toastTimer);
                        toastTimer = null;
                    }
                    toast.style.transition = '';
                    toast.style.transform = '';
                    toast.style.opacity = '';
                    toast.style.filter = '';

                    toast.classList.remove('show');
                    if (headerArea) headerArea.classList.remove('toast-active');
                    triggerVibration(false);
                } else {
                    // 未達門檻：彈回原位
                    toast.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
                    toast.style.transform = '';
                    toast.style.opacity = '';
                    toast.style.filter = '';
                }
            } else if (resolvedAxis === 'horizontal') {
                const isLeftDismiss = deltaX < -16 || velocityX < -0.25;
                const isRightDismiss = deltaX > 16 || velocityX > 0.25;

                if (isLeftDismiss || isRightDismiss) {
                    // 正左 / 正右滑動：純水平平移飛出
                    if (toastTimer) {
                        clearTimeout(toastTimer);
                        toastTimer = null;
                    }
                    const dir = isLeftDismiss ? -1 : 1;
                    toast.style.transition = 'transform 0.26s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.22s ease-out, filter 0.22s ease-out';
                    toast.style.transform = `translate(calc(-50% + ${dir * 140}px), -50%) scale(0.8)`;
                    toast.style.opacity = '0';
                    toast.style.filter = 'blur(4px)';
                    if (headerArea) headerArea.classList.remove('toast-active');

                    toastTimer = setTimeout(() => {
                        toast.classList.remove('show');
                        toast.style.transition = '';
                        toast.style.transform = '';
                        toast.style.opacity = '';
                        toast.style.filter = '';
                        toastTimer = null;
                    }, 260);
                    triggerVibration(false);
                } else {
                    // 未達門檻：彈回原位
                    toast.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
                    toast.style.transform = '';
                    toast.style.opacity = '';
                    toast.style.filter = '';
                }
            } else {
                // 點擊未移動：彈回原位
                toast.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
                toast.style.transform = '';
                toast.style.opacity = '';
                toast.style.filter = '';
            }

            dragAxis = null;
            activePointerId = null;
        };

        const onPointerCancel = (e) => {
            if (!isDragging || e.pointerId !== activePointerId) return;
            isDragging = false;
            try {
                toast.releasePointerCapture(e.pointerId);
            } catch (err) {}
            toast.style.transition = '';
            toast.style.transform = '';
            toast.style.opacity = '';
            toast.style.filter = '';
            dragAxis = null;
            activePointerId = null;
        };

        toast.addEventListener('pointerdown', onPointerDown);
        toast.addEventListener('pointermove', onPointerMove);
        toast.addEventListener('pointerup', onPointerUp);
        toast.addEventListener('pointercancel', onPointerCancel);
    }

    function setupDragToScroll(wrapperId) {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;

        let isDown = false;
        let startX = 0;
        let startScrollLeft = 0;
        let currentOverscroll = 0;
        let bounceAnimFrame = null;

        function getScaler(el) {
            return el.querySelector('.text-scaler') || el.firstElementChild;
        }

        function setScalerTransform(scaler, overscroll = 0) {
            if (!scaler) return;
            const ratio = parseFloat(scaler.dataset.currentRatio) || 1;
            const scaleStr = (ratio < 1) ? `scale(${ratio})` : 'scale(1)';
            scaler.style.transform = (overscroll !== 0) 
                ? `${scaleStr} translate3d(${-overscroll}px, 0, 0)` 
                : `${scaleStr} translate3d(0, 0, 0)`;
        }

        function getVisualScrollBounds(el) {
            const scaler = getScaler(el);
            const containerWidth = el.clientWidth;
            if (!scaler || containerWidth <= 0) {
                return { minScroll: 0, maxScroll: 0 };
            }
            const contentWidth = scaler.scrollWidth;
            if (contentWidth <= containerWidth) {
                return { minScroll: 0, maxScroll: 0 };
            }

            const ratio = Math.max(containerWidth / contentWidth, MIN_SCALE_RATIO);
            const visualContentWidth = contentWidth * ratio;
            if (visualContentWidth <= containerWidth) {
                return { minScroll: 0, maxScroll: 0 };
            } else {
                const maxScroll = Math.max(0, visualContentWidth - containerWidth);
                return { minScroll: 0, maxScroll };
            }
        }

        function animateBounceBack(duration = 320) {
            if (bounceAnimFrame) {
                cancelAnimationFrame(bounceAnimFrame);
                bounceAnimFrame = null;
            }

            const scaler = getScaler(wrapper);
            const { minScroll, maxScroll } = getVisualScrollBounds(wrapper);

            const startScroll = wrapper.scrollLeft;
            const targetScroll = Math.max(minScroll, Math.min(wrapper.scrollLeft, maxScroll));

            const startOverscroll = currentOverscroll;
            const targetOverscroll = 0;

            if (Math.abs(startOverscroll) < 0.1 && Math.abs(startScroll - targetScroll) < 0.5) {
                currentOverscroll = 0;
                setScalerTransform(scaler, 0);
                wrapper.scrollLeft = targetScroll;
                return;
            }

            const startTime = performance.now();

            function easeOutSpring(t) {
                return 1 - Math.pow(1 - t, 4);
            }

            function step(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = easeOutSpring(progress);

                const nowOverscroll = startOverscroll + (targetOverscroll - startOverscroll) * ease;
                currentOverscroll = nowOverscroll;

                setScalerTransform(scaler, nowOverscroll);

                wrapper.scrollLeft = startScroll + (targetScroll - startScroll) * ease;

                if (progress < 1) {
                    bounceAnimFrame = requestAnimationFrame(step);
                } else {
                    currentOverscroll = 0;
                    setScalerTransform(scaler, 0);
                    wrapper.scrollLeft = targetScroll;
                    bounceAnimFrame = null;
                }
            }
            bounceAnimFrame = requestAnimationFrame(step);
        }

        let scrollTimeout;
        wrapper.addEventListener('scroll', () => {
            if (isDown) return;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (!isDown && (currentOverscroll !== 0 || wrapper.scrollLeft < 0 || wrapper.scrollLeft > getVisualScrollBounds(wrapper).maxScroll)) {
                    animateBounceBack(320);
                }
            }, 80);
        });

        wrapper.addEventListener('pointerdown', (e) => {
            if (bounceAnimFrame) {
                cancelAnimationFrame(bounceAnimFrame);
                bounceAnimFrame = null;
            }

            isDown = true;
            startX = e.clientX;
            startScrollLeft = wrapper.scrollLeft;
            currentOverscroll = 0;
            try { wrapper.setPointerCapture(e.pointerId); } catch(err) {}
        });

        wrapper.addEventListener('pointermove', (e) => {
            if (!isDown) return;

            const scaler = getScaler(wrapper);
            const { minScroll, maxScroll } = getVisualScrollBounds(wrapper);
            const deltaX = startX - e.clientX;
            const targetScroll = startScrollLeft + deltaX;

            if (targetScroll < minScroll) {
                wrapper.scrollLeft = minScroll;
                const rawOverscroll = targetScroll - minScroll;
                currentOverscroll = rawOverscroll * 0.35;
                setScalerTransform(scaler, currentOverscroll);
            } else if (targetScroll > maxScroll) {
                wrapper.scrollLeft = maxScroll;
                const rawOverscroll = targetScroll - maxScroll;
                currentOverscroll = rawOverscroll * 0.35;
                setScalerTransform(scaler, currentOverscroll);
            } else {
                currentOverscroll = 0;
                setScalerTransform(scaler, 0);
                wrapper.scrollLeft = targetScroll;
            }
        });

        const stopDrag = (e) => {
            if (isDown) {
                isDown = false;
                try { wrapper.releasePointerCapture(e.pointerId); } catch(err) {}
                animateBounceBack(320);
            }
        };

        wrapper.addEventListener('pointerup', stopDrag);
        wrapper.addEventListener('pointerleave', stopDrag);
        wrapper.addEventListener('pointercancel', stopDrag);
    }

    function setupCopyFeature(wrapperId, getTextFn, successMsgKey) {
        const el = document.getElementById(wrapperId);
        if (!el) return;
        let longPressTimer = null;
        let startX = 0;
        let startY = 0;

        const executeCopy = () => {
            const valToCopy = getTextFn();
            if (!valToCopy || valToCopy.trim() === "") return;
            
            const fallbackCopy = (text) => {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed"; 
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    triggerVibration(); 
                    showToastMsg(I18N[currentLang][successMsgKey]);
                } catch (err) {
                    console.error('Fallback copy failed', err);
                }
                document.body.removeChild(textArea);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(valToCopy).then(() => {
                    triggerVibration(); showToastMsg(I18N[currentLang][successMsgKey]);
                }).catch(() => fallbackCopy(valToCopy));
            } else {
                fallbackCopy(valToCopy);
            }
        };

        const cancelPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const startPress = (e) => {
            startX = e.clientX || 0;
            startY = e.clientY || 0;
            longPressTimer = setTimeout(executeCopy, 450);
        };

        const checkMove = (e) => {
            if (!longPressTimer) return;
            const moveX = Math.abs((e.clientX || 0) - startX);
            const moveY = Math.abs((e.clientY || 0) - startY);
            if (moveX > 8 || moveY > 8) {
                cancelPress();
            }
        };

        el.addEventListener('pointerdown', startPress);
        el.addEventListener('pointermove', checkMove);
        el.addEventListener('pointerup', cancelPress);
        el.addEventListener('pointerleave', cancelPress);
        el.addEventListener('pointercancel', cancelPress);
    }

    function changeDecimals(delta) {
        triggerVibration();
        decimals = Math.max(0, Math.min(6, decimals + delta));
        document.getElementById('decimal-display').textContent = decimals;
        localStorage.setItem(KEY_DECIMALS, decimals.toString());
        calculateExchange();
    }

    function updateGliders() {
        document.querySelectorAll('.option-selector').forEach(selector => {
            let glider = selector.querySelector('.selector-glider');
            if (!glider) {
                glider = document.createElement('div');
                glider.className = 'selector-glider';
                selector.prepend(glider);
            }
            const activeBtn = selector.querySelector('.selector-btn.active, .lang-btn.active, .font-btn.active, .grid-preset-btn.active, .pool-tab-btn.active, .mode-btn.active');
            if (activeBtn && activeBtn.offsetWidth > 0) {
                const sRect = selector.getBoundingClientRect();
                const bRect = activeBtn.getBoundingClientRect();
                const targetLeft = bRect.left - sRect.left;
                glider.style.width = `${bRect.width}px`;
                glider.style.transform = `translate3d(${targetLeft}px, 0, 0)`;
                glider.style.opacity = '1';
            } else {
                glider.style.opacity = '0';
            }
        });
    }

    /* 語言切換機制 */
    function setLanguage(lang) {
        triggerVibration();
        currentLang = lang;
        localStorage.setItem(KEY_LANG, currentLang);

        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.dataset.lang === currentLang) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (I18N[currentLang] && I18N[currentLang][key]) {
                el.textContent = I18N[currentLang][key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (I18N[currentLang] && I18N[currentLang][key]) {
                el.placeholder = I18N[currentLang][key];
            }
        });

        document.querySelectorAll('[data-currency-name]').forEach(el => {
            const code = el.dataset.currencyName;
            if (I18N[currentLang].currencies[code]) {
                el.textContent = I18N[currentLang].currencies[code];
            }
        });

        requestAnimationFrame(() => updateGliders());
        setTimeout(updateGliders, 50);

        selectCurrency('from', currentFrom, flags[currentFrom]);
        selectCurrency('to', currentTo, flags[currentTo]);
        updateTaxBadgeUI();
        syncRateInputsUI();

        const savedTime = localStorage.getItem(KEY_RATES_TIME) || "";
        const updatedLabel = I18N[currentLang].updatedPrefix;
        if (savedTime) {
            const displayTime = savedTime === "Custom" ? I18N[currentLang].customTag : savedTime;
            document.getElementById('last-updated').textContent = `${updatedLabel}${displayTime}`;
        }

        renderHistory();
        updateDisplay();
        renderKeyPool(activePoolCategory);

        const displayContainer = document.getElementById('display-container');
        if (displayContainer) {
            displayContainer.classList.remove('slide-refresh');
            requestAnimationFrame(() => {
                displayContainer.classList.add('slide-refresh');
            });
        }
    }

    /* 字體切換機制 */
    function setFontStyle(type) {
        triggerVibration();
        fontStyle = type;
        localStorage.setItem(KEY_FONT_STYLE, fontStyle);

        document.body.classList.remove('font-tech', 'font-business', 'font-cute');
        document.body.classList.add(`font-${fontStyle}`);

        document.querySelectorAll('.font-btn').forEach(btn => {
            if (btn.dataset.font === fontStyle) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        updateGliders();

        autoScaleText('result-scaler', 'result-wrapper');
        autoScaleText('formula-scaler', 'formula-wrapper');
        autoScaleText('converted-scaler', 'converted-wrapper');

        const displayContainer = document.getElementById('display-container');
        if (displayContainer) {
            displayContainer.classList.remove('slide-refresh');
            requestAnimationFrame(() => {
                displayContainer.classList.add('slide-refresh');
            });
        }
    }

    /* 大數字顯示方式切換機制 (直接顯示超大數字 / 科學記號) */
    function setLargeNumberFormat(mode) {
        triggerVibration();
        largeNumberFormat = mode;
        localStorage.setItem(KEY_LARGE_NUMBER_FORMAT, largeNumberFormat);

        document.querySelectorAll('.number-format-btn').forEach(btn => {
            if (btn.dataset.format === largeNumberFormat) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        requestAnimationFrame(() => updateGliders());
        setTimeout(updateGliders, 50);

        updateDisplay();
        renderHistory();

        const displayContainer = document.getElementById('display-container');
        if (displayContainer) {
            displayContainer.classList.remove('slide-refresh');
            requestAnimationFrame(() => {
                displayContainer.classList.add('slide-refresh');
            });
        }
    }

    function updateTaxRate(code, val) {
        customTaxRates[code] = parseFloat(val) || 0;
        localStorage.setItem(KEY_TAX_RATES, JSON.stringify(customTaxRates));
        calculateExchange();
    }

    function syncRateInputsUI() {
        const baseCurrText = I18N[currentLang].currShort[baseRateCurrency] || baseRateCurrency;
        document.getElementById('rate-base-title').textContent = `${I18N[currentLang].basePrefix}${baseCurrText}`;
        const baseRateInUSD = rates[baseRateCurrency] || 1;

        ['TWD', 'JPY', 'USD', 'KRW', 'EUR', 'CNY', 'MYR', 'SGD', 'AUD', 'VND', 'THB'].forEach(code => {
            const input = document.getElementById(`rate-input-${code}`);
            if (input) {
                if (code === baseRateCurrency) {
                    input.value = "1";
                    input.disabled = true;
                    input.style.opacity = "0.5";
                } else {
                    input.disabled = false;
                    input.style.opacity = "1";
                    const relativeRate = (rates[code] || 1) / baseRateInUSD;
                    input.value = parseFloat(relativeRate.toFixed(3));
                }
            }
        });
    }

    function setBaseCurrency(code) {
        triggerVibration();
        baseRateCurrency = code;
        syncRateInputsUI();
    }

    function updateCustomRate(code, val) {
        const relativeVal = parseFloat(val);
        if (!isNaN(relativeVal) && relativeVal > 0) {
            const baseRateInUSD = rates[baseRateCurrency] || 1;
            rates[code] = parseFloat((relativeVal * baseRateInUSD).toFixed(3));
            
            const nowStr = "Custom";
            localStorage.setItem(KEY_RATES, JSON.stringify(rates));
            localStorage.setItem(KEY_RATES_TIME, nowStr);
            document.getElementById('last-updated').textContent = `${I18N[currentLang].updatedPrefix}${I18N[currentLang].customTag}`;
            calculateExchange();
        }
    }

    function applyThemeColor(colorStr) {
        document.documentElement.style.setProperty('--accent-main', colorStr);
        localStorage.setItem(KEY_THEME_COLOR, colorStr);
    }

    function renderThemePalette() {
        const palette = document.getElementById('theme-palette');
        const savedColor = localStorage.getItem(KEY_THEME_COLOR) || '#29b6f6';
        let html = THEME_COLORS.map(c => `
            <div class="color-swatch ${c === savedColor ? 'active' : ''}" style="background:${c}" data-color="${c}"></div>
        `).join('');
        const isCustom = !THEME_COLORS.includes(savedColor);
        html += `<div class="color-swatch custom-btn ${isCustom ? 'active' : ''}">+</div>`;
        palette.innerHTML = html;
        applyThemeColor(savedColor);
    }

    // RGB to HSV Conversion
    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s, v };
    }

    // HSV to RGB Conversion
    function hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h / 60);
        const f = h / 60 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    // Custom Color Picker State
    let curH = 180;
    let curS = 1;
    let curV = 1;

    function updateCustomPickerVisuals(hex, r, g, b) {
        const colorField = document.getElementById('color-field');
        if (colorField) {
            colorField.style.backgroundColor = `hsl(${curH}, 100%, 50%)`;
        }
        
        const handle = document.getElementById('color-field-handle');
        if (handle) {
            handle.style.left = `${curS * 100}%`;
            handle.style.top = `${(1 - curV) * 100}%`;
        }
        
        const hueHandle = document.getElementById('hue-slider-handle');
        if (hueHandle) {
            hueHandle.style.top = `${(curH / 360) * 100}%`;
        }
        
        const inputHex = document.getElementById('hex-input');
        if (inputHex) inputHex.value = hex.replace('#', '').toUpperCase();
        
        const valR = document.getElementById('val-r');
        const valG = document.getElementById('val-g');
        const valB = document.getElementById('val-b');
        if (valR) valR.textContent = r;
        if (valG) valG.textContent = g;
        if (valB) valB.textContent = b;
    }

    function updateCustomPicker() {
        const rgb = hsvToRgb(curH, curS, curV);
        const hex = "#" + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1).toUpperCase();
        
        updateCustomPickerVisuals(hex, rgb.r, rgb.g, rgb.b);
        applyThemeColor(hex);
    }

    function syncPickerFromHex(hex) {
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (/^#[0-9A-F]{6}$/i.test(hex)) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const hsv = rgbToHsv(r, g, b);
            curH = hsv.h;
            curS = hsv.s;
            curV = hsv.v;
            updateCustomPickerVisuals(hex, r, g, b);
        }
    }

    const toggleCustomColorMenu = throttle(function() {
        triggerVibration();
        const menu = document.getElementById('custom-color-menu');
        const isShowing = menu.classList.toggle('show');
        if (isShowing) {
            const activeColor = localStorage.getItem(KEY_THEME_COLOR) || '#29b6f6';
            syncPickerFromHex(activeColor);
        }
    }, 250);

    function updateFromHex() {
        let hex = document.getElementById('hex-input').value;
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (/^#[0-9A-F]{6}$/i.test(hex)) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const hsv = rgbToHsv(r, g, b);
            curH = hsv.h;
            curS = hsv.s;
            curV = hsv.v;
            updateCustomPickerVisuals(hex, r, g, b);
            applyThemeColor(hex);
        }
    }

    function applyLightMode(isLight) {
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (isLight) {
            document.body.classList.add('light-mode');
            if (themeColorMeta) themeColorMeta.setAttribute('content', '#e2e8f0');
            if (statusBarMeta) statusBarMeta.setAttribute('content', 'default');
        } else {
            document.body.classList.remove('light-mode');
            if (themeColorMeta) themeColorMeta.setAttribute('content', '#0f1015');
            if (statusBarMeta) statusBarMeta.setAttribute('content', 'black-translucent');
        }
    }

    function toggleLightMode() {
        triggerVibration();
        const isLight = document.getElementById('theme-toggle').checked;
        applyLightMode(isLight);
        localStorage.setItem(KEY_LIGHT_MODE, isLight ? 'true' : 'false');
    }

    function resetAllSettings() {
        triggerVibration();
        
        localStorage.removeItem(KEY_THEME_COLOR);
        localStorage.removeItem(KEY_LIGHT_MODE);
        localStorage.removeItem(KEY_TAX_RATES);
        localStorage.removeItem(KEY_RATES);
        localStorage.removeItem(KEY_RATES_TIME);
        localStorage.removeItem(KEY_DECIMALS);
        localStorage.removeItem(KEY_HAPTIC);
        localStorage.removeItem(KEY_PERCENT_MODE);
        localStorage.removeItem(KEY_CURRENCY_FROM);
        localStorage.removeItem(KEY_CURRENCY_TO);
        localStorage.removeItem(KEY_TAX_EXCLUDED);
        localStorage.removeItem(KEY_FONT_STYLE);
        localStorage.removeItem(KEY_LANG);
        localStorage.removeItem(KEY_CATEGORY_BUBBLE);
        isCategoryBubbleEnabled = true;
        updateCategorySummaryVisibility();

        localStorage.removeItem(KEY_LARGE_NUMBER_FORMAT);
        largeNumberFormat = 'full';
        document.querySelectorAll('.number-format-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.format === 'full');
        });

        decimals = 2;
        document.getElementById('decimal-display').textContent = decimals;

        document.getElementById('haptic-toggle').checked = true;
        const catToggle = document.getElementById('category-bubble-toggle');
        if (catToggle) catToggle.checked = true;
        document.getElementById('theme-toggle').checked = false;
        document.body.classList.remove('light-mode');

        isTaxExcluded = false;

        setLanguage('en');
        setFontStyle('tech');

        customTaxRates = {...DEFAULT_TAX_RATES};
        Object.keys(customTaxRates).forEach(k => {
            const el = document.getElementById(`tax-input-${k}`);
            if (el) el.value = customTaxRates[k];
        });

        localStorage.removeItem(KEY_KEYBOARD_LAYOUT);
        localStorage.removeItem(KEY_KEYBOARD_GRID);
        localStorage.removeItem(KEY_KEYBOARD_LAYOUT_LANDSCAPE);
        localStorage.removeItem(KEY_KEYBOARD_GRID_LANDSCAPE);
        syncKeyboardState();
        updateGridCols();
        renderMainKeyboard();

        baseRateCurrency = "USD";
        document.getElementById('custom-color-menu').classList.remove('show');

        currentFrom = "KRW";
        currentTo = "TWD";
        selectCurrency('from', currentFrom, flags[currentFrom]);
        selectCurrency('to', currentTo, flags[currentTo]);

        renderThemePalette();
        fetchRates(true);
        updateDisplay();

        const wasSettingsOpen = document.getElementById('settings-menu')?.classList.contains('show');
        closeAllMenus();
        if (wasSettingsOpen) {
            const settingsMenu = document.getElementById('settings-menu');
            if (settingsMenu) {
                settingsMenu.classList.add('show');
                updateMenuOpenState();
                setTimeout(updateGliders, 50);
            }
        }
        showToastMsg(I18N[currentLang].toastSettingsReset);
    }

    function updateGridCols() {
        const config = GRID_CONFIGS[currentKeyboardGrid] || GRID_CONFIGS['4x5'];
        const cols = config.cols;
        const totalKeys = currentKeyboardLayout.length;
        const rows = Math.max(1, Math.ceil(totalKeys / cols));

        const mainKb = document.getElementById('main-keyboard');
        const customKb = document.getElementById('custom-keyboard-grid');
        if (mainKb) {
            mainKb.style.setProperty('--grid-cols', cols);
            mainKb.style.setProperty('--grid-rows', rows);
        }
        if (customKb) {
            customKb.style.setProperty('--grid-cols', cols);
            customKb.style.setProperty('--grid-rows', rows);
        }

        const wrapper = document.getElementById('keyboard-custom-wrapper');
        if (wrapper) {
            wrapper.dataset.grid = currentKeyboardGrid;
        }

        const shelfLabel = document.getElementById('grid-shelf-label');
        if (shelfLabel) {
            const baseText = (I18N[currentLang] && I18N[currentLang].gridShelfTitle) || "當前鍵盤";
            shelfLabel.textContent = `${baseText} (${currentKeyboardGrid})`;
        }

        document.querySelectorAll('.grid-preset-btn').forEach(btn => {
            if (btn.dataset.grid === currentKeyboardGrid) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        updateGliders();
    }

    const EXTENDED_KEY_POOL = [
        'clear', 'backspace', 'percent', 'divide',
        'num_7', 'num_8', 'num_9', 'multiply',
        'num_4', 'num_5', 'num_6', 'subtract',
        'num_1', 'num_2', 'num_3', 'add',
        'paren', 'num_0', 'dot', 'equal',
        'double_zero', 'plus_minus', 'tax_plus', 'tax_minus'
    ];

    function setGridPreset(gridKey) {
        if (!GRID_CONFIGS[gridKey]) return;
        triggerVibration();
        currentKeyboardGrid = gridKey;
        saveKeyboardGrid(currentKeyboardGrid, activeEditOrientation);

        if (PRESET_DEFAULT_LAYOUTS[gridKey]) {
            currentKeyboardLayout = [...PRESET_DEFAULT_LAYOUTS[gridKey]];
        } else {
            const targetCount = GRID_CONFIGS[gridKey].total;
            if (currentKeyboardLayout.length > targetCount) {
                currentKeyboardLayout = currentKeyboardLayout.slice(0, targetCount);
            } else if (currentKeyboardLayout.length < targetCount) {
                while (currentKeyboardLayout.length < targetCount) {
                    const nextKey = DEFAULT_KEYBOARD_LAYOUT[currentKeyboardLayout.length] || 'blank';
                    currentKeyboardLayout.push(nextKey);
                }
            }
        }

        if (currentKeyboardLayout.length > 24) {
            currentKeyboardLayout = currentKeyboardLayout.slice(0, 24);
        }

        saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);
        pushUndoState();
        updateGridCols();
        renderCustomKeyboard();
        renderMainKeyboard();

        const customKb = document.getElementById('custom-keyboard-grid');
        if (customKb) {
            customKb.classList.remove('is-morphing');
            void customKb.offsetWidth;
            customKb.classList.add('is-morphing');
            setTimeout(() => {
                if (customKb) customKb.classList.remove('is-morphing');
            }, 260);
        }
    }

    /* ─── ↩ / ↪ 鍵盤自訂 Undo (復原) & Redo (重做) 歷史紀錄引擎 ─── */
    let undoStack = [];
    let redoStack = [];

    function pushUndoState() {
        const state = {
            layout: [...currentKeyboardLayout],
            grid: currentKeyboardGrid,
            orientation: activeEditOrientation
        };
        // 避免連續重複壓入同一個狀態
        if (undoStack.length > 0) {
            const lastState = undoStack[undoStack.length - 1];
            if (lastState.orientation === state.orientation &&
                lastState.grid === state.grid &&
                JSON.stringify(lastState.layout) === JSON.stringify(state.layout)) {
                return;
            }
        }
        undoStack.push(state);
        if (undoStack.length > 40) undoStack.shift(); // 限制最多 40 步歷史
        redoStack = []; // 清空重做堆疊
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        const undoBtn = document.getElementById('btn-keyboard-undo');
        const redoBtn = document.getElementById('btn-keyboard-redo');
        if (undoBtn) {
            if (undoStack.length > 1) {
                undoBtn.classList.remove('disabled');
            } else {
                undoBtn.classList.add('disabled');
            }
        }
        if (redoBtn) {
            if (redoStack.length > 0) {
                redoBtn.classList.remove('disabled');
            } else {
                redoBtn.classList.add('disabled');
            }
        }
    }

    function performUndo() {
        if (undoStack.length <= 1) return;
        triggerVibration();
        const currentState = undoStack.pop();
        redoStack.push(currentState);

        const targetState = undoStack[undoStack.length - 1];
        activeEditOrientation = targetState.orientation;
        currentKeyboardGrid = targetState.grid;
        currentKeyboardLayout = [...targetState.layout];

        saveKeyboardGrid(currentKeyboardGrid, activeEditOrientation);
        saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);

        updateOrientationModeBtnsUI();
        updateGridCols();
        renderCustomKeyboard();
        renderMainKeyboard();
        updateUndoRedoUI();
    }

    function performRedo() {
        if (redoStack.length === 0) return;
        triggerVibration();
        const targetState = redoStack.pop();
        undoStack.push(targetState);

        activeEditOrientation = targetState.orientation;
        currentKeyboardGrid = targetState.grid;
        currentKeyboardLayout = [...targetState.layout];

        saveKeyboardGrid(currentKeyboardGrid, activeEditOrientation);
        saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);

        updateOrientationModeBtnsUI();
        updateGridCols();
        renderCustomKeyboard();
        renderMainKeyboard();
        updateUndoRedoUI();
    }

    function getKeyLabel(keyId) {
        if (typeof I18N !== 'undefined' && I18N[currentLang] && I18N[currentLang].keyLabels && I18N[currentLang].keyLabels[keyId]) {
            return I18N[currentLang].keyLabels[keyId];
        }
        const def = KEY_DEFINITIONS[keyId];
        return def ? (def.name || def.label || keyId) : keyId;
    }

    function generateKeyElement(keyId, index = -1, isPool = false) {
        const def = KEY_DEFINITIONS[keyId] || KEY_DEFINITIONS['blank'];
        const btn = document.createElement('button');
        btn.className = `key ${def.type || ''}`.trim();
        btn.dataset.keyId = keyId;
        if (def.action) btn.dataset.action = def.action;
        if (def.param !== undefined && def.param !== null) btn.dataset.param = def.param;
        btn.setAttribute('aria-label', getKeyLabel(keyId));
        if (index >= 0) btn.dataset.index = index;

        if (def.customHTML) {
            btn.innerHTML = def.customHTML;
        } else if (def.icon && ICONS[def.icon]) {
            btn.innerHTML = ICONS[def.icon];
        } else if (def.label) {
            btn.innerHTML = `<span class="key-text">${def.label}</span>`;
        }

        return btn;
    }

    function renderMainKeyboard() {
        const config = GRID_CONFIGS[currentKeyboardGrid] || GRID_CONFIGS['4x5'];
        const cols = config.cols;

        // 計算實際有效佈局（自動縮減末尾整列空白，避免浪費下方空間）
        let activeLayout = [...currentKeyboardLayout];
        while (activeLayout.length > cols) {
            const lastRow = activeLayout.slice(-cols);
            if (lastRow.every(k => k === 'blank')) {
                activeLayout = activeLayout.slice(0, -cols);
            } else {
                break;
            }
        }

        const activeRows = Math.max(1, Math.ceil(activeLayout.length / cols));
        const keyboardEl = document.getElementById('main-keyboard');
        if (!keyboardEl) return;
        keyboardEl.style.setProperty('--grid-cols', cols);
        keyboardEl.style.setProperty('--grid-rows', activeRows);
        keyboardEl.innerHTML = '';
        activeLayout.forEach((keyId, idx) => {
            const btn = generateKeyElement(keyId, idx);
            keyboardEl.appendChild(btn);
        });

        keyboardEl.querySelectorAll('.key').forEach(btn => {
            if (btn.dataset.action === 'backspace') {
                attachBackspaceRepeat(btn);
            } else {
                attachSmartTap(btn, (e) => instantInput(e, btn.dataset.action, btn.dataset.param), { activeClass: 'active' });
            }
        });
    }

    /* ⌫ 長按 Backspace 連續高速刪除引擎 */
    function attachBackspaceRepeat(btn) {
        let repeatTimeout = null;
        let repeatInterval = null;
        let startX = 0, startY = 0;
        let isPressed = false;

        const stopRepeat = () => {
            if (repeatTimeout) {
                clearTimeout(repeatTimeout);
                repeatTimeout = null;
            }
            if (repeatInterval) {
                clearInterval(repeatInterval);
                repeatInterval = null;
            }
            if (isPressed) {
                isPressed = false;
                btn.classList.remove('active');
            }
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
        };

        const onMove = (e) => {
            if (!isPressed) return;
            const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
            if (dist > 14) {
                stopRepeat();
            }
        };

        const onUp = () => stopRepeat();
        const onCancel = () => stopRepeat();

        btn.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.cancelable) e.preventDefault();
            isPressed = true;
            startX = e.clientX;
            startY = e.clientY;
            btn.classList.add('active');

            // 1. 首次點擊立即刪除一個字符（零延遲即時反饋）
            instantInput(e, 'backspace');

            // 2. 監聽全域指標移動與釋放
            window.addEventListener('pointermove', onMove, { passive: true });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);

            // 3. 長按延遲 360ms 後開啟高頻連續刪除（每 65ms 刪除一格，直至回歸 0）
            repeatTimeout = setTimeout(() => {
                repeatInterval = setInterval(() => {
                    if (currentInput === "0" && isEvaluated) {
                        stopRepeat();
                        return;
                    }
                    instantInput(null, 'backspace');
                    if (currentInput === "0") {
                        stopRepeat();
                    }
                }, 65);
            }, 360);
        });

        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    let activePoolCategory = 'all';

    function renderCustomKeyboard() {
        updateGridCols();
        const gridEl = document.getElementById('custom-keyboard-grid');
        if (!gridEl) return;
        gridEl.innerHTML = '';
        currentKeyboardLayout.forEach((keyId, idx) => {
            const btn = generateKeyElement(keyId, idx);
            // 擬真隨機抖動：隨機分配 4 種不同角度與週期的抖動軌道，並帶入負 delay 徹底錯開全體時間軸
            const jiggleTrack = `jiggle-track-${(idx % 4) + 1}`;
            btn.classList.add(jiggleTrack);
            // 採用多段式負時間差（animation-delay），消除機械同步感
            const delays = ['-0.08s', '-0.17s', '-0.23s', '-0.04s', '-0.19s', '-0.12s', '-0.27s', '-0.02s'];
            btn.style.animationDelay = delays[idx % delays.length];
            gridEl.appendChild(btn);
        });
    }

    function renderKeyPool(category = 'all', withMorph = false) {
        const poolEl = document.getElementById('key-pool-scroll');
        const sidePoolEl = document.getElementById('side-pool-scroll');
        if (!poolEl) return;
        poolEl.innerHTML = '';
        if (sidePoolEl) sidePoolEl.innerHTML = '';
        activePoolCategory = category;

        const allKeys = Object.keys(KEY_DEFINITIONS);
        const filteredKeys = allKeys.filter(keyId => {
            const def = KEY_DEFINITIONS[keyId];
            return category === 'all' || def.category === category;
        });

        // 1. 渲染下方全寬主按鍵庫
        filteredKeys.forEach(keyId => {
            const item = document.createElement('div');
            item.className = 'pool-key-item';
            item.dataset.poolKeyId = keyId;

            const keyBtn = generateKeyElement(keyId, -1, true);
            item.appendChild(keyBtn);

            const label = document.createElement('span');
            label.className = 'pool-key-label';
            label.textContent = getKeyLabel(keyId);
            item.appendChild(label);

            poolEl.appendChild(item);
        });

        // 2. 渲染右上側邊精選按鍵庫 (依規格動態配置 4~8 顆高頻候選鍵)
        if (sidePoolEl) {
            const quickCandidates = ['equal', 'clear', 'backspace', 'add', 'subtract', 'multiply', 'divide', 'percent', 'plus_minus', 'parentheses', 'mem_recall', 'sqrt', 'square', 'tax_plus', 'tax_minus'];
            const sideKeys = quickCandidates.filter(k => filteredKeys.includes(k));
            const finalSideKeys = (sideKeys.length >= 4 ? sideKeys : filteredKeys).slice(0, 8);

            finalSideKeys.forEach(keyId => {
                const item = document.createElement('div');
                item.className = 'pool-key-item';
                item.dataset.poolKeyId = keyId;

                const keyBtn = generateKeyElement(keyId, -1, true);
                item.appendChild(keyBtn);

                const label = document.createElement('span');
                label.className = 'pool-key-label';
                label.textContent = getKeyLabel(keyId);
                item.appendChild(label);

                sidePoolEl.appendChild(item);
            });
        }

        if (withMorph) {
            poolEl.classList.remove('is-morphing');
            if (sidePoolEl) sidePoolEl.classList.remove('is-morphing');
            void poolEl.offsetWidth;
            poolEl.classList.add('is-morphing');
            if (sidePoolEl) sidePoolEl.classList.add('is-morphing');
            setTimeout(() => {
                if (poolEl) poolEl.classList.remove('is-morphing');
                if (sidePoolEl) sidePoolEl.classList.remove('is-morphing');
            }, 260);
        }
    }

    function updateOrientationModeBtnsUI() {
        document.querySelectorAll('.orientation-mode-selector .mode-btn').forEach(btn => {
            if (btn.dataset.orientation === activeEditOrientation) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function openKeyboardCustomizer() {
        activeEditOrientation = isLandscapeMode() ? 'landscape' : 'portrait';
        updateOrientationModeBtnsUI();
        syncKeyboardState(activeEditOrientation);
        if (typeof updateSnapshotUI === 'function') updateSnapshotUI(activeEditOrientation);
        undoStack = [];
        redoStack = [];
        pushUndoState();
        updateGridCols();
        renderCustomKeyboard();
        renderKeyPool(activePoolCategory, false);
        navigateSubMenu('settings-menu', 'keyboard-settings-menu', 'forward');
        requestAnimationFrame(() => updateGliders());
        setTimeout(updateGliders, 60);
    }

    function setupKeyboardDragDrop() {
        const menuEl = document.getElementById('keyboard-settings-menu');
        const gridEl = document.getElementById('custom-keyboard-grid');
        const poolEl = document.getElementById('key-pool-scroll');
        const sidePoolEl = document.getElementById('side-pool-scroll');
        const poolDropTarget = document.getElementById('pool-drop-target');
        const sidePoolTarget = document.getElementById('side-pool-section');
        const gridContainer = document.querySelector('.custom-grid-container');
        if (!menuEl || !gridEl || !poolEl || !gridContainer) return;

        // 移除可能殘留在 gridContainer 內的舊指示器
        const oldGridIndicator = gridContainer.querySelector('.grid-slot-indicator');
        if (oldGridIndicator) oldGridIndicator.remove();

        // 建立或取得專屬的網格槽位指示器 (直接置於 document.body，確保 fixed 視口座標 1:1 精準貼合，絕無位移偏差)
        let indicatorEl = document.querySelector('body > .grid-slot-indicator');
        if (!indicatorEl) {
            indicatorEl = document.createElement('div');
            indicatorEl.className = 'grid-slot-indicator';
            document.body.appendChild(indicatorEl);
        }

        let dragState = null;
        let dragRaf = null;

        const updateLiveShifts = (hoverIdx) => {
            if (!dragState || dragState.isFinalizing) return;
            const { isFromGrid, sourceIndex, gridKeys, slotRects, indicatorEl } = dragState;
            const N = slotRects.length;

            if (isFromGrid) {
                gridKeys.forEach((keyEl, i) => {
                    keyEl.classList.add('is-shifting');

                    if (i === sourceIndex) {
                        // 被拿起的原按鍵淡出隱藏
                        keyEl.style.opacity = '0';
                        keyEl.style.visibility = 'hidden';
                        keyEl.style.transform = 'translate3d(0, 0, 0)';
                    } else {
                        // 其他按鍵根據起點 (sourceIndex) 與當前懸停目標 (hoverIdx) 實時推擠讓位
                        let targetSlot = i;
                        if (hoverIdx >= 0 && hoverIdx !== sourceIndex) {
                            if (sourceIndex < hoverIdx) {
                                if (i > sourceIndex && i <= hoverIdx) {
                                    targetSlot = i - 1; // 往前挪移一格補位
                                }
                            } else if (sourceIndex > hoverIdx) {
                                if (i >= hoverIdx && i < sourceIndex) {
                                    targetSlot = i + 1; // 往後挪移一格騰出空位
                                }
                            }
                        }

                        if (targetSlot !== i && targetSlot >= 0 && targetSlot < N) {
                            const dx = slotRects[targetSlot].left - slotRects[i].left;
                            const dy = slotRects[targetSlot].top - slotRects[i].top;
                            keyEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                            keyEl.style.opacity = '1';
                            keyEl.style.visibility = 'visible';
                        } else {
                            keyEl.style.transform = 'translate3d(0, 0, 0)';
                            keyEl.style.opacity = '1';
                            keyEl.style.visibility = 'visible';
                        }
                    }
                });
            } else {
                if (hoverIdx < 0 || hoverIdx >= N) {
                    // 未懸停於網格上，全部按鍵回到初始原位
                    gridKeys.forEach(keyEl => {
                        keyEl.classList.add('is-shifting');
                        keyEl.style.transform = 'translate3d(0, 0, 0)';
                        keyEl.style.opacity = '1';
                        keyEl.style.visibility = 'visible';
                    });
                    if (indicatorEl) indicatorEl.classList.remove('active');
                    return;
                }

                // 從庫存區拖入網格：智慧空白格定向吸收動態讓位
                let targetBlankIdx = -1;
                let minDistToBlank = Infinity;
                currentKeyboardLayout.forEach((kId, idx) => {
                    if (kId === 'blank') {
                        const dist = Math.abs(idx - hoverIdx);
                        if (dist < minDistToBlank) {
                            minDistToBlank = dist;
                            targetBlankIdx = idx;
                        }
                    }
                });

                gridKeys.forEach((keyEl, i) => {
                    keyEl.classList.add('is-shifting');

                    if (targetBlankIdx !== -1) {
                        if (targetBlankIdx > hoverIdx) {
                            // 空白格在落點後方：[hoverIdx ... targetBlankIdx-1] 往後順延挪移一格讓出 hoverIdx 槽位
                            if (i >= hoverIdx && i < targetBlankIdx) {
                                const targetSlot = i + 1;
                                const dx = slotRects[targetSlot].left - slotRects[i].left;
                                const dy = slotRects[targetSlot].top - slotRects[i].top;
                                keyEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                                keyEl.style.opacity = '1';
                                keyEl.style.visibility = 'visible';
                            } else if (i === targetBlankIdx) {
                                keyEl.style.transform = 'translate3d(0, 0, 0)';
                                keyEl.style.opacity = '0';
                                keyEl.style.visibility = 'hidden';
                            } else {
                                keyEl.style.transform = 'translate3d(0, 0, 0)';
                                keyEl.style.opacity = '1';
                                keyEl.style.visibility = 'visible';
                            }
                        } else if (targetBlankIdx < hoverIdx) {
                            // 空白格在落點前方：[targetBlankIdx+1 ... hoverIdx] 往前順延挪移一格讓出 hoverIdx 槽位
                            if (i > targetBlankIdx && i <= hoverIdx) {
                                const targetSlot = i - 1;
                                const dx = slotRects[targetSlot].left - slotRects[i].left;
                                const dy = slotRects[targetSlot].top - slotRects[i].top;
                                keyEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                                keyEl.style.opacity = '1';
                                keyEl.style.visibility = 'visible';
                            } else if (i === targetBlankIdx) {
                                keyEl.style.transform = 'translate3d(0, 0, 0)';
                                keyEl.style.opacity = '0';
                                keyEl.style.visibility = 'hidden';
                            } else {
                                keyEl.style.transform = 'translate3d(0, 0, 0)';
                                keyEl.style.opacity = '1';
                                keyEl.style.visibility = 'visible';
                            }
                        } else {
                            // 正好移到空白格上：直接讓出該格
                            keyEl.style.transform = 'translate3d(0, 0, 0)';
                            keyEl.style.opacity = '1';
                            keyEl.style.visibility = 'visible';
                        }
                    } else {
                        // 無空白格時：[hoverIdx ...] 所有按鍵往後遞推讓位
                        if (i >= hoverIdx) {
                            const targetSlot = i + 1;
                            if (targetSlot < N) {
                                const dx = slotRects[targetSlot].left - slotRects[i].left;
                                const dy = slotRects[targetSlot].top - slotRects[i].top;
                                keyEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                                keyEl.style.opacity = '1';
                                keyEl.style.visibility = 'visible';
                            } else {
                                keyEl.style.transform = 'translate3d(0, 0, 0)';
                                keyEl.style.opacity = '0';
                                keyEl.style.visibility = 'hidden';
                            }
                        } else {
                            keyEl.style.transform = 'translate3d(0, 0, 0)';
                            keyEl.style.opacity = '1';
                            keyEl.style.visibility = 'visible';
                        }
                    }
                });
            }

            // 統一更新預期槽位虛線指示器 (完全貼合目標槽位，絕無偏移)
            if (indicatorEl) {
                if (hoverIdx >= 0 && hoverIdx < N) {
                    const targetRect = slotRects[hoverIdx];
                    indicatorEl.style.width = `${targetRect.width}px`;
                    indicatorEl.style.height = `${targetRect.height}px`;
                    indicatorEl.style.borderRadius = window.getComputedStyle(gridKeys[hoverIdx]).borderRadius || '50%';
                    indicatorEl.style.transform = `translate3d(${targetRect.left}px, ${targetRect.top}px, 0)`;
                    indicatorEl.classList.add('active');
                } else {
                    indicatorEl.classList.remove('active');
                }
            }
        };

        const processPointerMove = () => {
            if (!dragState || dragState.isFinalizing) return;
            const { floatingEl, keyRect, offsetX, offsetY, slotCenters, slotRects, gridRect, isFromGrid, pendingEvent, touchLiftY } = dragState;
            if (!pendingEvent) return;

            const targetX = pendingEvent.clientX - keyRect.width / 2 - offsetX;
            const targetY = pendingEvent.clientY - keyRect.height / 2 - offsetY;

            dragState.lastTargetX = targetX;
            dragState.lastTargetY = targetY;

            // 純 GPU 合成位移，零 Reflow，維持 1:1 自然大小不放大
            floatingEl.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(1)`;

            // 以真實觸控/游標點（含 touchLiftY 微調）作為碰撞判定核心
            const pointerX = pendingEvent.clientX;
            const pointerY = pendingEvent.clientY - touchLiftY;
            
            // 判定是否拖出網格 (適度擴張碰撞感應區 32px，使邊界滑動極致靈敏)
            const isOutsideGrid = (pointerX < gridRect.left - 32 || pointerX > gridRect.right + 32 || pointerY < gridRect.top - 32 || pointerY > gridRect.bottom + 32);
            let hoveredIndex = -1;

            if (!isOutsideGrid && slotCenters && slotCenters.length > 0) {
                let minDistance = Infinity;
                let closestIdx = -1;

                for (let idx = 0; idx < slotCenters.length; idx++) {
                    const center = slotCenters[idx];
                    const dist = Math.hypot(pointerX - center.x, pointerY - center.y);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestIdx = idx;
                    }
                }

                const slotW = slotRects[0] ? slotRects[0].width : 40;
                // 擴大感應半徑至槽位寬度的 1.8 倍，只要接近目標按鍵槽位即刻感應
                if (minDistance <= slotW * 1.8 && closestIdx >= 0) {
                    hoveredIndex = closestIdx;
                } else {
                    hoveredIndex = isFromGrid ? dragState.sourceIndex : -1;
                }
            }

            if (isOutsideGrid && isFromGrid) {
                if (poolDropTarget) poolDropTarget.classList.add('is-drop-active');
                if (sidePoolTarget) sidePoolTarget.classList.add('is-drop-active');
                dragState.isOverPool = true;
                hoveredIndex = -1;
            } else {
                if (poolDropTarget) poolDropTarget.classList.remove('is-drop-active');
                if (sidePoolTarget) sidePoolTarget.classList.remove('is-drop-active');
                dragState.isOverPool = false;
            }

            if (hoveredIndex !== dragState.lastHoverIndex) {
                if (hoveredIndex >= 0) triggerVibration(false);
                dragState.lastHoverIndex = hoveredIndex;
            }
            dragState.currentHoverIndex = hoveredIndex;

            updateLiveShifts(hoveredIndex);
        };

        const onPointerMove = (e) => {
            if (!dragState || dragState.isFinalizing) return;
            dragState.pendingEvent = e;
            processPointerMove();
        };

        const onPointerDown = (e) => {
            if (e.button && e.button !== 0) return;
            if (dragState) return;

            const targetKey = e.target.closest('.custom-keyboard-grid .key, .pool-key-item');
            if (!targetKey) return;

            const isFromGrid = targetKey.classList.contains('key') && targetKey.parentElement === gridEl;
            const keyId = isFromGrid ? targetKey.dataset.keyId : targetKey.dataset.poolKeyId;
            if (!keyId) return;

            e.preventDefault();
            triggerVibration(false);

            const sourceIndex = isFromGrid ? parseInt(targetKey.dataset.index) : -1;
            const keyBtn = targetKey.classList.contains('key') ? targetKey : targetKey.querySelector('.key') || targetKey;
            const keyRect = keyBtn.getBoundingClientRect();
            const containerRect = gridContainer.getBoundingClientRect();
            const gridRect = gridEl.getBoundingClientRect();

            // 快取當前網格所有按鍵槽位的邊界與中心座標
            const gridKeys = Array.from(gridEl.querySelectorAll('.key'));
            const slotRects = gridKeys.map(k => k.getBoundingClientRect());
            const slotCenters = slotRects.map(r => ({
                x: r.left + r.width / 2,
                y: r.top + r.height / 2
            }));

            const isTouch = (e.pointerType === 'touch');
            const touchLiftY = isTouch ? 22 : 0;
            const initialX = keyRect.left;
            const initialY = keyRect.top;

            // 建立跟隨手指的高性能懸浮拖曳按鍵 (固定 top:0, left:0，精確鎖定網格按鍵尺寸 1:1)
            const targetSize = Math.round(keyRect.width) || 40;
            const floatingEl = generateKeyElement(keyId);
            floatingEl.classList.add('is-dragging');
            floatingEl.style.setProperty('--drag-size', `${targetSize}px`);
            floatingEl.style.position = 'fixed';
            floatingEl.style.left = '0px';
            floatingEl.style.top = '0px';
            floatingEl.style.width = `${targetSize}px`;
            floatingEl.style.height = `${targetSize}px`;
            floatingEl.style.maxWidth = `${targetSize}px`;
            floatingEl.style.maxHeight = `${targetSize}px`;
            floatingEl.style.minWidth = `${targetSize}px`;
            floatingEl.style.minHeight = `${targetSize}px`;
            floatingEl.style.transform = `translate3d(${initialX}px, ${initialY}px, 0) scale(1)`;
            floatingEl.style.zIndex = '999999';
            floatingEl.style.pointerEvents = 'none';
            floatingEl.style.margin = '0';
            document.body.appendChild(floatingEl);

            if (isFromGrid) {
                targetKey.classList.add('is-placeholder');
            }

            gridEl.classList.add('is-dragging-active');

            dragState = {
                keyId,
                isFromGrid,
                sourceIndex,
                sourceEl: targetKey,
                floatingEl,
                indicatorEl,
                gridContainer,
                containerRect,
                gridRect,
                gridEl,
                gridKeys,
                slotRects,
                slotCenters,
                keyRect,
                touchLiftY,
                offsetX: e.clientX - (keyRect.left + keyRect.width / 2),
                offsetY: e.clientY - (keyRect.top + keyRect.height / 2) + touchLiftY,
                lastTargetX: initialX,
                lastTargetY: initialY,
                currentHoverIndex: isFromGrid ? sourceIndex : -1,
                lastHoverIndex: isFromGrid ? sourceIndex : -1,
                isOverPool: false,
                isFinalizing: false,
                pendingEvent: e,
                pointerId: e.pointerId
            };

            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
            
            // 立即執行一次滑動座標更新與讓位判定
            processPointerMove();
        };

        const onPointerUp = (e) => {
            if (!dragState || dragState.isFinalizing) return;
            dragState.isFinalizing = true;

            if (dragRaf) {
                cancelAnimationFrame(dragRaf);
                dragRaf = null;
            }

            const { keyId, isFromGrid, sourceIndex, sourceEl, floatingEl, indicatorEl, gridKeys, slotRects, currentHoverIndex, isOverPool, lastTargetX, lastTargetY } = dragState;

            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);

            try {
                sourceEl.releasePointerCapture(e.pointerId);
            } catch (err) {}

            if (indicatorEl) indicatorEl.classList.remove('active');
            if (poolDropTarget) poolDropTarget.classList.remove('is-drop-active');
            if (sidePoolTarget) sidePoolTarget.classList.remove('is-drop-active');

            const finalizeCleanup = () => {
                if (floatingEl && floatingEl.parentNode) {
                    floatingEl.parentNode.removeChild(floatingEl);
                }
                gridEl.classList.remove('is-dragging-active');
                gridKeys.forEach(k => {
                    k.style.transform = '';
                    k.style.opacity = '';
                    k.style.visibility = '';
                    k.classList.remove('is-placeholder', 'is-shifting');
                });
                dragState = null;
            };

            if (isFromGrid && sourceIndex >= 0) {
                if (isOverPool || currentHoverIndex === -1) {
                    // 拖到底下庫存區：轉化為微光虛線空白格（blank）並彈出提示
                    triggerVibration(true);
                    floatingEl.classList.add('is-discarding');
                    floatingEl.style.transform = `translate3d(${lastTargetX}px, ${lastTargetY + 30}px, 0) scale(0.2)`;
                    setTimeout(() => {
                        currentKeyboardLayout[sourceIndex] = 'blank';
                        saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);
                        pushUndoState();
                        finalizeCleanup();
                        renderCustomKeyboard();
                        renderMainKeyboard();
                        showToastMsg(I18N[currentLang].toastKeyRemoved);
                    }, 200);
                } else {
                    // 網格內放開：觸發 Spring Drop 吸附動畫，並在動畫前先完成佈局更新以保持畫面連貫
                    const finalIndex = (currentHoverIndex >= 0 && currentHoverIndex < slotRects.length) ? currentHoverIndex : sourceIndex;
                    const destRect = slotRects[finalIndex];

                    floatingEl.classList.add('is-dropping');
                    floatingEl.style.transform = `translate3d(${destRect.left}px, ${destRect.top}px, 0) scale(1)`;
                    triggerVibration(false);

                    if (finalIndex !== sourceIndex) {
                        const [movedItem] = currentKeyboardLayout.splice(sourceIndex, 1);
                        currentKeyboardLayout.splice(finalIndex, 0, movedItem);
                        saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);
                        pushUndoState();
                    }

                    setTimeout(() => {
                        finalizeCleanup();
                        renderCustomKeyboard();
                        renderMainKeyboard();
                    }, 220);
                }
            } else if (!isFromGrid) {
                // 從庫存拖入網格：觸發吸附動畫並智慧空白格吸收
                if (currentHoverIndex >= 0 && currentHoverIndex < slotRects.length) {
                    const destRect = slotRects[currentHoverIndex];
                    floatingEl.classList.add('is-dropping');
                    floatingEl.style.transform = `translate3d(${destRect.left}px, ${destRect.top}px, 0) scale(1)`;
                    triggerVibration(false);

                    const maxSlots = (GRID_CONFIGS[currentKeyboardGrid] || GRID_CONFIGS['4x5']).total;
                    if (currentKeyboardLayout[currentHoverIndex] === 'blank') {
                        currentKeyboardLayout[currentHoverIndex] = keyId;
                    } else {
                        // 尋找離 currentHoverIndex 最近的空白格
                        let targetBlankIdx = -1;
                        let minDistToBlank = Infinity;
                        currentKeyboardLayout.forEach((kId, idx) => {
                            if (kId === 'blank') {
                                const dist = Math.abs(idx - currentHoverIndex);
                                if (dist < minDistToBlank) {
                                    minDistToBlank = dist;
                                    targetBlankIdx = idx;
                                }
                            }
                        });

                        if (targetBlankIdx !== -1) {
                            if (targetBlankIdx > currentHoverIndex) {
                                currentKeyboardLayout.splice(currentHoverIndex, 0, keyId);
                                currentKeyboardLayout.splice(targetBlankIdx + 1, 1);
                            } else {
                                currentKeyboardLayout.splice(targetBlankIdx, 1);
                                currentKeyboardLayout.splice(currentHoverIndex, 0, keyId);
                            }
                        } else {
                            currentKeyboardLayout.splice(currentHoverIndex, 0, keyId);
                            if (currentKeyboardLayout.length > maxSlots) {
                                currentKeyboardLayout.pop();
                            }
                        }
                    }
                    saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);
                    pushUndoState();

                    setTimeout(() => {
                        finalizeCleanup();
                        renderCustomKeyboard();
                        renderMainKeyboard();
                    }, 220);
                } else {
                    floatingEl.classList.add('is-discarding');
                    floatingEl.style.transform = `translate3d(${lastTargetX}px, ${lastTargetY + 30}px, 0) scale(0.2)`;
                    setTimeout(() => {
                        finalizeCleanup();
                        renderCustomKeyboard();
                    }, 200);
                }
            }
        };

        gridEl.addEventListener('pointerdown', onPointerDown);
        poolEl.addEventListener('pointerdown', onPointerDown);
        if (sidePoolEl) sidePoolEl.addEventListener('pointerdown', onPointerDown);

        const undoBtn = document.getElementById('btn-keyboard-undo');
        const redoBtn = document.getElementById('btn-keyboard-redo');
        if (undoBtn && !undoBtn.dataset.bound) {
            undoBtn.dataset.bound = 'true';
            attachSmartTap(undoBtn, performUndo);
        }
        if (redoBtn && !redoBtn.dataset.bound) {
            redoBtn.dataset.bound = 'true';
            attachSmartTap(redoBtn, performRedo);
        }
    }

    function setupMainKeyboardLongPress() {
        const keyboardEl = document.getElementById('main-keyboard');
        if (!keyboardEl) return;

        let pressTimer = null;
        let startX = 0, startY = 0;

        keyboardEl.addEventListener('pointerdown', (e) => {
            const keyBtn = e.target.closest('.key');
            if (!keyBtn) return;
            if (keyBtn.dataset.action === 'backspace') return; // Backspace 專用連續刪除，不觸發鍵盤自訂長按
            if (keyBtn.dataset.action === 'applyTaxAdd' || keyBtn.dataset.action === 'applyTaxSub') {
                // 長按 +TAX / -TAX 鍵快速設定稅率 (Casio SET Mode)
                pressTimer = setTimeout(() => {
                    openQuickTaxModal(currentFrom);
                }, 450);
                return;
            }
            startX = e.clientX;
            startY = e.clientY;

            pressTimer = setTimeout(() => {
                triggerVibration(true);
                const settingsMenu = document.getElementById('settings-menu');
                if (settingsMenu && !settingsMenu.classList.contains('show')) {
                    toggleMenu('settings');
                }
                setTimeout(() => {
                    openKeyboardCustomizer();
                }, 200);
            }, 550);
        });

        const cancelTimer = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        keyboardEl.addEventListener('pointermove', (e) => {
            if (pressTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
                cancelTimer();
            }
        });
        keyboardEl.addEventListener('pointerup', cancelTimer);
        keyboardEl.addEventListener('pointercancel', cancelTimer);
    }

    /* 🔥 修正後的定位檢測與幣別切換機制 */
    async function detectLocationCurrency(isFirstTimeUser) {
        let detectedCurrency = null;

        try {
            const res = await fetch('https://ipwho.is/');
            if (res.ok) {
                const data = await res.json();
                if (data.currency && data.currency.code) {
                    detectedCurrency = data.currency.code;
                }
            }
        } catch (e) {
            console.warn("API detection failed, trying Local Timezone fallback...");
        }

        if (!detectedCurrency) {
            try {
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (tz.includes('Seoul')) detectedCurrency = 'KRW';
                else if (tz.includes('Taipei')) detectedCurrency = 'TWD';
                else if (tz.includes('Tokyo')) detectedCurrency = 'JPY';
                else if (tz.includes('Shanghai') || tz.includes('Chongqing')) detectedCurrency = 'CNY';
                else if (tz.includes('Kuala_Lumpur') || tz.includes('Kuching')) detectedCurrency = 'MYR';
                else if (tz.includes('Singapore')) detectedCurrency = 'SGD';
                else if (tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Brisbane') || tz.includes('Perth') || tz.includes('Adelaide') || tz.includes('Darwin') || tz.includes('Hobart') || tz.startsWith('Australia/')) detectedCurrency = 'AUD';
                else if (tz.includes('Ho_Chi_Minh') || tz.includes('Hanoi')) detectedCurrency = 'VND';
                else if (tz.includes('Bangkok')) detectedCurrency = 'THB';
                else if (tz.startsWith('America/')) detectedCurrency = 'USD';
                else if (tz.startsWith('Europe/')) detectedCurrency = 'EUR';
            } catch (e) {}
        }

        if (detectedCurrency && flags[detectedCurrency]) {
            if (isFirstTimeUser || detectedCurrency === 'TWD') {
                currentFrom = detectedCurrency;
                selectCurrency('from', currentFrom, flags[detectedCurrency]);
                if (detectedCurrency === 'TWD') {
                    currentTo = 'TWD';
                    selectCurrency('to', 'TWD', flags['TWD']);
                    const headerArea = document.getElementById('header-area');
                    if (headerArea) setCapsuleCollapsed(true, { animate: false });
                }
            }
            const currName = I18N[currentLang].currencies[detectedCurrency] || detectedCurrency;
            showToastMsg(`${I18N[currentLang].toastLocationSuccess}${currName}`);
        } else {
            showToastMsg(I18N[currentLang].toastLocationFailed);
        }
    }

    const KEY_RATES_TIMESTAMP = 'bCalc_rates_timestamp';

    function updateRateFreshnessUI(nowStr) {
        const lastUpdatedEl = document.getElementById('last-updated');
        if (!lastUpdatedEl) return;
        const tsStr = localStorage.getItem(KEY_RATES_TIMESTAMP);
        const savedTime = localStorage.getItem(KEY_RATES_TIME);
        let isOutdated = false;
        if (tsStr) {
            const ts = parseInt(tsStr, 10);
            if (Date.now() - ts > 24 * 60 * 60 * 1000) {
                isOutdated = true;
            }
        }
        const displayTime = nowStr || (savedTime === "Custom" ? I18N[currentLang].customTag : (savedTime || ""));
        lastUpdatedEl.textContent = `${I18N[currentLang].updatedPrefix}${displayTime}` + (isOutdated ? ' (>24h)' : '');
        lastUpdatedEl.classList.toggle('outdated', isOutdated);
    }

    const fetchRates = throttle(async function(isManual = false) {
        const refreshBtn = document.getElementById('refresh-rate-btn');
        if (isManual) { 
            triggerVibration(); 
            if (refreshBtn) {
                refreshBtn.textContent = "..."; 
                refreshBtn.style.pointerEvents = "none"; 
            }
        }
        
        const savedRates = localStorage.getItem(KEY_RATES);
        if (savedRates) { rates = {...rates, ...JSON.parse(savedRates)}; calculateExchange(); syncRateInputsUI(); }
        updateRateFreshnessUI();

        try {
            if (!navigator.onLine) {
                throw new Error("No internet connection");
            }
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            if (res.ok) {
                const data = await res.json();
                rates = data.rates;
                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                localStorage.setItem(KEY_RATES, JSON.stringify(rates));
                localStorage.setItem(KEY_RATES_TIME, nowStr);
                localStorage.setItem(KEY_RATES_TIMESTAMP, Date.now().toString());
                
                updateRateFreshnessUI(nowStr);
                calculateExchange();
                syncRateInputsUI();

                if (isManual && refreshBtn) {
                    refreshBtn.textContent = "OK";
                    refreshBtn.classList.add('success');
                    setTimeout(() => {
                        refreshBtn.textContent = I18N[currentLang].btnRefresh;
                        refreshBtn.classList.remove('success');
                        refreshBtn.style.pointerEvents = "auto";
                    }, 1000);
                }
            } else {
                throw new Error("Fetch failed");
            }
        } catch (e) {
            updateRateFreshnessUI();
            if (isManual || !navigator.onLine) {
                showToastMsg(I18N[currentLang].toastNoInternet);
            } else {
                showToastMsg(I18N[currentLang].toastOfflineData);
            }
            if (isManual && refreshBtn) {
                refreshBtn.textContent = "OFFLINE";
                refreshBtn.classList.add('error');
                setTimeout(() => {
                    refreshBtn.textContent = I18N[currentLang].btnRefresh;
                    refreshBtn.classList.remove('error');
                    refreshBtn.style.pointerEvents = "auto";
                }, 1000);
            }
        }
    }, 2000);

    function initEvents() {
        renderMainKeyboard();
        setupKeyboardDragDrop();
        setupMainKeyboardLongPress();

        /* 🔥 電腦實體鍵盤快捷鍵綁定 */
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const key = e.key;
            if (key >= '0' && key <= '9') instantInput(null, 'inputNum', key);
            else if (key === '.') instantInput(null, 'inputNum', '.');
            else if (key === '+') instantInput(null, 'inputOperator', '+');
            else if (key === '-') instantInput(null, 'inputOperator', '-');
            else if (key === '*') instantInput(null, 'inputOperator', '×');
            else if (key === '/') instantInput(null, 'inputOperator', '÷');
            else if (key === '%') instantInput(null, 'inputOperator', '%');
            else if (key === '(' || key === ')') instantInput(null, 'inputParenthesis');
            else if (key === 'Enter' || key === '=') instantInput(null, 'evaluateExpr');
            else if (key === 'Backspace') instantInput(null, 'backspace');
            else if (key === 'Escape') instantInput(null, 'clearAll');
        });

        attachSmartTap(document.getElementById('trigger-from'), (e) => toggleDropdown('from', e));
        attachSmartTap(document.getElementById('trigger-to'), (e) => toggleDropdown('to', e));
        attachSmartTap(document.getElementById('btn-swap'), swapCurrencies);

        /* 🔥 TAX 鍵長按快速設定稅率 / 短按切換含未稅模式 */
        const taxBtn = document.getElementById('tax-btn');
        if (taxBtn) {
            let taxBtnTimer = null;
            taxBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                let startX = e.clientX, startY = e.clientY;
                let didLongPress = false;
                taxBtnTimer = setTimeout(() => {
                    didLongPress = true;
                    openQuickTaxModal(currentFrom);
                }, 420);

                const onUp = (ev) => {
                    if (taxBtnTimer) {
                        clearTimeout(taxBtnTimer);
                        taxBtnTimer = null;
                    }
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                    if (!didLongPress && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 10) {
                        ev.stopPropagation();
                        toggleTaxMode();
                    }
                };

                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
            });
        }
        attachSmartTap(document.getElementById('btn-quick-tax-save'), saveQuickTaxModal);
        attachSmartTap(document.getElementById('btn-quick-tax-cancel'), closeQuickTaxModal);

        /* 📸 鍵盤佈局快照 (Snapshots) 切換與儲存 */
        const KEY_KEYBOARD_SNAPSHOTS = 'bCalc_keyboard_snapshots';
        const PRESET_SNAPSHOT_CONFIGS = {
            'biz': {
                grid: '4x5',
                layout: ['clear', 'backspace', 'percent', 'divide', 'num_7', 'num_8', 'num_9', 'multiply', 'num_4', 'num_5', 'num_6', 'subtract', 'num_1', 'num_2', 'num_3', 'add', 'tax', 'num_0', 'dot', 'equal']
            },
            'travel': {
                grid: '4x5',
                layout: ['clear', 'backspace', 'swapCurrencies', 'divide', 'num_7', 'num_8', 'num_9', 'multiply', 'num_4', 'num_5', 'num_6', 'subtract', 'num_1', 'num_2', 'num_3', 'add', 'num_00', 'num_0', 'dot', 'equal']
            },
            'math': {
                grid: '4x6',
                layout: ['sin', 'cos', 'tan', 'power', 'clear', 'backspace', 'percent', 'divide', 'num_7', 'num_8', 'num_9', 'multiply', 'num_4', 'num_5', 'num_6', 'subtract', 'num_1', 'num_2', 'num_3', 'add', 'paren', 'num_0', 'dot', 'equal']
            }
        };

        function updateSnapshotUI(orientation = activeEditOrientation) {
            try {
                const snapshots = JSON.parse(localStorage.getItem(KEY_KEYBOARD_SNAPSHOTS)) || {};
                const activeKey = snapshots[orientation]?.activeSnapshot || 'biz';
                document.querySelectorAll('.snapshot-chip[data-snapshot]').forEach(c => {
                    if (c.dataset.snapshot === activeKey) {
                        c.classList.add('active');
                    } else {
                        c.classList.remove('active');
                    }
                });
            } catch (e) {}
        }

        /* 📱 模式切換：直向鍵盤 / 橫向鍵盤 */
        document.querySelectorAll('.orientation-mode-selector .mode-btn').forEach(btn => {
            attachSmartTap(btn, () => {
                triggerVibration();
                activeEditOrientation = btn.dataset.orientation;
                updateOrientationModeBtnsUI();
                syncKeyboardState(activeEditOrientation);
                updateSnapshotUI(activeEditOrientation);
                updateGridCols();
                renderCustomKeyboard();
                renderMainKeyboard();
            });
        });

        document.querySelectorAll('.snapshot-chip[data-snapshot]').forEach(btn => {
            attachSmartTap(btn, () => {
                triggerVibration();
                const snapKey = btn.dataset.snapshot;

                // 1. 保存當前方案至對應快照 Slot
                autoSaveSnapshot(activeEditOrientation);

                // 2. 讀取點選目標之快照數據 (若無自訂檔則帶入官方預設)
                const snapshots = JSON.parse(localStorage.getItem(KEY_KEYBOARD_SNAPSHOTS)) || {};
                if (!snapshots[activeEditOrientation]) snapshots[activeEditOrientation] = {};
                
                let targetConfig = snapshots[activeEditOrientation][snapKey];
                if (!targetConfig || !targetConfig.grid || !Array.isArray(targetConfig.layout)) {
                    targetConfig = PRESET_SNAPSHOT_CONFIGS[snapKey] || PRESET_SNAPSHOT_CONFIGS['biz'];
                }

                // 3. 切換 activeSnapshot
                snapshots[activeEditOrientation].activeSnapshot = snapKey;
                snapshots[activeEditOrientation][snapKey] = {
                    grid: targetConfig.grid,
                    layout: [...targetConfig.layout]
                };
                localStorage.setItem(KEY_KEYBOARD_SNAPSHOTS, JSON.stringify(snapshots));

                // 4. 更新當前狀態與單寫入存檔
                currentKeyboardGrid = targetConfig.grid;
                currentKeyboardLayout = [...targetConfig.layout];

                const gridKey = (activeEditOrientation === 'landscape') ? KEY_KEYBOARD_GRID_LANDSCAPE : KEY_KEYBOARD_GRID;
                const layoutKey = (activeEditOrientation === 'landscape') ? KEY_KEYBOARD_LAYOUT_LANDSCAPE : KEY_KEYBOARD_LAYOUT;
                localStorage.setItem(gridKey, currentKeyboardGrid);
                localStorage.setItem(layoutKey, JSON.stringify(currentKeyboardLayout));

                // 5. 刷新 UI 與 Undo 歷史紀錄
                updateSnapshotUI(activeEditOrientation);
                updateGridCols();
                renderCustomKeyboard();
                renderMainKeyboard();
                pushUndoState();

                const name = btn.textContent.trim();
                showToastMsg((I18N[currentLang].toastSnapshotLoaded || "LOADED: {name}").replace('{name}', name));
            });
        });

        const btnSnapshotSave = document.getElementById('btn-snapshot-save');
        if (btnSnapshotSave) {
            attachSmartTap(btnSnapshotSave, () => {
                triggerVibration(true);
                const snapshots = JSON.parse(localStorage.getItem(KEY_KEYBOARD_SNAPSHOTS) || '{}');
                snapshots.custom = {
                    grid: currentKeyboardGrid,
                    layout: [...currentKeyboardLayout]
                };
                localStorage.setItem(KEY_KEYBOARD_SNAPSHOTS, JSON.stringify(snapshots));
                showToastMsg(I18N[currentLang].toastSnapshotSaved || "SNAPSHOT SAVED!");
            });
        }

        attachSmartTap(document.getElementById('btn-settings'), (e) => toggleMenu('settings', e));
        attachSmartTap(document.getElementById('btn-history'), (e) => toggleMenu('history', e));
        attachSmartTap(document.getElementById('btn-ai-scan'), (e) => toggleMenu('ai-scan', e));
        attachSmartTap(document.getElementById('btn-open-keyboard'), guardSubMenuOpen(openKeyboardCustomizer));
        attachSmartTap(document.getElementById('btn-keyboard-back'), () => {
            // 檢查是否缺少 刪除鍵(backspace)、清除鍵(clear)、等於鍵(equal) 任一個
            const missing = [];
            if (!currentKeyboardLayout.includes('backspace')) missing.push(I18N[currentLang].keyNameBackspace);
            if (!currentKeyboardLayout.includes('clear')) missing.push(I18N[currentLang].keyNameClear);
            if (!currentKeyboardLayout.includes('equal')) missing.push(I18N[currentLang].keyNameEqual);

            if (missing.length > 0) {
                triggerVibration(true);
                const separator = currentLang === 'zh' ? '、' : ', ';
                const msg = I18N[currentLang].toastMissingKeys.replace('{keys}', missing.join(separator));
                showToastMsg(msg);
            } else {
                triggerVibration(false);
            }

            // 點擊「完成」時，才自動縮減末尾全為空白的列
            const config = GRID_CONFIGS[currentKeyboardGrid] || GRID_CONFIGS['4x5'];
            const cols = config.cols;
            while (currentKeyboardLayout.length > cols) {
                const lastRow = currentKeyboardLayout.slice(-cols);
                if (lastRow.every(k => k === 'blank')) {
                    currentKeyboardLayout.splice(-cols);
                } else {
                    break;
                }
            }

            // 自動同步對應規格按鈕（例如 24鍵自動縮為20鍵 -> 4x5）
            Object.keys(GRID_CONFIGS).forEach(gk => {
                if (GRID_CONFIGS[gk].cols === cols && GRID_CONFIGS[gk].total === currentKeyboardLayout.length) {
                    currentKeyboardGrid = gk;
                    saveKeyboardGrid(currentKeyboardGrid, activeEditOrientation);
                }
            });

            saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);
            syncKeyboardState();
            updateGridCols();
            renderCustomKeyboard();
            renderMainKeyboard();
            navigateSubMenu('keyboard-settings-menu', 'settings-menu', 'backward');
        });
        attachSmartTap(document.getElementById('btn-keyboard-reset'), () => {
            triggerVibration();
            currentKeyboardGrid = (activeEditOrientation === 'landscape') ? '6x4' : '4x5';
            currentKeyboardLayout = [...(PRESET_DEFAULT_LAYOUTS[currentKeyboardGrid] || DEFAULT_KEYBOARD_LAYOUT)];
            saveKeyboardGrid(currentKeyboardGrid, activeEditOrientation);
            saveKeyboardLayout(currentKeyboardLayout, activeEditOrientation);
            updateGridCols();
            renderCustomKeyboard();
            renderMainKeyboard();
            showToastMsg(I18N[currentLang].toastKeyboardReset);
        });

        document.querySelectorAll('.grid-preset-btn').forEach(btn => {
            attachSmartTap(btn, () => setGridPreset(btn.dataset.grid));
        });

        document.querySelectorAll('.pool-tab-btn').forEach(btn => {
            attachSmartTap(btn, () => {
                triggerVibration();
                document.querySelectorAll('.pool-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateGliders();
                renderKeyPool(btn.dataset.category, true);
            });
        });

        attachSmartTap(document.getElementById('btn-open-style'), guardSubMenuOpen(() => {
            navigateSubMenu('settings-menu', 'style-settings-menu', 'forward');
            requestAnimationFrame(() => updateGliders());
            setTimeout(updateGliders, 60);
        }));
        attachSmartTap(document.getElementById('btn-style-back'), () => {
            navigateSubMenu('style-settings-menu', 'settings-menu', 'backward');
            requestAnimationFrame(() => updateGliders());
            setTimeout(updateGliders, 60);
        });

        attachSmartTap(document.getElementById('btn-open-tax'), guardSubMenuOpen(() => navigateSubMenu('settings-menu', 'tax-settings-menu', 'forward')));
        attachSmartTap(document.getElementById('btn-tax-back'), () => navigateSubMenu('tax-settings-menu', 'settings-menu', 'backward'));

        attachSmartTap(document.getElementById('btn-open-rates'), guardSubMenuOpen(() => {
            syncRateInputsUI();
            navigateSubMenu('settings-menu', 'rate-settings-menu', 'forward');
        }));
        attachSmartTap(document.getElementById('btn-rate-back'), () => navigateSubMenu('rate-settings-menu', 'settings-menu', 'backward'));
        
        attachSmartTap(document.getElementById('btn-open-ai-scan-settings'), guardSubMenuOpen(() => {
            if (window.updateGeminiKeyUI) window.updateGeminiKeyUI();
            navigateSubMenu('settings-menu', 'ai-scan-settings-menu', 'forward');
        }));
        
        attachSmartTap(document.getElementById('btn-rate-reset'), () => {
            triggerVibration();
            baseRateCurrency = "USD";
            localStorage.removeItem(KEY_RATES);
            localStorage.removeItem(KEY_RATES_TIME);
            fetchRates(true);
        });

        attachSmartTap(document.getElementById('btn-settings-reset'), () => {
            triggerVibration();
            document.getElementById('confirm-reset-modal').classList.add('show');
        });

        /* 🔥 大數字顯示模式按鈕綁定 */
        document.querySelectorAll('.number-format-btn').forEach(btn => {
            attachSmartTap(btn, () => setLargeNumberFormat(btn.dataset.format));
        });

        document.getElementById('haptic-toggle').addEventListener('change', (e) => {
            triggerVibration();
            localStorage.setItem(KEY_HAPTIC, e.target.checked ? 'true' : 'false');
        });

        const bubbleToggle = document.getElementById('category-bubble-toggle');
        if (bubbleToggle) {
            bubbleToggle.addEventListener('change', (e) => {
                triggerVibration();
                isCategoryBubbleEnabled = e.target.checked;
                localStorage.setItem(KEY_CATEGORY_BUBBLE, isCategoryBubbleEnabled ? 'true' : 'false');
                if (!isCategoryBubbleEnabled) hideCategoryBubble();
                updateCategorySummaryVisibility();
            });
        }

        document.querySelectorAll('.lang-btn').forEach(btn => {
            attachSmartTap(btn, () => setLanguage(btn.dataset.lang));
        });

        document.querySelectorAll('.font-btn').forEach(btn => {
            attachSmartTap(btn, () => setFontStyle(btn.dataset.font));
        });

        document.querySelectorAll('.currency-btn-group').forEach(btn => {
            attachSmartTap(btn, () => {
                const code = btn.dataset.code;
                setBaseCurrency(code);
            });
        });

        document.querySelectorAll('input[type="number"], input[type="text"]').forEach(input => {
            attachSmartTap(input, () => {
                if (input.disabled) return;
                input.removeAttribute('readonly');
                input.focus();
            });
            input.addEventListener('blur', () => {
                input.setAttribute('readonly', 'true');
            });
        });

        document.querySelectorAll('.dropdown-options').forEach(el => {
            attachSmartTap(el, (e, option) => {
                const type = el.id.split('-')[1];
                selectCurrency(type, option.dataset.code, option.dataset.flag);
            }, { selector: '.dropdown-option' });
        });

        attachSmartTap(window, (e) => {
            if (!e.target.closest('.custom-dropdown')) {
                document.getElementById('options-from')?.classList.remove('show');
                document.getElementById('options-to')?.classList.remove('show');
                if (typeof updateDropdownBackdrop === 'function') updateDropdownBackdrop();
            }
        });

        const dropdownBackdrop = document.getElementById('dropdown-backdrop');
        if (dropdownBackdrop) {
            attachSmartTap(dropdownBackdrop, () => {
                document.getElementById('options-from')?.classList.remove('show');
                document.getElementById('options-to')?.classList.remove('show');
                if (typeof updateDropdownBackdrop === 'function') updateDropdownBackdrop();
            });
        }

        attachSmartTap(document.getElementById('theme-palette'), (e, swatch) => {
            if (swatch.classList.contains('custom-btn')) toggleCustomColorMenu();
            else {
                document.getElementById('custom-color-menu').classList.remove('show');
                applyThemeColor(swatch.dataset.color);
                renderThemePalette();
            }
        }, { selector: '.color-swatch' });
        
        const colorField = document.getElementById('color-field');
        const hueSlider = document.getElementById('hue-slider-container');
        
        if (colorField && hueSlider) {
            let colorFieldRaf = null;
            let hueSliderRaf = null;

            colorField.addEventListener('pointerdown', (e) => {
                triggerVibration();
                colorField.setPointerCapture(e.pointerId);
                let cachedRect = colorField.getBoundingClientRect();

                const moveHandler = (ev) => {
                    if (colorFieldRaf) return;
                    colorFieldRaf = requestAnimationFrame(() => {
                        colorFieldRaf = null;
                        if (cachedRect.width === 0 || cachedRect.height === 0) return;
                        const x = Math.max(0, Math.min(ev.clientX - cachedRect.left, cachedRect.width));
                        const y = Math.max(0, Math.min(ev.clientY - cachedRect.top, cachedRect.height));
                        curS = x / cachedRect.width;
                        curV = 1 - (y / cachedRect.height);
                        updateCustomPicker();
                    });
                };
                const upHandler = (ev) => {
                    if (colorFieldRaf) { cancelAnimationFrame(colorFieldRaf); colorFieldRaf = null; }
                    colorField.releasePointerCapture(ev.pointerId);
                    colorField.removeEventListener('pointermove', moveHandler);
                    colorField.removeEventListener('pointerup', upHandler);
                    colorField.removeEventListener('pointercancel', upHandler);
                };
                colorField.addEventListener('pointermove', moveHandler, { passive: true });
                colorField.addEventListener('pointerup', upHandler);
                colorField.addEventListener('pointercancel', upHandler);
                moveHandler(e);
            });

            hueSlider.addEventListener('pointerdown', (e) => {
                triggerVibration();
                hueSlider.setPointerCapture(e.pointerId);
                let cachedRect = hueSlider.getBoundingClientRect();

                const moveHandler = (ev) => {
                    if (hueSliderRaf) return;
                    hueSliderRaf = requestAnimationFrame(() => {
                        hueSliderRaf = null;
                        if (cachedRect.height === 0) return;
                        const y = Math.max(0, Math.min(ev.clientY - cachedRect.top, cachedRect.height));
                        curH = (y / cachedRect.height) * 360;
                        updateCustomPicker();
                    });
                };
                const upHandler = (ev) => {
                    if (hueSliderRaf) { cancelAnimationFrame(hueSliderRaf); hueSliderRaf = null; }
                    hueSlider.releasePointerCapture(ev.pointerId);
                    hueSlider.removeEventListener('pointermove', moveHandler);
                    hueSlider.removeEventListener('pointerup', upHandler);
                    hueSlider.removeEventListener('pointercancel', upHandler);
                };
                hueSlider.addEventListener('pointermove', moveHandler, { passive: true });
                hueSlider.addEventListener('pointerup', upHandler);
                hueSlider.addEventListener('pointercancel', upHandler);
                moveHandler(e);
            });
        }
        document.getElementById('hex-input').addEventListener('change', updateFromHex);
        document.getElementById('theme-toggle').addEventListener('change', toggleLightMode);
        attachSmartTap(document.getElementById('btn-dec-minus'), () => changeDecimals(-1));
        attachSmartTap(document.getElementById('btn-dec-plus'), () => changeDecimals(1));
        
        document.querySelectorAll('.percent-mode-btn').forEach(btn => {
            attachSmartTap(btn, () => setPercentageMode(btn.dataset.percent));
        });

        const btnShareLine = document.getElementById('btn-history-share');
        if (btnShareLine) attachSmartTap(btnShareLine, shareHistoryText);

        const btnExportExcel = document.getElementById('btn-history-export-excel');
        if (btnExportExcel) attachSmartTap(btnExportExcel, exportHistoryExcel);

        const btnTravelReport = document.getElementById('btn-history-travel-report');
        if (btnTravelReport) {
            attachSmartTap(btnTravelReport, () => {
                triggerVibration();
                if (renderTravelSummaryReport()) {
                    const modal = document.getElementById('travel-summary-modal');
                    if (modal) modal.style.display = 'flex';
                }
            });
        }

        const btnCloseTravel = document.getElementById('btn-close-travel-modal');
        if (btnCloseTravel) {
            attachSmartTap(btnCloseTravel, () => {
                triggerVibration();
                const modal = document.getElementById('travel-summary-modal');
                if (modal) modal.style.display = 'none';
            });
        }

        const btnCopyTravel = document.getElementById('btn-copy-travel-report');
        if (btnCopyTravel) attachSmartTap(btnCopyTravel, copyTravelReportText);

        const btnExportTravelExcel = document.getElementById('btn-export-travel-excel');
        if (btnExportTravelExcel) attachSmartTap(btnExportTravelExcel, exportHistoryExcel);

        // 綁定即時分類氣泡按鈕
        document.querySelectorAll('#category-bubble .cat-chip').forEach(chip => {
            attachSmartTap(chip, (e) => {
                e.stopPropagation();
                setLatestHistoryCategory(chip.dataset.cat);
            });
        });

        // 綁定歷史 Modal 內的分類切換按鈕
        document.querySelectorAll('#modal-category-picker .modal-cat-chip').forEach(chip => {
            attachSmartTap(chip, (e) => {
                e.stopPropagation();
                changeHistoryItemCategory(chip.dataset.cat);
            });
        });

        const memBadge = document.getElementById('mem-indicator');
        if (memBadge) {
            attachSmartTap(memBadge, () => {
                instantInput(null, 'memoryRecall');
            });
        }

        const resWrapper = document.getElementById('result-wrapper');
        if (resWrapper) {
            attachSmartTap(resWrapper, (e) => {
                if (isEvaluated) return;
                triggerVibration(false);
                const resScreen = document.getElementById('result-screen');
                if (!resScreen) return;

                // 利用瀏覽器原生 Caret API 取得點擊位置的 DOM 文字節點與字元偏移
                let domNode = null, domOffset = 0;
                if (document.caretPositionFromPoint) {
                    const cp = document.caretPositionFromPoint(e.clientX, e.clientY);
                    if (cp) { domNode = cp.offsetNode; domOffset = cp.offset; }
                } else if (document.caretRangeFromPoint) {
                    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                    if (range) { domNode = range.startContainer; domOffset = range.startOffset; }
                }

                if (!domNode || !resScreen.contains(domNode)) {
                    cursorPos = currentInput.length;
                    updateDisplay();
                    return;
                }

                let rawPos = 0;
                let found = false;

                function walkNodes(node) {
                    if (found) return;
                    if (node.nodeType === Node.TEXT_NODE) {
                        const len = node.textContent.length;
                        if (node === domNode) {
                            rawPos += domOffset;
                            found = true;
                        } else {
                            rawPos += len;
                        }
                    } else if (node.tagName === 'SUP') {
                        const supText = node.textContent;
                        if (node.contains(domNode)) {
                            rawPos += 1;
                            for (const child of node.childNodes) {
                                if (found) break;
                                if (child.nodeType === Node.TEXT_NODE) {
                                    if (child === domNode) {
                                        rawPos += domOffset;
                                        found = true;
                                    } else {
                                        rawPos += child.textContent.length;
                                    }
                                }
                            }
                            if (!found) { rawPos += supText.length; found = true; }
                        } else {
                            rawPos += 1 + supText.length;
                        }
                    } else {
                        for (const child of node.childNodes) walkNodes(child);
                    }
                }

                for (const child of resScreen.childNodes) {
                    if (found) break;
                    if (child.classList && child.classList.contains('formula-cursor')) continue;
                    if (child.classList && (child.classList.contains('existing-digits') || child.classList.contains('new-digit'))) {
                        for (const inner of child.childNodes) { if (!found) walkNodes(inner); }
                    } else {
                        walkNodes(child);
                    }
                }

                cursorPos = Math.max(0, Math.min(rawPos, currentInput.length));
                updateDisplay();
            });
        }

        ['TWD', 'JPY', 'USD', 'KRW', 'EUR', 'CNY', 'MYR', 'SGD', 'AUD', 'VND', 'THB'].forEach(code => {
            const input = document.getElementById(`tax-input-${code}`);
            if (input) input.addEventListener('change', (e) => updateTaxRate(code, e.target.value));

            const rateInput = document.getElementById(`rate-input-${code}`);
            if (rateInput) rateInput.addEventListener('change', (e) => updateCustomRate(code, e.target.value));
        });

        attachSmartTap(document.getElementById('refresh-rate-btn'), () => fetchRates(true));
        attachSmartTap(document.getElementById('btn-settings-done'), (e) => toggleMenu('settings', e));

        // 歷史紀錄雙模式分頁切換 (記帳紀錄 vs 商務紀錄)
        const tabAccounting = document.getElementById('tab-history-accounting');
        const tabBusiness = document.getElementById('tab-history-business');
        if (tabAccounting && tabBusiness) {
            attachSmartTap(tabAccounting, () => {
                triggerVibration(false);
                currentHistoryMode = 'accounting';
                tabAccounting.classList.add('active');
                tabBusiness.classList.remove('active');
                renderHistory();
            });
            attachSmartTap(tabBusiness, () => {
                triggerVibration(false);
                currentHistoryMode = 'business';
                tabBusiness.classList.add('active');
                tabAccounting.classList.remove('active');
                renderHistory();
            });
        }

        attachSmartTap(document.getElementById('history-container'), (e, item) => {
            openHistoryModal(parseInt(item.dataset.index), e);
        }, { selector: '.history-item' });
        
        attachSmartTap(document.getElementById('btn-history-clear'), () => {
            triggerVibration();
            document.getElementById('confirm-clear-modal').classList.add('show');
        });
        attachSmartTap(document.getElementById('btn-history-done'), (e) => toggleMenu('history', e));
        attachSmartTap(document.getElementById('btn-ai-scan-close'), (e) => toggleMenu('ai-scan', e));
        attachSmartTap(document.getElementById('btn-ai-scan-settings-back'), () => navigateSubMenu('ai-scan-settings-menu', 'settings-menu', 'backward'));

        attachSmartTap(document.getElementById('history-modal'), closeHistoryModal);
        document.getElementById('history-modal-card').addEventListener('pointerdown', (e) => e.stopPropagation());
        document.querySelectorAll('#history-modal-card .modal-btn').forEach(btn => {
            attachSmartTap(btn, () => {
                const action = btn.dataset.action;
                if (action === 'cancel') closeHistoryModal();
                else applyHistoryOption(action);
            });
        });

        attachSmartTap(document.getElementById('confirm-clear-modal'), () => {
            document.getElementById('confirm-clear-modal').classList.remove('show');
        });
        document.getElementById('confirm-modal-card').addEventListener('pointerdown', (e) => e.stopPropagation());
        document.querySelectorAll('#confirm-modal-card .alert-btn').forEach(btn => {
            attachSmartTap(btn, () => {
                const action = btn.dataset.action;
                if (action === 'confirm-clear') {
                    triggerVibration();
                    calcHistory = [];
                    localStorage.setItem(KEY_HISTORY, JSON.stringify([]));
                    deleteFromIDB(KEY_HISTORY);
                    renderHistory();
                    document.getElementById('confirm-clear-modal').classList.remove('show');
                    toggleMenu('history');
                    showToastMsg(I18N[currentLang].toastHistoryCleared);
                } else if (action === 'cancel-clear') {
                    triggerVibration();
                    document.getElementById('confirm-clear-modal').classList.remove('show');
                }
            });
        });

        attachSmartTap(document.getElementById('confirm-reset-modal'), () => {
            document.getElementById('confirm-reset-modal').classList.remove('show');
        });
        document.getElementById('confirm-reset-card').addEventListener('pointerdown', (e) => e.stopPropagation());
        document.querySelectorAll('#confirm-reset-card .alert-btn').forEach(btn => {
            attachSmartTap(btn, () => {
                const action = btn.dataset.action;
                if (action === 'confirm-reset') {
                    resetAllSettings();
                    document.getElementById('confirm-reset-modal').classList.remove('show');
                } else if (action === 'cancel-reset') {
                    triggerVibration();
                    document.getElementById('confirm-reset-modal').classList.remove('show');
                }
            });
        });

        attachSmartTap(window, (e) => {
            resetInactivityTimer();
            const headerArea = document.getElementById('header-area');
            const capsule = document.getElementById('top-capsule');
            if (headerArea && !headerArea.classList.contains('collapsed')) {
                if (capsule && !capsule.contains(e.target) && !e.target.closest('.action-bar') && !e.target.closest('.overlay-menu')) {
                    setCapsuleCollapsed(true);
                }
            }
        });
        window.addEventListener('mousemove', resetInactivityTimer);
        window.addEventListener('keydown', resetInactivityTimer);
        window.addEventListener('touchstart', resetInactivityTimer);

        attachSmartTap(document.getElementById('top-capsule'), (e) => {
            const headerArea = document.getElementById('header-area');
            if (headerArea) {
                if (headerArea.classList.contains('collapsed')) {
                    if (e.target.closest('#tax-btn')) return;
                    e.stopPropagation();
                    e.preventDefault();
                    setCapsuleCollapsed(false);
                    resetInactivityTimer();
                } else {
                    const isInteractive = e.target.closest('.dropdown-trigger') || 
                                          e.target.closest('.dropdown-options') || 
                                          e.target.closest('#btn-swap') || 
                                          e.target.closest('#tax-btn') || 
                                          e.target.closest('#same-currency-label');
                    if (!isInteractive) {
                        e.stopPropagation();
                        e.preventDefault();
                        setCapsuleCollapsed(true);
                    }
                }
            }
        });

        /* 監聽視窗尺寸改變 */
        window.addEventListener('resize', () => {
            autoScaleText('result-scaler', 'result-wrapper');
            autoScaleText('formula-scaler', 'formula-wrapper');
            autoScaleText('converted-scaler', 'converted-wrapper');
            updateGliders();
        });
    }

    let waitingServiceWorker = null;

    window.addEventListener('DOMContentLoaded', () => {
        if (typeof DOM !== 'undefined' && DOM.init) DOM.init();
        renderCurrencyUI();

        const isSupportedProtocol = location.protocol === 'https:' || location.protocol === 'http:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if ('serviceWorker' in navigator && isSupportedProtocol) {
            navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            waitingServiceWorker = newWorker;
                            const banner = document.getElementById('pwa-update-banner');
                            if (banner) banner.classList.add('show');
                        }
                    });
                });

                if (reg.waiting && navigator.serviceWorker.controller) {
                    waitingServiceWorker = reg.waiting;
                    const banner = document.getElementById('pwa-update-banner');
                    if (banner) banner.classList.add('show');
                }
            }).catch((err) => console.warn('[Service Worker] Registration failed:', err));

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });

            const updateBtn = document.getElementById('pwa-update-btn');
            if (updateBtn) {
                attachSmartTap(updateBtn, () => {
                    triggerVibration(false);
                    if (waitingServiceWorker) {
                        waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
                    } else {
                        window.location.reload();
                    }
                });
            }
        }

        if (localStorage.getItem(KEY_LIGHT_MODE) === 'true') {
            document.body.classList.add('light-mode');
            document.getElementById('theme-toggle').checked = true;
        }

        if (localStorage.getItem(KEY_HAPTIC) !== null) {
            document.getElementById('haptic-toggle').checked = (localStorage.getItem(KEY_HAPTIC) === 'true');
        }

        if (localStorage.getItem(KEY_CATEGORY_BUBBLE) !== null) {
            const catToggle = document.getElementById('category-bubble-toggle');
            if (catToggle) catToggle.checked = (localStorage.getItem(KEY_CATEGORY_BUBBLE) !== 'false');
        }

        document.getElementById('decimal-display').textContent = decimals;

        // 初始化大數字顯示模式按鈕狀態
        document.querySelectorAll('.number-format-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.format === largeNumberFormat);
        });

        const isFirstTimeUser = (localStorage.getItem(KEY_CURRENCY_FROM) === null);

        setLanguage(currentLang);
        setFontStyle(fontStyle);

        Object.keys(customTaxRates).forEach(k => {
            const el = document.getElementById(`tax-input-${k}`);
            if (el) el.value = customTaxRates[k];
        });

        initEvents();
        updateMemoryIndicator();
        updateCategorySummaryVisibility();
        renderThemePalette();
        fetchRates();
        
        checkSameCurrency();
        updateDisplay();
        updateHistoryButtonUI();
        resetInactivityTimer();
        setTimeout(updateGliders, 80);

        detectLocationCurrency(isFirstTimeUser).then(() => {
            checkSameCurrency();
            updateDisplay();
            const headerArea = document.getElementById('header-area');
            if (currentFrom === currentTo) {
                if (inactivityTimer) clearTimeout(inactivityTimer);
                if (headerArea) setCapsuleCollapsed(true, { animate: false });
            }
        });
        
        setupDragToScroll('result-wrapper');
        setupDragToScroll('formula-wrapper');
        setupDragToScroll('converted-wrapper');

        setupCopyFeature('result-wrapper', () => isEvaluated ? document.getElementById('result-screen').textContent.replace(/,/g, '') : currentInput, 'toastResultCopied');
        setupCopyFeature('formula-wrapper', () => {
            let formulaText = document.getElementById('formula-screen').textContent;
            return formulaText ? formulaText.replace(' =', '') : null;
        }, 'toastFormulaCopied');

        setupToastSwipeDismiss();

        // 通用 PWA Install Prompt 邏輯 (支援 Android, iOS 及 Desktop)
        const setupInstallPrompt = () => {
            const prompt = document.getElementById('ios-install-prompt');
            const closeBtn = document.getElementById('ios-prompt-close');
            if (!prompt || !closeBtn) return;

            let deferredPrompt = null;
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && window.navigator.standalone);
            const isDismissed = localStorage.getItem('app_pwa_prompt_dismissed') === 'true';
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            // 監聽 Android/Chrome 的原生的安裝事件
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                if (!isStandalone && !isDismissed) {
                    setTimeout(() => { prompt.classList.add('show'); }, 2000);
                }
            });

            // 只有當確定是 iOS 裝置、非 Standalone 模式、未關閉過且未收到原生安裝事件時，才彈出 iOS 安裝教學
            if (!isStandalone && !isDismissed && isIOS) {
                setTimeout(() => {
                    if (!prompt.classList.contains('show') && !deferredPrompt) {
                        prompt.classList.add('show');
                    }
                }, 3000);
            }

            // 點擊彈窗主體：如果是在支援原生觸發安裝的瀏覽器 (Android/Chrome)，記錄點擊觸發系統安裝
            attachSmartTap(prompt, (e) => {
                if (e.target === closeBtn || closeBtn.contains(e.target)) return;
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choiceResult) => {
                        if (choiceResult.outcome === 'accepted') {
                            prompt.classList.remove('show');
                        }
                        deferredPrompt = null;
                    });
                }
            });

            attachSmartTap(closeBtn, (e) => {
                e.stopPropagation();
                triggerVibration();
                prompt.classList.remove('show');
                localStorage.setItem('app_pwa_prompt_dismissed', 'true');
            });
        };
        // 智慧日期時間解析輔助函數 (支援西元年、民國年、中文年月日/時分秒與 ISO 格式)
        function parseInvoiceDateToISO(customTimestamp) {
            if (!customTimestamp) return new Date().toISOString();
            if (customTimestamp instanceof Date) {
                return !isNaN(customTimestamp.getTime()) ? customTimestamp.toISOString() : new Date().toISOString();
            }

            let str = String(customTimestamp).trim();
            if (!str) return new Date().toISOString();

            // 1. 檢查民國年格式 (如 113/09/18, 113-09-18, 1130918, 113年9月18日)
            const rocMatch = str.match(/^(1\d{2})[./\-\s年]?(\d{1,2})[./\-\s月]?(\d{1,2})(?:[日\s]*(\d{1,2})[.:點]?(\d{1,2})?(?:[.:秒]?(\d{1,2}))?)?/);
            if (rocMatch) {
                const year = parseInt(rocMatch[1], 10) + 1911;
                const month = parseInt(rocMatch[2], 10) - 1;
                const day = parseInt(rocMatch[3], 10);
                const hour = rocMatch[4] !== undefined ? parseInt(rocMatch[4], 10) : 12;
                const min = rocMatch[5] !== undefined ? parseInt(rocMatch[5], 10) : 0;
                const sec = rocMatch[6] !== undefined ? parseInt(rocMatch[6], 10) : 0;
                const d = new Date(year, month, day, hour, min, sec);
                if (!isNaN(d.getTime())) return d.toISOString();
            }

            // 2. 處理西元年中文或分隔號 (如 2024年09月18日 14點30分50秒 -> 2024-09-18 14:30:50)
            let cleaned = str
                .replace(/年|月/g, '-')
                .replace(/日/g, ' ')
                .replace(/點|時/g, ':')
                .replace(/分/g, ':')
                .replace(/秒/g, '')
                .trim();

            // 3. 西元年匹配 YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD
            const ymdMatch = cleaned.match(/^(\d{4})[./\-\s](\d{1,2})[./\-\s](\d{1,2})(?:\s+(\d{1,2})[.:](\d{1,2})(?:[.:](\d{1,2}))?)?/);
            if (ymdMatch) {
                const year = parseInt(ymdMatch[1], 10);
                const month = parseInt(ymdMatch[2], 10) - 1;
                const day = parseInt(ymdMatch[3], 10);
                const now = new Date();
                const hour = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : now.getHours();
                const min = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : now.getMinutes();
                const sec = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : now.getSeconds();
                const d = new Date(year, month, day, hour, min, sec);
                if (!isNaN(d.getTime())) return d.toISOString();
            }

            // 4. iOS / Cross-browser safe ISO format (Replace space with 'T')
            const isoClean = str.replace(' ', 'T');
            let d = new Date(isoClean);
            if (!isNaN(d.getTime())) {
                return d.toISOString();
            }

            d = new Date(str);
            if (!isNaN(d.getTime())) {
                return d.toISOString();
            }

            return new Date().toISOString();
        }

        // Expose global helper for AI Scan module
        window.addScannedRecordToHistory = function (name, amount, customTimestamp, category, extraData) {
            if (Array.isArray(calcHistory)) {
                const itemTime = parseInvoiceDateToISO(customTimestamp);
                const itemCat = category || 'other';
                const extra = extraData || {};
                const recObj = {
                    formula: name || '發票明細商品',
                    result: amount,
                    category: itemCat,
                    timestamp: itemTime,
                    addedAt: new Date().toISOString(),
                    currencyFrom: extra.origCurrency || currentFrom,
                    currencyTo: currentTo,
                    convertedResult: extra.twdAmount !== undefined ? extra.twdAmount : amount,
                    nameForeign: extra.nameForeign || name || '',
                    rateToTWD: extra.rateToTWD || 1,
                    location: extra.location || ''
                };
                if (Array.isArray(extra.items) && extra.items.length > 0) {
                    recObj.items = extra.items;
                }
                calcHistory.unshift(recObj);
                if (calcHistory.length > 50) calcHistory.pop();
                try {
                    saveHistoryStorage();
                } catch (e) {
                    console.error('Save history error:', e);
                }
                if (typeof renderHistory === 'function') {
                    renderHistory();
                }
            }
        };
        window.addScannedReceiptToHistory = window.addScannedRecordToHistory;
        window.showToastMsg = typeof showToastMsg === 'function' ? showToastMsg : function(msg) { alert(msg); };
        window.toggleMenu = toggleMenu;
        window.updateGliders = updateGliders;

        // 🎙️ 人性化 Google 助理 / URL 語音捷徑記帳解析引擎
        function handleVoiceUrlParams() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                // 支援多種常見參數名：item / name / note / memo / text / desc
                const rawItem = urlParams.get('item') || urlParams.get('name') || urlParams.get('note') || urlParams.get('memo') || urlParams.get('text') || urlParams.get('desc') || '';
                // 支援多種常見金額參數名：amount / price / cost / val / num
                const rawAmount = urlParams.get('amount') || urlParams.get('price') || urlParams.get('cost') || urlParams.get('val') || urlParams.get('num') || '';
                const rawCat = urlParams.get('category') || urlParams.get('cat') || '';

                if (!rawItem && !rawAmount) return;

                let itemName = rawItem.trim();
                let amountVal = null;
                let category = 'other';

                // 1. 如果從語音輸入混在一起（例如 item=午餐120 或 item=120元午餐）
                if (!rawAmount && itemName) {
                    const matchNum = itemName.match(/(\d+(?:\.\d+)?)/);
                    if (matchNum) {
                        amountVal = parseFloat(matchNum[1]);
                        // 清理品名中的數字與「元/塊/塊錢」
                        itemName = itemName.replace(matchNum[1], '').replace(/元|塊錢|塊/g, '').trim();
                    }
                } else if (rawAmount) {
                    const numMatch = String(rawAmount).match(/(\d+(?:\.\d+)?)/);
                    if (numMatch) {
                        amountVal = parseFloat(numMatch[1]);
                    }
                }

                if (!itemName) itemName = '語音速記';
                if (amountVal === null || isNaN(amountVal) || amountVal <= 0) return;

                // 2. 人性化分類自動推論
                const lowerCat = rawCat.toLowerCase();
                if (lowerCat.includes('food') || lowerCat.includes('食') || lowerCat.includes('餐') || /午餐|晚餐|早餐|飲料|咖啡|便當|麵|飯|小吃|餐廳|宵夜|點心|水果|奶茶/.test(itemName)) {
                    category = 'food';
                } else if (lowerCat.includes('shop') || lowerCat.includes('購') || /買|衣服|鞋|超市|超商|全家|7-11|藥妝|玩具|日用品|禮物/.test(itemName)) {
                    category = 'shopping';
                } else if (lowerCat.includes('trans') || lowerCat.includes('行') || /車|捷運|公車|高鐵|計程車|Uber|加油|停車|機車|路邊/.test(itemName)) {
                    category = 'transport';
                } else if (rawCat) {
                    category = rawCat;
                }

                // 3. 自動寫入歷史紀錄
                const formattedRes = amountVal.toString();
                calcHistory.unshift({
                    formula: itemName,
                    result: formattedRes,
                    category: category,
                    timestamp: new Date().toISOString(),
                    currencyFrom: currentFrom,
                    currencyTo: currentTo,
                    convertedResult: lastValidConvertedValue || amountVal,
                    isTaxExcluded: isTaxExcluded,
                    taxRate: customTaxRates[currentFrom] || 0
                });
                if (calcHistory.length > 50) calcHistory.pop();
                saveHistoryStorage();
                if (typeof updateHistoryButtonUI === 'function') updateHistoryButtonUI();
                if (typeof renderHistory === 'function') renderHistory();

                // 4. 超親切人性化 Toast 提示與音效觸覺回饋
                setTimeout(() => {
                    triggerVibration(false);
                    const catEmoji = category === 'food' ? '🍜' : (category === 'shopping' ? '🛍️' : (category === 'transport' ? '🚗' : '🏷️'));
                    showToastMsg(`🎙️ 助理已為您記帳：${itemName} ${catEmoji} $${amountVal}`);
                }, 300);

                // 5. 潔癖式清理 URL（移除 query string，避免使用者重新整理網頁時重複記帳）
                if (window.history && window.history.replaceState) {
                    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
                }
            } catch (err) {
                console.error('Voice URL parsing error:', err);
            }
        }

        // 觸發 URL 語音參數檢測
        setTimeout(handleVoiceUrlParams, 500);

        // 🎙️ 點擊頂部語音按鈕 (#btn-voice-rec)：啟動瀏覽器原生 Web Speech API 語音辨識與實時對話框 Modal
        const voiceBtn = document.getElementById('btn-voice-rec');
        const voiceModal = document.getElementById('voice-modal');
        const voiceInputItem = document.getElementById('voice-input-item');
        const voiceInputAmount = document.getElementById('voice-input-amount');
        const voiceHint = document.getElementById('voice-parsed-hint');
        const voiceCancelBtn = document.getElementById('btn-voice-modal-cancel');
        const voiceConfirmBtn = document.getElementById('btn-voice-modal-confirm');
        const voiceCatChips = document.querySelectorAll('.voice-cat-chip');

        let selectedVoiceCategory = 'food';

        if (voiceCatChips) {
            voiceCatChips.forEach(chip => {
                attachSmartTap(chip, () => {
                    triggerVibration(false);
                    voiceCatChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    selectedVoiceCategory = chip.dataset.cat || 'other';
                });
            });
        }

        if (voiceBtn) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            let recognition = null;
            let isRecognizing = false;
            let activeAudioStream = null;

            function closeVoiceModal() {
                isRecognizing = false;
                if (voiceModal) voiceModal.classList.remove('show');
                if (voiceBtn) voiceBtn.classList.remove('is-listening');
                if (activeAudioStream) {
                    activeAudioStream.getTracks().forEach(t => t.stop());
                    activeAudioStream = null;
                }
                if (recognition) {
                    try { recognition.abort(); } catch(e) {}
                }
            }

            if (voiceCancelBtn) {
                attachSmartTap(voiceCancelBtn, () => {
                    triggerVibration(false);
                    closeVoiceModal();
                });
            }

            if (voiceConfirmBtn) {
                attachSmartTap(voiceConfirmBtn, () => {
                    triggerVibration(false);
                    const itemVal = voiceInputItem ? voiceInputItem.value.trim() : '';
                    const amtVal = voiceInputAmount ? parseFloat(voiceInputAmount.value) : NaN;

                    if (!itemVal && (isNaN(amtVal) || amtVal <= 0)) {
                        showToastMsg("⚠️ 請輸入或語音說明品名與金額");
                        return;
                    }

                    const finalItem = itemVal || '語音速記';
                    const finalAmt = isNaN(amtVal) ? 0 : amtVal;

                    // 直接寫入歷史紀錄
                    calcHistory.unshift({
                        formula: finalItem,
                        result: finalAmt.toString(),
                        category: selectedVoiceCategory,
                        timestamp: new Date().toISOString(),
                        currencyFrom: currentFrom,
                        currencyTo: currentTo,
                        convertedResult: lastValidConvertedValue || finalAmt,
                        isTaxExcluded: isTaxExcluded,
                        taxRate: customTaxRates[currentFrom] || 0
                    });
                    if (calcHistory.length > 50) calcHistory.pop();
                    saveHistoryStorage();
                    if (typeof updateHistoryButtonUI === 'function') updateHistoryButtonUI();
                    if (typeof renderHistory === 'function') renderHistory();

                    const catEmoji = selectedVoiceCategory === 'food' ? '🍜' : (selectedVoiceCategory === 'shopping' ? '🛍️' : (selectedVoiceCategory === 'transport' ? '🚗' : '🏷️'));
                    showToastMsg(`🎙️ 已記帳：${finalItem} ${catEmoji} $${finalAmt}`);
                    closeVoiceModal();
                });
            }

            function startVoiceRecognition() {
                if (!SpeechRecognition) {
                    triggerVibration(true);
                    showToastMsg("⚠️ 您的瀏覽器不支援本機語音辨識（請使用 Chrome 或 Edge）");
                    return;
                }

                try {
                    if (recognition) {
                        try { recognition.abort(); } catch(e) {}
                    }
                    recognition = new SpeechRecognition();
                    recognition.lang = currentLang === 'zh' ? 'zh-TW' : 'en-US';
                    recognition.continuous = true;
                    recognition.interimResults = true;

                    recognition.onstart = () => {
                        isRecognizing = true;
                        triggerVibration(false);
                        voiceBtn.classList.add('is-listening');
                        if (voiceInputItem) voiceInputItem.value = '';
                        if (voiceInputAmount) voiceInputAmount.value = '';
                        if (voiceHint) voiceHint.textContent = I18N[currentLang].voiceListeningHint || "🎙️ 正在即時收音辨識中...";
                        
                        // 自動以 IP 定位為主、GPS 定位為輔動態更新金額後方之幣別標籤
                        const voiceCurrTag = document.getElementById('voice-currency-tag');
                        if (voiceCurrTag) {
                            voiceCurrTag.textContent = currentFrom || 'TWD';
                            fetchUnifiedLocationAndCurrency((meta) => {
                                if (meta && meta.currency) {
                                    voiceCurrTag.textContent = meta.currency;
                                }
                            });
                        }

                        if (voiceModal) voiceModal.classList.add('show');
                    };

                    recognition.onresult = (event) => {
                        let interimTranscript = '';
                        let finalTranscript = '';

                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                            const trans = event.results[i][0].transcript;
                            if (event.results[i].isFinal) {
                                finalTranscript += trans;
                            } else {
                                interimTranscript += trans;
                            }
                        }

                        const currentText = (finalTranscript + ' ' + interimTranscript).trim();
                        if (currentText) {
                            // 即時拆解品名與金額帶入編輯框
                            const matchNum = currentText.match(/(\d+(?:\.\d+)?)/);
                            if (matchNum) {
                                const amt = parseFloat(matchNum[1]);
                                const itemName = currentText.replace(matchNum[1], '').replace(/元|塊錢|塊/g, '').trim() || '語音速記';
                                if (voiceInputItem) voiceInputItem.value = itemName;
                                if (voiceInputAmount) voiceInputAmount.value = amt;

                                // 推論分類
                                if (/午餐|晚餐|早餐|飲料|咖啡|便當|麵|飯|小吃|餐廳|宵夜|點心|水果|奶茶/.test(itemName)) {
                                    selectedVoiceCategory = 'food';
                                } else if (/買|衣服|鞋|超市|超商|全家|7-11|藥妝|玩具|日用品|禮物/.test(itemName)) {
                                    selectedVoiceCategory = 'shopping';
                                } else if (/車|捷運|公車|高鐵|計程車|Uber|加油|停車|機車|路邊/.test(itemName)) {
                                    selectedVoiceCategory = 'transport';
                                }
                                if (voiceCatChips) {
                                    voiceCatChips.forEach(c => {
                                        c.classList.toggle('active', c.dataset.cat === selectedVoiceCategory);
                                    });
                                }

                                if (voiceHint) voiceHint.textContent = `✨ 已自動辨識帶入，可點擊上方輸入框修改`;
                            } else {
                                if (voiceInputItem) voiceInputItem.value = currentText;
                                if (voiceHint) voiceHint.textContent = `🗣️ 語音辨識中：${currentText}`;
                            }
                        }
                    };

                    recognition.onerror = (event) => {
                        console.warn('Speech recognition error:', event.error);
                        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                            triggerVibration(true);
                            if (voiceHint) voiceHint.textContent = "⚠️ 請在瀏覽器允許「麥克風」權限";
                            showToastMsg("⚠️ 請允許瀏覽器存取麥克風權限");
                        } else if (event.error === 'no-speech') {
                            if (voiceHint) voiceHint.textContent = "⚠️ 未聽見聲音，講完可直接於上方輸入框點擊修改";
                        } else if (event.error === 'network') {
                            if (voiceHint) voiceHint.textContent = "⚠️ 語音連線超時，講完可直接於上方輸入框點擊修改";
                        }
                    };

                    recognition.onend = () => {
                        if (isRecognizing && lastRecognizedText && voiceModal && voiceModal.classList.contains('show')) {
                            const urlParams = new URLSearchParams();
                            urlParams.set('item', lastRecognizedText);
                            window.history.replaceState({}, '', window.location.pathname + '?' + urlParams.toString());
                            handleVoiceUrlParams();
                            setTimeout(closeVoiceModal, 1200);
                        } else {
                            voiceBtn.classList.remove('is-listening');
                        }
                    };

                    recognition.start();
                } catch(err) {
                    console.error('Speech Recognition start failed:', err);
                    showToastMsg("⚠️ 語音辨識啟動失敗，請重新點擊");
                }
            }

            attachSmartTap(voiceBtn, () => {
                if (voiceModal && voiceModal.classList.contains('show')) {
                    closeVoiceModal();
                } else {
                    // 先請求麥克風權限（針對電腦版 Chrome 防堵權限阻擋）
                    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                            // 取得權限後立即關閉臨時串流，並開啟 SpeechRecognition
                            stream.getTracks().forEach(t => t.stop());
                            startVoiceRecognition();
                        }).catch(err => {
                            console.warn('Microphone permission denied:', err);
                            triggerVibration(true);
                            showToastMsg("⚠️ 請在網址列左側鎖頭開啟「麥克風」權限");
                        });
                    } else {
                        startVoiceRecognition();
                    }
                }
            });
        }

    }); // DOMContentLoaded

