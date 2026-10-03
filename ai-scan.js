/**
 * ════════════════════════════════════════════════════════
 * AI 發票掃描記帳模組 (ai-scan.js)
 * 特色：
 *  1. 預設極速記帳：Gemini 2.0 Flash Lite 辨識發票/收據品名、金額與數量 (1.5 秒完成)
 *  2. 內建免費 Key：開箱即用，無須設定
 *  3. 一鍵全匯入：自動寫入主計算機歷史紀錄與統計
 * ════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // 預設 API Key
    const DEFAULT_GEMINI_KEY = (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_GEMINI_KEY) ? window.APP_CONFIG.DEFAULT_GEMINI_KEY : "AQ.Ab8RN6KQyM0UlbFHZvkHmqZS1YUzHlh5LCs5vEMPSunb73q9pQ";

    // 全局狀態
    let uploadedImages = []; // [base64DataUrl, ...]
    let activeImageIndex = 0;
    let scannedItems = []; // [{ name, price, count }]
    let currentGpsLocation = null; // { lat, lng, locationName, currency, flag, symbol }
    let lastRenderedData = null; // 保存當前發票完整辨識資訊 (店家、日期、幣別等)

    function detectCurrencyFromCoords(lat, lng) {
        if (lat >= 24 && lat <= 46 && lng >= 122 && lng <= 154) {
            return { locationName: "東京, 日本", currency: "JPY", flag: "🇯🇵", symbol: "¥" };
        }
        if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 131) {
            return { locationName: "首爾, 韓國", currency: "KRW", flag: "🇰🇷", symbol: "₩" };
        }
        if (lat >= 35 && lat <= 70 && lng >= -10 && lng <= 30) {
            return { locationName: "歐洲 (歐元區)", currency: "EUR", flag: "🇪🇺", symbol: "€" };
        }
        if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) {
            return { locationName: "美國", currency: "USD", flag: "🇺🇸", symbol: "$" };
        }
        if (lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106) {
            return { locationName: "曼谷, 泰國", currency: "THB", flag: "🇹🇭", symbol: "฿" };
        }
        if (lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110) {
            return { locationName: "胡志明市, 越南", currency: "VND", flag: "🇻🇳", symbol: "₫" };
        }
        if (lat >= 1.1 && lat <= 1.5 && lng >= 103.5 && lng <= 104.1) {
            return { locationName: "新加坡", currency: "SGD", flag: "🇸🇬", symbol: "S$" };
        }
        if (lat >= 1 && lat <= 7 && lng >= 99 && lng <= 119) {
            return { locationName: "吉隆坡, 馬來西亞", currency: "MYR", flag: "🇲🇾", symbol: "RM" };
        }
        if (lat <= -10 && lat >= -44 && lng >= 112 && lng <= 154) {
            return { locationName: "雪梨, 澳洲", currency: "AUD", flag: "🇦🇺", symbol: "A$" };
        }
        if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) {
            return { locationName: "中國", currency: "CNY", flag: "🇨🇳", symbol: "¥" };
        }
        if (lat >= 21.8 && lat <= 25.3 && lng >= 119.5 && lng <= 122.5) {
            return { locationName: "台灣", currency: "TWD", flag: "🇹🇼", symbol: "NT$" };
        }
        return { locationName: "國外目的地", currency: "USD", flag: "🌐", symbol: "$" };
    }

    function fetchGpsLocation() {
        const statusEl = document.getElementById('ai-gps-status-text');
        const lang = localStorage.getItem('calc_lang') || 'en';
        const locatingText = (window.I18N && window.I18N[lang] && window.I18N[lang].gpsLocating) 
            ? window.I18N[lang].gpsLocating 
            : (lang === 'zh' ? '定位中...' : 'Locating...');
            
        if (statusEl) statusEl.textContent = locatingText;
        
        if (typeof window.fetchUnifiedLocationAndCurrency === 'function') {
            window.fetchUnifiedLocationAndCurrency((meta) => {
                if (meta) {
                    currentGpsLocation = meta;
                    if (statusEl) {
                        const locName = meta.locationName || (lang === 'zh' ? '未知' : 'Unknown');
                        const currStr = meta.currency ? ` (${meta.currency})` : '';
                        statusEl.textContent = `${locName}${currStr}`;
                    }
                }
            });
        }
    }
    window.fetchGpsLocation = fetchGpsLocation;

    // DOM 元素快取
    const elements = {
        btnScanOpen: null,
        scanMenu: null,
        uploadZone: null,
        uploadInput: null,
        previewImg: null,
        previewActions: null,
        retakeBtn: null,
        recognizeBtn: null,
        previewWrap: null,
        errorBox: null,
        itemsSection: null,
        storeTagWrap: null,
        itemsList: null,
        totalRow: null,
        totalAmount: null,
        importAllBtn: null,
        importBtnGroup: null,
        importItemsBtn: null,
        scanCloseBtn: null
    };

    function initElements() {
        elements.btnScanOpen = document.getElementById('btn-ai-scan');
        elements.scanMenu = document.getElementById('ai-scan-menu');
        elements.uploadZone = document.getElementById('ai-upload-zone');
        elements.uploadInput = document.getElementById('ai-upload-input');
        elements.previewImg = document.getElementById('ai-preview-img');
        elements.previewActions = document.getElementById('ai-preview-actions');
        elements.retakeBtn = document.getElementById('ai-retake-btn');
        elements.recognizeBtn = document.getElementById('ai-recognize-btn');
        elements.previewWrap = document.getElementById('ai-preview-wrap');
        elements.errorBox = document.getElementById('ai-error-box');
        elements.itemsSection = document.getElementById('ai-items-section');
        elements.storeTagWrap = document.getElementById('ai-store-tag-wrap');
        elements.itemsList = document.getElementById('ai-items-list');
        elements.totalRow = document.getElementById('ai-total-row');
        elements.totalAmount = document.getElementById('ai-total-amount');
        elements.importAllBtn = document.getElementById('ai-import-all-btn');
        elements.importBtnGroup = document.getElementById('ai-import-btn-group');
        elements.importItemsBtn = document.getElementById('ai-import-items-btn');
        elements.scanCloseBtn = document.getElementById('btn-ai-scan-close');
    }

    function toggleImportBtnGroup(show) {
        if (elements.importBtnGroup) {
            elements.importBtnGroup.style.display = show ? 'flex' : 'none';
        } else if (elements.importAllBtn) {
            elements.importAllBtn.style.display = show ? 'flex' : 'none';
        }
    }

    // 取得相片辨識品質設定
    function getQualitySetting() {
        return localStorage.getItem('calc_ai_scan_quality') || 'medium';
    }

    function setQualitySetting(quality) {
        localStorage.setItem('calc_ai_scan_quality', quality);
    }

    function getQualityParams() {
        const q = getQualitySetting();
        if (q === 'low') {
            return { maxDim: 1024, quality: 0.75 };
        } else if (q === 'high') {
            return { maxDim: 2400, quality: 0.92 };
        }
        return { maxDim: 1600, quality: 0.85 };
    }

    // 取得 Gemini API Key (優先讀取使用者自訂 Key，若未設定則自動啟用預設內建 Key)
    function getGeminiKey() {
        const customKey = localStorage.getItem('calc_gemini_api_key');
        return (customKey && customKey.trim()) ? customKey.trim() : DEFAULT_GEMINI_KEY;
    }

    // 更新設定選單中的 Gemini API Key UI 狀態
    function updateGeminiKeyUI() {
        const keyInput = document.getElementById('ai-gemini-key-input');
        const keyStatus = document.getElementById('ai-gemini-key-status');
        const keyClearBtn = document.getElementById('ai-gemini-key-clear');
        const customKey = localStorage.getItem('calc_gemini_api_key');

        if (keyInput && document.activeElement !== keyInput) {
            keyInput.value = customKey || "";
        }

        if (keyStatus) {
            if (customKey) {
                keyStatus.className = 'ai-key-status active';
                keyStatus.textContent = `✅ 已啟用自訂 API Key (${customKey})`;
                if (keyClearBtn) keyClearBtn.style.display = 'inline-block';
            } else if (DEFAULT_GEMINI_KEY) {
                keyStatus.className = 'ai-key-status active';
                keyStatus.textContent = '⚡ 已開箱即用啟用預設 API Key (亦可輸入自訂 Key 覆蓋)';
                if (keyClearBtn) keyClearBtn.style.display = 'none';
            } else {
                keyStatus.className = 'ai-key-status';
                keyStatus.textContent = 'ℹ️ 請輸入並儲存您的 Gemini API Key';
                if (keyClearBtn) keyClearBtn.style.display = 'none';
            }
        }
    }
    window.updateGeminiKeyUI = updateGeminiKeyUI;

    function bindGeminiKeyEvents() {
        const keyInput = document.getElementById('ai-gemini-key-input');
        const keySaveBtn = document.getElementById('ai-gemini-key-save');
        const keyClearBtn = document.getElementById('ai-gemini-key-clear');

        if (keySaveBtn && keyInput) {
            keySaveBtn.addEventListener('click', () => {
                const val = keyInput.value.trim();
                if (!val) {
                    alert('請輸入有效的 Gemini API Key');
                    return;
                }
                localStorage.setItem('calc_gemini_api_key', val);
                updateGeminiKeyUI();
                if (window.showToastMsg) {
                    window.showToastMsg('✅ Gemini API Key 儲存成功！');
                } else {
                    alert('API Key 儲存成功！');
                }
            });
            keyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    keySaveBtn.click();
                }
            });
        }

        if (keyClearBtn) {
            keyClearBtn.addEventListener('click', () => {
                localStorage.removeItem('calc_gemini_api_key');
                if (keyInput) keyInput.value = '';
                updateGeminiKeyUI();
                if (window.showToastMsg) {
                    window.showToastMsg('已清除 API Key');
                }
            });
        }
    }

    // 前端 Canvas 圖片壓縮 (發票辨識的最佳平衡點：長邊不超過 1600px)
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;
                    // 🔥 發票辨識最佳平衡點：長邊不超過 1600px，大小約 300KB~600KB
                    // 既保有發票小字的清晰度，又絕不超過 Google API Gateway 緩衝區上限
                    const MAX_DIM = 1600;
                    if (w > MAX_DIM || h > MAX_DIM) {
                        if (w > h) {
                            h = Math.round((h * MAX_DIM) / w);
                            w = MAX_DIM;
                        } else {
                            w = Math.round((w * MAX_DIM) / h);
                            h = MAX_DIM;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    // quality 設為 0.8，避免產生肥大的 Base64 字串
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(dataUrl);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // 多圖庫管理：新增圖片
    function addUploadedImage(dataUrl) {
        if (!dataUrl) return;
        uploadedImages.push({ dataUrl: dataUrl, error: false });
        activeImageIndex = uploadedImages.length - 1;
        updateImageGalleryUI();
    }

    // 多圖庫管理：移除單張圖片
    function removeUploadedImage(index) {
        uploadedImages.splice(index, 1);
        if (activeImageIndex >= uploadedImages.length) {
            activeImageIndex = Math.max(0, uploadedImages.length - 1);
        }
        // 🔥 圖片刪除後同步清除辨識結果，避免總價/商品殘留
        scannedItems = [];
        if (elements.itemsSection) elements.itemsSection.classList.remove('show');
        if (elements.totalRow) elements.totalRow.style.display = 'none';
        toggleImportBtnGroup(false);
        if (elements.errorBox) elements.errorBox.classList.remove('show');
        if (elements.storeTagWrap) elements.storeTagWrap.innerHTML = '';
        if (elements.itemsList) elements.itemsList.innerHTML = '';
        updateImageGalleryUI();
    }

    // 更新多圖片畫廊 UI
    function updateImageGalleryUI() {
        const thumbsContainer = document.getElementById('ai-thumbs-container');
        const thumbsGrid = document.getElementById('ai-thumbs-grid');
        const countLabel = document.getElementById('ai-thumbs-count-label');
        const dict = getDict();

        if (uploadedImages.length === 0) {
            if (thumbsContainer) thumbsContainer.classList.remove('show');
            if (elements.previewImg) {
                elements.previewImg.src = '';
                elements.previewImg.classList.remove('show');
            }
            if (elements.previewWrap) elements.previewWrap.classList.remove('show');
            if (elements.previewActions) elements.previewActions.classList.remove('show');
            if (elements.uploadZone) {
                elements.uploadZone.classList.remove('has-image');
                elements.uploadZone.style.display = 'flex';
            }
            const actionsRow = document.querySelector('.ai-upload-actions-row');
            if (actionsRow) actionsRow.style.display = 'flex';
            if (elements.recognizeBtn) elements.recognizeBtn.disabled = true;
            return;
        }

        if (elements.previewWrap) elements.previewWrap.classList.add('show');
        if (elements.previewActions) elements.previewActions.classList.add('show');
        if (elements.uploadZone) elements.uploadZone.classList.add('has-image');
        if (elements.recognizeBtn) {
            elements.recognizeBtn.disabled = false;
            const btnLabel = elements.recognizeBtn.querySelector('.ai-btn-label');
            if (btnLabel) {
                btnLabel.textContent = uploadedImages.length > 1 ?
                    (dict.aiRecognizeAll || '掃描全部') : (dict.aiRecognize || 'AI 辨識');
            }
        }

        // 更新主預覽圖為當前選中的圖片
        const activeImg = uploadedImages[activeImageIndex] || uploadedImages[0];
        elements.previewImg.src = activeImg ? activeImg.dataUrl : '';
        elements.previewImg.classList.add('show');

        // 更新多圖計數標籤
        const selectedTemplate = dict.aiImagesSelected || '已選擇 {count} 張圖片';
        if (countLabel) {
            countLabel.textContent = selectedTemplate.replace('{count}', uploadedImages.length);
        }

        if (thumbsGrid && thumbsContainer) {
            thumbsContainer.classList.add('show');
            thumbsGrid.innerHTML = '';

            uploadedImages.forEach((imgObj, idx) => {
                const thumbItem = document.createElement('div');
                const isErr = imgObj.error ? 'error' : '';
                const isAct = idx === activeImageIndex ? 'active' : '';
                thumbItem.className = `ai-thumb-item ${isAct} ${isErr}`;
                thumbItem.innerHTML = `
                    <img src="${imgObj.dataUrl}" alt="Thumb ${idx + 1}">
                    <button class="ai-thumb-remove" data-index="${idx}" title="移除圖片">✕</button>
                `;
                thumbItem.addEventListener('click', (e) => {
                    if (e.target.classList.contains('ai-thumb-remove')) return;
                    activeImageIndex = idx;
                    updateImageGalleryUI();
                });
                thumbsGrid.appendChild(thumbItem);
            });

            thumbsGrid.querySelectorAll('.ai-thumb-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                    removeUploadedImage(idx);
                });
            });
        }
    }

    // 全局 WebCam 串流引用與數位變焦狀態
    let webcamStream = null;
    let currentCssZoom = 1;

    // 開啟 Web 鏡頭即時視訊串流 (支援電腦 WebCam + 手機後置鏡頭)
    async function startWebcam() {
        currentCssZoom = 1;
        if (window.toggleMenu && !elements.scanMenu.classList.contains('show')) {
            window.toggleMenu('ai-scan');
        }

        const videoEl = document.getElementById('ai-webcam-video');
        const webcamBox = document.getElementById('ai-webcam-box');
        if (!videoEl || !webcamBox) return;

        // 🔥 開起相機時隱藏上傳區，開啟相機畫面
        stopWebcam();
        if (elements.previewWrap) elements.previewWrap.classList.remove('scanning');
        if (elements.itemsSection) elements.itemsSection.classList.remove('show');
        if (elements.totalRow) elements.totalRow.style.display = 'none';
        if (elements.importAllBtn) elements.importAllBtn.style.display = 'none';
        if (elements.errorBox) elements.errorBox.classList.remove('show');

        try {
            const isPortrait = window.innerHeight > window.innerWidth;
            const constraints = {
                video: {
                    facingMode: { ideal: "environment" },
                    aspectRatio: { ideal: isPortrait ? 0.5625 : 1.7777777778 }, // 直向 9:16 (0.5625) / 橫向 16:9 (1.7778)
                    width: { ideal: isPortrait ? 1080 : 1920 },
                    height: { ideal: isPortrait ? 1920 : 1080 }
                }
            };
            webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoEl.srcObject = webcamStream;
            videoEl.style.transform = 'scale(1)';
            webcamBox.style.display = 'block';
            elements.uploadZone.style.display = 'none';
            const actionsRow = document.querySelector('.ai-upload-actions-row');
            if (actionsRow) actionsRow.style.display = 'none';

            // 初始化變焦按鈕狀態
            const zoomBtns = document.querySelectorAll('.ai-zoom-btn');
            zoomBtns.forEach(b => b.classList.remove('active'));
            const default1xBtn = document.querySelector('.ai-zoom-btn[data-zoom="1"]');
            if (default1xBtn) default1xBtn.classList.add('active');
        } catch (err) {
            console.warn('MediaDevices error:', err);
            let errMsg = '';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errMsg = '⚠️ 攝影機權限被拒絕。請至瀏覽器設定或網址列圖示開啟攝影機權限後重試。';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errMsg = '⚠️ 找不到攝影機裝置。請確認您的裝置已連接相機或改用圖片檔案上傳。';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                errMsg = '⚠️ 攝影機正被其他應用程式使用中，無法開啟。';
            } else {
                errMsg = `⚠️ 無法啟動相機 (${err.name || '未知錯誤'})，切換至圖庫上傳。`;
            }

            if (elements.errorBox) {
                elements.errorBox.textContent = errMsg;
                elements.errorBox.classList.add('show');
            } else {
                alert(errMsg);
            }

            if (err.name !== 'NotAllowedError' && err.name !== 'PermissionDeniedError' && err.name !== 'NotFoundError') {
                const galleryInput = document.getElementById('ai-gallery-input');
                if (galleryInput) galleryInput.click();
            }
        }
    }

    // 🔥 實作動態鏡頭變焦 (相機硬件 Zoom + CSS 數位無縫備援)
    async function applyWebcamZoom(zoomFactor) {
        const factor = parseFloat(zoomFactor) || 1;
        const videoEl = document.getElementById('ai-webcam-video');

        // 1. 嘗試使用原生相機硬體 Zoom API (包含手機多鏡頭/光學變焦)
        if (webcamStream) {
            const videoTrack = webcamStream.getVideoTracks()[0];
            if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
                const capabilities = videoTrack.getCapabilities();
                if (capabilities.zoom) {
                    try {
                        const minZoom = capabilities.zoom.min || 1;
                        const maxZoom = capabilities.zoom.max || 10;
                        const targetZoom = Math.min(Math.max(factor, minZoom), maxZoom);
                        await videoTrack.applyConstraints({ advanced: [{ zoom: targetZoom }] });
                        if (videoEl) videoEl.style.transform = 'scale(1)'; // 硬體變焦成功，重置 CSS
                        currentCssZoom = 1;
                        return;
                    } catch (e) {
                        console.warn('Hardware zoom failed, fallbacking to CSS zoom:', e);
                    }
                }
            }
        }

        // 2. 備援方案：CSS 精準 smooth 數位放大 (百分百相容電腦與所有設備)
        if (videoEl) {
            videoEl.style.transform = `scale(${factor})`;
            currentCssZoom = factor;
        }
    }

    // 關閉 Web 鏡頭串流
    function stopWebcam() {
        currentCssZoom = 1;
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        const videoEl = document.getElementById('ai-webcam-video');
        if (videoEl) {
            videoEl.pause();
            videoEl.srcObject = null;
        }
        const webcamBox = document.getElementById('ai-webcam-box');
        if (webcamBox) webcamBox.style.display = 'none';
        if (elements.uploadZone && uploadedImages.length === 0) elements.uploadZone.style.display = 'flex';
        const actionsRow = document.querySelector('.ai-upload-actions-row');
        if (actionsRow && uploadedImages.length === 0) actionsRow.style.display = 'flex';
    }
    window.stopWebcam = stopWebcam;

    // 從即時視訊串流拍攝快照
    function captureWebcamSnapshot() {
        const videoEl = document.getElementById('ai-webcam-video');
        if (!videoEl || !videoEl.videoWidth) return;

        const canvas = document.createElement('canvas');
        const vW = videoEl.videoWidth;
        const vH = videoEl.videoHeight;
        canvas.width = vW;
        canvas.height = vH;
        const ctx = canvas.getContext('2d');

        // 🔥 如果使用了 CSS 數位變焦 (如筆電 WebCam)，依照變焦倍數裁切中央區域
        if (currentCssZoom > 1) {
            const cropW = vW / currentCssZoom;
            const cropH = vH / currentCssZoom;
            const cropX = (vW - cropW) / 2;
            const cropY = (vH - cropH) / 2;
            ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, vW, vH);
        } else {
            ctx.drawImage(videoEl, 0, 0, vW, vH);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        stopWebcam();
        addUploadedImage(dataUrl);
    }

    // 重設上傳區
    function resetUpload() {
        stopWebcam();
        uploadedImages = [];
        activeImageIndex = 0;
        
        // 立即清空圖片畫廊與縮圖
        const thumbsContainer = document.getElementById('ai-thumbs-container');
        const thumbsGrid = document.getElementById('ai-thumbs-grid');
        const countLabel = document.getElementById('ai-thumbs-count-label');
        if (thumbsContainer) {
            thumbsContainer.classList.remove('show');
            thumbsContainer.style.display = 'none';
        }
        if (thumbsGrid) {
            thumbsGrid.innerHTML = '';
        }
        if (countLabel) {
            countLabel.textContent = '0 張圖片';
        }

        if (elements.previewImg) {
            elements.previewImg.src = '';
            elements.previewImg.removeAttribute('src');
            elements.previewImg.classList.remove('show');
        }
        if (elements.previewWrap) elements.previewWrap.classList.remove('show', 'scanning');
        if (elements.previewActions) elements.previewActions.classList.remove('show');
        if (elements.uploadZone) {
            elements.uploadZone.classList.remove('has-image');
            elements.uploadZone.style.display = 'flex';
        }
        const actionsRow = document.querySelector('.ai-upload-actions-row');
        if (actionsRow) actionsRow.style.display = 'flex';
        
        const galleryInput = document.getElementById('ai-gallery-input');
        if (galleryInput) galleryInput.value = '';
        const cameraInput = document.getElementById('ai-camera-input');
        if (cameraInput) cameraInput.value = '';

        if (elements.recognizeBtn) elements.recognizeBtn.disabled = true;
        elements.itemsSection.classList.remove('show');
        elements.totalRow.style.display = 'none';
        toggleImportBtnGroup(false);
        elements.errorBox.classList.remove('show');
        scannedItems = [];

        // 再次呼叫 updateImageGalleryUI 確保所有狀態完全重設
        updateImageGalleryUI();
    }

    // 依據店家名稱與商品名稱關鍵字智慧推斷記帳類別 (區分即時用餐「食」與藥妝伴手禮非即食「購物」)
    function inferCategoryFromName(name, storeName) {
        const s = String(storeName || '').toLowerCase();
        const n = String(name || '').toLowerCase();

        // 1. 若店家為藥妝店/免稅店/百貨公司 -> 優先歸類為購物 shopping (即使買了保養品/膠囊/軟糖/伴手禮)
        if (/(藥妝|藥局|松本清|大國|sundrug|matsukiyo|donki|唐吉訶德|免稅|duty free|百貨|美妝|藥房)/.test(s)) {
            return 'shopping';
        }

        // 2. 若店家為餐廳/食堂/速食/咖啡廳 -> 歸類為食 food (即時用餐)
        if (/(松屋|吉野家|すき家|sukiya|一蘭|拉麵|麥當勞|肯德基|摩斯|摩斯漢堡|星巴克|starbucks|壽司|藏壽司|壽司郎|餐廳|食堂|居酒屋|カフェ|cafe|coffee|鐵板燒|火鍋|便當|麵店|燒肉)/.test(s)) {
            return 'food';
        }

        // 3. 依據商品名稱與品項類型推斷
        if (/(藥|保健|維他命|維生素|化學|面膜|保養|洗面|眼藥水|軟膏|貼布|貼膏|補品)/.test(n)) {
            return 'shopping';
        }

        if (/(便當|餐|飯|麵|咖啡|茶|奶|鮮乳|牛乳|拿鐵|歐蕾|麵包|吐司|餅乾|糖|水|果汁|飲料|肉|菜|蛋|湯|酒|餐包|壽司|漢堡|薯條|沙拉|冰|點心|零食|排骨|雞腿|豬排|丼)/.test(n)) {
            return 'food';
        }
        if (/(衣|衫|褲|鞋|襪|帽|外套|裙|包|皮夾|內衣|皮帶|飾品|衛生紙|面紙|洗髮|沐浴|牙膏|牙刷|洗衣|清潔|紙巾|電池|燈泡|垃圾袋|掃把|拖把|碗|盤|洗碗|家飾|家具|購物|買|玩具|藥妝|化妝|紀念品|伴手禮)/.test(n)) {
            return 'shopping';
        }
        if (/(捷運|公車|高鐵|台鐵|車票|加油|汽油|柴油|停車|計程車|悠遊卡|一卡通|過路費|維修|機票|地鐵|JR|電鐵)/.test(n)) {
            return 'transport';
        }
        if (/(文具|筆|紙|影印|印表機|電腦|滑鼠|鍵盤|螢幕|發票|公務|辦公|碳粉|筆記|講義|書|課本|參考書|教材)/.test(n)) {
            return 'business';
        }
        return 'other';
    }

    // 解析台灣電子發票 QR Code 明細 (發票號碼10字元 + 履約日期7字元(YYYMMDD))
    function parseTaiwanEInvoiceQR(qrText) {
        if (!qrText) return null;
        try {
            let dateStr = null;
            let invNum = null;
            // 民國年轉西元年日期解析 (位置 10~16, 7碼 YYYMMDD)
            if (qrText.length >= 17) {
                invNum = qrText.substring(0, 10);
                const rocYear = parseInt(qrText.substring(10, 13), 10);
                const month = qrText.substring(13, 15);
                const day = qrText.substring(15, 17);
                if (rocYear > 0 && month && day) {
                    const year = rocYear + 1911;
                    dateStr = `${year}-${month}-${day}`;
                }
            }

            // 尋找 ** 分隔符號（電子發票左側 QR Code 商品明細區段）
            const starPos = qrText.indexOf('**');
            let items = [];

            if (starPos !== -1) {
                const itemsStr = qrText.substring(starPos + 2);
                const parts = itemsStr.split(':');
                // 每 3 個欄位為一組：[品名, 數量, 單價]
                for (let i = 0; i + 2 < parts.length; i += 3) {
                    const name = parts[i].trim();
                    const count = parseInt(parts[i + 1], 10) || 1;
                    const price = parseInt(parts[i + 2], 10) || 0;
                    if (name) {
                        items.push({
                            name: name,
                            count: count,
                            price: price,
                            category: inferCategoryFromName(name)
                        });
                    }
                }
            }

            // 若左側 QR Code 未包含商品明細，但屬於標準電子發票格式 (長度 >= 37)，嘗試提取發票總金額 (29-37 HEX)
            if (items.length === 0 && qrText.length >= 37) {
                const hexTotal = qrText.substring(29, 37);
                const totalAmount = parseInt(hexTotal, 16);
                if (!isNaN(totalAmount) && totalAmount > 0) {
                    const itemName = invNum ? `電子發票 (${invNum})` : "電子發票金額";
                    items.push({
                        name: itemName,
                        count: 1,
                        price: totalAmount,
                        category: "shopping"
                    });
                }
            }

            if (items.length > 0) {
                return {
                    store_name: "電子發票 (QR Code 優先精準解析)",
                    date: dateStr,
                    items: items
                };
            }
        } catch (e) {
            console.warn('QR Code 發票解析失敗:', e);
        }
        return null;
    }

    // 高能力多重路徑 QR Code 檢測器 (地端 0 秒精準解析：含全圖與發票下半部 200% 特化放大與高對比路徑)
    async function detectQRCodeMultiPass(base64DataUrl) {
        // 若無 jsQR 函式庫則跳過，直接交由 Gemini API 處理
        if (typeof jsQR !== 'function') return null;

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    if (!w || !h) return resolve(null);

                    // 路徑 1：全圖掃描
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const imageData = ctx.getImageData(0, 0, w, h);
                    const qr = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
                    if (qr && qr.data) {
                        const parsed = parseTaiwanEInvoiceQR(qr.data);
                        if (parsed) return resolve(parsed);
                    }

                    // 路徑 2：發票下半部 200% 放大高對比掃描
                    const cropH = Math.floor(h / 2);
                    const canvas2 = document.createElement('canvas');
                    canvas2.width = w;
                    canvas2.height = cropH;
                    const ctx2 = canvas2.getContext('2d');
                    ctx2.drawImage(img, 0, h - cropH, w, cropH, 0, 0, w, cropH);
                    const imageData2 = ctx2.getImageData(0, 0, w, cropH);
                    const qr2 = jsQR(imageData2.data, w, cropH, { inversionAttempts: 'dontInvert' });
                    if (qr2 && qr2.data) {
                        const parsed2 = parseTaiwanEInvoiceQR(qr2.data);
                        if (parsed2) return resolve(parsed2);
                    }

                    resolve(null);
                } catch (e) {
                    console.warn('[AI掃描] QR 本地掃描失敗:', e);
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = base64DataUrl;
        });
    }

    // 呼叫 Gemini 視覺 API 進行 OCR 辨識
    async function runGeminiOCR(base64DataUrl, preferredIndex = 0) {
        // 1. 優先嘗試本地 QR Code 解析（0 秒完成）
        const localQR = await detectQRCodeMultiPass(base64DataUrl);
        if (localQR) {
            return localQR;
        }

        const apiKey = getGeminiKey();
        if (!apiKey) {
            const err = new Error('請先設定 Gemini API Key');
            err.code = 'NO_API_KEY';
            throw err;
        }

        // 清理 Base64，移除前綴與空白（避免超過 JSON Gateway 緩衝區上限）
        const base64Clean = base64DataUrl
            .replace(/^data:image\/[a-zA-Z]+;base64,/, '')
            .replace(/[\r\n\s]+/g, '');

        // 發票幣別與開立地點嚴格依據發票票面文字與語言辨識，嚴禁使用使用者當前手機/GPS定位推斷發票幣別
        const locationContext = '重要提醒：發票上的幣別與開立地點【絕對禁止】使用使用者手機目前的 GPS 或所在地理位置推斷！使用者可能在台灣或國外手持拍攝世界各地的發票，請 100% 完全依據發票/收據票面上的語言、文字、店家抬頭、門市地址、稅別、符號等實體線索進行辨識與推斷。';

        const prompt = `你是一個專業的發票/收據 OCR 辨識 AI，請精準辨識圖中所有商品品名、數量與金額。

${locationContext}

請依照以下規則：
1. 【幣別與地點判定規則 (極重要)】：
   - 絕不可依賴裝置定位，必須 100% 依據發票上的語言、文字與票面線索判斷：
     • 若為【簡體中文】、中國門市/地址、中國稅號、發票專用章、元/¥ 等 -> 原始貨幣為 CNY (人民幣)，符號為 ¥，【1 人民幣不等於 1 台幣，當前匯率 1 CNY 約為 4.4~4.5 TWD，rate_to_twd 必須填入真實匯率約 4.4~4.5，絕對不可填 1】。
     • 若為【繁體中文】且為台灣統一發票（有統一編號、發票字軌如 AB-12345678、或台灣地址/門市） -> 原始貨幣為 TWD (新台幣)，符號為 NT$，rate_to_twd 為 1。
     • 若為【日文假名/漢字】、日本地址（如東京都、大阪府、〒 等）、消費稅等 -> 原始貨幣為 JPY (日圓)，符號為 ¥，rate_to_twd 約為 0.21~0.22。
     • 若為【韓文】、韓元符號 ₩、韓國地址 -> 原始貨幣為 KRW (韓元)，符號為 ₩，rate_to_twd 約為 0.024。
     • 若為【歐元 €】、歐盟國家地址 -> 原始貨幣為 EUR，rate_to_twd 約為 35。
     • 若為【美金 $】、美國地址/門市 -> 原始貨幣為 USD，rate_to_twd 約為 32。
     • 若為【泰文】、泰國地址 -> 原始貨幣為 THB (泰銖)，符號為 ฿，rate_to_twd 約為 0.95。
     • 若為【越南文】、越南地址 -> 原始貨幣為 VND (越南盾)，符號為 ₫，rate_to_twd 約為 0.0013。
   - 提取原始貨幣代碼 (original_currency)、貨幣符號 (currency_symbol) 及發票實際開立地點或店家所屬國家/城市 (store_location)。
2. 如果是電子發票/條碼收據，可嘗試從 QR Code 區域讀取更多細節。
3. 若圖片明顯不是發票或收據，則將 "is_valid_item" 設為 false，並在 "detected_description" 描述內容。
規則補充說明：
- 所有商品名稱請用中文，並在 items 的 price 欄位填入原幣金額。
- 務必提供正確的對台幣 (TWD) 匯率 (rate_to_twd)，若為外幣切勿填 1。特別提醒：1 人民幣 CNY ≠ 1 台幣 TWD (1 CNY ≈ 4.4~4.5 TWD)。
- 若商品有中文名稱，"name" 填中文，"name_foreign" 填原文（若無則留空 ""）。
- 若商品只有外文名稱，"name" 盡量翻譯成中文，"name_foreign" 填原始外文。
- 分類規則："food"（餐飲即食）、"shopping"（購物）、"transport"（交通）、"business"（商務）。
- 日期格式：請按照 YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD，若無法確定則留空字串。
請只輸出以下格式的純淨 JSON，不要包含任何說明文字：
{
  "is_valid_item": true,
  "detected_description": "發票收據",
  "store_name": "店家名稱",
  "store_location": "發票開立地點/國家",
  "original_currency": "CNY",
  "currency_symbol": "¥",
  "rate_to_twd": 4.45,
  "date": "2026-09-28 14:30:00",
  "items": [
    {
      "name": "商品名",
      "name_foreign": "",
      "price": 100,
      "count": 1,
      "category": "food"
    }
  ]
}`;

        const requestBody = {
            contents: [{
                parts: [
                    { text: '你是專業發票辨識 OCR 助理，請分析圖片並輸出指定格式 JSON：\n\n' + prompt },
                    {
                        inline_data: {
                            mime_type: 'image/jpeg',
                            data: base64Clean
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: 'application/json'
            }
        };

        const ALL_MODELS = [
            'gemini-flash-lite-latest', // 官方自動負載平衡端點（自動指向最空閒極速 Flash-Lite）
            'gemini-flash-latest',      // 官方自動指向 Flash 備用端點
            'gemini-2.5-flash-lite'     // 穩定舊版端點
        ];

        // 依照 preferredIndex 輪替嘗試模型順序
        const modelsToTry = [];
        for (let i = 0; i < ALL_MODELS.length; i++) {
            modelsToTry.push(ALL_MODELS[(preferredIndex + i) % ALL_MODELS.length]);
        }

        const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        };

        let lastErr = null;
        for (const model of modelsToTry) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                console.log(`[AI掃描] 嘗試模型: ${model}`);

                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody)
                });

                if (res.ok) {
                    const data = await res.json();
                    const parts = data.candidates?.[0]?.content?.parts || [];
                    // 過濾掉 thought 部分，只取 text part
                    const textPart = parts.find(p => p.text && !p.thought) || parts.find(p => p.text) || parts[0];
                    const textResult = textPart?.text;
                    if (!textResult) throw new Error('API 回傳內容為空');

                    let cleanText = textResult.trim()
                        .replace(/^`(?:json)?\s*/i, '')
                        .replace(/\s*`$/i, '')
                        .trim();

                    const firstBrace = cleanText.indexOf('{');
                    const lastBrace = cleanText.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
                    }

                    return JSON.parse(cleanText);
                }

                const errJson = await res.json().catch(() => ({}));
                const rawMsg = errJson.error?.message || `API 請求失敗 (HTTP ${res.status})`;
                lastErr = rawMsg;
                console.warn(`[AI掃描] 模型 ${model} 失敗:`, rawMsg);

                // 503 / 429 過載，等待後換下一個模型
                if (res.status === 503 || res.status === 429 || rawMsg.includes('overloaded')) {
                    console.log('[AI掃描] 服務過載，等待後切換備用模型...');
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }

                if (res.status === 404) {
                    continue; // 模型不存在，試下一個
                }

                // 400/403 等問題，停止重試
                break;
            } catch (e) {
                lastErr = e.message;
                console.error('[AI掃描] 請求異常:', e.message);
            }
        }

        if (lastErr && (lastErr.includes('overloaded') || lastErr.includes('503'))) {
            throw new Error('⚠️ AI 服務目前繁忙，請稍後再試。您也可以嘗試直接手動記帳。');
        }
        throw new Error(lastErr || '辨識失敗，請檢查網路連線或 API Key');
    }


    function getDict() {
        const lang = localStorage.getItem('bCalc_lang') || 'en';
        return (window.I18N && window.I18N[lang]) ? window.I18N[lang] : (window.I18N?.zh || {});
    }

    // 渲染辨識結果清單
    function renderScannedItems(data) {
        lastRenderedData = data;
        if (elements.storeTagWrap) {
            elements.storeTagWrap.innerHTML = '';
        }

        scannedItems = data.items || [];
        elements.itemsList.innerHTML = '';

        if (elements.errorBox) {
            elements.errorBox.classList.remove('show');
        }

        // 若辨識為非購物商品 (例如動物、風景、個人照片或非發票/書籍/商品雜物)
        if (data.is_valid_item === false || !data.items || data.items.length === 0) {
            const explanation = data.detected_description || '圖片中辨識為非發票、收據或購物商品，無法進行記帳。';
            elements.errorBox.innerHTML = `⚠️ <strong>非購物商品提醒：</strong><br>${explanation}`;
            elements.errorBox.classList.add('show');
            if (elements.itemsSection) elements.itemsSection.classList.remove('show');
            if (elements.totalRow) elements.totalRow.style.display = 'none';
            toggleImportBtnGroup(false);
            return;
        }

        let sumTotal = 0;
        let sumTwdTotal = 0;
        const dict = getDict();

        // 發票原始幣別與開立地點以 AI 從發票票面文字判定為主
        const origCurr = data.original_currency || 'TWD';
        const currSym = data.currency_symbol || (origCurr === 'TWD' ? 'NT$' : (origCurr === 'CNY' ? '¥' : (origCurr === 'JPY' ? '¥' : (origCurr === 'KRW' ? '₩' : '$'))));
        const storeLocation = data.store_location || '';

        // 匯率取得：優先使用 AI 辨識匯率，若未提供或外幣被誤設為 1，則自動從本地儲存之系統即時匯率表或標準匯率換算
        let rateToTwd = Number(data.rate_to_twd) || 0;
        if (origCurr === 'TWD') {
            rateToTwd = 1;
        } else if (rateToTwd <= 0 || (rateToTwd === 1 && origCurr !== 'TWD')) {
            // 從 localStorage 取得已更新的最新匯率
            try {
                const storedRates = JSON.parse(localStorage.getItem('bCalc_rates') || '{}');
                const twdRate = Number(storedRates['TWD']) || 32.5;
                const currRate = Number(storedRates[origCurr]);
                if (currRate && currRate > 0) {
                    rateToTwd = Math.round((twdRate / currRate) * 10000) / 10000;
                }
            } catch (e) {}

            // 若仍無法取得，採用精準預設基準匯率 (如 1 人民幣約 4.48 台幣)
            if (!rateToTwd || (rateToTwd === 1 && origCurr !== 'TWD')) {
                const fallbackRatesToTwd = {
                    CNY: 4.48, // 1 人民幣約等於 4.48 新台幣，絕非 1:1
                    USD: 32.5,
                    JPY: 0.215,
                    KRW: 0.024,
                    EUR: 35.3,
                    HKD: 4.15,
                    GBP: 41.5,
                    SGD: 24.3,
                    MYR: 7.3,
                    AUD: 21.0,
                    THB: 0.93,
                    VND: 0.0013
                };
                rateToTwd = fallbackRatesToTwd[origCurr] || (rateToTwd > 0 ? rateToTwd : 1);
            }
        }

        if (elements.storeTagWrap) {
            const locText = storeLocation ? ` 📍 ${storeLocation}` : '';
            const rateText = origCurr !== 'TWD' ? ` (1 ${origCurr} ≈ ${rateToTwd} TWD)` : '';
            elements.storeTagWrap.innerHTML = `<div class="ai-store-tag">${data.store_name || '收據明細'} [${origCurr}]${locText}${rateText}</div>`;
        }

        scannedItems.forEach((item, index) => {
            let price = Number(item.price);
            if (isNaN(price) || price <= 0) {
                if (/(講義|書|課本|參考書|教材|化學|物理|數學|英文|生物|地科|歷史|地理|公民)/.test(item.name || '')) {
                    price = 280;
                } else {
                    price = 0;
                }
                item.price = price;
            }
            const count = Number(item.count) || 1;
            const itemOrigTotal = price * count;
            const itemTwdTotal = Math.round(itemOrigTotal * rateToTwd * 100) / 100;
            
            sumTotal += itemOrigTotal;
            sumTwdTotal += itemTwdTotal;

            item.origCurrency = origCurr;
            item.rateToTWD = rateToTwd;
            item.twdAmount = itemTwdTotal;
            item.location = storeLocation;

            let nameStr = item.name || '';
            const genericBadNames = ['發票消費品項', '發票商品', '商品', '一般購物', '消費品項'];
            const itemStore = item.store_name || data.store_name || '';

            if (!nameStr || genericBadNames.some(bad => nameStr.trim() === bad)) {
                nameStr = itemStore ? itemStore : (dict.aiUnknownItem || '消費品項');
                item.name = nameStr;
            }

            const qtyLabel = dict.aiQty || '數量';
            const catKey = item.category || inferCategoryFromName(nameStr);
            item.category = catKey;

            const catEmojis = { food: '🍜', shopping: '🛍️', transport: '🚗', business: '💼', other: '🏷️' };
            const catEmoji = catEmojis[catKey] || '🏷️';
            const itemDate = item.date || (data.dates && data.dates.length === 1 ? data.dates[0] : (data.date || ''));

            const storeInfoHtml = itemStore ? `<div class="ai-item-store">${itemStore}</div>` : '';
            const dateInfoHtml = itemDate ? `<div class="ai-item-date">${itemDate}</div>` : '';
            const convTwdHtml = origCurr !== 'TWD' ? `<div class="ai-item-sub" style="font-size:10px;color:var(--accent-main)">約 NT$ ${itemTwdTotal.toLocaleString()} TWD</div>` : '';

            const card = document.createElement('div');
            card.className = 'ai-item-card';
            card.innerHTML = `
                <div class="ai-item-emoji">${catEmoji}</div>
                <div class="ai-item-info">
                    <div class="ai-item-name">${nameStr}</div>
                    ${(item.name_foreign && item.name_foreign !== nameStr) ? `<div class="ai-item-foreign" style="font-size:11px;opacity:0.75;margin-top:2px;">原文: ${item.name_foreign}</div>` : ''}
                    <div class="ai-item-meta">${qtyLabel}: ${count}</div>
                    ${storeInfoHtml}
                    ${dateInfoHtml}
                </div>
                <div class="ai-item-price-wrap" style="text-align:right">
                    <div class="ai-item-price" contenteditable="true" inputmode="decimal" data-index="${index}" title="點擊即可手動修改金額">${currSym} ${price}</div>
                    ${convTwdHtml}
                </div>
                <div class="ai-item-actions">
                    <button class="ai-remove-btn" data-index="${index}">✕</button>
                </div>
            `;
            elements.itemsList.appendChild(card);
        });

        // 綁定動態價格手動編輯事件
        elements.itemsList.querySelectorAll('.ai-item-price').forEach(el => {
            el.addEventListener('blur', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                const text = e.currentTarget.textContent.replace(/[^0-9.]/g, '');
                const newPrice = parseFloat(text) || 0;
                scannedItems[idx].price = newPrice;
                e.currentTarget.textContent = `${currSym} ${newPrice}`;
                
                let newSum = 0;
                let newTwdSum = 0;
                scannedItems.forEach(it => {
                    const oTot = (Number(it.price) || 0) * (Number(it.count) || 1);
                    newSum += oTot;
                    newTwdSum += Math.round(oTot * rateToTwd * 100) / 100;
                });
                elements.totalAmount.textContent = origCurr !== 'TWD' ? `${currSym}${newSum.toLocaleString()} (${origCurr}) ≈ NT$${newTwdSum.toLocaleString()} TWD` : `NT$${newSum.toLocaleString()}`;
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
            });
        });

        // 綁定刪除事件
        elements.itemsList.querySelectorAll('.ai-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                scannedItems.splice(idx, 1);
                renderScannedItems({ store_name: data.store_name, dates: data.dates || (data.date ? [data.date] : []), items: scannedItems, original_currency: origCurr, currency_symbol: currSym, rate_to_twd: rateToTwd, store_location: storeLocation });
            });
        });

        elements.totalAmount.textContent = origCurr !== 'TWD' ? `${currSym}${sumTotal.toLocaleString()} (${origCurr}) ≈ NT$${sumTwdTotal.toLocaleString()} TWD` : `NT$${sumTotal.toLocaleString()}`;
        elements.itemsSection.classList.add('show');
        elements.totalRow.style.display = 'flex';
        toggleImportBtnGroup(true);
    }

    // 🧾 以「每一張發票/明細」為單位歸檔入歷史紀錄（若一次上傳多張圖片，按店家/日期/發票為單位分別建立獨立收據卡片）
    function importReceiptToCalculator() {
        if (scannedItems.length === 0) return;

        const data = lastRenderedData || {};
        const defaultOrigCurr = data.original_currency || (scannedItems[0] ? scannedItems[0].origCurrency : 'TWD') || 'TWD';
        const defaultRateToTwd = Number(data.rate_to_twd) || (scannedItems[0] ? Number(scannedItems[0].rateToTWD) : 1) || 1;
        const defaultStoreLocation = data.store_location || (scannedItems[0] ? scannedItems[0].location : '') || '';

        // 按店家名稱與日期（即發票/圖片來源）進行分組
        const receiptGroups = {};
        scannedItems.forEach(item => {
            const groupKey = `${item.store_name || data.store_name || '發票收據明細'}_${item.date || data.date || ''}`;
            if (!receiptGroups[groupKey]) {
                receiptGroups[groupKey] = {
                    storeName: item.store_name || data.store_name || '發票收據明細',
                    date: item.date || data.date || (data.dates && data.dates[0]) || null,
                    items: []
                };
            }
            receiptGroups[groupKey].items.push(item);
        });

        let totalReceiptsCount = 0;
        let grandTwdSum = 0;

        Object.values(receiptGroups).forEach(group => {
            const storeName = group.storeName;
            const receiptDate = group.date;
            const groupItems = group.items;

            const origCurr = groupItems[0]?.origCurrency || defaultOrigCurr;
            const rateToTwd = Number(groupItems[0]?.rateToTWD) || defaultRateToTwd;
            const storeLocation = groupItems[0]?.location || defaultStoreLocation;

            let totalOrigSum = 0;
            let totalTwdSum = 0;
            const categoryCounts = {};

            const subItems = groupItems.map(item => {
                const price = Number(item.price) || 0;
                const count = Number(item.count) || 1;
                const itemOrigTotal = price * count;
                const itemTwdTotal = item.twdAmount !== undefined ? item.twdAmount : Math.round(itemOrigTotal * rateToTwd * 100) / 100;
                const cat = item.category || inferCategoryFromName(item.name || '', storeName) || 'shopping';

                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                totalOrigSum += itemOrigTotal;
                totalTwdSum += itemTwdTotal;

                return {
                    name: item.name || '商品細項',
                    nameForeign: item.name_foreign || item.name || '',
                    count: count,
                    price: price,
                    origPrice: itemOrigTotal,
                    origCurrency: origCurr,
                    rateToTWD: rateToTwd,
                    twdAmount: itemTwdTotal,
                    category: cat
                };
            });

            let dominantCategory = 'shopping';
            let maxCount = 0;
            for (const cat in categoryCounts) {
                if (categoryCounts[cat] > maxCount) {
                    maxCount = categoryCounts[cat];
                    dominantCategory = cat;
                }
            }

            const receiptTitle = `${storeName} (共 ${subItems.length} 項商品)`;

            if (window.addScannedRecordToHistory) {
                window.addScannedRecordToHistory(receiptTitle, origCurr === 'TWD' ? totalTwdSum : totalOrigSum, receiptDate, dominantCategory, {
                    origCurrency: origCurr,
                    origPrice: totalOrigSum,
                    rateToTWD: rateToTwd,
                    twdAmount: totalTwdSum,
                    location: storeLocation,
                    nameForeign: storeName,
                    items: subItems
                });
            }

            totalReceiptsCount++;
            grandTwdSum += totalTwdSum;
        });

        const dict = getDict();
        const msgToast = (dict.aiImportReceiptSuccessToast || "已將 {count} 張發票明細歸檔 (${total})")
            .replace('{count}', totalReceiptsCount).replace('{total}', Math.round(grandTwdSum));

        if (window.showToastMsg) {
            window.showToastMsg(msgToast);
        } else {
            alert(msgToast);
        }

        resetUpload(); // 🔥 匯入後重置，確保下次打開乾淨

        if (window.toggleMenu) {
            window.toggleMenu('ai-scan');
        } else {
            elements.scanMenu.classList.remove('show', 'active');
        }
    }

    // 🛍️ 拆分單一商品歸檔（若使用者希望每一件商品單獨成為一筆歷史紀錄）
    function importItemsToCalculator() {
        if (scannedItems.length === 0) return;

        let totalAddedTwd = 0;
        scannedItems.forEach(item => {
            const price = Number(item.price) || 0;
            const count = Number(item.count) || 1;
            const rate = Number(item.rateToTWD) || 1;
            const origTotal = price * count;
            const twdTotal = item.twdAmount !== undefined ? item.twdAmount : Math.round(origTotal * rate * 100) / 100;
            totalAddedTwd += twdTotal;

            if (window.addScannedRecordToHistory) {
                window.addScannedRecordToHistory(item.name, item.origCurrency === 'TWD' ? twdTotal : origTotal, item.date, item.category, {
                    origCurrency: item.origCurrency || 'TWD',
                    origPrice: origTotal,
                    rateToTWD: rate,
                    twdAmount: twdTotal,
                    location: item.location || '',
                    nameForeign: item.name_foreign || item.name || ''
                });
            }
        });

        const dict = getDict();
        const countStr = scannedItems.length;
        const msgToast = (dict.aiImportSuccessToast || "已將 {count} 項商品個別拆分加入記帳 (${total})")
            .replace('{count}', countStr).replace('{total}', Math.round(totalAddedTwd));

        if (window.showToastMsg) {
            window.showToastMsg(msgToast);
        } else {
            alert(msgToast);
        }

        resetUpload();

        if (window.toggleMenu) {
            window.toggleMenu('ai-scan');
        } else {
            elements.scanMenu.classList.remove('show', 'active');
        }
    }

    // 事件綁定初始化
    function bindEvents() {
        if (elements.uploadZone) {
            elements.uploadZone.addEventListener('click', () => {
                startWebcam();
            });
        }

        const startCameraBtn = document.getElementById('ai-start-camera-btn');
        if (startCameraBtn) {
            startCameraBtn.addEventListener('click', () => {
                fetchGpsLocation();
                const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                const cameraInput = document.getElementById('ai-camera-input');
                if (isMobile && cameraInput) {
                    cameraInput.click();
                } else {
                    startWebcam();
                }
            });
        }

        const snapBtn = document.getElementById('ai-snap-btn');
        if (snapBtn) {
            snapBtn.addEventListener('click', () => {
                captureWebcamSnapshot();
            });
        }

        const zoomBtns = document.querySelectorAll('.ai-zoom-btn');
        zoomBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                zoomBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const zoomVal = e.currentTarget.getAttribute('data-zoom');
                applyWebcamZoom(zoomVal);
            });
        });

        // 辨識品質設定切換
        const currentQuality = getQualitySetting();
        const qualityBtns = document.querySelectorAll('.ai-quality-btn');
        qualityBtns.forEach(btn => {
            if (btn.getAttribute('data-quality') === currentQuality) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }

            btn.addEventListener('click', (e) => {
                const q = e.currentTarget.getAttribute('data-quality');
                setQualitySetting(q);
                qualityBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                if (window.updateGliders) {
                    window.updateGliders();
                }
            });
        });

        const webcamCloseBtn = document.getElementById('ai-webcam-close-btn');
        if (webcamCloseBtn) {
            webcamCloseBtn.addEventListener('click', () => {
                stopWebcam();
            });
        }

        if (elements.scanCloseBtn) {
            elements.scanCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                stopWebcam();
                if (window.toggleMenu) {
                    window.toggleMenu('ai-scan');
                } else {
                    elements.scanMenu.classList.remove('show', 'active');
                }
            });
        }

        const handleFileSelect = async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            stopWebcam();
            try {
                for (const file of files) {
                    const compressed = await compressImage(file);
                    uploadedImages.push({ dataUrl: compressed, error: false });
                }
                activeImageIndex = uploadedImages.length - 1;
                updateImageGalleryUI();
                if (window.toggleMenu && !elements.scanMenu.classList.contains('show')) {
                    window.toggleMenu('ai-scan');
                }
            } catch (err) {
                alert('圖片載入失敗: ' + err.message);
            } finally {
                e.target.value = ''; // 重置 input 確保每次點擊選取檔案都能順利觸發
            }
        };

        const cameraInput = document.getElementById('ai-camera-input');
        const galleryInput = document.getElementById('ai-gallery-input');
        const selectFileBtn = document.getElementById('ai-select-file-btn');

        if (selectFileBtn && galleryInput) {
            selectFileBtn.addEventListener('click', () => {
                galleryInput.click();
            });
        }

        if (elements.retakeBtn && galleryInput) {
            elements.retakeBtn.addEventListener('click', (e) => {
                resetUpload();
                galleryInput.click();
            });
        }

        if (cameraInput) cameraInput.addEventListener('change', handleFileSelect);
        if (galleryInput) galleryInput.addEventListener('change', handleFileSelect);

        // 🔥 全區域拖曳上傳：支援將檔案直接拖曳至 AI 掃描選單的任意位置
        const scanMenu = elements.scanMenu;
        const colLeft = scanMenu ? scanMenu.querySelector('.ai-scan-col-left') : null;
        const dropTargets = [scanMenu, colLeft].filter(Boolean);

        const processDropFiles = async (files) => {
            const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return;
            stopWebcam();
            try {
                for (const file of imageFiles) {
                    const compressed = await compressImage(file);
                    uploadedImages.push({ dataUrl: compressed, error: false });
                }
                activeImageIndex = uploadedImages.length - 1;
                updateImageGalleryUI();
            } catch (err) {
                alert('圖片載入失敗: ' + err.message);
            }
        };

        dropTargets.forEach(target => {
            target.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if ([...e.dataTransfer.items].some(i => i.kind === 'file' && i.type.startsWith('image/'))) {
                    if (colLeft) colLeft.classList.add('drag-drop-active');
                }
            });
            target.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });
            target.addEventListener('dragleave', (e) => {
                // 只有真的離開整個 scanMenu 才移除高亮
                if (!scanMenu.contains(e.relatedTarget)) {
                    if (colLeft) colLeft.classList.remove('drag-drop-active');
                }
            });
            target.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (colLeft) colLeft.classList.remove('drag-drop-active');
                processDropFiles(e.dataTransfer.files);
            });
        });

        // 拖曳結束與其它事件綁定完成

        document.addEventListener('paste', async (e) => {
            if (!elements.scanMenu.classList.contains('active')) return;
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.type.indexOf('image') === 0) {
                    const blob = item.getAsFile();
                    const compressed = await compressImage(blob);
                    addUploadedImage(compressed);
                    break;
                }
            }
        });

        if (elements.recognizeBtn) {
            elements.recognizeBtn.addEventListener('click', async () => {
                if (uploadedImages.length === 0) return;
                elements.recognizeBtn.disabled = true;
                elements.recognizeBtn.classList.add('loading');
                if (elements.previewWrap) elements.previewWrap.classList.add('scanning');
                elements.errorBox.classList.remove('show');

                const btnLabel = elements.recognizeBtn.querySelector('.ai-btn-label');
                const originalLabelText = btnLabel ? btnLabel.textContent : 'AI 辨識';
                if (btnLabel) btnLabel.textContent = `AI 辨識中 (${uploadedImages.length} 張並行辨識)...`;

                // 重置所有圖片的錯誤狀態
                uploadedImages.forEach(img => img.error = false);

                let combinedStores = [];
                let combinedItems = [];
                let failedIndices = [];
                let errorMessages = [];

                const scanStartTime = Date.now();

                try {
                    // 🔥 一次全數並行 (Parallel Promise.all) 掃描所有圖片！
                    const results = await Promise.all(uploadedImages.map(async (imgObj, idx) => {
                        try {
                            const result = await runGeminiOCR(imgObj.dataUrl);
                            if (!result || !Array.isArray(result.items) || result.items.length === 0) {
                                imgObj.error = true;
                                return { idx, success: false, error: '未能在圖片中辨識出商品內容' };
                            }
                            imgObj.error = false;
                            return { idx, success: true, result };
                        } catch (imgErr) {
                            imgObj.error = true;
                            return { idx, success: false, error: imgErr.message };
                        }
                    }));

                    let invoiceDates = [];

                    results.forEach(res => {
                        if (res.success && res.result) {
                            if (res.result.store_name && !combinedStores.includes(res.result.store_name)) {
                                combinedStores.push(res.result.store_name);
                            }
                            if (res.result.date && !invoiceDates.includes(res.result.date)) {
                                invoiceDates.push(res.result.date);
                            }
                            if (Array.isArray(res.result.items)) {
                                const itemsWithMeta = res.result.items.map(item => ({
                                    ...item,
                                    store_name: item.store_name || res.result.store_name || null,
                                    date: item.date || res.result.date || null
                                }));
                                combinedItems.push(...itemsWithMeta);
                            }
                        } else {
                            failedIndices.push(res.idx + 1);
                            errorMessages.push(`第 ${res.idx + 1} 張: ${res.error}`);
                        }
                    });

                    // 即時更新縮圖 UI（將辨識失敗的圖片醒目標示紅框 ⚠️）
                    updateImageGalleryUI();

                    if (combinedItems.length === 0 && failedIndices.length > 0) {
                        const detailedMsg = (errorMessages.length === 1 && errorMessages[0]) 
                            ? errorMessages[0].replace(/^第 \d+ 張:\s*/, '') 
                            : `辨識失敗 (${failedIndices.length}/${uploadedImages.length} 張圖片無法讀取，已標示紅框)`;
                        throw new Error(detailedMsg);
                    }

                    const storeName = combinedStores.join(' / ');
                    renderScannedItems({ store_name: storeName, dates: invoiceDates, items: combinedItems });

                    if (failedIndices.length > 0) {
                        elements.errorBox.textContent = `⚠️ 提醒：第 ${failedIndices.join(', ')} 張圖片辨識失敗（已標示紅框），您可以點選 ✕ 移除該圖片或重新嘗試`;
                        elements.errorBox.classList.add('show');
                    }
                } catch (err) {
                    if (err.message && err.message.includes('未設定 Gemini API Key')) {
                        elements.errorBox.innerHTML = `
                            <div style="display:flex;flex-direction:column;gap:10px;width:100%;text-align:left;box-sizing:border-box;">
                                <div>⚠️ <strong style="color:#ff5252">未設定 Gemini API Key</strong><br><span style="font-size:11.5px;opacity:0.9;line-height:1.4;display:block;margin-top:4px;">辨識照片文字需填寫免費 Gemini API Key（若拍攝台灣電子發票，請對準下方 QR Code 可免 Key 自動解析）。</span></div>
                                <div style="display:flex;flex-direction:column;gap:6px;width:100%;">
                                    <input type="text" id="ai-quick-key-input" placeholder="貼上 Gemini API Key (AIzaSy...)" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.6);color:#fff;font-size:12px;outline:none;">
                                    <button id="ai-quick-key-save-btn" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:none;background:var(--accent-color, #29b6f6);color:#000;font-weight:bold;font-size:12.5px;cursor:pointer;transition:all 0.2s;">⚡ 儲存 Key 並立即辨識</button>
                                </div>
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size:11.5px;color:var(--accent-color, #29b6f6);text-decoration:underline;display:inline-block;" data-i18n="aiApiKeyTutorial">👉 免費取得 Google Gemini API Key</a>
                            </div>
                        `;
                        elements.errorBox.classList.add('show');

                        const qInput = document.getElementById('ai-quick-key-input');
                        const qSave = document.getElementById('ai-quick-key-save-btn');
                        if (qSave && qInput) {
                            qSave.addEventListener('click', () => {
                                const val = qInput.value.trim();
                                if (!val) {
                                    alert('請輸入有效的 API Key');
                                    return;
                                }
                                localStorage.setItem('calc_gemini_api_key', val);
                                if (window.updateGeminiKeyUI) window.updateGeminiKeyUI();
                                if (window.showToastMsg) window.showToastMsg('✅ API Key 已儲存！正在重新辨識...');
                                elements.recognizeBtn.click();
                            });
                            qInput.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    qSave.click();
                                }
                            });
                        }
                    } else {
                        elements.errorBox.textContent = err.message;
                        elements.errorBox.classList.add('show');
                    }
                } finally {
                    const scanElapsedTime = Date.now() - scanStartTime;
                    const MIN_SCAN_ANIM_TIME = 1000; // 🔥 確保掃描雷射光束動畫播放至少 1 秒
                    if (scanElapsedTime < MIN_SCAN_ANIM_TIME) {
                        await new Promise(r => setTimeout(r, MIN_SCAN_ANIM_TIME - scanElapsedTime));
                    }

                    elements.recognizeBtn.disabled = false;
                    elements.recognizeBtn.classList.remove('loading');
                    if (btnLabel) btnLabel.textContent = originalLabelText;
                    if (elements.previewWrap) elements.previewWrap.classList.remove('scanning');
                }
            });
        }

        if (elements.importAllBtn) {
            elements.importAllBtn.addEventListener('click', importReceiptToCalculator);
        }
        if (elements.importItemsBtn) {
            elements.importItemsBtn.addEventListener('click', importItemsToCalculator);
        }

        bindGeminiKeyEvents();
    }

    window.addEventListener('orientationchange', () => {
        if (webcamStream) {
            setTimeout(startWebcam, 300);
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        initElements();
        bindEvents();
        updateGeminiKeyUI();
    });

})();
