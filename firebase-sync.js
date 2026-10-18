(function () {
    // ===== Firebase 設定（維持不變）=====
    const firebaseConfig = {
        apiKey: "AIzaSyCDi3qPySBJtr5CxpsIk2kQm7adS_ozHMY",
        authDomain: "premium-business-calculator.firebaseapp.com",
        projectId: "premium-business-calculator",
        storageBucket: "premium-business-calculator.firebasestorage.app",
        messagingSenderId: "217376135609",
        appId: "1:217376135609:web:381101bda8484773d73e68",
        measurementId: "G-ZJB8H8WJHC"
    };

    // ===== 常數 =====
    const META_APPLIED = '_cloud_appliedAt';  // 本機已套用的雲端版本時間戳
    const META_DIRTY = '_cloud_dirty';        // 本機有尚未上傳的修改
    const SKIP_EMPTY_HISTORY = true;          // true：歷史為空時不覆蓋雲端
    const PUSH_DELAY_MS = 800;                // 合併短時間內的多次修改

    // 純本地快取性質的鍵，排除在雲端同步之外（避免匯率定時抓取觸發多設備互相覆蓋與 reload）
    const EXCLUDE_SYNC_KEYS = new Set([
        'bCalc_rates',
        'bCalc_rates_time',
        'bCalc_rates_timestamp'
    ]);

    // ===== 狀態 =====
    let currentUser = null;
    let isSyncing = false;
    let pendingSync = false;
    let pushTimer = null;

    if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK is not loaded.');
        return;
    }
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const auth = firebase.auth();
    const db = firebase.firestore();
    const originalSetItem = Storage.prototype.setItem;

    // ===== UI 初始化 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSyncUI);
    } else {
        initSyncUI();
    }

    function initSyncUI() {
        const card = document.getElementById('cloud-sync-status-card');
        if (!card) return;

        auth.onAuthStateChanged((user) => {
            currentUser = user;
            updateSyncUI(user);
            if (user) {
                syncFromCloud(user.uid);
            }
        });
    }

    function updateSyncUI(user) {
        const card = document.getElementById('cloud-sync-status-card');
        if (!card) return;

        if (user) {
            const photoUrl = user.photoURL || '';
            const displayName = user.displayName || user.email || 'User';
            const email = user.email || '';

            card.innerHTML = `
                <div class="cloud-avatar-circle logged-in" id="btn-user-profile-avatar" title="${escapeHtml(displayName)} (${escapeHtml(email)}) - 點擊登出">
                    ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" class="cloud-avatar-img" alt="Avatar" referrerpolicy="no-referrer">` : `<span class="cloud-avatar-text">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`}
                    <span class="online-sync-dot" title="雲端自動同步中"></span>
                </div>
            `;

            document.getElementById('btn-user-profile-avatar')?.addEventListener('click', () => {
                if (confirm(`確定要登出 Google 帳號嗎？\n(${displayName})`)) {
                    handleSignOut();
                }
            });
        } else {
            card.innerHTML = `
                <button class="cloud-avatar-circle logged-out" id="btn-google-login" title="使用 Google 帳號登入與同步" aria-label="Google 登入">
                    <svg class="google-avatar-icon" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                </button>
            `;

            document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleLogin);
        }

        if (typeof window.applyTranslations === 'function') {
            window.applyTranslations();
        }
    }

    // ===== 登入 / 登出 =====
    let isLoggingIn = false;

    async function handleGoogleLogin() {
        if (isLoggingIn) return;
        isLoggingIn = true;
        const btn = document.getElementById('btn-google-login');
        if (btn) btn.style.pointerEvents = 'none';

        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error('Google Login Error:', error);
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                alert('Google 登入失敗: ' + error.message);
            }
        } finally {
            isLoggingIn = false;
            if (btn) btn.style.pointerEvents = 'auto';
        }
    }

    function handleSignOut() {
        auth.signOut().then(() => {
            updateSyncUI(null);
            showToast('👋 已安全登出');
        }).catch((err) => {
            console.error('Sign Out Error:', err);
        });
    }

    // ===== 從雲端載入（登入時）=====
    async function syncFromCloud(uid) {
        if (!uid) return;
        try {
            const doc = await db.collection('users').doc(uid).get({ source: 'server' });

            // 雲端沒有資料：把本機上傳
            if (!doc.exists) {
                await pushAll(uid);
                return;
            }

            const cloudData = doc.data() || {};
            const cloudTs = (cloudData.updatedAt && cloudData.updatedAt.toMillis()) || 0;
            const appliedTs = parseInt(localStorage.getItem(META_APPLIED) || '0', 10);

            // 這個雲端版本已套用過，不重複處理
            if (cloudTs && cloudTs === appliedTs) return;

            // 本機有尚未上傳的修改：先上傳，不覆蓋
            if (localStorage.getItem(META_DIRTY) === '1') {
                await pushAll(uid);
                return;
            }

            let changed = false;
            window._isPullingCloud = true;
            try {
                Object.keys(cloudData).forEach(key => {
                    if (!key.startsWith('bCalc_') || EXCLUDE_SYNC_KEYS.has(key) || typeof cloudData[key] !== 'string') return;
                    if (localStorage.getItem(key) !== cloudData[key]) {
                        localStorage.setItem(key, cloudData[key]);
                        changed = true;
                    }
                });
            } finally {
                window._isPullingCloud = false;
            }

            localStorage.setItem(META_APPLIED, String(cloudTs || Date.now()));
            localStorage.setItem(META_DIRTY, '0');

            if (changed) {
                showToast('☁️ 已從雲端載入最新紀錄');
                setTimeout(() => window.location.reload(), 400);
            }
        } catch (err) {
            console.error('Fetch Cloud Sync Error:', err);
            handleFirestoreError(err);
        }
    }

    // ===== 上傳到雲端 =====
    function collectLocalData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('bCalc_') && !EXCLUDE_SYNC_KEYS.has(key)) {
                const val = localStorage.getItem(key);
                if (val !== null) data[key] = val;
            }
        }
        if (SKIP_EMPTY_HISTORY && data['bCalc_history'] === '[]') {
            delete data['bCalc_history'];
        }
        return data;
    }

    async function pushAll(uid) {
        if (!uid) return;
        if (isSyncing) { pendingSync = true; return; }
        isSyncing = true;
        setDot('syncing');
        localStorage.setItem(META_DIRTY, '0');

        try {
            const payload = {
                ...collectLocalData(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const ref = db.collection('users').doc(uid);
            await ref.set(payload, { merge: true });

            // 讀回伺服器時間，記為已套用版本，避免自己上傳後又被下載重整
            const snap = await ref.get({ source: 'server' });
            const ts = (snap.data() && snap.data().updatedAt && snap.data().updatedAt.toMillis()) || Date.now();
            localStorage.setItem(META_APPLIED, String(ts));
        } catch (err) {
            console.error('Cloud Sync Error:', err);
            localStorage.setItem(META_DIRTY, '1');
            handleFirestoreError(err);
        } finally {
            isSyncing = false;
            setDot('idle');
            if (pendingSync) {
                pendingSync = false;
                pushAll(uid);
            }
        }
    }

    function setDot(state) {
        const dot = document.querySelector('.online-sync-dot');
        if (!dot) return;
        dot.classList.toggle('syncing', state === 'syncing');
    }

    // ===== 錯誤處理 =====
    function handleFirestoreError(err) {
        const msg = err ? (err.message || String(err)) : '';
        if (err && err.code === 'permission-denied') {
            alert('⚠️ 雲端同步失敗（權限不足）：\n請至 Firebase 控制台的 Firestore Database -> 規則 (Rules) 開啟讀寫權限！');
        } else if (err && (err.code === 'not-found' || (msg.includes('database') && msg.includes('not exist')))) {
            alert('⚠️ 尚未建立 Firestore 資料庫：\n請至 Firebase 控制台點選「Firestore Database」並點擊「建立資料庫」。');
        }
    }

    function showToast(msg) {
        if (typeof window.showToastMsg === 'function') {
            window.showToastMsg(msg);
        }
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===== 攔截 localStorage 寫入，自動排程上傳 =====
    Storage.prototype.setItem = function (key, value) {
        originalSetItem.apply(this, arguments);
        if (this !== localStorage || typeof key !== 'string' || !key.startsWith('bCalc_') || EXCLUDE_SYNC_KEYS.has(key)) return;
        if (window._isPullingCloud) return;
        if (!currentUser) return;

        originalSetItem.call(localStorage, META_DIRTY, '1');
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => pushAll(currentUser.uid), PUSH_DELAY_MS);
    };

    // ===== 對外介面 =====
    window.triggerCloudSync = function () {
        if (!currentUser) return;
        clearTimeout(pushTimer);
        pushAll(currentUser.uid);
    };
})();
