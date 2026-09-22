/**
 * ════════════════════════════════════════════════════════
 * AI 發票掃描記帳模組 (ai-scan.js)
 * 特色：
 *  1. 預設極速記帳：Gemini 3.6 Flash 辨識發票/收據品名、金額與數量 (1.5 秒完成)
 *  2. 內建免費 Key：開箱即用，無須設定
 *  3. 一鍵全匯入：自動寫入主計算機歷史紀錄與統計
 * ════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // 內建開箱即用預設 API Key (若使用者未輸入自訂 Key，自動以此預設 Key 執行)
    const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6IMSvhw99i9rpSYY8lLhKP5oUbPGFMfqX_Cr1w3H4QpZw"; 

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
        if (statusEl) statusEl.textContent = '🌐 智能地區與幣別感應中...';
        
        if (typeof window.fetchUnifiedLocationAndCurrency === 'function') {
            window.fetchUnifiedLocationAndCurrency((meta) => {
                if (meta && meta.locationName) {
                    currentGpsLocation = meta;
                    if (statusEl) {
                        const tagSource = meta.source === 'IP' ? '🌐 IP' : '📍 GPS';
                        statusEl.textContent = `${tagSource} 定位：${meta.locationName} (${meta.flag || ''} ${meta.currency || ''})`;
                    }
                }
            });
        }
    }

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
                const masked = customKey.length > 8 
                    ? `${customKey.substring(0, 4)}...${customKey.substring(customKey.length - 4)}` 
                    : '已設定';
                keyStatus.className = 'ai-key-status active';
                keyStatus.textContent = `✅ 已啟用自訂 API Key (${masked})`;
                if (keyClearBtn) keyClearBtn.style.display = 'inline-block';
            } else {
                keyStatus.className = 'ai-key-status active';
                keyStatus.textContent = '⚡ 已開箱即用啟用預設 API Key (亦可輸入自訂 Key 覆蓋)';
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

    // 前端 Canvas 圖片壓縮 (依據選擇的辨識品質動態調整尺寸與 quality)
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;
                    const { maxDim, quality } = getQualityParams();
                    // 手機行動端 Canvas 記憶體防護：強制最高不超過 4000px
                    const HARD_MAX_DIM = 4000;
                    const effectiveMaxDim = Math.min(maxDim, HARD_MAX_DIM);

                    if (w > effectiveMaxDim || h > effectiveMaxDim) {
                        if (w > h) {
                            h = Math.round((h * effectiveMaxDim) / w);
                            w = effectiveMaxDim;
                        } else {
                            w = Math.round((w * effectiveMaxDim) / h);
                            h = effectiveMaxDim;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
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
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = async () => {
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (!w || !h) return resolve(null);

                const canvasesToTry = [];

                // 1. 原圖全圖 Canvas
                const canvasFull = document.createElement('canvas');
                canvasFull.width = w;
                canvasFull.height = h;
                const ctxFull = canvasFull.getContext('2d');
                ctxFull.drawImage(img, 0, 0);
                canvasesToTry.push(canvasFull);

                // 2. 發票下半部 65% 區域 Canvas (針對台灣發票 QR Code 特化放大)
                const cropY = Math.floor(h * 0.35);
                const cropH = h - cropY;
                const canvasBottom = document.createElement('canvas');
                canvasBottom.width = w;
                canvasBottom.height = cropH;
                const ctxBottom = canvasBottom.getContext('2d');
                ctxBottom.drawImage(img, 0, cropY, w, cropH, 0, 0, w, cropH);
                canvasesToTry.push(canvasBottom);

                // 3. 高對比反差強化 Canvas (防止照片陰影或燈光反射)
                try {
                    const canvasContrast = document.createElement('canvas');
                    canvasContrast.width = w;
                    canvasContrast.height = cropH;
                    const ctxContrast = canvasContrast.getContext('2d');
                    ctxContrast.drawImage(img, 0, cropY, w, cropH, 0, 0, w, cropH);
                    const imgData = ctxContrast.getImageData(0, 0, w, cropH);
                    const data = imgData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                        const val = avg > 128 ? 255 : 0; // 黑白二值化強化
                        data[i] = val;
                        data[i + 1] = val;
                        data[i + 2] = val;
                    }
                    ctxContrast.putImageData(imgData, 0, 0);
                    canvasesToTry.push(canvasContrast);
                } catch (e) {
                    console.warn('二值化 Canvas 建立跳過:', e);
                }

                // 調用原生 BarcodeDetector 進行多重圖像區域檢測
                if ('BarcodeDetector' in window) {
                    try {
                        const detector = new BarcodeDetector({ formats: ['qr_code'] });
                        for (const targetCanvas of canvasesToTry) {
                            const barcodes = await detector.detect(targetCanvas);
                            for (const barcode of barcodes) {
                                const parsed = parseTaiwanEInvoiceQR(barcode.rawValue);
                                if (parsed) {
                                    console.log('⚡ 多重路徑地端 QR 成功解析！', parsed);
                                    return resolve(parsed);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('BarcodeDetector 多重區域檢測失敗:', e);
                    }
                }

                resolve(null);
            };
            img.onerror = () => resolve(null);
            img.src = base64DataUrl;
        });
    }

    // 呼叫 Gemini Flash API (具備多模型自動降級備援與高負載重試機制)
    async function runGeminiOCR(base64DataUrl) {
        // 1. 優先：嘗試多重路徑地端 QR Code 檢測 (含發票下半部 200% 特化放大，0 秒精準免 Key 解析)
        const localQR = await detectQRCodeMultiPass(base64DataUrl);
        if (localQR) {
            return localQR;
        }

        const apiKey = getGeminiKey();
        if (!apiKey) {
            const err = new Error('未設定 Gemini API Key');
            err.code = 'NO_API_KEY';
            throw err;
        }

        const base64Clean = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');

        const locationContext = currentGpsLocation 
            ? `【GPS 地理位置輔助參考】: 照片拍攝時的 GPS 位置在：${currentGpsLocation.locationName} (${currentGpsLocation.flag} ${currentGpsLocation.currency})。` 
            : '【GPS 地理位置輔助參考】: 未提供 GPS 座標，請完全依據照片內的文字語言、門市地址、貨幣符號(如 ¥, ₩, €, $, ฿, ₫)與金額格式智慧推算幣別。';

        const prompt = `你是發票、收據、國外旅遊消費、菜單與商品購物掃描識別專家。
${locationContext}

【任務識別說明】：
1. 國外/國內發票與實體收據：請優先閱讀照片上的【語言文字（日文/韓文/英文/法文/德文/泰文/越文等）、門市名稱/地址、貨幣符號 (¥, ₩, €, $, ฿, ₫, NT$) 與金額格式】，並將 GPS 位置作為輔助參考，自動辨識出真實的【發票原始貨幣幣別 (original_currency)】（如 JPY, KRW, EUR, USD, THB, VND, TWD）、貨幣符號 (currency_symbol) 與店家城市/國家 (store_location)。
2. 台灣電子發票 / 實體收據：若有雙方塊 QR Code 請優先解碼明細；若無則辨識品名、數量、金額與日期。
3. 書籍 / 講義 / 菜單 / 購物標籤。
4. **非購物商品/非記帳對象**（如：寵物、風景、個人自拍、無關雜物）：請將 "is_valid_item" 設為 false，並在 "detected_description" 中說明。

【重要價格、名稱與分類規範】：
- 請將價格以收據上的【原始貨幣金額】填寫在 items 的 price 欄位。
- 請估算或提供該原始貨幣換算至新台幣 (TWD) 的當日估算匯率 (rate_to_twd，例如 1 JPY ≈ 0.21 TWD, 1 USD ≈ 32.5 TWD, 1 EUR ≈ 35.0 TWD, 1 KRW ≈ 0.024 TWD)。
- **品名名稱嚴格規範（非常重要！）**：
  - 絕對不要寫無意義的通用後綴或補充詞（例如禁止寫「購物明細」、「發票明細」、「消費品項」、「明細」、「商品」等多餘贅字）。
  - 若發票/收據原本即為【繁體中文（台幣發票）】："name" 請填寫真實品名（如「Global Mall 板橋車站」或具體商品名），**"name_foreign" 欄位請留空 "" 或填寫與 "name" 完全相同的中文**，絕對不要寫多餘的中文翻譯或「購物明細」。
  - 若發票/收據為【外文（如日文、韓文、英文等）】：
    - "name" 欄位請填寫翻譯後的【繁體中文品名】（例如：「可口可樂 500ml」）。
    - "name_foreign" 欄位請填寫發票上的【原始外文品名】（例如：「コカ・コーラ 500ml」）。

【台灣收據格式特別規範（非常重要！）】：
- 台灣連鎖餐飲收據的品項格式為：「品名  單價  數量  小計TX」，例如「蛋捲冰淇淋  18  2  36TX」代表單價18元×數量2=小計36元。price 請填【單價(18)】，count 請填【數量(2)】，勿將小計當作 price。後綴 TX 代表含稅，可忽略。
- 品名前綴「D」代表【折扣優惠價 (Discount)】，絕對不是口味或規格。例如「D蛋捲冰淇淋  10  1  10TX」→ name 應為「蛋捲冰淇淋（折扣）」，price=10，count=1。勿將 D 讀成「D口味」。
- 品名前綴「@」代表點數/優惠兌換，如「@金選 那堤」是正常品名，直接使用即可。
- 後綴「1P」或「IP」表示累積點數，不影響金額。


【品項分類 category 嚴格判定標準】：
- "food" (食)：【僅限即時食用 / 現場用餐 / 正餐 / 點心 / 餐廳 / 速食】（例如：松屋、吉野家、一蘭拉麵、麥當勞、星巴克、餐廳內用、外帶熱食便當、咖啡廳點心、現場吃掉的冰品）。
- "shopping" (購物)：若是在【藥妝店】（如松本清、大國藥妝、Sundrug）、免稅店、百貨公司、超市購買之物品（即使買了保健食品、膠囊、軟糖、伴手禮盒、保養品、藥品、化妝品），因屬於非現場即時享用之商品/購物品項，務必統一歸類為 "shopping"！
- "transport" (交通)：車票、捷運、JR、加油、計程車。
- "business" (公務/文具)：辦公用品、書籍講義。

【重要日期與時間 (date) 辨識規範（非常重要！）】：
- 請務必仔細搜尋並讀取發票/收據上的【交易日期與具體時間（幾點幾分/秒）】。
- "date" 欄位請輸出完整包含日與時間的格式：「YYYY-MM-DD HH:mm:ss」或「YYYY-MM-DD HH:mm」（例如：「2026-09-03 14:35:20」或「2026-09-03 14:35」）。
- 若發票為台灣民國年（如 115/09/03 14:35 或 115年9月3日 14點35分），請自動將民國年加 1911 換算為西元年（如「2026-09-03 14:35:00」）。
- 若發票上只看得出日期看不出具體時間，才輸出「YYYY-MM-DD」。

請分析圖片內容並輸出 JSON 格式：
{
  "is_valid_item": true,
  "detected_description": "說明照片中實際拍攝到的內容",
  "store_name": "店家名稱（例如：FamilyMart 東京店）",
  "store_location": "東京, 日本",
  "original_currency": "JPY",
  "currency_symbol": "¥",
  "rate_to_twd": 0.21,
  "date": "2026-09-19 14:35:00",
  "items": [
    {
      "name": "繁體中文品名",
      "name_foreign": "發票上的原始外文品名 (若為繁體中文發票則留空 \"\" 或同 name)",
      "price": 650,
      "count": 1,
      "category": "food"
    }
  ]
}`;

        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: base64Clean
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json",
                temperature: 0.1,
                top_p: 0.95
            }
        };

        // 官方最新極速低成本 Flash-Lite / Flash 模型清單 (以極速低延遲 Lite 為第一優先)
        const modelsToTry = [
            'gemini-3.5-flash-lite',
            'gemini-3.6-flash',
            'gemini-3.5-flash'
        ];

        let lastErr = null;
        for (const model of modelsToTry) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const parts = data.candidates?.[0]?.content?.parts || [];
                        const textPart = parts.find(p => p.text && p.text.trim()) || parts[0];
                        const textResult = textPart?.text;
                        if (!textResult) throw new Error('無法識別圖片內容');
                        
                        let cleanText = textResult.trim()
                            .replace(/^```(?:json)?\s*/i, '')
                            .replace(/\s*```$/i, '')
                            .trim();
                        
                        const firstBrace = cleanText.indexOf('{');
                        const lastBrace = cleanText.lastIndexOf('}');
                        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
                        }
                        
                        return JSON.parse(cleanText);
                    }

                    const errJson = await res.json().catch(() => ({}));
                    const rawMsg = errJson.error?.message || `API 錯誤 (${res.status})`;
                    lastErr = rawMsg;

                    const lowerMsg = (rawMsg || '').toLowerCase();
                    // 若模型不存在或已停用 (404 / 400 / not found / no longer available)，立刻切換至下一模型
                    if (res.status === 404 || res.status === 400 || lowerMsg.includes('not found') || lowerMsg.includes('no longer available')) {
                        break;
                    }

                    // 若遇到 503 / 429 / High Demand 高用量暫時性塞車，延遲 800ms 後重試
                    if (res.status === 503 || res.status === 429 || lowerMsg.includes('high demand') || lowerMsg.includes('spikes in demand')) {
                        await new Promise(r => setTimeout(r, 800));
                        continue;
                    } else {
                        break;
                    }
                } catch (e) {
                    lastErr = e.message;
                }
            }
        }

        if (lastErr && (lastErr.includes('high demand') || lastErr.includes('503') || lastErr.includes('spikes in demand'))) {
            throw new Error('⚡ AI 服務目前使用流量較高，請再按一次「AI 辨識」即可完成！');
        }
        throw new Error(lastErr || '辨識失敗，請重新嘗試');
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

        const origCurr = data.original_currency || (currentGpsLocation ? currentGpsLocation.currency : 'TWD');
        const currSym = data.currency_symbol || (currentGpsLocation ? currentGpsLocation.symbol : '$');
        const rateToTwd = Number(data.rate_to_twd) || 1;
        const storeLocation = data.store_location || (currentGpsLocation ? currentGpsLocation.locationName : '');

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
                    scanMenu.classList.add('drag-drop-active');
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
                    scanMenu.classList.remove('drag-drop-active');
                    if (colLeft) colLeft.classList.remove('drag-drop-active');
                }
            });
            target.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                scanMenu.classList.remove('drag-drop-active');
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
                                    <input type="password" id="ai-quick-key-input" placeholder="貼上 Gemini API Key (AIzaSy...)" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.6);color:#fff;font-size:12px;outline:none;">
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
