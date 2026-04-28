const ppro = require('premierepro');
const { storage } = require('uxp');
const uxpFS = storage.localFileSystem;

const TICKS_PER_SECOND = 254016000000;
const SERVER_URL = 'https://script.google.com/macros/s/AKfycbzx9K_0KmVZph-O_MyEXAH7AbKWOwL5zu5Z3_re2b2w6PoZJnClGPipoU9Wah_dhNaL/exec';

// const _logLines = [];

let _authPassed = false;
let _authState = null;
let _slideNum = 1;
let _imgNum = 1;

function dbg(_msg) { /* disabled */ }
function dbgClear() { /* disabled */ }

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function ticksToSeconds(t) { return Number(t || 0) / TICKS_PER_SECOND; }
function secondsToTicks(s) { return Math.round(Number(s || 0) * TICKS_PER_SECOND); }

function dbgErr(_label, _e) { /* disabled */ }

// ============================================================
//  알림창
// ============================================================

let _alertOverlay = null, _alertTitle = null, _alertMsg = null, _alertOk = null;
let _alertResolve = null, _alertQueue = Promise.resolve();

function ensureAlertUI() {
    if (_alertOverlay) return;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);z-index:9999;display:none;pointer-events:none;align-items:flex-start;justify-content:center;padding-top:30px;box-sizing:border-box;';
    const p = document.createElement('div');
    p.style.cssText = 'background:#252525;border:1px solid #555;border-radius:8px;padding:16px;width:min(420px,90%);';
    const t = document.createElement('div');
    t.style.cssText = 'font-weight:700;color:#eee;margin-bottom:10px;font-size:13px;';
    const m = document.createElement('div');
    m.style.cssText = 'color:#ccc;font-size:12px;white-space:pre-wrap;line-height:1.5;margin-bottom:14px;max-height:200px;overflow-y:auto;';
    const br = document.createElement('div');
    br.style.cssText = 'display:flex;justify-content:flex-end;';
    const ok = document.createElement('div');
    ok.textContent = '확인';
    ok.style.cssText = 'background:#4b4b4b;color:#ccc;border:1px solid #5a5a5a;border-radius:5px;padding:7px 14px;cursor:pointer;';
    ok.onclick = () => {
        hideModal(ov);
        if (_alertResolve) { const r = _alertResolve; _alertResolve = null; r(); }
    };
    br.appendChild(ok); p.appendChild(t); p.appendChild(m); p.appendChild(br); ov.appendChild(p);
    document.body.appendChild(ov);
    _alertOverlay = ov; _alertTitle = t; _alertMsg = m; _alertOk = ok;
}

function showAlert(msg, title = '알림') {
    dbg('[ALERT] ' + title + ': ' + String(msg).replace(/\n/g, ' | '));
    _alertQueue = _alertQueue.then(() => new Promise(r => {
        ensureAlertUI();
        _alertTitle.textContent = title;
        _alertMsg.textContent = String(msg);
        _alertResolve = r;
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        showModal(_alertOverlay);
        setTimeout(() => { try { _alertOk.focus(); } catch (e) { } }, 0);
    }));
    return _alertQueue;
}

window.addEventListener('error', e => showAlert(String(e.message || e.error), '오류'));
window.addEventListener('unhandledrejection', e => showAlert(String(e.reason), '비동기 오류'));

async function safeRun(label, fn) {
    try { dbg('[' + label + '] 시작'); await fn(); dbg('[' + label + '] 완료'); }
    catch (e) { dbg('[' + label + '] 오류: ' + e); await showAlert(String(e), label + ' 오류'); }
}

function getEl(id) { return document.getElementById(id); }

function setBtnText(id, text) {
    const el = getEl(id);
    if (!el) return;
    const span = el.querySelector('span span');
    if (span) span.textContent = text;
    else el.textContent = text;
}

// ============================================================
//  인증
// ============================================================

async function ensureSubFolder(name) {
    const df = await uxpFS.getDataFolder();
    try { return await df.getEntry(name); } catch (e) { return await df.createFolder(name); }
}

async function readFile(path) {
    const df = await uxpFS.getDataFolder();
    const parts = path.split('/');
    let entry = df;
    for (let i = 0; i < parts.length - 1; i++) {
        entry = await entry.getEntry(parts[i]);
    }
    const f = await entry.getEntry(parts[parts.length - 1]);
    return await f.read({ format: storage.formats.utf8 });
}

async function writeFile(folder, file, text) {
    const dir = await ensureSubFolder(folder);
    let f;
    try { f = await dir.getEntry(file); } catch (e) { f = await dir.createFile(file, { overwrite: true }); }
    await f.write(text, { format: storage.formats.utf8 });
}

function _genUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16).toUpperCase();
    });
}

async function getHWID() {
    try {
        const v = await readFile('SJE_PR_EDIT_PRO/device.id');
        if (v && v.trim()) {
            const saved = v.trim();
            if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(saved)) {
                dbg('[HWID] 기존 ID 로드: ' + saved);
                return saved;
            }
            dbg('[HWID] 형식 불일치, 재생성: ' + saved);
        } else {
            dbg('[HWID] device.id 비어있음');
        }
    } catch (e) { dbg('[HWID] 읽기 실패: ' + e.message); }
    const id = _genUUID();
    try {
        await writeFile('SJE_PR_EDIT_PRO', 'device.id', id);
        dbg('[HWID] 저장 성공: ' + id);
    } catch (e) { dbg('[HWID] 저장 실패: ' + e.message); }
    return id;
}

async function loadLicense() {
    try { return JSON.parse(await readFile('SJE_PR_EDIT_PRO/license.key')); } catch (e) { return null; }
}

async function saveLicense(obj) {
    try { await writeFile('SJE_PR_EDIT_PRO', 'license.key', JSON.stringify(obj)); } catch (e) { }
}

async function fetchServer(params, timeout = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const url = SERVER_URL + '?' + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
        const res = await fetch(url, { signal: ctrl.signal });
        return await res.json();
    } finally { clearTimeout(timer); }
}

const STATUS_MSG = {
    trial_active: null, // 처리 분기에서 직접 처리
    trial_expired: '체험판 기간이 만료되었습니다.\n라이선스 키를 입력하여 활성화해 주세요.',
    trial_not_found: null, // 내부 처리
    active: null,
    grace_period: '구독 만료 유예기간 중입니다.\n곧 만료됩니다. 갱신해 주세요.',
    expired: '구독이 만료되었습니다.\n갱신 후 라이선스 키를 다시 입력해 주세요.',
    hwid_mismatch: '이 라이선스 키는 다른 기기에 등록되어 있습니다.',
    invalid_key: '유효하지 않은 라이선스 키입니다.',
    max_reached: '라이선스 사용 가능 횟수를 초과했습니다.',
    offline: '서버에 연결할 수 없습니다.\n인터넷 연결을 확인해 주세요.',
};

async function doInitAuth() {
    const hwid = await getHWID();
    const local = await loadLicense();

    // 로컬 키가 있으면 서버에서 구독 확인
    if (local && local.key) {
        try {
            const data = await fetchServer({ action: 'check_subscription', hwid, key: local.key });
            if (data.status === 'active') {
                return { ok: true, plan: 'subscription', daysLeft: data.days_remaining };
            }
            if (data.status === 'grace_period') {
                return { ok: true, plan: 'grace', daysLeft: data.grace_days_left };
            }
            return { ok: false, reason: data.status, email: local.email };
        } catch (e) {
            return { ok: true, plan: 'subscription', offline: true };
        }
    }

    // 로컬 이메일 있음 → 체험판 상태 확인
    if (local && local.email) {
        try {
            const data = await fetchServer({ action: 'trial_check', email: local.email, hwid });
            if (data.status === 'trial_active' || data.status === 'trial_already_active') {
                return { ok: true, plan: 'trial', daysLeft: data.remaining };
            }
            return { ok: false, reason: data.status, email: local.email };
        } catch (e) {
            return { ok: true, plan: 'trial', offline: true };
        }
    }

    // 아무것도 없음 → 웰컴 모달 트리거
    return { ok: false, reason: 'trial_not_found' };
}

function updateLicenseStatus(r) {
    const el = getEl('license-status');
    if (!el) return;
    if (r.ok) {
        const days = r.daysLeft != null ? ' (' + r.daysLeft + '일 남음)' : '';
        let label, color;
        if (r.plan === 'trial') { label = '체험판' + days; color = '#6abf6a'; }
        else if (r.plan === 'grace') { label = '⚠ 유예기간' + days; color = '#e0a030'; }
        else { label = '구독중' + days; color = '#50c878'; }
        el.textContent = label + (r.offline ? ' (오프라인)' : '');
        el.style.color = color;
    } else if (r.reason === 'trial_expired') {
        el.textContent = '체험판 만료';
        el.style.color = '#e05555';
    } else {
        el.textContent = '인증 필요';
        el.style.color = '#e05555';
    }
}

let _modalOpenCount = 0;
function showModal(el) {
    el.style.display = 'flex'; el.style.pointerEvents = 'all';
    _modalOpenCount++;
    document.body.classList.add('modal-open');
}
function hideModal(el) {
    el.style.display = 'none'; el.style.pointerEvents = 'none';
    _modalOpenCount = Math.max(0, _modalOpenCount - 1);
    if (_modalOpenCount === 0) document.body.classList.remove('modal-open');
}

// 라이선스 키 입력 모달
let _licenseModalResolve = null;

function ensureLicenseModalUI() {
    if (getEl('license-modal-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'license-modal-overlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.7);z-index:10000;display:none;align-items:flex-start;justify-content:center;padding-top:30px;box-sizing:border-box;pointer-events:none;';
    const p = document.createElement('div');
    p.style.cssText = 'background:#252525;border:1px solid #555;border-radius:8px;padding:20px;width:min(360px,92%);';
    p.innerHTML = `
        <div style="font-weight:700;color:#eee;font-size:13px;margin-bottom:6px;">라이선스 키 입력</div>
        <div style="color:#aaa;font-size:11px;margin-bottom:12px;line-height:1.5;" id="license-modal-msg"></div>
        <input id="license-modal-input" type="text" placeholder="PR로 시작하는 라이선스 키 입력"
            style="width:100%;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#e8e8e8;
                   font-size:12px;padding:7px 10px;outline:none;box-sizing:border-box;margin-bottom:12px;height:34px;" />
        <div style="display:flex;gap:8px;justify-content:flex-end;">
            <div id="license-modal-cancel" role="button"
                style="background:#333;color:#aaa;border:1px solid #444;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:11px;margin-right:8px;">취소</div>
            <div id="license-modal-ok" role="button"
                style="background:#4b4b4b;color:#ccc;border:1px solid #5a5a5a;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:11px;font-weight:600;">활성화</div>
        </div>
        <div id="license-modal-error" style="color:#e05555;font-size:11px;margin-top:8px;display:none;"></div>
    `;
    ov.appendChild(p);
    document.body.appendChild(ov);

    getEl('license-modal-cancel').onclick = () => {
        hideModal(ov);
        if (_licenseModalResolve) { _licenseModalResolve(null); _licenseModalResolve = null; }
    };
    getEl('license-modal-ok').onclick = async () => {
        const key = (getEl('license-modal-input').value || '').trim();
        if (!key) return;
        const errEl = getEl('license-modal-error');
        errEl.style.display = 'none';
        const okBtn = getEl('license-modal-ok');
        okBtn.style.pointerEvents = 'none'; okBtn.style.opacity = '0.4'; okBtn.textContent = '확인 중...';
        try {
            const hwid = await getHWID();
            const data = await fetchServer({ action: 'activate', hwid, key });
            if (data.status === 'activated' || data.status === 'already_active') {
                await saveLicense({ hwid, key });
                hideModal(ov);
                if (_licenseModalResolve) { _licenseModalResolve({ ok: true, plan: 'subscription', daysLeft: data.days_remaining }); _licenseModalResolve = null; }
                return;
            }
            const msg = STATUS_MSG[data.status] || ('오류: ' + data.status);
            errEl.textContent = msg; errEl.style.display = 'block';
        } catch (e) {
            errEl.textContent = '서버 연결 실패. 인터넷 연결을 확인해 주세요.'; errEl.style.display = 'block';
        }
        okBtn.style.pointerEvents = ''; okBtn.style.opacity = ''; okBtn.textContent = '활성화';
    };
    getEl('license-modal-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') getEl('license-modal-ok').onclick();
    });
}

function showLicenseModal(msg) {
    ensureLicenseModalUI();
    const msgEl = getEl('license-modal-msg');
    if (msgEl) msgEl.textContent = msg || '';
    const errEl = getEl('license-modal-error');
    if (errEl) errEl.style.display = 'none';
    const inp = getEl('license-modal-input');
    if (inp) inp.value = '';
    const ov = getEl('license-modal-overlay');
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    showModal(ov);
    setTimeout(() => { try { inp && inp.focus(); } catch (e) { } }, 0);
    return new Promise(r => { _licenseModalResolve = r; });
}

let _welcomeModalResolve = null;

function showWelcomeModal() {
    ensureLicenseModalUI();
    if (!getEl('welcome-modal-overlay')) {
        const ov = document.createElement('div');
        ov.id = 'welcome-modal-overlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.8);z-index:10001;display:none;align-items:flex-start;justify-content:center;padding-top:30px;box-sizing:border-box;pointer-events:none;';
        const p = document.createElement('div');
        p.style.cssText = 'background:#252525;border:1px solid #555;border-radius:8px;padding:24px;width:min(340px,92%);';
        p.innerHTML = `
            <div style="font-weight:700;color:#eee;font-size:14px;margin-bottom:8px;text-align:center;">SJE PR Edit Pro</div>

            <!-- Step 1: 선택 -->
            <div id="w-step1">
                <div style="color:#aaa;font-size:11px;margin-bottom:16px;line-height:1.6;text-align:center;">처음 사용하시나요?<br>체험판(7일) 또는 라이선스 키로 시작하세요.</div>
                <div id="w-trial-btn" role="button" style="display:block;width:100%;background:#4b4b4b;color:#ccc;border:1px solid #5a5a5a;border-radius:4px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:8px;text-align:center;box-sizing:border-box;">7일 무료 체험 시작</div>
                <div id="w-license-btn" role="button" style="display:block;width:100%;background:#4b4b4b;color:#ccc;border:1px solid #5a5a5a;border-radius:4px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;text-align:center;box-sizing:border-box;">라이선스 키 입력</div>
            </div>

            <!-- Step 2: 이메일 입력 -->
            <div id="w-step2" style="display:none;">
                <div style="color:#aaa;font-size:11px;margin-bottom:12px;line-height:1.6;">이메일 주소를 입력하면 인증 코드를 발송합니다.<br>이메일당 1회만 체험판 사용 가능합니다.</div>
                <input id="w-email-input" type="email" placeholder="이메일 주소 입력"
                    style="width:100%;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#e8e8e8;font-size:12px;padding:8px 10px;outline:none;box-sizing:border-box;margin-bottom:10px;height:34px;" />
                <div style="display:flex;gap:8px;">
                    <div id="w-back-btn" role="button" style="flex:1;background:#333;color:#aaa;border:1px solid #444;border-radius:4px;padding:8px;font-size:11px;cursor:pointer;text-align:center;margin-right:8px;">뒤로</div>
                    <div id="w-send-btn" role="button" style="flex:2;background:#4b4b4b;color:#ccc;border:1px solid #5a5a5a;border-radius:4px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;text-align:center;">인증 코드 발송</div>
                </div>
            </div>

            <!-- Step 3: 코드 입력 -->
            <div id="w-step3" style="display:none;">
                <div style="color:#aaa;font-size:11px;margin-bottom:4px;">이메일로 발송된 6자리 코드를 입력하세요.</div>
                <div id="w-email-display" style="color:#f0a030;font-size:11px;margin-bottom:12px;"></div>
                <input id="w-code-input" type="text" placeholder="123456" maxlength="6"
                    style="display:block;width:100%;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#e8e8e8;font-size:14px;padding:8px 10px;outline:none;box-sizing:border-box;margin-bottom:10px;text-align:center;height:34px;" />
                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <div id="w-resend-btn" role="button" style="flex:1;background:#333;color:#aaa;border:1px solid #444;border-radius:4px;padding:8px;font-size:11px;cursor:pointer;text-align:center;margin-right:8px;">재발송</div>
                    <div id="w-verify-btn" role="button" style="flex:2;background:#4b4b4b;color:#ccc;border:1px solid #5a5a5a;border-radius:4px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;text-align:center;">확인</div>
                </div>
            </div>

            <div id="w-error" style="color:#e05555;font-size:11px;margin-top:6px;display:none;"></div>
        `;
        ov.appendChild(p);
        document.body.appendChild(ov);

        const showStep = (n) => {
            getEl('w-step1').style.display = n === 1 ? '' : 'none';
            getEl('w-step2').style.display = n === 2 ? '' : 'none';
            getEl('w-step3').style.display = n === 3 ? '' : 'none';
            getEl('w-error').style.display = 'none';
        };
        const setErr = (msg) => { const e = getEl('w-error'); e.textContent = msg; e.style.display = 'block'; };

        getEl('w-trial-btn').onclick = () => { showStep(2); setTimeout(() => { try { getEl('w-email-input').focus(); } catch (e) { } }, 0); };
        getEl('w-license-btn').onclick = async () => {
            hideModal(ov);
            const result = await showLicenseModal('라이선스 키를 입력하여 구독을 시작하세요.');
            if (result && result.ok) {
                if (_welcomeModalResolve) { _welcomeModalResolve(result); _welcomeModalResolve = null; }
            } else { showModal(ov); }
        };
        getEl('w-back-btn').onclick = () => showStep(1);

        let _resendCooldown = false;
        const doSend = async () => {
            const email = (getEl('w-email-input').value || '').trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('올바른 이메일 주소를 입력해 주세요.'); return; }
            const btn = getEl('w-send-btn');
            btn.style.pointerEvents = 'none'; btn.style.opacity = '0.4'; btn.textContent = '발송 중...';
            getEl('w-error').style.display = 'none';
            try {
                const hwid = await getHWID();
                const data = await fetchServer({ action: 'trial_request_code', email, hwid });
                if (data.status === 'code_sent') {
                    getEl('w-email-display').textContent = email;
                    showStep(3);
                    setTimeout(() => { try { getEl('w-code-input').focus(); } catch (e) { } }, 0);
                } else if (data.status === 'trial_already_active') {
                    // 같은 이메일+HWID → 바로 통과
                    await saveLicense({ hwid, email });
                    hideModal(ov);
                    if (_welcomeModalResolve) { _welcomeModalResolve({ ok: true, plan: 'trial', daysLeft: 7 }); _welcomeModalResolve = null; }
                } else if (data.status === 'trial_email_used') {
                    setErr('이미 다른 기기에서 체험판을 사용한 이메일입니다.');
                } else if (data.status === 'code_already_sent') {
                    setErr('이미 코드가 발송되었습니다. 잠시 후 재시도해 주세요.');
                } else {
                    setErr('오류: ' + (data.message || data.status));
                }
            } catch (e) { setErr('서버 연결 실패. 인터넷 연결을 확인해 주세요.'); }
            btn.style.pointerEvents = ''; btn.style.opacity = ''; btn.textContent = '인증 코드 발송';
        };
        getEl('w-send-btn').onclick = doSend;
        getEl('w-email-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

        getEl('w-resend-btn').onclick = async () => {
            if (_resendCooldown) { setErr('60초 후 재시도해 주세요.'); return; }
            _resendCooldown = true;
            const rb = getEl('w-resend-btn');
            rb.style.pointerEvents = 'none'; rb.style.opacity = '0.4';
            const email = (getEl('w-email-input').value || '').trim();
            try {
                const hwid = await getHWID();
                await fetchServer({ action: 'trial_request_code', email, hwid });
                getEl('w-error').style.display = 'none';
            } catch (e) { setErr('재발송 실패.'); }
            setTimeout(() => { _resendCooldown = false; rb.style.pointerEvents = ''; rb.style.opacity = ''; }, 60000);
        };

        getEl('w-verify-btn').onclick = async () => {
            const code = (getEl('w-code-input').value || '').trim();
            if (!code) { setErr('인증 코드를 입력해 주세요.'); return; }
            const btn = getEl('w-verify-btn');
            btn.style.pointerEvents = 'none'; btn.style.opacity = '0.4'; btn.textContent = '확인 중...';
            getEl('w-error').style.display = 'none';
            try {
                const hwid = await getHWID();
                const email = (getEl('w-email-input').value || '').trim();
                const data = await fetchServer({ action: 'trial_verify_code', email, hwid, code });
                if (data.status === 'verified' || data.status === 'trial_already_active') {
                    await saveLicense({ hwid, email });
                    hideModal(ov);
                    if (_welcomeModalResolve) { _welcomeModalResolve({ ok: true, plan: 'trial', daysLeft: data.remaining || 7 }); _welcomeModalResolve = null; }
                } else if (data.status === 'invalid_code') {
                    setErr('인증 코드가 올바르지 않습니다.');
                } else if (data.status === 'code_expired') {
                    setErr('코드가 만료되었습니다. 재발송 버튼을 눌러주세요.');
                } else {
                    setErr('오류: ' + (data.message || data.status));
                }
            } catch (e) { setErr('서버 연결 실패.'); }
            btn.style.pointerEvents = ''; btn.style.opacity = ''; btn.textContent = '확인';
        };
        getEl('w-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') getEl('w-verify-btn').onclick(); });
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    showModal(getEl('welcome-modal-overlay'));
    // Step 1로 초기화
    const showStep = (n) => {
        getEl('w-step1').style.display = n === 1 ? '' : 'none';
        getEl('w-step2').style.display = n === 2 ? '' : 'none';
        getEl('w-step3').style.display = n === 3 ? '' : 'none';
        getEl('w-error').style.display = 'none';
    };
    showStep(1);
    return new Promise(r => { _welcomeModalResolve = r; });
}


// ============================================================
//  Sequence / Track 유틸
// ============================================================

async function getActiveSeq() {
    try {
        const proj = await ppro.Project.getActiveProject();
        if (!proj) { dbg('프로젝트 없음'); return null; }
        const seq = await proj.getActiveSequence();
        if (!seq) { dbg('시퀀스 없음'); return null; }
        dbg('[SEQ] ' + seq.name);
        return seq;
    } catch (e) { dbg('getActiveSeq 오류: ' + e); return null; }
}

async function getPlayhead(seq) {
    try {
        const pos = await seq.getPlayerPosition();
        const ticks = Number(pos && pos.ticks || 0);
        dbg('[SEQ] 플레이헤드: ' + ticksToSeconds(ticks).toFixed(3) + 's');
        return { time: pos, ticks, seconds: ticksToSeconds(ticks) };
    } catch (e) { dbg('플레이헤드 오류: ' + e); return { time: null, ticks: 0, seconds: 0 }; }
}

async function getVideoTracks(seq) {
    const count = await seq.getVideoTrackCount();
    const arr = [];
    for (let i = 0; i < count; i++) {
        try { const t = await seq.getVideoTrack(i); if (t) arr.push(t); } catch (e) { }
    }
    return arr;
}

async function toArray(col) {
    if (!col) return [];
    if (Array.isArray(col)) return col.filter(Boolean);
    try { if (typeof col[Symbol.iterator] === 'function') return [...col].filter(Boolean); } catch (e) { }
    const arr = [];
    const len = col.length || col.numItems || 0;
    for (let i = 0; i < len; i++) { try { if (col[i]) arr.push(col[i]); } catch (e) { } }
    return arr;
}

async function getClips(track) {
    if (!track) return [];
    try {
        const items = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
        return await toArray(items);
    } catch (e) { dbg('getClips 실패: ' + e); }
    return [];
}

async function getClipName(c) {
    try { if (typeof c.getName === 'function') return await c.getName(); } catch (e) { }
    try { if (c.name) return c.name; } catch (e) { }
    return '';
}

async function getClipStart(c) {
    try { const t = await c.getStartTime(); return ticksToSeconds(t && t.ticks != null ? t.ticks : t || 0); } catch (e) { }
    try { if (c.start && c.start.ticks != null) return ticksToSeconds(c.start.ticks); } catch (e) { }
    return 0;
}

async function setClipDisabled(proj, clip, disabled) {
    try {
        proj.lockedAccess(() => {
            proj.executeTransaction(ca => {
                const a = clip.createSetDisabledAction(disabled);
                if (a) ca.addAction(a);
            });
        });
        return true;
    } catch (e) { dbg('setClipDisabled 실패: ' + e); }
    return false;
}

// ============================================================
//  Marker 진단 (disabled)
// ============================================================

/* let _probedMarkerAPI = false;

async function probeMarkerAPI(seq) {
    if (_probedMarkerAPI) return;
    _probedMarkerAPI = true;
    dbg('[PROBE] ===== Marker API 진단 시작 =====');

    // ppro.Marker 네임스페이스 덤프
    try {
        const mk = ppro.Marker;
        if (mk) {
            dbg('[PROBE] ppro.Marker keys: ' + Reflect.ownKeys(mk).map(String).join(', '));
            const proto = mk.prototype;
            if (proto) dbg('[PROBE] ppro.Marker.prototype: ' + Object.getOwnPropertyNames(proto).join(', '));
        } else { dbg('[PROBE] ppro.Marker 없음'); }
    } catch (e) { dbgErr('[PROBE] ppro.Marker 덤프 실패', e); }

    // ppro.Markers 네임스페이스 덤프
    try {
        const mks = ppro.Markers;
        if (mks) {
            dbg('[PROBE] ppro.Markers keys: ' + Reflect.ownKeys(mks).map(String).join(', '));
            const proto = mks.prototype;
            if (proto) dbg('[PROBE] ppro.Markers.prototype: ' + Object.getOwnPropertyNames(proto).join(', '));
        } else { dbg('[PROBE] ppro.Markers 없음'); }
    } catch (e) { dbgErr('[PROBE] ppro.Markers 덤프 실패', e); }

    // ppro.TickTime / ppro.Time / ppro.Constants 존재 여부
    for (const key of ['TickTime', 'Time', 'Constants']) {
        try {
            const v = ppro[key];
            dbg('[PROBE] ppro.' + key + ' = ' + (v == null ? '없음' : typeof v) + (v ? ' keys:' + Reflect.ownKeys(v).map(String).slice(0, 10).join(',') : ''));
        } catch (e) { dbg('[PROBE] ppro.' + key + ' 접근 실패: ' + e); }
    }

    // MarkerCollection 인스턴스 덤프
    try {
        const col = await ppro.Markers.getMarkers(seq);
        if (col) {
            dbg('[PROBE] col type: ' + typeof col + ' constructor: ' + (col.constructor && col.constructor.name));
            const proto = Object.getPrototypeOf(col);
            dbg('[PROBE] col prototype methods: ' + Object.getOwnPropertyNames(proto).join(', '));

            // createAddMarkerAction 상세
            const fn = col.createAddMarkerAction;
            dbg('[PROBE] createAddMarkerAction type=' + typeof fn + ' length=' + (fn && fn.length) + ' toString=' + (fn && String(fn).slice(0, 80)));
            // createRemoveMarkerAction / createMoveMarkerAction 길이 비교
            for (const m of ['createRemoveMarkerAction', 'createMoveMarkerAction']) {
                const f = col[m];
                dbg('[PROBE] ' + m + ' length=' + (f && f.length) + ' toString=' + (f && String(f).slice(0, 80)));
            }

            // 기존 마커 1개 덤프
            try {
                const list = await col.getMarkers();
                const arr = await toArray(list);
                if (arr.length > 0) {
                    const first = arr[0];
                    dbg('[PROBE] 기존 마커 constructor: ' + (first.constructor && first.constructor.name));
                    dbg('[PROBE] 기존 마커 prototype methods: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(first)).join(', '));
                    dbg('[PROBE] 기존 마커 enumerable keys: ' + Object.keys(first).join(', '));
                    // 기존 마커 인스턴스를 createAddMarkerAction에 직접 전달 시도
                    try {
                        const a = await col.createAddMarkerAction(first);
                        dbg('[PROBE] createAddMarkerAction(existingMarker) 성공! action=' + typeof a);
                    } catch (e) { dbgErr('[PROBE] createAddMarkerAction(existingMarker) 실패', e); }

                    // 기존 마커의 getStart() 반환값을 그대로 전달 시도
                    try {
                        const startTime = await first.getStart();
                        dbg('[PROBE] 기존 마커 getStart() 반환: constructor=' + (startTime && startTime.constructor && startTime.constructor.name) + ' keys=' + (startTime ? Object.getOwnPropertyNames(Object.getPrototypeOf(startTime)).join(',') : 'null'));
                        const a = await col.createAddMarkerAction(startTime);
                        dbg('[PROBE] createAddMarkerAction(getStart()) 성공! action=' + typeof a);
                    } catch (e) { dbgErr('[PROBE] createAddMarkerAction(getStart()) 실패', e); }
                } else { dbg('[PROBE] 기존 마커 없음 — 마커가 있는 시퀀스에서 테스트 필요'); }
            } catch (e) { dbgErr('[PROBE] 마커 목록 조회 실패', e); }
        } else { dbg('[PROBE] col 없음'); }
    } catch (e) { dbgErr('[PROBE] MarkerCollection 덤프 실패', e); }

    // createAddMarkerAction 인자 없이 호출 시도
    try {
        const col2 = await ppro.Markers.getMarkers(seq);
        const a = await col2.createAddMarkerAction();
        dbg('[PROBE] createAddMarkerAction() 인자없음 성공! type=' + typeof a + ' constructor=' + (a && a.constructor && a.constructor.name));
        const proto = a && Object.getPrototypeOf(a);
        if (proto) dbg('[PROBE] action prototype methods: ' + Object.getOwnPropertyNames(proto).join(', '));
    } catch (e) { dbgErr('[PROBE] createAddMarkerAction() 인자없음 실패', e); }

    // ppro.Action 클래스 덤프
    try {
        const Act = ppro.Action;
        if (Act) {
            dbg('[PROBE] ppro.Action keys: ' + Reflect.ownKeys(Act).map(String).join(', '));
            if (Act.prototype) dbg('[PROBE] ppro.Action.prototype: ' + Object.getOwnPropertyNames(Act.prototype).join(', '));
        } else { dbg('[PROBE] ppro.Action 없음'); }
    } catch (e) { dbgErr('[PROBE] ppro.Action 덤프 실패', e); }

    // ppro.SequenceEditor 덤프
    try {
        const SE = ppro.SequenceEditor;
        if (SE) {
            dbg('[PROBE] ppro.SequenceEditor keys: ' + Reflect.ownKeys(SE).map(String).join(', '));
            if (SE.prototype) dbg('[PROBE] ppro.SequenceEditor.prototype: ' + Object.getOwnPropertyNames(SE.prototype).join(', '));
            // SequenceEditor.getEditor(seq) 시도
            if (typeof SE.getEditor === 'function') {
                try {
                    const ed = await SE.getEditor(seq);
                    if (ed) {
                        dbg('[PROBE] SequenceEditor.getEditor 성공 constructor=' + (ed.constructor && ed.constructor.name));
                        dbg('[PROBE] editor prototype: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(ed)).join(', '));
                    }
                } catch (e) { dbgErr('[PROBE] SequenceEditor.getEditor 실패', e); }
            }
        } else { dbg('[PROBE] ppro.SequenceEditor 없음'); }
    } catch (e) { dbgErr('[PROBE] ppro.SequenceEditor 덤프 실패', e); }

    // ppro.OperationCompleteEvent / SequenceEvent 덤프
    for (const key of ['OperationCompleteEvent', 'SequenceEvent', 'EventManager']) {
        try {
            const C = ppro[key];
            if (C) dbg('[PROBE] ppro.' + key + ' keys: ' + Reflect.ownKeys(C).map(String).filter(k => !['length','name','arguments','caller'].includes(k)).join(', '));
            else dbg('[PROBE] ppro.' + key + ' 없음');
        } catch (e) { dbg('[PROBE] ppro.' + key + ' 접근 실패: ' + e); }
    }

    // ppro.Constants.SequenceOperation 전체 덤프
    try {
        const so = ppro.Constants && ppro.Constants.SequenceOperation;
        if (so) {
            dbg('[PROBE] Constants.SequenceOperation keys: ' + Object.keys(so).join(', '));
            for (const k of Object.keys(so)) dbg('[PROBE]   SequenceOperation.' + k + ' = ' + so[k]);
        } else { dbg('[PROBE] Constants.SequenceOperation 없음'); }
    } catch (e) { dbgErr('[PROBE] Constants.SequenceOperation 덤프 실패', e); }

    // SequenceUtils.performSceneEditDetectionOnSelection 시그니처 탐색
    try {
        const SU = ppro.SequenceUtils;
        const fn = SU && SU.performSceneEditDetectionOnSelection;
        dbg('[PROBE] SU.performSceneEditDetectionOnSelection length=' + (fn && fn.length) + ' toString=' + (fn && String(fn).slice(0, 100)));
    } catch (e) { dbgErr('[PROBE] SU 탐색 실패', e); }

    // ppro 네임스페이스 전체 키 덤프 (놓친 API 탐색)
    try {
        const allKeys = Reflect.ownKeys(ppro).map(String).filter(k => !['length','name','arguments','caller','prototype'].includes(k));
        dbg('[PROBE] ppro 전체 keys: ' + allKeys.join(', '));
    } catch (e) { dbgErr('[PROBE] ppro keys 덤프 실패', e); }

    dbg('[PROBE] ===== 진단 완료 =====');
} */

// ============================================================
//  Marker 유틸
// ============================================================

async function getMarkerCol(seq) {
    try { return await ppro.Markers.getMarkers(seq); } catch (e) { return null; }
}

async function getMarkerList(seq) {
    try {
        const col = await getMarkerCol(seq);
        if (!col || typeof col.getMarkers !== 'function') return [];
        return await toArray(await col.getMarkers());
    } catch (e) { return []; }
}

async function getMarkerTicks(mk) {
    try { if (mk.start && mk.start.ticks != null) return Number(mk.start.ticks); } catch (e) { }
    try { const t = await mk.getStart(); if (t && t.ticks != null) return Number(t.ticks); } catch (e) { }
    return 0;
}

async function getMarkerName(mk) {
    try { if (typeof mk.getName === 'function') return await mk.getName(); } catch (e) { }
    try { if (typeof mk.getComments === 'function') return await mk.getComments(); } catch (e) { }
    return '';
}

async function setMarkerName(proj, mk, name) {
    try {
        proj.lockedAccess(() => {
            proj.executeTransaction(ca => {
                const a = mk.createSetNameAction(name);
                if (a) ca.addAction(a);
            });
        });
        return true;
    } catch (e) { dbgErr('[setMarkerName] 실패', e); }
    return false;
}

async function setMarkerComments(proj, mk, text) {
    try {
        proj.lockedAccess(() => {
            proj.executeTransaction(ca => {
                const a = mk.createSetCommentsAction(text);
                if (a) ca.addAction(a);
            });
        });
        return true;
    } catch (e) { }
    return false;
}

async function setMarkerColor(proj, mk, idx) {
    try {
        proj.lockedAccess(() => {
            proj.executeTransaction(ca => {
                const a = mk.createSetColorByIndexAction(idx);
                if (a) ca.addAction(a);
            });
        });
        return true;
    } catch (e) { }
    return false;
}

// ============================================================
//  ★ 핵심: SequenceUtils.SEQUENCE_OPERATION_CREATEMARKER 기반 마커 추가
// ============================================================

async function addMarker(proj, seq, ticks, name, colorIndex) {
    const col = await getMarkerCol(seq);
    if (!col) { dbg('[MARKER] col 없음'); return false; }

    const markerType = ppro.Marker.MARKER_TYPE_COMMENT;
    const startTime = ppro.TickTime.createWithTicks(String(ticks));
    const duration = ppro.TickTime.TIME_ZERO;

    // 공식 샘플 패턴: lockedAccess + executeTransaction 모두 동기 호출
    try {
        proj.lockedAccess(() => {
            proj.executeTransaction(ca => {
                const act = col.createAddMarkerAction(name || '', markerType, startTime, duration, name || '');
                if (act) ca.addAction(act);
            });
        });
    } catch (e) { dbgErr('[MARKER] createAddMarkerAction 실패', e); return false; }

    await new Promise(r => setTimeout(r, 300));
    const check = await getMarkerList(seq);
    dbg('[MARKER] 생성 후 마커 수: ' + check.length);
    if (check.length === 0) { dbg('[MARKER] 마커 미생성'); return false; }

    await new Promise(r => setTimeout(r, 200));

    // 색상 설정 (이름은 이미 createAddMarkerAction에 포함)
    if (colorIndex) {
        const after = await getMarkerList(seq);
        let target = null, bestDiff = Infinity;
        for (const mk of after) {
            const t = await getMarkerTicks(mk);
            const diff = Math.abs(Number(t) - Number(ticks));
            if (diff < bestDiff) { bestDiff = diff; target = mk; }
        }
        if (target && bestDiff < TICKS_PER_SECOND) await setMarkerColor(proj, target, colorIndex);
    }

    dbg('[MARKER] 완료: ' + name + ' @ ' + ticksToSeconds(ticks).toFixed(2) + 's');
    return true;
}

// ============================================================
//  기능
// ============================================================

async function razorAtPlayhead() {
    dbgClear();
    const seq = await getActiveSeq();
    if (!seq) return;
    const ph = await getPlayhead(seq);
    await showAlert(
        'UXP에서 직접 자르기는 지원되지 않습니다.\n\nWindows: Ctrl+K\nMac: Cmd+K\n\n현재 위치: ' + ph.seconds.toFixed(2) + 's',
        '자르기 안내'
    );
}

async function razorAndMark(markerName) {
    dbg('[MARK] 시작: ' + markerName);
    const proj = await ppro.Project.getActiveProject();
    const seq = await getActiveSeq();
    if (!proj || !seq) return;

    const ph = await getPlayhead(seq);

    // 같은 위치에 마커가 있으면 이름만 교체
    const list = await getMarkerList(seq);
    let existing = null;
    for (const mk of list) {
        const t = ticksToSeconds(await getMarkerTicks(mk));
        if (Math.abs(t - ph.seconds) <= 0.1) { existing = mk; break; }
    }

    if (existing) {
        dbg('[MARK] 같은 위치 마커 존재 → 이름 교체: ' + markerName);
        const ok = await setMarkerName(proj, existing, markerName);
        await setMarkerComments(proj, existing, markerName);
        if (!ok) dbg('[MARK] 이름 교체 실패');
    } else {
        dbg('[MARK] 새 마커 추가');
        const ok = await addMarker(proj, seq, ph.ticks, markerName, 0);
        if (!ok) dbg('[MARK] 마커 추가 실패 - 로그 확인');
    }
}

async function appendAngleToLastMarker(angleName) {
    dbgClear();
    dbg('[ANGLE] 시작: ' + angleName);
    const proj = await ppro.Project.getActiveProject();
    const seq = await getActiveSeq();
    if (!proj || !seq) return;

    const ph = await getPlayhead(seq);
    const list = await getMarkerList(seq);
    let target = null, targetTime = -1;
    for (const mk of list) {
        const t = ticksToSeconds(await getMarkerTicks(mk));
        if (t <= ph.seconds + 0.5 && t > targetTime) { targetTime = t; target = mk; }
    }
    if (!target) { await showAlert('직전 마커를 찾을 수 없습니다.'); return; }

    const cur = await getMarkerName(target);
    const base = cur.replace(/,?\s*\[(정면|좌측|우측)\]/g, '').replace(/,\s*$/, '').trimEnd();
    const newName = base + ', [' + angleName + ']';
    const ok = await setMarkerName(proj, target, newName) || await setMarkerComments(proj, target, newName);
    if (!ok) await showAlert('마커 이름 변경 실패');
    else dbg('[ANGLE] 완료: ' + newName);
}

async function appendImgToLastMarker(imgTag) {
    dbgClear();
    dbg('[IMG] 시작: ' + imgTag);
    const proj = await ppro.Project.getActiveProject();
    const seq = await getActiveSeq();
    if (!proj || !seq) return;

    const ph = await getPlayhead(seq);
    const list = await getMarkerList(seq);
    let target = null;
    for (const mk of list) {
        const t = ticksToSeconds(await getMarkerTicks(mk));
        if (Math.abs(t - ph.seconds) <= 0.1) { target = mk; break; }
    }

    if (target) {
        const cur = await getMarkerName(target);
        const base = cur.replace(/,?\s*\[#\d+(?:-\d+)?\]/g, '').replace(/,\s*$/, '').trimEnd();
        const newName = base ? base + ', [' + imgTag + ']' : '[' + imgTag + ']';
        await setMarkerName(proj, target, newName);
        await setMarkerComments(proj, target, newName);
        dbg('[IMG] 완료: ' + newName);
    } else {
        await addMarker(proj, seq, ph.ticks, '[' + imgTag + ']', 0);
    }
}

async function autoSwitchAngle() {
    dbgClear();
    dbg('[SWITCH] 시작');
    const proj = await ppro.Project.getActiveProject();
    const seq = await getActiveSeq();
    if (!proj || !seq) return;

    const list = await getMarkerList(seq);
    if (!list.length) { await showAlert('마커가 없습니다.'); return; }

    const cutData = [];
    for (const mk of list) {
        cutData.push({ seconds: ticksToSeconds(await getMarkerTicks(mk)), text: await getMarkerName(mk) });
    }
    cutData.sort((a, b) => a.seconds - b.seconds);

    const STR = { FRONT: '정면', LEFT: '좌측', RIGHT: '우측' };
    const trackMap = { front: null, left: null, right: null };
    const vTracks = await getVideoTracks(seq);
    dbg('[SWITCH] 비디오 트랙 수: ' + vTracks.length);

    for (let ti = 0; ti < vTracks.length; ti++) {
        const tr = vTracks[ti];
        const clips = await getClips(tr);
        dbg('[SWITCH] 트랙[' + ti + '] 클립 수: ' + clips.length);
        for (const cl of clips) {
            const n = await getClipName(cl);
            dbg('[SWITCH]   클립명: ' + n);
            if (!trackMap.front && n.includes(STR.FRONT)) { trackMap.front = tr; dbg('[SWITCH] → 정면 트랙 확정'); }
            else if (!trackMap.left && n.includes(STR.LEFT)) { trackMap.left = tr; dbg('[SWITCH] → 좌측 트랙 확정'); }
            else if (!trackMap.right && n.includes(STR.RIGHT)) { trackMap.right = tr; dbg('[SWITCH] → 우측 트랙 확정'); }
        }
    }

    if (!trackMap.front && !trackMap.left && !trackMap.right) { await showAlert('앵글 트랙을 찾을 수 없습니다.'); return; }

    let count = 0;
    for (let i = 0; i < cutData.length; i++) {
        const d = cutData[i];
        let angle = '';
        if (d.text.includes(STR.FRONT)) angle = 'front';
        else if (d.text.includes(STR.LEFT)) angle = 'left';
        else if (d.text.includes(STR.RIGHT)) angle = 'right';
        if (!angle) continue;

        const start = d.seconds;
        const end = i + 1 < cutData.length ? cutData[i + 1].seconds : 99999;

        for (const [key, tr] of Object.entries(trackMap)) {
            if (!tr) continue;
            const clips = await getClips(tr);
            for (const cl of clips) {
                const cs = await getClipStart(cl);
                if (cs >= start - 0.5 && cs < end) await setClipDisabled(proj, cl, key !== angle);
            }
        }
        count++;
    }
    await showAlert('앵글 스위칭 완료: ' + count + '개 구간');
}

async function autoRazorTracks() {
    dbgClear();
    dbg('[AUTO] 시작');
    const proj = await ppro.Project.getActiveProject();
    const seq = await getActiveSeq();
    if (!proj || !seq) return;

    const vTracks = await getVideoTracks(seq);
    const cutTimes = [];
    for (const tr of vTracks) {
        const clips = await getClips(tr);
        for (const cl of clips) {
            const name = await getClipName(cl);
            if (name.toLowerCase().includes('slide')) cutTimes.push({ seconds: await getClipStart(cl), text: name });
        }
    }

    if (!cutTimes.length) { await showAlert('Slide 클립을 찾을 수 없습니다.'); return; }
    cutTimes.sort((a, b) => a.seconds - b.seconds);

    let count = 0;
    for (let i = 0; i < cutTimes.length; i++) {
        const ct = cutTimes[i];
        const sm = ct.text.match(/\[Slide\s*(\d+)\]/i);
        const num = sm ? parseInt(sm[1]) : i + 1;
        const ok = await addMarker(proj, seq, secondsToTicks(ct.seconds), 'Slide ' + pad2(num), 0);
        if (ok) count++;
    }
    await showAlert('완료\n마커: ' + count + '개\n자르기: Ctrl+K 사용');
}

// ============================================================
//  이미지 자동 배치
// ============================================================

function extractImageNumbers(text) {
    const results = [];
    const regex = /#\s*(\d+)(?:\s*-\s*(\d+))?/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const num = parseInt(match[1], 10);
        const sub = match[2] ? parseInt(match[2], 10) : 0;
        const numStr = num < 10 ? '0' + num : '' + num;
        const subStr = sub ? '-' + (sub < 10 ? '0' + sub : '' + sub) : '';
        results.push({ num, sub, suffix: '_' + numStr + subStr });
    }
    return results;
}

async function findImageInProject(root, searchKey) {
    const lowerKey = searchKey.toLowerCase();
    let scanned = 0;
    const search = async (bin) => {
        let items;
        try { items = await bin.getItems(); } catch (e) { return null; }
        if (!items || !items.length) return null;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item) continue;
            const name = (item.name || '').toLowerCase();
            if (/\.(png|jpg|jpeg)$/i.test(name)) {
                scanned++;
                if (scanned <= 5) dbg('[FIND] 이미지 파일: ' + item.name);
                if (name.includes(lowerKey)) return item;
            } else {
                // 빈(bin) 타입이면 재귀 탐색
                const found = await search(item);
                if (found) return found;
            }
        }
        return null;
    };
    const result = await search(root);
    if (scanned === 0) dbg('[FIND] 프로젝트에 이미지 파일 없음');
    return result;
}

async function autoPlaceImages() {
    dbgClear();
    dbg('[IMG-PLACE] 시작');
    const proj = await ppro.Project.getActiveProject();
    const seq = await getActiveSeq();

    if (!proj || !seq) return;

    // 타겟 트랙 번호 (1-based → 0-based)
    const trackInput = getEl('img-track-input');
    const targetTrackIdx = Math.max(0, (parseInt(trackInput ? trackInput.value : 4) || 4) - 1);
    dbg('[IMG-PLACE] 타겟 트랙 인덱스(0-based): ' + targetTrackIdx);

    // 마커 수집
    const markerList = await getMarkerList(seq);
    if (!markerList.length) { await showAlert('시퀀스 마커가 없습니다.'); return; }

    const markerData = [];
    for (const mk of markerList) {
        markerData.push({ seconds: ticksToSeconds(await getMarkerTicks(mk)), text: await getMarkerName(mk) });
    }
    markerData.sort((a, b) => a.seconds - b.seconds);

    // 시퀀스 끝 시간
    let seqEndSeconds = 0;
    try { const et = await seq.getEndTime(); seqEndSeconds = et ? (et.seconds || ticksToSeconds(et.ticks || 0)) : 0; } catch (e) { }
    dbg('[IMG-PLACE] 시퀀스 끝: ' + seqEndSeconds.toFixed(2) + 's');

    // 배치 계획 수립
    const placements = [];
    let currentSlideNum = null;

    for (let i = 0; i < markerData.length; i++) {
        const mk = markerData[i];
        const sm = mk.text.match(/\[Slide\s*(\d+)\]/i);
        if (sm) currentSlideNum = parseInt(sm[1], 10);
        if (!currentSlideNum) continue;

        const imageNums = extractImageNumbers(mk.text);
        if (!imageNums.length) continue;

        // 이 마커 이후 다음 [Slide N] 직전까지
        let endSeconds = seqEndSeconds;
        for (let j = i + 1; j < markerData.length; j++) {
            if (markerData[j].text.match(/\[Slide\s*(\d+)\]/i)) {
                endSeconds = markerData[j].seconds;
                break;
            }
        }

        for (const imgInfo of imageNums) {
            const sn = currentSlideNum < 10 ? '0' + currentSlideNum : '' + currentSlideNum;
            const searchKey = 'p' + sn + imgInfo.suffix;
            const trackOffset = (imgInfo.num - 1) + imgInfo.sub;
            placements.push({ searchKey, startSeconds: mk.seconds, endSeconds, trackOffset });
        }
    }

    if (!placements.length) { await showAlert('마커에서 [#N] 이미지 태그를 찾을 수 없습니다.'); return; }
    dbg('[IMG-PLACE] 배치 계획: ' + placements.length + '개');

    // 같은 트랙 내 겹침 방지 (endSeconds 재계산)
    const byTrack = {};
    for (const pl of placements) {
        if (!byTrack[pl.trackOffset]) byTrack[pl.trackOffset] = [];
        byTrack[pl.trackOffset].push(pl);
    }
    for (const tk of Object.keys(byTrack)) {
        byTrack[tk].sort((a, b) => a.startSeconds - b.startSeconds);
        for (let t = 0; t < byTrack[tk].length - 1; t++) {
            if (byTrack[tk][t + 1].startSeconds < byTrack[tk][t].endSeconds)
                byTrack[tk][t].endSeconds = byTrack[tk][t + 1].startSeconds;
        }
    }

    // 필요한 트랙 수 확인 — 부족하면 자동 추가 시도
    const maxOffset = Math.max(...placements.map(p => p.trackOffset));
    const totalRequired = targetTrackIdx + maxOffset + 1;
    const currentTrackCount = await seq.getVideoTrackCount();
    if (totalRequired > currentTrackCount) {
        const tracksToAdd = totalRequired - currentTrackCount;
        dbg('[IMG-PLACE] 트랙 추가 시도: ' + tracksToAdd + '개 (현재 ' + currentTrackCount + ' → 필요 ' + totalRequired + ')');
        await showAlert('트랙이 부족합니다.\n\n현재: V' + currentTrackCount + ' | 필요: V' + totalRequired + '\n\n타임라인 빈 곳 우클릭 → [비디오 트랙 추가] 로\n' + tracksToAdd + '개 추가 후 다시 실행하세요.');
        return;
    }

    // 프로젝트 루트 가져오기
    const root = await proj.getRootItem();
    if (!root) { await showAlert('프로젝트 루트를 가져올 수 없습니다.'); return; }

    // SequenceEditor 가져오기
    const editor = await ppro.SequenceEditor.getEditor(seq);
    if (!editor) { await showAlert('SequenceEditor를 가져올 수 없습니다.'); return; }

    // 배치 실행
    let placedCount = 0;
    const notFound = [];

    for (const pl of placements) {
        const projectItem = await findImageInProject(root, pl.searchKey);
        if (!projectItem) { notFound.push(pl.searchKey); dbg('[IMG-PLACE] 못찾음: ' + pl.searchKey); continue; }

        const vTrackIdx = targetTrackIdx + pl.trackOffset;
        const startTime = ppro.TickTime.createWithSeconds(pl.startSeconds);
        const endTime = ppro.TickTime.createWithSeconds(pl.endSeconds);

        try {
            proj.lockedAccess(() => {
                proj.executeTransaction(ca => {
                    const act = editor.createOverwriteItemAction(projectItem, startTime, vTrackIdx, -1);
                    if (act) ca.addAction(act);
                });
            });
            dbg('[IMG-PLACE] 배치: ' + pl.searchKey + ' → V' + (vTrackIdx + 1) + ' @ ' + pl.startSeconds.toFixed(2) + 's');

            // 끝 시간 조정 — 배치 후 클립 찾아서 end 설정
            await new Promise(r => setTimeout(r, 100));
            const track = await seq.getVideoTrack(vTrackIdx);
            if (track) {
                const clips = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
                let target = null, bestDiff = Infinity;
                for (const cl of clips) {
                    try {
                        const st = await cl.getStartTime();
                        const stSec = st.seconds != null ? st.seconds : ticksToSeconds(st.ticks || 0);
                        const diff = Math.abs(stSec - pl.startSeconds);
                        if (diff < bestDiff) { bestDiff = diff; target = cl; }
                    } catch (e) { }
                }
                if (target && bestDiff < 1) {
                    proj.lockedAccess(() => {
                        proj.executeTransaction(ca => {
                            const act = target.createSetEndAction(endTime);
                            if (act) ca.addAction(act);
                        });
                    });
                }
            }
            placedCount++;
        } catch (e) { dbgErr('[IMG-PLACE] 배치 실패: ' + pl.searchKey, e); }
    }

    let msg = '이미지 배치 완료: ' + placedCount + '개';
    if (notFound.length) msg += '\n\n찾을 수 없는 이미지 (' + notFound.length + '개):\n' + notFound.slice(0, 10).join(', ');
    await showAlert(msg);
}


// ============================================================
//  버튼 핸들러
// ============================================================

function updateSlideBtn() {
    setBtnText('razor-marker-btn', '[Slide ' + _slideNum + ']');
}

function updateImgBtn() {
    setBtnText('img-marker-btn', '[#' + _imgNum + ']');
}

async function btnSlide() {
    dbgClear();
    const input = getEl('slide-start-input');
    const start = parseInt(input ? input.value : 1) || 1;
    // input 이벤트로 이미 동기화되어 있으나, 코드로 값을 바꾼 경우를 위해 재동기화
    if (_slideNum < start) _slideNum = start;
    dbg('[BTN] 슬라이드 실행 전: _slideNum=' + _slideNum);
    try {
        await razorAndMark('[Slide ' + _slideNum + ']');
    } catch (e) {
        dbgErr('[BTN] razorAndMark 실패', e);
    }
    _slideNum++;
    _imgNum = 1;
    dbg('[BTN] 슬라이드 실행 후: _slideNum=' + _slideNum);
    if (window._setSlideInput) window._setSlideInput(_slideNum);
    if (window._setImgInput) window._setImgInput(1);
    updateSlideBtn();
    updateImgBtn();
}

async function btnImg() {
    const input = getEl('img-start-input');
    const start = parseInt(input ? input.value : 1) || 1;
    if (_imgNum < start) _imgNum = start;
    await appendImgToLastMarker('#' + _imgNum);
    _imgNum++;
    if (window._setImgInput) window._setImgInput(_imgNum);
    updateImgBtn();
}

// ============================================================
//  초기화
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    ensureAlertUI();

    const bind = (id, fn) => {
        const el = getEl(id);
        if (el) el.addEventListener('click', fn);
        else dbg('[DOM] 버튼 없음: ' + id);
    };

    const guarded = (fn) => async () => {
        if (!_authPassed) {
            dbg('[차단] 인증 필요');
            let result;
            if (_authState && _authState.email) {
                // 이메일 있음 (만료/유예 등) → 라이선스 입력창만
                result = await showLicenseModal('라이선스 키를 입력하여 계속 사용하세요.');
            } else {
                // 완전 신규 → 체험판/라이선스 선택 웰컴 모달
                result = await showWelcomeModal();
            }
            if (result && result.ok) { updateLicenseStatus(result); _authPassed = true; }
            return;
        }
        return await fn();
    };

    bind('razor-btn', guarded(() => safeRun('자르기', razorAtPlayhead)));
    bind('auto-razor-btn', guarded(() => safeRun('자동 자르기', autoRazorTracks)));
    bind('razor-marker-btn', guarded(() => safeRun('슬라이드 마커', btnSlide)));
    bind('angle-front-btn', guarded(() => safeRun('정면', () => appendAngleToLastMarker('정면'))));
    bind('angle-right-btn', guarded(() => safeRun('우측', () => appendAngleToLastMarker('우측'))));
    bind('angle-left-btn', guarded(() => safeRun('좌측', () => appendAngleToLastMarker('좌측'))));
    bind('img-marker-btn', guarded(() => safeRun('이미지 마커', btnImg)));
    bind('switch-btn', guarded(() => safeRun('앵글 스위칭', autoSwitchAngle)));
    bind('image-btn', guarded(() => safeRun('이미지 배치', autoPlaceImages)));

    /* bind('debug-shape-btn', guarded(async () => {
        dbgClear();
        _probedMarkerAPI = false;
        try {
            const seq = await getActiveSeq();
            if (!seq) { dbg('[DEBUG] 활성 시퀀스 없음'); return; }
            await probeMarkerAPI(seq);
        } catch (e) { dbgErr('[DEBUG] probeMarkerAPI 실패', e); }
    }));

    bind('debug-bridge-btn', guarded(async () => {
        dbgClear();
        try {
            const seq = await getActiveSeq();
            if (!seq) { dbg('[DEBUG] 활성 시퀀스 없음'); return; }

            // ppro.CompoundAction 탐색
            try {
                const CA = ppro.CompoundAction;
                if (CA) {
                    dbg('[BRIDGE] CompoundAction keys: ' + Reflect.ownKeys(CA).map(String).join(', '));
                    if (CA.prototype) dbg('[BRIDGE] CompoundAction.prototype: ' + Object.getOwnPropertyNames(CA.prototype).join(', '));
                    // CompoundAction 인스턴스 생성 시도
                    try {
                        const ca = new CA();
                        dbg('[BRIDGE] new CompoundAction() 성공 constructor=' + (ca.constructor && ca.constructor.name));
                        dbg('[BRIDGE] ca prototype: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(ca)).join(', '));
                    } catch (e) { dbgErr('[BRIDGE] new CompoundAction() 실패', e); }
                } else { dbg('[BRIDGE] CompoundAction 없음'); }
            } catch (e) { dbgErr('[BRIDGE] CompoundAction 탐색 실패', e); }

            // ppro.Sequence 프로토타입 탐색
            try {
                const Seq = ppro.Sequence;
                if (Seq) {
                    dbg('[BRIDGE] ppro.Sequence keys: ' + Reflect.ownKeys(Seq).map(String).join(', '));
                    if (Seq.prototype) dbg('[BRIDGE] ppro.Sequence.prototype: ' + Object.getOwnPropertyNames(Seq.prototype).join(', '));
                } else { dbg('[BRIDGE] ppro.Sequence 없음'); }
            } catch (e) { dbgErr('[BRIDGE] ppro.Sequence 탐색 실패', e); }

            // seq 인스턴스 프로토타입 탐색
            try {
                const proto = Object.getPrototypeOf(seq);
                dbg('[BRIDGE] seq prototype: ' + Object.getOwnPropertyNames(proto).join(', '));
            } catch (e) { dbgErr('[BRIDGE] seq prototype 실패', e); }

            // ppro.Project 탐색
            try {
                const Proj = ppro.Project;
                if (Proj) {
                    dbg('[BRIDGE] ppro.Project keys: ' + Reflect.ownKeys(Proj).map(String).join(', '));
                    if (Proj.prototype) dbg('[BRIDGE] ppro.Project.prototype: ' + Object.getOwnPropertyNames(Proj.prototype).join(', '));
                }
            } catch (e) { dbgErr('[BRIDGE] ppro.Project 탐색 실패', e); }

            // createAddMarkerAction에 Marker.MARKER_TYPE_COMMENT 상수 + TickTime 조합 시도
            try {
                const col = await ppro.Markers.getMarkers(seq);
                const markerType = ppro.Marker.MARKER_TYPE_COMMENT;
                dbg('[BRIDGE] MARKER_TYPE_COMMENT = ' + markerType);

                // ticks 값이 있는 기존 마커 가져오기
                const list = await toArray(await col.getMarkers());
                const existStart = list.length > 0 ? await list[0].getStart() : null;
                const ticksStr = existStart ? String(existStart.ticks) : '0';
                const ttReal = await ppro.TickTime.createWithTicks(ticksStr);
                dbg('[BRIDGE] ttReal.ticks=' + ttReal.ticks + ' ticksStr=' + ticksStr);

                const ticksStrExplicit = String(ttReal.ticks);
                const ticksNum = ttReal.ticksNumber;
                dbg('[BRIDGE] ticksStrExplicit=' + ticksStrExplicit + ' ticksNum=' + ticksNum);

                // "Script action failed to execute" = 타입 맞음, 실행 실패
                // 성공 후보: (markerType, ticksStr), (markerType, ttReal.ticks), (ticksStr, markerType), (ticksStr)
                const proj = await ppro.Project.getActiveProject();

                // "Script action failed to execute" = action 생성 성공, 실행 실패 가능성
                // executeTransaction / lockedAccess 안에서 시도
                // 현재 플레이헤드 위치 가져오기
                const ph = await getPlayhead(seq);
                const phTicks = String(ph.ticks);
                const phSec = ph.seconds;
                dbg('[BRIDGE] 플레이헤드 ticks=' + phTicks + ' sec=' + phSec);

                // 각 조합 테스트: 트랜잭션 후 마커 수 변화로 실제 생성 여부 확인
                const beforeCount = (await getMarkerList(seq)).length;
                dbg('[BRIDGE] 테스트 전 마커 수: ' + beforeCount);

                const txCombos = [
                    // 두 번째 인자 = 현재 플레이헤드 ticks 문자열
                    ['tx:(markerType, phTicks)', async () => col.createAddMarkerAction(markerType, phTicks)],
                    // 두 번째 인자 = seconds 문자열
                    ['tx:(markerType, phSec_str)', async () => col.createAddMarkerAction(markerType, String(phSec))],
                    // 두 번째 인자 = seconds 정수 문자열
                    ['tx:(markerType, phSec_int)', async () => col.createAddMarkerAction(markerType, String(Math.round(phSec)))],
                    // 인자 순서 반전
                    ['tx:(phTicks, markerType)', async () => col.createAddMarkerAction(phTicks, markerType)],
                    // ticks=0 (이미 성공 확인됨 — 시퀀스 시작에 마커 생기는지 확인)
                    ['tx:(markerType, "0")', async () => col.createAddMarkerAction(markerType, '0')],
                ];

                // Action 인스턴스 구조 먼저 확인
                try {
                    let act;
                    await proj.executeTransaction(async ca => {
                        act = await col.createAddMarkerAction(markerType, phTicks);
                        if (act) {
                            dbg('[BRIDGE] act keys: ' + Object.keys(act).join(', '));
                            const proto = Object.getPrototypeOf(act);
                            dbg('[BRIDGE] act proto methods: ' + Object.getOwnPropertyNames(proto).join(', '));
                            // act 직접 실행 시도
                            for (const m of Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor')) {
                                try {
                                    dbg('[BRIDGE] act.' + m + '() 시도');
                                    const r = await act[m]();
                                    dbg('[BRIDGE] act.' + m + '() 결과: ' + typeof r);
                                } catch (e2) { dbg('[BRIDGE] act.' + m + '() 실패: ' + e2.message); }
                            }
                            ca.addAction(act);
                        }
                    });
                } catch (e) { dbgErr('[BRIDGE] act 구조 확인 실패', e); }

                await new Promise(r => setTimeout(r, 300));
                const afterAct = (await getMarkerList(seq)).length;
                dbg('[BRIDGE] act 구조 테스트 후 마커 수: ' + afterAct);

                // lockedAccess 안에서만 createAddMarkerAction 시도 (addAction 없이)
                try {
                    await proj.lockedAccess(async () => {
                        const act = await col.createAddMarkerAction(markerType, phTicks);
                        dbg('[BRIDGE] lockedAccess act=' + typeof act);
                    });
                    await new Promise(r => setTimeout(r, 300));
                    dbg('[BRIDGE] lockedAccess 후 마커 수: ' + (await getMarkerList(seq)).length);
                } catch (e) { dbg('[BRIDGE] lockedAccess 실패: ' + e.message); }

                // createMoveMarkerAction / createRemoveMarkerAction 시그니처 확인 (비교용)
                try {
                    const mks = await getMarkerList(seq);
                    if (mks.length > 0) {
                        const rm = await col.createRemoveMarkerAction(mks[0]);
                        dbg('[BRIDGE] createRemoveMarkerAction(marker) = ' + typeof rm);
                    }
                } catch (e) { dbg('[BRIDGE] createRemoveMarkerAction 실패: ' + e.message); }

                for (const [label, actFn] of txCombos) {
                    try {
                        let act;
                        await proj.executeTransaction(async ca => {
                            act = await actFn();
                            if (act) ca.addAction(act);
                        });
                        await new Promise(r => setTimeout(r, 200));
                        const afterCount = (await getMarkerList(seq)).length;
                        dbg('[BRIDGE] ' + label + ' → 마커 수: ' + afterCount + ' (변화: ' + (afterCount - beforeCount) + ')');
                        if (afterCount > beforeCount) {
                            dbg('[BRIDGE] ★ 마커 생성 확인됨! ' + label);
                            const mks = await getMarkerList(seq);
                            for (const mk of mks) {
                                const t = await getMarkerTicks(mk);
                                dbg('[BRIDGE]   생성 마커 ticks=' + t + ' sec=' + ticksToSeconds(t).toFixed(3));
                            }
                            break;
                        }
                    } catch (e) { dbg('[BRIDGE] ' + label + ' 실패: ' + e.message); }
                }
            } catch (e) { dbgErr('[BRIDGE] 조합 테스트 실패', e); }

            dbg('[BRIDGE] 완료');
        } catch (e) { dbgErr('[BRIDGE] 실패', e); }
    })); */

    // 시작 번호 입력 변경 시 버튼 텍스트 즉시 반영 (사용자 직접 입력 시에만)
    let _slideInputByCode = false;
    const slideInput = getEl('slide-start-input');
    const onSlideInput = () => {
        if (_slideInputByCode) return;
        const v = parseInt(slideInput.value) || 1;
        _slideNum = v;
        updateSlideBtn();
    };
    if (slideInput) {
        slideInput.addEventListener('input', onSlideInput);
        slideInput.addEventListener('change', onSlideInput);
    }
    window._setSlideInput = (val) => {
        _slideInputByCode = true;
        if (slideInput) slideInput.value = val;
        _slideInputByCode = false;
    };
    let _imgInputByCode = false;
    const imgInput2 = getEl('img-start-input');
    const onImgInput = () => {
        if (_imgInputByCode) return;
        const v = parseInt(imgInput2.value) || 1;
        _imgNum = v;
        updateImgBtn();
    };
    if (imgInput2) {
        imgInput2.addEventListener('input', onImgInput);
        imgInput2.addEventListener('change', onImgInput);
    }
    window._setImgInput = (val) => {
        _imgInputByCode = true;
        if (imgInput2) imgInput2.value = val;
        _imgInputByCode = false;
    };

    updateSlideBtn();
    updateImgBtn();
    dbg('SJE PR Edit Pro v2.0 로드 완료');

    // license-status 클릭 / 키 입력 버튼 → 모달 열기
    const openLicenseModal = async () => {
        const result = await showLicenseModal('라이선스 키를 입력하면 구독으로 전환됩니다.');
        if (result && result.ok) { updateLicenseStatus(result); _authPassed = true; }
    };
    const licSt = getEl('license-status');
    if (licSt) licSt.addEventListener('click', openLicenseModal);
    bind('license-key-btn', openLicenseModal);

    // 패널 로드 시 인증 상태 확인
    doInitAuth().then(async r => {
        _authState = r;
        if (r.ok) {
            updateLicenseStatus(r);
            _authPassed = true;
        } else if (r.reason === 'trial_not_found') {
            // 신규 → 웰컴 모달 (체험판/라이선스 선택)
            updateLicenseStatus({ ok: false });
            const result = await showWelcomeModal();
            if (result && result.ok) { updateLicenseStatus(result); _authPassed = true; _authState = result; }
        } else if (r.reason === 'trial_expired') {
            // 체험판 만료 → 라이선스 입력 모달
            updateLicenseStatus(r);
            await showAlert('7일 체험판이 만료되었습니다.\n라이선스 키를 입력하여 계속 사용하세요.', '체험판 만료');
            const result = await showLicenseModal('라이선스 키를 입력하면 구독으로 전환됩니다.');
            if (result && result.ok) { updateLicenseStatus(result); _authPassed = true; _authState = result; }
        } else {
            // 그 외 실패 (expired, hwid_mismatch 등) → 라이선스 입력 모달
            updateLicenseStatus({ ok: false });
            const result = await showLicenseModal('인증이 필요합니다. 라이선스 키를 입력해 주세요.');
            if (result && result.ok) { updateLicenseStatus(result); _authPassed = true; _authState = result; }
        }
    }).catch(() => { });
});