// המפתחות שלך שנוצרו ב-Firebase
const firebaseConfig = {
    apiKey: "AIzaSyASJW8HIsfQ-S7CbAuxgaFbSj0CutgN8ZY",
    authDomain: "portfolio-clash-3e70d.firebaseapp.com",
    projectId: "portfolio-clash-3e70d",
    storageBucket: "portfolio-clash-3e70d.firebasestorage.app",
    messagingSenderId: "903714514589",
    appId: "1:903714514589:web:860cc0a17296634f7ad674",
    measurementId: "G-B23YYE9YQZ"
};

// אימייל המנהל הראשי של המערכת
const ADMIN_EMAIL = "shlomi19871@gmail.com";

const API_KEY = "d9p11a9r01qh40a7cb4gd9p11a9r01qh40a7cb50";
const FINNHUB_CACHE_TTL_MS = 2 * 60 * 1000;
const FINNHUB_MIN_REQUEST_GAP_MS = 350;
const FINNHUB_SYMBOL_RE = /^[A-Z0-9.-]{1,12}$/;
const finnhubCache = new Map();
let lastFinnhubRequestAt = 0;

// הגדרות התראת טלגרם
const TELEGRAM_BOT_TOKEN = "8996503881:AAFw851erUAgn6dZjLyc6VjAksCEtc2fj2U";
const TELEGRAM_CHAT_ID = "1174515533";

// ===== רשימת מדדים ומטבעות בזמן אמת =====
const MARKET_ASSETS = [
    { id: 'sp500', name: 'S&P 500', symbol: 'SPY', api: 'finnhub' },
    { id: 'nasdaq', name: 'נאסד"ק', symbol: 'ONEQ', api: 'finnhub' },
    { id: 'ndx100', name: 'נאסד"ק 100', symbol: 'QQQ', api: 'finnhub' },
    { id: 'dow30', name: 'דאו ג\'ונס 30', symbol: 'DIA', api: 'finnhub' },
    { id: 'russell2000', name: 'ראסל 2000', symbol: 'IWM', api: 'finnhub' },
    { id: 'vix', name: 'VIX', symbol: 'VXX', api: 'finnhub' },
    { id: 'voo', name: 'VOO', symbol: 'VOO', api: 'finnhub' },
    { id: 'ivv', name: 'IVV', symbol: 'IVV', api: 'finnhub' },
    { id: 'sox', name: 'SOX', symbol: 'SOXX', api: 'finnhub' },
    { id: 'qqq', name: 'QQQ', symbol: 'QQQ', api: 'finnhub' },
    { id: 'dia', name: 'DIA', symbol: 'DIA', api: 'finnhub' },
    { id: 'btc', name: 'ביטקוין', symbol: 'BTCUSDT', api: 'binance' },
    { id: 'eth', name: 'אתריום', symbol: 'ETHUSDT', api: 'binance' },
    { id: 'sol', name: 'סולאנה', symbol: 'SOLUSDT', api: 'binance' }
];

function isValidSymbol(symbol) {
    return FINNHUB_SYMBOL_RE.test(String(symbol || '').trim().toUpperCase());
}

async function waitForFinnhubTurn() {
    const elapsed = Date.now() - lastFinnhubRequestAt;
    if (elapsed < FINNHUB_MIN_REQUEST_GAP_MS) {
        await new Promise(resolve => setTimeout(resolve, FINNHUB_MIN_REQUEST_GAP_MS - elapsed));
    }
    lastFinnhubRequestAt = Date.now();
}

async function fetchFinnhubJson(endpoint, params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase();
    if (!isValidSymbol(symbol)) {
        throw new Error('סימבול לא תקין');
    }

    const query = new URLSearchParams({ ...params, symbol, token: API_KEY });
    const url = `https://finnhub.io/api/v1/${endpoint}?${query.toString()}`;
    const cacheKey = `${endpoint}:${query.toString().replace(API_KEY, '[token]')}`;
    const cached = finnhubCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < FINNHUB_CACHE_TTL_MS) {
        return cached.data;
    }

    await waitForFinnhubTurn();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Finnhub returned ${response.status}`);
        }
        const data = await response.json();
        finnhubCache.set(cacheKey, { data, createdAt: Date.now() });
        return data;
    } finally {
        clearTimeout(timeoutId);
    }
}

function marketCardHtml(asset) {
    return `
        <div class="market-card">
            <div class="market-card-title">
                <span>${asset.name}</span>
                <span class="market-card-symbol">${asset.symbol.replace('USDT','')}</span>
            </div>
            <div class="market-card-price" data-price-for="${asset.id}">טוען...</div>
            <div class="market-card-change" data-change-for="${asset.id}">—</div>
        </div>
    `;
}

// ===== לולאת גלילה אינסופית (מדויקת בפיקסלים) עבור סרגל המדדים =====
const marketMarquee = { offset: 0, setWidth: 0, rafId: null, paused: false, started: false };

function measureMarketSetWidth(track) {
    const children = Array.from(track.children);
    const half = children.length / 2;
    if (half <= 0) return 0;
    // המרחק בין תחילת הפריט הראשון לתחילת הפריט המקביל לו בעותק השני
    // הוא בדיוק הרוחב של "סט" אחד (כולל כל המרווחים) - כך שהלולאה תמיד תהיה חלקה.
    // שימוש ב-Math.abs: בעמוד RTL (כמו כאן) סדר ה-offsetLeft הפוך (הפריט הראשון
    // מוצג מימין ולכן offsetLeft שלו גדול יותר) - בלי abs היינו מקבלים מספר שלילי
    // והלולאה כלל לא הייתה מתחילה לזוז.
    return Math.abs(track.children[half].offsetLeft - track.children[0].offsetLeft);
}

function initMarketMarquee() {
    const grid = document.getElementById('marketGrid');
    const track = grid ? grid.querySelector('.market-track') : null;
    if (!grid || !track) return;

    marketMarquee.setWidth = measureMarketSetWidth(track);
    if (marketMarquee.setWidth <= 0) return;

    // אם התנועה מכובה על ידי המשתמש (הגדרת נגישות), משאירים את הסרגל סטטי.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        track.style.transform = 'translateX(0)';
        return;
    }

    if (!marketMarquee.started) {
        marketMarquee.started = true;
        grid.addEventListener('mouseenter', () => { marketMarquee.paused = true; });
        grid.addEventListener('mouseleave', () => { marketMarquee.paused = false; });
        window.addEventListener('resize', () => {
            const newWidth = measureMarketSetWidth(track);
            if (newWidth > 0) {
                marketMarquee.offset = marketMarquee.offset % newWidth;
                marketMarquee.setWidth = newWidth;
            }
        });
    }

    if (marketMarquee.rafId) cancelAnimationFrame(marketMarquee.rafId);

    const PIXELS_PER_SECOND = 32;
    let lastTs = null;

    function step(ts) {
        if (lastTs === null) lastTs = ts;
        const deltaSeconds = (ts - lastTs) / 1000;
        lastTs = ts;

        if (!marketMarquee.paused && marketMarquee.setWidth > 0) {
            marketMarquee.offset += PIXELS_PER_SECOND * deltaSeconds;
            // ברגע שריבוע שלם "נכנס" משמאל, מאפסים בצורה חלקה - כך שהוא בעצם "יוצא" מימין מחדש (לולאה אינסופית אמיתית).
            if (marketMarquee.offset >= marketMarquee.setWidth) {
                marketMarquee.offset -= marketMarquee.setWidth;
            }
            track.style.transform = `translateX(${-marketMarquee.offset}px)`;
        }
        marketMarquee.rafId = requestAnimationFrame(step);
    }
    marketMarquee.rafId = requestAnimationFrame(step);
}

async function fetchMarketData() {
    const grid = document.getElementById('marketGrid');
    if (!grid) return;

    let justBuilt = false;
    if (grid.children.length === 0) {
        const cardsHtml = MARKET_ASSETS.map(marketCardHtml).join('');
        const track = document.createElement('div');
        track.className = 'market-track';
        track.innerHTML = cardsHtml + cardsHtml;
        grid.appendChild(track);
        justBuilt = true;
    }

    for (const asset of MARKET_ASSETS) {
        try {
            let price = null, changePercent = null;
            if (asset.api === 'binance') {
                const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${asset.symbol}`);
                const data = await res.json();
                if (data && data.lastPrice) {
                    price = parseFloat(data.lastPrice);
                    changePercent = parseFloat(data.priceChangePercent);
                }
            } else {
                const data = await fetchFinnhubJson('quote', { symbol: asset.symbol });
                if (data && data.c && data.c > 0) {
                    price = data.c;
                    changePercent = data.dp !== undefined && data.dp !== null ? data.dp : ((data.c - data.pc) / data.pc) * 100;
                }
            }

            const priceEls = grid.querySelectorAll(`[data-price-for="${asset.id}"]`);
            const changeEls = grid.querySelectorAll(`[data-change-for="${asset.id}"]`);

            if (price !== null && priceEls.length && changeEls.length) {
                const formattedPrice = price >= 1000 ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(2);
                const sign = changePercent >= 0 ? '+' : '';
                const color = changePercent >= 0 ? '#00ff87' : '#ff5555';
                const icon = changePercent >= 0 ? '<i class="fa-solid fa-caret-up"></i>' : '<i class="fa-solid fa-caret-down"></i>';

                priceEls.forEach(el => { el.innerText = `$${formattedPrice}`; });
                changeEls.forEach(el => {
                    el.innerHTML = `${icon} ${sign}${changePercent.toFixed(2)}%`;
                    el.style.color = color;
                });
            }
        } catch (e) {
            console.error(`שגיאה בטעינת נתונים עבור ${asset.name}:`, e);
        }
    }

    if (justBuilt) {
        // ממתינים לפריים הבא כדי לוודא שהדפדפן סיים למדוד את רוחב הכרטיסים בפועל.
        requestAnimationFrame(() => requestAnimationFrame(initMarketMarquee));
    }
}

// טעינה ראשונית ועדכון אוטומטי של המדדים.
// חשוב: זה רשום כאן, מוקדם בקובץ ובנפרד מ-Firebase, כדי שסרגל המדדים תמיד יעבוד
// גם אם משהו בהמשך הקובץ (למשל טעינת Firebase) נכשל או נזרק עליו שגיאה.
window.addEventListener('DOMContentLoaded', () => {
    fetchMarketData();
    setInterval(fetchMarketData, 5 * 60 * 1000);
});

async function sendTelegramNotification(text, phone, email, context) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('הכנס_כאן')) return;
    const contextLabel = context === 'subscribe' ? '💳 בקשת מנוי חדשה'
        : context === 'register' ? '🆕 נרשם חדש באתר'
        : '📩 הודעה חדשה מהאתר';
    const phoneLine = phone ? `📞 טלפון: ${phone}\n` : '';
    const message = `${contextLabel}\n\n${phoneLine}✉️ אימייל: ${email}\n\n${text}`;
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
        });
    } catch (e) {
        console.error('שגיאה בשליחת התראת טלגרם:', e);
    }
}

// אתחול Firebase
// עטוף ב-try/catch: אם ה-SDK של Firebase לא נטען מסיבה כלשהי (למשל חוסם פרסומות,
// בעיית רשת רגעית או תוסף דפדפן), שגיאה כאן לא תעצור את שאר הקוד בקובץ.
let auth = null;
let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
} catch (e) {
    console.error('שגיאה באתחול Firebase - התחברות ושמירה בענן לא יהיו זמינות:', e);
}

let portfolio = [];
let myChart = null;
let currentUser = null;

// האזנה לשינוי מצב משתמש
if (auth) {
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists && userDoc.data().approved) {
            currentUser = user;
            document.getElementById('currentUsername').innerText = user.email;
            document.getElementById('logoutBtn').style.display = 'block';

            if (user.email === ADMIN_EMAIL) {
                document.getElementById('adminTabBtn').style.display = 'flex';
            }

            trackVisit(true);
            loadCloudPortfolio();
        } else {
            alert("החשבון שלך ממתין לאישור מנהל המערכת.");
            auth.signOut();
        }
    } else {
        currentUser = null;
        document.getElementById('currentUsername').innerText = 'אורח (לא מחובר)';
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('adminTabBtn').style.display = 'none';
        trackVisit(false);
        portfolio = [];
        renderTable();
    }
});
}

// הרשמת משתמש חדש
async function register() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!email || !password) return alert("אנא הזן אימייל וסיסמה.");

    try {
        const res = await auth.createUserWithEmailAndPassword(email, password);
        const isAutoAdmin = (email === ADMIN_EMAIL);
        await db.collection('users').doc(res.user.uid).set({
            email: email,
            approved: isAutoAdmin
        });
        
        if (isAutoAdmin) {
            alert("נרשמת כאיש ניהול! החשבון מאושר אוטומטית.");
        } else {
            sendTelegramNotification("משתמש חדש נרשם וממתין לאישור.", '', email, 'register');
            alert("בקשת ההרשמה נשלחה! החשבון יופעל רק לאחר אישור מנהל.");
            auth.signOut();
        }
    } catch (err) {
        alert("שגיאה בהרשמה: " + translateAuthError(err));
    }
}

// התחברות
async function login() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!email || !password) return alert("אנא הזן אימייל וסיסמה.");

    try {
        await auth.signInWithEmailAndPassword(email, password);
        switchTab('portfolio');
    } catch (err) {
        alert("שגיאה בהתחברות: " + translateAuthError(err));
    }
}

// איפוס סיסמה
async function forgotPassword() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) {
        return alert("קודם הזן את כתובת האימייל שלך בשדה למעלה, ואז לחץ שוב על 'שכחתי סיסמה'.");
    }
    try {
        await auth.sendPasswordResetEmail(email);
        alert("נשלח מייל איפוס סיסמה אל " + email + ". בדוק גם בתיקיית ספאם.");
    } catch (err) {
        alert("שגיאה בשליחת מייל איפוס: " + translateAuthError(err));
    }
}

function translateAuthError(err) {
    const map = {
        'auth/wrong-password': 'הסיסמה שגויה.',
        'auth/user-not-found': 'לא נמצא משתמש עם האימייל הזה.',
        'auth/invalid-credential': 'אימייל או סיסמה שגויים.',
        'auth/invalid-email': 'כתובת האימייל אינה תקינה.',
        'auth/too-many-requests': 'יותר מדי ניסיונות כושלים. נסה שוב בעוד כמה דקות, או אפס סיסמה.',
        'auth/email-already-in-use': 'כתובת האימייל הזו כבר רשומה במערכת.',
        'auth/weak-password': 'הסיסמה חלשה מדי (נדרשים לפחות 6 תווים).',
        'auth/network-request-failed': 'בעיית רשת. בדוק את החיבור לאינטרנט ונסה שוב.'
    };
    return map[err.code] || err.message;
}

function logout() {
    auth.signOut();
}

async function fetchRiskMetrics(symbol, currentPrice) {
    let riskLabel = 'לא זמין', riskColor = '#8b949e', distanceFromHigh = null;
    if (!isValidSymbol(symbol)) return { riskLabel, riskColor, distanceFromHigh };

    try {
        const metricData = await fetchFinnhubJson('stock/metric', { symbol, metric: 'all' });
        const beta = metricData?.metric?.beta;
        const week52High = metricData?.metric?.['52WeekHigh'];

        if (typeof beta === 'number') {
            if (beta < 0.8) { riskLabel = 'נמוך'; riskColor = '#00ff87'; }
            else if (beta <= 1.3) { riskLabel = 'בינוני'; riskColor = '#ffc107'; }
            else { riskLabel = 'גבוה'; riskColor = '#ff5555'; }
        }

        if (typeof week52High === 'number' && week52High > 0) {
            distanceFromHigh = ((week52High - currentPrice) / week52High) * 100;
        }
    } catch (e) {
        console.error(`[fetchRiskMetrics] שגיאת רשת עבור ${symbol}:`, e);
    }

    if (riskLabel === 'לא זמין') {
        try {
            const q = await fetchFinnhubJson('quote', { symbol });
            if (q && q.h && q.l && q.pc) {
                const dailyRangePercent = ((q.h - q.l) / q.pc) * 100;
                if (dailyRangePercent < 2) { riskLabel = 'נמוך (משוער)'; riskColor = '#00ff87'; }
                else if (dailyRangePercent <= 5) { riskLabel = 'בינוני (משוער)'; riskColor = '#ffc107'; }
                else { riskLabel = 'גבוה (משוער)'; riskColor = '#ff5555'; }
            }
        } catch (e) {}
    }

    return { riskLabel, riskColor, distanceFromHigh };
}

let autoFillInProgress = false;
async function autoFillMissingRiskData() {
    if (autoFillInProgress) return;
    const missing = portfolio.filter(s => !s.riskChecked);
    if (missing.length === 0) return;

    autoFillInProgress = true;
    for (const stock of missing) {
        const result = await fetchRiskMetrics(stock.symbol, stock.currentPrice);
        stock.riskLabel = result.riskLabel;
        stock.riskColor = result.riskColor;
        stock.distanceFromHigh = result.distanceFromHigh;
        stock.riskChecked = true;
    }
    autoFillInProgress = false;

    renderTable();
    if (currentUser) await saveCloudPortfolio();
}

setInterval(async () => {
    if (portfolio.length === 0) return;
    for (const stock of portfolio) {
        const result = await fetchRiskMetrics(stock.symbol, stock.currentPrice);
        stock.riskLabel = result.riskLabel;
        stock.riskColor = result.riskColor;
        stock.distanceFromHigh = result.distanceFromHigh;
        stock.riskChecked = true;
    }
    renderTable();
    if (currentUser) await saveCloudPortfolio();
}, 30 * 60 * 1000);

let contactContext = 'general';
function openContactModal(context) {
    contactContext = context;
    const title = document.getElementById('contactModalTitle');
    const textarea = document.getElementById('contactMessage');
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactEmail').value = currentUser ? currentUser.email : '';
    if (context === 'subscribe') {
        title.innerHTML = '<i class="fa-solid fa-crown"></i> בקשת הפעלת מנוי';
        textarea.value = 'שלום, אני מעוניין/ת להפעיל מנוי לתיק ההתנגשות. אשמח לפרטי תשלום.';
    } else {
        title.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שליחת הודעה למנהל';
        textarea.value = '';
    }
    document.getElementById('contactModalOverlay').style.display = 'flex';
}
function closeContactModal() {
    document.getElementById('contactModalOverlay').style.display = 'none';
}

async function sendContactMessage() {
    const phone = document.getElementById('contactPhone').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const text = document.getElementById('contactMessage').value.trim();

    if (!phone || !email) return alert('יש למלא מספר טלפון ואימייל לפני שליחת ההודעה.');
    if (!text) return alert('אנא כתוב הודעה לפני השליחה.');

    const btn = document.getElementById('sendContactBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שולח...';

    try {
        await db.collection('messages').add({
            text: text,
            context: contactContext,
            contactPhone: phone,
            contactEmail: email,
            fromEmail: currentUser ? currentUser.email : 'אורח (לא מחובר)',
            read: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        sendTelegramNotification(text, phone, email, contactContext);
        alert('ההודעה נשלחה בהצלחה! המנהל יחזור אליך בהקדם.');
        closeContactModal();
    } catch (err) {
        alert('שגיאה בשליחת ההודעה: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שלח הודעה';
    }
}

async function loadMessages() {
    const list = document.getElementById('messagesList');
    const badge = document.getElementById('unreadBadge');
    list.innerHTML = '<p style="color:#8b949e; text-align:center;">טוען הודעות...</p>';

    try {
        const snapshot = await db.collection('messages').orderBy('timestamp', 'desc').get();
        if (snapshot.empty) {
            list.innerHTML = '<p style="color:#8b949e; text-align:center;">אין הודעות עדיין.</p>';
            badge.innerText = '';
            return;
        }

        let unreadCount = 0;
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const m = doc.data();
            if (!m.read) unreadCount++;
            const dateStr = m.timestamp ? m.timestamp.toDate().toLocaleString('he-IL') : '';
            const contextLabel = m.context === 'subscribe' ? ' (בקשת מנוי)' : '';
            const div = document.createElement('div');
            div.className = 'message-item' + (m.read ? '' : ' unread');

            const meta = document.createElement('div');
            meta.className = 'message-meta';
            const from = document.createElement('span');
            from.textContent = `${m.fromEmail || 'אורח'}${contextLabel}`;
            const date = document.createElement('span');
            date.textContent = dateStr;
            meta.append(from, date);

            const contacts = document.createElement('div');
            contacts.style.cssText = 'color:#79c0ff; font-size:0.85rem; margin-bottom:6px; display:flex; gap:15px; flex-wrap:wrap;';
            const phone = document.createElement('span');
            phone.innerHTML = '<i class="fa-solid fa-phone"></i> ';
            phone.append(document.createTextNode(m.contactPhone || '—'));
            const email = document.createElement('span');
            email.innerHTML = '<i class="fa-solid fa-envelope"></i> ';
            email.append(document.createTextNode(m.contactEmail || '—'));
            contacts.append(phone, email);

            const text = document.createElement('div');
            text.className = 'message-text';
            text.textContent = m.text || '';

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
            if (!m.read) {
                const readBtn = document.createElement('button');
                readBtn.className = 'btn-approve';
                readBtn.textContent = 'סמן כנקרא';
                readBtn.addEventListener('click', () => markMessageRead(doc.id));
                actions.appendChild(readBtn);
            }
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> מחק';
            deleteBtn.addEventListener('click', () => deleteMessage(doc.id));
            actions.appendChild(deleteBtn);

            div.append(meta, contacts, text, actions);
            list.appendChild(div);
        });

        badge.innerText = unreadCount > 0 ? `(${unreadCount} חדשות)` : '';
    } catch (err) {
        list.innerHTML = '';
        const error = document.createElement('p');
        error.style.cssText = 'color:#ff5555; text-align:center;';
        error.textContent = `שגיאה בטעינת הודעות: ${err.message}`;
        list.appendChild(error);
    }
}

async function markMessageRead(id) {
    await db.collection('messages').doc(id).update({ read: true });
    loadMessages();
}

async function deleteMessage(id) {
    if (!confirm('למחוק את ההודעה?')) return;
    await db.collection('messages').doc(id).delete();
    loadMessages();
}

const TABLE_COLUMNS = [
    { id: 'symbol', label: 'סימבול' },
    { id: 'name', label: 'שם המניה' },
    { id: 'shares', label: 'כמות יחידות' },
    { id: 'buyPrice', label: 'שער כניסה' },
    { id: 'currentPrice', label: 'שער נוכחי' },
    { id: 'totalCost', label: 'עלות כוללת' },
    { id: 'currentValue', label: 'שווי נוכחי' },
    { id: 'profitDollar', label: 'רווח / הפסד ($)' },
    { id: 'profitPercent', label: 'רווח / הפסד (%)' },
    { id: 'risk', label: 'מדד סיכון' },
    { id: 'distanceHigh', label: 'מרחק משיא' },
    { id: 'action', label: 'מחיקה' },
    { id: 'news', label: 'חדשות' }
];

function getColumnPrefs() {
    try {
        return JSON.parse(localStorage.getItem('tableColumnPrefs') || '{}');
    } catch(e) { return {}; }
}

function populateColumnModal() {
    const list = document.getElementById('columnCheckboxList');
    const prefs = getColumnPrefs();
    list.innerHTML = TABLE_COLUMNS.map(col => {
        const checked = prefs[col.id] === false ? '' : 'checked';
        return `
            <div class="column-checkbox-row">
                <label for="colcheck-${col.id}" style="margin:0; color:#f0f6fc; cursor:pointer;">${col.label}</label>
                <input type="checkbox" id="colcheck-${col.id}" ${checked} onchange="toggleColumn('${col.id}', this.checked)">
            </div>
        `;
    }).join('');
}

function toggleColumn(colId, isChecked) {
    const prefs = getColumnPrefs();
    prefs[colId] = isChecked;
    localStorage.setItem('tableColumnPrefs', JSON.stringify(prefs));
    applyColumnVisibility();
}

function applyColumnVisibility() {
    const prefs = getColumnPrefs();
    TABLE_COLUMNS.forEach(col => {
        const visible = prefs[col.id] !== false;
        document.querySelectorAll(`[data-col="${col.id}"]`).forEach(el => {
            el.style.display = visible ? '' : 'none';
        });
    });
}

function openColumnOptions() {
    populateColumnModal();
    document.getElementById('columnModalOverlay').style.display = 'flex';
}
function closeColumnOptions() {
    document.getElementById('columnModalOverlay').style.display = 'none';
}

function updateForecastStockList() {
    const forecastBox = document.getElementById('forecastBox');
    const select = document.getElementById('forecastStock');

    if (portfolio.length === 0) {
        forecastBox.style.display = 'none';
        return;
    }
    forecastBox.style.display = 'block';

    const prevValue = select.value;
    select.innerHTML = '';
    portfolio.forEach((s, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `${s.symbol || ''} — ${s.name || ''}`;
        select.appendChild(option);
    });
    if (prevValue && portfolio[prevValue]) select.value = prevValue;

    updateForecast();
}

function switchForecastTab(tab) {
    document.getElementById('forecastTabProfit').classList.toggle('active', tab === 'profit');
    document.getElementById('forecastTabStop').classList.toggle('active', tab === 'stop');
    document.getElementById('forecastProfitPanel').style.display = tab === 'profit' ? 'block' : 'none';
    document.getElementById('forecastStopPanel').style.display = tab === 'stop' ? 'block' : 'none';
    updateForecast();
}

function updateForecast() {
    const select = document.getElementById('forecastStock');
    const idx = parseInt(select.value);
    const stock = portfolio[idx];
    if (!stock) return;

    const targetPercent = parseFloat(document.getElementById('forecastPercent').value);
    const targetPrice = stock.currentPrice * (1 + targetPercent / 100);
    const targetValue = stock.shares * targetPrice;
    const targetProfitDollar = targetValue - stock.totalCost;
    const targetProfitPercent = (targetProfitDollar / stock.totalCost) * 100;
    const profitResult = document.getElementById('forecastProfitResult');
    const pSign = targetProfitDollar >= 0 ? '+' : '';
    profitResult.value = `${pSign}$${Math.abs(targetProfitDollar).toFixed(2)}  (${pSign}${Math.abs(targetProfitPercent).toFixed(2)}%)`;
    profitResult.style.color = targetProfitDollar >= 0 ? '#00ff87' : '#ff5555';

    const stopPriceInput = document.getElementById('forecastStopPrice');
    const stopResult = document.getElementById('forecastStopResult');
    const stopPrice = parseFloat(stopPriceInput.value);
    if (isNaN(stopPrice) || stopPrice <= 0) {
        stopResult.value = '';
        return;
    }
    const stopDollar = (stopPrice - stock.buyPrice) * stock.shares;
    const stopPercent = ((stopPrice - stock.buyPrice) / stock.buyPrice) * 100;
    const sSign = stopDollar >= 0 ? '+' : '';
    stopResult.value = `${sSign}$${Math.abs(stopDollar).toFixed(2)}  (${sSign}${Math.abs(stopPercent).toFixed(2)}%)`;
    stopResult.style.color = stopDollar >= 0 ? '#00ff87' : '#ff5555';
}

function openCalculator() {
    document.getElementById('calcModalOverlay').style.display = 'flex';
    calcProfit();
}
function closeCalculator() {
    document.getElementById('calcModalOverlay').style.display = 'none';
}
function calcProfit() {
    const action = document.getElementById('calcAction').value;
    const buy = parseFloat(document.getElementById('calcBuyPrice').value);
    const sell = parseFloat(document.getElementById('calcSellPrice').value);
    const resultInput = document.getElementById('calcResult');

    if (isNaN(buy) || isNaN(sell) || buy <= 0 || sell <= 0) {
        resultInput.value = '';
        resultInput.style.color = '#fff';
        return;
    }

    const diff = sell - buy;
    const basis = action === 'sell' ? sell : buy;
    const percent = (diff / basis) * 100;
    const sign = diff >= 0 ? '+' : '';

    resultInput.value = `${sign}${diff.toFixed(2)}$  (${sign}${percent.toFixed(2)}%)`;
    resultInput.style.color = diff >= 0 ? '#00ff87' : '#ff5555';
}

let visitTracked = false;
async function trackVisit(isLoggedIn) {
    if (visitTracked) return;
    visitTracked = true;
    const field = isLoggedIn ? 'loggedInVisits' : 'guestVisits';
    try {
        await db.collection('stats').doc('visits').set({
            [field]: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });
    } catch (e) {
        console.error('שגיאה במעקב ביקורים:', e);
    }
}

async function loadVisitStats() {
    try {
        const doc = await db.collection('stats').doc('visits').get();
        const data = doc.exists ? doc.data() : {};
        document.getElementById('guestVisitsCount').innerText = data.guestVisits || 0;
        document.getElementById('loggedVisitsCount').innerText = data.loggedInVisits || 0;
    } catch (e) {
        document.getElementById('guestVisitsCount').innerText = '—';
        document.getElementById('loggedVisitsCount').innerText = '—';
    }
}

async function loadCloudPortfolio() {
    if (!currentUser) return;
    const doc = await db.collection('portfolios').doc(currentUser.uid).get();
    if (doc.exists) {
        portfolio = doc.data().items || [];
    } else {
        portfolio = [];
    }
    renderTable();
}

async function saveCloudPortfolio() {
    if (!currentUser) return;
    await db.collection('portfolios').doc(currentUser.uid).set({
        items: portfolio
    });
}

async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersBody');
    tbody.innerHTML = '';
    const snapshot = await db.collection('users').get();
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const tr = document.createElement('tr');
        const isMainAdmin = data.email === ADMIN_EMAIL;
        const emailTd = document.createElement('td');
        emailTd.textContent = data.email || '';

        const statusTd = document.createElement('td');
        statusTd.style.color = data.approved ? '#00ff87' : '#ff5555';
        statusTd.textContent = data.approved ? 'מאושר' : 'ממתין לאישור';

        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:8px; justify-content:center; flex-wrap: wrap;';

        if (!data.approved) {
            const approveBtn = document.createElement('button');
            approveBtn.className = 'btn-approve';
            approveBtn.textContent = 'אשר משתמש';
            approveBtn.addEventListener('click', () => approveUser(doc.id));
            actions.appendChild(approveBtn);
        }

        if (!isMainAdmin) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-delete';
            removeBtn.innerHTML = '<i class="fa-solid fa-user-slash"></i> הסר';
            removeBtn.addEventListener('click', () => removeUser(doc.id, data.email || ''));
            actions.appendChild(removeBtn);
        } else {
            const mainAdmin = document.createElement('span');
            mainAdmin.style.cssText = 'color:#8b949e; font-size:0.85rem;';
            mainAdmin.textContent = 'מנהל ראשי';
            actions.appendChild(mainAdmin);
        }

        actionsTd.appendChild(actions);
        tr.append(emailTd, statusTd, actionsTd);
        tbody.appendChild(tr);
    });
}

async function approveUser(uid) {
    await db.collection('users').doc(uid).update({ approved: true });
    alert("המשתמש אושר בהצלחה!");
    loadAdminUsers();
}

async function removeUser(uid, email) {
    if (!confirm(`להסיר את ${email} מהמערכת? הפעולה תחסום את הגישה שלו ותמחק את תיק ההשקעות שלו.`)) return;
    try {
        await db.collection('users').doc(uid).delete();
        await db.collection('portfolios').doc(uid).delete();
        alert("המשתמש הוסר בהצלחה.");
        loadAdminUsers();
    } catch (err) {
        alert("שגיאה בהסרת המשתמש: " + err.message);
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'portfolio') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('portfolioTab').classList.add('active');
    } else if (tabName === 'login') {
        document.getElementById('loginTabBtn').classList.add('active');
        document.getElementById('loginTab').classList.add('active');
    } else if (tabName === 'admin') {
        document.getElementById('adminTabBtn').classList.add('active');
        document.getElementById('adminTab').classList.add('active');
        loadAdminUsers();
        loadVisitStats();
        loadMessages();
    }
}

const GUEST_ADD_LIMIT = 3;

async function addStock() {
    let guestCount = parseInt(localStorage.getItem('guestAddCount') || '0');

    if (!currentUser && guestCount >= GUEST_ADD_LIMIT) {
        alert("ניצלת את 3 ההוספות החינמיות שלך. יש להתחבר לחשבון (וקבלת אישור מנהל) כדי להמשיך ולשמור את התיק שלך לצמיתות.");
        switchTab('login');
        return;
    }

    const symbolInput = document.getElementById('symbol').value.trim().toUpperCase();
    const shares = parseFloat(document.getElementById('shares').value);
    const buyPrice = parseFloat(document.getElementById('buyPrice').value);
    const addBtn = document.getElementById('addBtn');
    
    if (!symbolInput || isNaN(shares) || isNaN(buyPrice) || shares <= 0 || buyPrice <= 0) {
        alert("אנא מלא את כל השדות במספרים תקינים.");
        return;
    }
    if (!isValidSymbol(symbolInput)) {
        alert("הסימבול יכול להכיל רק אותיות באנגלית, מספרים, נקודה או מקף, עד 12 תווים.");
        return;
    }

    // ===== בדיקה אם המניה כבר קיימת בתיק - אם כן, מדובר ב"חיזוק" =====
    const existingIndex = portfolio.findIndex(s => (s.symbol || '').trim().toUpperCase() === symbolInput);
    const isReinforcement = existingIndex !== -1;

    if (isReinforcement) {
        const existing = portfolio[existingIndex];
        const confirmMerge = confirm(
            `📈 חיזוק מניה קיימת — ${symbolInput}\n\n` +
            `המניה כבר נמצאת בתיק שלך:\n` +
            `• כמות נוכחית: ${existing.shares}\n` +
            `• שער קנייה ממוצע נוכחי: $${existing.buyPrice.toFixed(2)}\n\n` +
            `ההוספה החדשה:\n` +
            `• כמות: ${shares}\n` +
            `• שער קנייה: $${buyPrice.toFixed(2)}\n\n` +
            `לחיצה על "אישור" תמזג את שתי ההחזקות לשורה אחת ותחשב שער קנייה ממוצע משוקלל חדש.\n` +
            `לחיצה על "ביטול" תבטל את ההוספה.`
        );

        if (!confirmMerge) {
            return;
        }
    }

    addBtn.disabled = true;
    addBtn.innerHTML = isReinforcement
        ? '<i class="fa-solid fa-spinner fa-spin"></i> מחזק אחזקה קיימת...'
        : '<i class="fa-solid fa-spinner fa-spin"></i> מושך נתונים בזמן אמת...';

    try {
        const quoteData = await fetchFinnhubJson('quote', { symbol: symbolInput });

        if (!quoteData || !quoteData.c || quoteData.c === 0) {
            alert("לא ניתן למצוא נתונים עבור סימבול זה.");
            return;
        }

        const currentPrice = quoteData.c;
        const riskData = await fetchRiskMetrics(symbolInput, currentPrice);
        const { riskLabel, riskColor, distanceFromHigh } = riskData;

        // ===== מסלול חיזוק: מיזוג לשורה קיימת + חישוב שער ממוצע משוקלל =====
        if (isReinforcement) {
            const existing = portfolio[existingIndex];
            const combinedShares = existing.shares + shares;
            const combinedCost = (existing.shares * existing.buyPrice) + (shares * buyPrice);
            const avgBuyPrice = combinedCost / combinedShares;
            const currentValue = combinedShares * currentPrice;
            const profitDollar = currentValue - combinedCost;
            const profitPercent = (profitDollar / combinedCost) * 100;

            portfolio[existingIndex] = {
                ...existing,
                shares: combinedShares,
                buyPrice: avgBuyPrice,
                currentPrice,
                totalCost: combinedCost,
                currentValue,
                profitDollar,
                profitPercent,
                riskLabel, riskColor, distanceFromHigh, riskChecked: true
            };

            if (currentUser) {
                await saveCloudPortfolio();
            } else {
                guestCount++;
                localStorage.setItem('guestAddCount', guestCount);
            }

            document.getElementById('symbol').value = '';
            document.getElementById('shares').value = '';
            document.getElementById('buyPrice').value = '';
            renderTable();

            setTimeout(() => alert(
                `✅ חוזק בהצלחה! ${symbolInput} עודכן לכמות ${combinedShares} ` +
                `במחיר קנייה ממוצע חדש של $${avgBuyPrice.toFixed(2)}.`
            ), 100);

            return;
        }

        // ===== מסלול רגיל: הוספת מניה חדשה שלא הייתה בתיק =====
        let companyName = symbolInput;
        try {
            const profileData = await fetchFinnhubJson('stock/profile2', { symbol: symbolInput });
            if (profileData && profileData.name) companyName = profileData.name;
        } catch(e) {}

        const totalCost = shares * buyPrice;
        const currentValue = shares * currentPrice;
        const profitDollar = currentValue - totalCost;
        const profitPercent = (profitDollar / totalCost) * 100;

        portfolio.push({
            symbol: symbolInput, name: companyName, shares, buyPrice, currentPrice,
            totalCost, currentValue, profitDollar, profitPercent,
            riskLabel, riskColor, distanceFromHigh, riskChecked: true
        });

        if (currentUser) {
            await saveCloudPortfolio();
        } else {
            guestCount++;
            localStorage.setItem('guestAddCount', guestCount);
            const remaining = GUEST_ADD_LIMIT - guestCount;
            if (remaining > 0) {
                setTimeout(() => alert(`המניה נוספה! נשארו לך ${remaining} הוספות חינמיות לפני שתצטרך להתחבר.`), 100);
            } else {
                setTimeout(() => alert("זו הייתה ההוספה החינמית האחרונה שלך. התחבר עכשיו כדי להמשיך ולשמור את התיק שלך."), 100);
            }
        }

        document.getElementById('symbol').value = '';
        document.getElementById('shares').value = '';
        document.getElementById('buyPrice').value = '';
        renderTable();

    } catch (error) {
        alert("שגיאה במשיכת נתונים.");
    } finally {
        addBtn.disabled = false;
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> הוסף מניה לתיק';
    }
}

async function deleteStock(index) {
    portfolio.splice(index, 1);
    await saveCloudPortfolio();
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = ''; 

    if (portfolio.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding: 20px; direction: rtl;">התיק ריק. הוסף מניות מהטופס למעלה כדי להתחיל!</td></tr>';
        updateChart();
        updateForecastStockList();
        applyColumnVisibility();
        return;
    }

    portfolio.forEach((stock, index) => {
        const tr = document.createElement('tr');
        const profitClass = stock.profitDollar >= 0 ? 'profit-pos' : 'profit-neg';
        const sign = stock.profitDollar >= 0 ? '+' : '';
        const safeSymbolForUrl = encodeURIComponent(stock.symbol || '');
        const yahooUrl = `https://finance.yahoo.com/quote/${safeSymbolForUrl}/news`;
        const investingUrl = `https://www.investing.com/search/?q=${safeSymbolForUrl}`;

        const riskLabel = stock.riskLabel || 'לא זמין';
        const riskColor = /^#[0-9a-fA-F]{6}$/.test(stock.riskColor || '') ? stock.riskColor : '#8b949e';
        const hasDistance = typeof stock.distanceFromHigh === 'number';
        const distanceText = hasDistance ? `${stock.distanceFromHigh >= 0 ? '-' : '+'}${Math.abs(stock.distanceFromHigh).toFixed(1)}%` : '—';
        const distanceColor = hasDistance ? (stock.distanceFromHigh <= 5 ? '#00ff87' : (stock.distanceFromHigh <= 20 ? '#ffc107' : '#ff5555')) : '#8b949e';

        const cells = [
            ['symbol', stock.symbol || '', 'font-weight:bold; font-size: 1.1rem;'],
            ['name', stock.name || '', '', 'rtl'],
            ['shares', stock.shares],
            ['buyPrice', `$${stock.buyPrice.toFixed(2)}`],
            ['currentPrice', `$${stock.currentPrice.toFixed(2)}`, 'font-weight:bold; color: #ffc107;'],
            ['totalCost', `$${stock.totalCost.toFixed(2)}`],
            ['currentValue', `$${stock.currentValue.toFixed(2)}`],
            ['profitDollar', `${sign}$${Math.abs(stock.profitDollar).toFixed(2)}`, '', 'ltr', profitClass],
            ['profitPercent', `${sign}${Math.abs(stock.profitPercent).toFixed(2)}%`, '', 'ltr', profitClass],
            ['risk', riskLabel, `font-weight:bold; color: ${riskColor};`],
            ['distanceHigh', distanceText, `font-weight:bold; color: ${distanceColor};`, 'rtl']
        ];

        cells.forEach(([col, value, style, dir, className]) => {
            const td = document.createElement('td');
            td.dataset.col = col;
            if (style) td.style.cssText = style;
            if (dir) td.dir = dir;
            if (className) td.className = className;
            td.textContent = value;
            tr.appendChild(td);
        });

        const actionTd = document.createElement('td');
        actionTd.dataset.col = 'action';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.addEventListener('click', () => deleteStock(index));
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);

        const newsTd = document.createElement('td');
        newsTd.dataset.col = 'news';
        const newsLinks = document.createElement('div');
        newsLinks.className = 'news-links';
        const yahooLink = document.createElement('a');
        yahooLink.href = yahooUrl;
        yahooLink.target = '_blank';
        yahooLink.rel = 'noopener noreferrer';
        yahooLink.className = 'news-btn news-yahoo';
        yahooLink.innerHTML = '<i class="fa-solid fa-newspaper"></i> Yahoo';
        const investingLink = document.createElement('a');
        investingLink.href = investingUrl;
        investingLink.target = '_blank';
        investingLink.rel = 'noopener noreferrer';
        investingLink.className = 'news-btn news-investing';
        investingLink.innerHTML = '<i class="fa-solid fa-chart-line"></i> Investing';
        newsLinks.append(yahooLink, investingLink);
        newsTd.appendChild(newsLinks);
        tr.appendChild(newsTd);
        tbody.appendChild(tr);
    });

    updateChart();
    updateForecastStockList();
    applyColumnVisibility();
    autoFillMissingRiskData();
}

function updateChart() {
    const chartBox = document.querySelector('.chart-box');
    if (portfolio.length === 0) {
        chartBox.style.display = 'none';
        if (myChart) { myChart.destroy(); myChart = null; }
        return;
    }

    chartBox.style.display = 'block';
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    const labels = portfolio.map(item => item.symbol);
    const dataValues = portfolio.map(item => item.currentValue);
    const palette = ['#ffc107', '#2ea043', '#388bfd', '#ff6b6b', '#a371f7', '#f0883e', '#7ee787', '#79c0ff'];

    if (myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = dataValues;
        myChart.data.datasets[0].backgroundColor = palette.slice(0, labels.length);
        myChart.update();
    } else {
        myChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{ data: dataValues, backgroundColor: palette.slice(0, labels.length), borderWidth: 2, borderColor: '#161b22' }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}
