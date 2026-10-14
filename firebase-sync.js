(function () {
    // Firebase Configuration provided by user
    const firebaseConfig = {
        apiKey: "AIzaSyCDi3qPySBJtr5CxpsIk2kQm7adS_ozHMY",
        authDomain: "premium-business-calculator.firebaseapp.com",
        projectId: "premium-business-calculator",
        storageBucket: "premium-business-calculator.firebasestorage.app",
        messagingSenderId: "217376135609",
        appId: "1:217376135609:web:381101bda8484773d73e68",
        measurementId: "G-ZJB8H8WJHC"
    };

    let currentUser = null;
    let isSyncing = false;
    const META_APPLIED = '_cloud_appliedAt'; // 本機上次套用/上傳的雲端版本時間
    const META_DIRTY = '_cloud_dirty';       // 本機有尚未上傳的修改
    let pendingSync = false;

    // Keys to sync between local storage and Firestore
    const SYNC_KEYS = [
        'bCalc_history',
        'bCalc_keyboard_layout',
        'bCalc_keyboard_snapshots',
        'bCalc_theme_color',
        'bCalc_light_mode',
        'bCalc_decimals',
        'bCalc_tax_rates',
        'bCalc_percent_mode',
        'bCalc_haptic',
        'bCalc_large_number_format',
        'bCalc_category_bubble',
        'bCalc_curr_from',
        'bCalc_curr_to',
        'bCalc_tax_excluded',
        'bCalc_font_style',
        'bCalc_lang'
    ];

    // Initialize Firebase if compat SDK loaded
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
    } else {
        console.warn("Firebase SDK is not loaded.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // DOM Elements for UI
    document.addEventListener('DOMContentLoaded', () => {
        initSyncUI();
    });

    function initSyncUI() {
        const loginContainer = document.getElementById('cloud-sync-status-card');
        if (!loginContainer) return;

        // Monitor Auth State
        auth.onAuthStateChanged((user) => {
            currentUser = user;
            updateSyncUI(user);
            if (user) {
                // Pull cloud data and merge on login
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
                    ${photoUrl ? `<img src="${photoUrl}" class="cloud-avatar-img" alt="Avatar" referrerpolicy="no-referrer">` : `<span class="cloud-avatar-text">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`}
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

        // Apply i18n translations if function available
        if (typeof window.applyTranslations === 'function') {
            window.applyTranslations();
        }
    }

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
            console.error("Google Login Error:", error);
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                alert("Google 登入失敗: " + error.message);
            }
        } finally {
            isLoggingIn = false;
            if (btn) btn.style.pointerEvents = 'auto';
        }
    }

    function handleSignOut() {
        auth.signOut().then(() => {
            updateSyncUI(null);
            if (typeof window.showToastMsg === 'function') {
                window.showToastMsg('👋 已安全登出');
            }
        }).catch((err) => {
            console.error("Sign Out Error:", err);
        });
    }

    async function syncToCloud(uid, showToast = false) {
        if (!uid) return;
        if (isSyncing) { pendingSync = true; return; }
        isSyncing = true;
        localStorage.setItem(META_DIRTY, '0'); // 先清除，上傳期間若有新修改會被重新標記

        try {
            const dataToSync = {
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('bCalc_')) {
                    const val = localStorage.getItem(key);
                    if (val !== null) dataToSync[key] = val;
                }
            }

            const ref = db.collection('users').doc(uid);
            await ref.set(dataToSync, { merge: true });

            // 記下這次雲端版本的時間，下次登入就不會誤判為「雲端有更新」
            const snap = await ref.get({ source: 'server' });
            const ts = (snap.data() && snap.data().updatedAt && snap.data().updatedAt.toMillis())
                || Date.now();
            localStorage.setItem(META_APPLIED, String(ts));

            if (showToast && typeof window.showToastMsg === 'function') {
                window.showToastMsg('☁️ 雲端同步完成');
            }
        } catch (err) {
            console.error("Cloud Sync Error:", err);
            localStorage.setItem(META_DIRTY, '1'); // 失敗要保留待上傳標記
            handleFirestoreError(err);
        } finally {
            isSyncing = false;
            if (pendingSync) {
                pendingSync = false;
                syncToCloud(uid, false);
            }
        }
    }

    async function syncFromCloud(uid) {
        if (!uid) return;
        try {
            const ref = db.collection('users').doc(uid);
            const doc = await ref.get({ source: 'server' });

            // 雲端沒有資料：把本機備份上去
            if (!doc.exists) {
                await syncToCloud(uid, false);
                return;
            }

            const cloudData = doc.data() || {};
            const cloudTs = (cloudData.updatedAt && cloudData.updatedAt.toMillis()) || 0;
            const appliedTs = parseInt(localStorage.getItem(META_APPLIED) || '0', 10);
            const dirty = localStorage.getItem(META_DIRTY) === '1';
            const neverSynced = appliedTs === 0;

            // 這台裝置同步過、且本機有未上傳的修改 → 以本機為準上傳
            if (!neverSynced && dirty) {
                await syncToCloud(uid, false);
                return;
            }

            // 雲端沒有比本機已套用的版本更新 → 什麼都不用做（不重載）
            if (cloudTs <= appliedTs) return;

            // 雲端較新（或這台裝置第一次登入）→ 套用雲端資料
            let changed = false;
            window._isPullingCloud = true;
            try {
                Object.keys(cloudData).forEach(key => {
                    if (key.startsWith('bCalc_') && localStorage.getItem(key) !== cloudData[key]) {
                        localStorage.setItem(key, cloudData[key]);
                        changed = true;
                    }
                });
            } finally {
                window._isPullingCloud = false;
            }

            // 關鍵：先記錄已套用的版本，重載後就不會再進到這裡
            localStorage.setItem(META_APPLIED, String(cloudTs));
            localStorage.setItem(META_DIRTY, '0');

            if (changed) {
                if (typeof window.showToastMsg === 'function') {
                    window.showToastMsg('☁️ 已從雲端載入最新紀錄');
                }
                setTimeout(() => window.location.reload(), 400);
            }
        } catch (err) {
            console.error("Fetch Cloud Sync Error:", err);
            handleFirestoreError(err);
        }
    }

    function handleFirestoreError(err) {
        const errMsg = err ? (err.message || String(err)) : '';
        if (err && err.code === 'permission-denied') {
            alert("⚠️ 雲端同步失敗（權限不足）：\n請至 Firebase 控制台的 Firestore Database -> 規則 (Rules) 開啟讀寫權限！");
        } else if (err && (err.code === 'not-found' || errMsg.includes('database') && errMsg.includes('not exist'))) {
            alert("⚠️ 尚未建立 Firestore 資料庫：\n請至 Firebase 控制台點選「Firestore Database」並點擊「建立資料庫」。");
        }
    }

    // Helper HTML escaper
    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Intercept Storage.prototype.setItem so ANY calculation, input, or setting change automatically syncs to cloud
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        originalSetItem.apply(this, arguments);
        if (this === localStorage && typeof key === 'string' && key.startsWith('bCalc_')
            && !window._isPullingCloud) {
            originalSetItem.call(localStorage, META_DIRTY, '1'); // 標記本機有未上傳修改
            if (typeof window.triggerCloudSync === 'function') {
                window.triggerCloudSync();
            }
        }
    };

    // Automatic silent background sync with breathing dot indicator
    window.triggerCloudSync = function () {
        if (!currentUser) return;
        const dot = document.querySelector('.online-sync-dot');
        if (dot) dot.classList.add('syncing');

        if (window._cloudSyncTimer) clearTimeout(window._cloudSyncTimer);
        window._cloudSyncTimer = setTimeout(async () => {
            await syncToCloud(currentUser.uid, false);
            if (dot) dot.classList.remove('syncing');
        }, 800);
    };
})();
