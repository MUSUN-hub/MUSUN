// ============================================
// [REVISED v5] Copy-Paste Pro License Server - Google Apps Script
// (Multi-Device + Registration + Deactivation + Subscription + Renew)
// ============================================
// 이 코드를 Google Apps Script 에디터에 붙여넣고 [새 배포] 해주세요.
//
// Licenses 시트 컬럼:
// [A:Key, B:HWIDs, C:User, D:ActiveDate, E:Computers, F:Max, G:IssuedDate, H:Plan, I:ExpiryDate]

var TRIAL_DAYS = 10;
var GRACE_DAYS = 7;

// ============================================
// 만료일 계산 헬퍼
// plan 이 바뀌면 오늘부터, 같은 플랜 갱신이면 기존 만료일(미래) 또는 오늘 중 더 큰 쪽에서 연장
// ============================================
function calcNewExpiry(currentExpiryStr, currentPlan, newPlan) {
  var now = new Date();

  // 플랜이 바뀌면 항상 오늘부터 계산
  if (currentPlan !== newPlan) {
    return addPlanDuration(now, newPlan);
  }

  // 같은 플랜 갱신: 기존 만료일이 미래면 거기서 연장, 아니면 오늘부터
  var base = now;
  if (currentExpiryStr) {
    var existing = new Date(currentExpiryStr);
    if (existing > now) {
      base = existing;
    }
  }
  return addPlanDuration(base, newPlan);
}

function addPlanDuration(baseDate, plan) {
  var d = new Date(baseDate.getTime());
  if (plan === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    // monthly (기본)
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function formatExpiryISO(date) {
  return Utilities.formatDate(date, "UTC", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

// ============================================
// doGet 라우터
// ============================================
function doGet(e) {
  // 파라미터 없으면 모바일 대시보드 HTML 반환
  if (!e || !e.parameter || !e.parameter.action) {
    return HtmlService.createHtmlOutput(getDashboardHtml())
      .setTitle("Copy-Paste Pro 관리자")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var action = e.parameter.action;

  if (action === "check") {
    return checkLicense(e.parameter.key, e.parameter.hwid);
  } else if (action === "activate") {
    return activateLicense(e.parameter.key, e.parameter.hwid, e.parameter.user, e.parameter.computer);
  } else if (action === "deactivate") {
    return deactivateLicense(e.parameter.key, e.parameter.hwid);
  } else if (action === "register") {
    return registerLicense(e.parameter.key, e.parameter.user, e.parameter.date, e.parameter.plan, e.parameter.expiry_date);
  } else if (action === "trial_check") {
    return checkTrial(e.parameter.hwid);
  } else if (action === "trial_register") {
    return registerTrial(e.parameter.hwid);
  } else if (action === "check_subscription") {
    return checkSubscription(e.parameter.key, e.parameter.hwid);
  } else if (action === "renew") {
    // 갱신 + 플랜 변경 통합
    return renewSubscription(e.parameter.key, e.parameter.plan);
  } else if (action === "list") {
    return listLicenses();
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: "Invalid action"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 갱신 + 플랜 변경 통합 함수
// plan 파라미터: "monthly" | "yearly"
// 플랜이 바뀌면 오늘부터 재계산, 같은 플랜이면 기존 만료일 연장
// ============================================
function renewSubscription(licenseKey, newPlan) {
  if (!licenseKey) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error", message: "라이선스 키 없음"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var planVal = newPlan || "monthly";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === licenseKey) {
      var currentPlan    = String(data[i][7] || "monthly");
      var currentExpiry  = String(data[i][8] || "");

      var newExpiryDate  = calcNewExpiry(currentExpiry, currentPlan, planVal);
      var newExpiryISO   = formatExpiryISO(newExpiryDate);
      var newExpiryDisp  = Utilities.formatDate(newExpiryDate, Session.getScriptTimeZone(), "yyyy-MM-dd");

      // H열(Plan) + I열(ExpiryDate) 동시 업데이트
      sheet.getRange(i + 1, 8).setValue(planVal);
      sheet.getRange(i + 1, 9).setValue(newExpiryISO);

      var planChanged = (currentPlan !== planVal);

      return ContentService.createTextOutput(JSON.stringify({
        status: "renewed",
        plan: planVal,
        plan_changed: planChanged,
        expiry_date: newExpiryISO,
        expiry_display: newExpiryDisp,
        message: (planChanged ? "플랜 변경 및 " : "") + "갱신 완료: " + newExpiryDisp + "까지"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "not_found", message: "라이선스 키를 찾을 수 없습니다"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 라이선스 목록 조회 (대시보드용)
// ============================================
function listLicenses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  var list  = [];

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var key        = String(row[0] || "");
    var user       = String(row[2] || "");
    var computers  = String(row[4] || "");
    var issuedDate = String(row[6] || "");
    var plan       = String(row[7] || "");
    var expiryStr  = String(row[8] || "");

    if (!key) continue;

    var daysRemaining = null;
    var subStatus     = "permanent";
    if (expiryStr) {
      var expiry        = new Date(expiryStr);
      var diff          = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      daysRemaining     = diff;
      if      (diff > 0)          subStatus = "valid";
      else if (diff > -GRACE_DAYS) subStatus = "grace";
      else                         subStatus = "expired";
    }

    list.push({
      key:           key,
      user:          user,
      computers:     computers,
      issued_date:   issuedDate,
      plan:          plan,
      expiry_date:   expiryStr,
      days_remaining: daysRemaining,
      sub_status:    subStatus
    });
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "ok", licenses: list
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 모바일 관리자 대시보드 HTML
// ============================================
function getDashboardHtml() {
  // GAS 배포 URL을 그대로 사용 (자기 자신 호출)
  var selfUrl = ScriptApp.getService().getUrl();

  return '<!DOCTYPE html>\n' +
'<html lang="ko">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
'<title>Copy-Paste Pro 관리자</title>\n' +
'<style>\n' +
':root{\n' +
'  --bg:#0f0f17;--bg2:#1a1a28;--bg3:#12121e;\n' +
'  --accent:#c8a84b;--accent2:#a07830;\n' +
'  --fg:#e0e0e0;--fg-dim:#888899;\n' +
'  --border:#2a2a3a;--red:#e05555;--green:#55c47a;--orange:#e09455;\n' +
'}\n' +
'*{box-sizing:border-box;margin:0;padding:0}\n' +
'body{\n' +
'  background:var(--bg);color:var(--fg);\n' +
'  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;\n' +
'  font-size:14px;\n' +
'  overflow-x:clip;\n' +
'  -webkit-overflow-scrolling:touch;\n' +
'  touch-action:manipulation;\n' +
'}\n' +
'header{\n' +
'  position:sticky;top:0;z-index:100;\n' +
'  background:var(--bg2);border-bottom:1px solid var(--border);\n' +
'  padding:12px 16px;\n' +
'  padding-top:calc(12px + env(safe-area-inset-top));\n' +
'}\n' +
'header h1{font-size:16px;color:var(--accent);letter-spacing:.5px}\n' +
'header p{font-size:11px;color:var(--fg-dim);margin-top:2px}\n' +
'.container{max-width:480px;margin:0 auto;padding:16px;}\n' +
'.card{\n' +
'  background:var(--bg2);border:1px solid var(--border);\n' +
'  border-radius:10px;padding:16px;margin-bottom:16px;\n' +
'}\n' +
'.card h2{font-size:13px;color:var(--accent);margin-bottom:12px;letter-spacing:.3px}\n' +
'label{display:block;font-size:11px;color:var(--fg-dim);margin-bottom:4px}\n' +
'input,select{\n' +
'  width:100%;background:var(--bg3);color:var(--fg);\n' +
'  border:1px solid var(--border);border-radius:6px;\n' +
'  padding:0 10px;height:44px;font-size:14px;\n' +
'  -webkit-appearance:none;appearance:none;\n' +
'  touch-action:manipulation;\n' +
'}\n' +
'select{\n' +
'  background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23888899\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E");\n' +
'  background-repeat:no-repeat;background-position:right 12px center;\n' +
'  padding-right:36px;\n' +
'}\n' +
'input[type="date"]::-webkit-calendar-picker-indicator{\n' +
'  filter:invert(1);opacity:.5;\n' +
'}\n' +
'.field{margin-bottom:12px}\n' +
'button{\n' +
'  width:100%;height:48px;\n' +
'  background:var(--accent);color:#0f0f17;\n' +
'  border:none;border-radius:8px;\n' +
'  font-size:15px;font-weight:700;\n' +
'  cursor:pointer;margin-top:4px;\n' +
'  touch-action:manipulation;\n' +
'  -webkit-tap-highlight-color:transparent;\n' +
'}\n' +
'button:active{background:var(--accent2)}\n' +
'.result{\n' +
'  margin-top:12px;padding:12px;\n' +
'  background:var(--bg3);border-radius:6px;\n' +
'  font-size:13px;line-height:1.6;\n' +
'  display:none;word-break:break-all;\n' +
'}\n' +
'.ok{color:var(--green)}.err{color:var(--red)}.warn{color:var(--orange)}\n' +
'.badge{\n' +
'  display:inline-block;padding:2px 8px;\n' +
'  border-radius:4px;font-size:11px;font-weight:700;\n' +
'}\n' +
'.badge-ok{background:#1a3d2a;color:var(--green)}\n' +
'.badge-warn{background:#3d2a10;color:var(--orange)}\n' +
'.badge-err{background:#3d1a1a;color:var(--red)}\n' +
'.list-item{\n' +
'  padding:10px 0;border-bottom:1px solid var(--border);\n' +
'}\n' +
'.list-item:last-child{border-bottom:none}\n' +
'.list-key{\n' +
'  font-family:monospace;font-size:12px;color:var(--accent);\n' +
'  cursor:pointer;user-select:all;\n' +
'  display:inline-block;padding:2px 6px;\n' +
'  border-radius:4px;border:1px solid transparent;\n' +
'  transition:background .15s,border-color .15s;\n' +
'}\n' +
'.list-key:hover{background:var(--bg3);border-color:var(--border)}\n' +
'.list-key:active{background:#2a2a1a}\n' +
'.list-key-copied{background:#1a3d2a !important;border-color:var(--green) !important;color:var(--green) !important}\n' +
'.list-user{font-size:13px;font-weight:600;margin:2px 0}\n' +
'.list-meta{font-size:11px;color:var(--fg-dim)}\n' +
'#listSearch{\n' +
'  margin-bottom:10px;\n' +
'}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<header>\n' +
'  <h1>⚙️ Copy-Paste Pro 관리자</h1>\n' +
'  <p>라이선스 서버 관리 대시보드</p>\n' +
'</header>\n' +
'<div class="container">\n' +
'\n' +
'  <!-- 카드 0: 신규 발급 -->\n' +
'  <div class="card">\n' +
'    <h2>🆕 신규 라이선스 발급</h2>\n' +
'    <div class="field"><label>사용자 이름</label>\n' +
'      <input type="text" id="regName" placeholder="홍길동" autocomplete="off">\n' +
'    </div>\n' +
'    <div class="field"><label>구독 플랜</label>\n' +
'      <select id="regPlan" onchange="updateExpiryPreview()">\n' +
'        <option value="monthly">월간 (1개월)</option>\n' +
'        <option value="yearly">연간 (1년)</option>\n' +
'      </select>\n' +
'    </div>\n' +
'    <div class="field"><label>구독 시작일</label>\n' +
'      <input type="date" id="regStart" onchange="updateExpiryPreview()">\n' +
'    </div>\n' +
'    <div class="field"><label>만료 예정일</label>\n' +
'      <div id="expiryPreview" style="color:var(--accent);font-size:14px;padding:4px 0">—</div>\n' +
'    </div>\n' +
'    <button onclick="doRegister()">라이선스 키 생성 및 서버 등록</button>\n' +
'    <div class="result" id="regResult"></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- 카드 1: 갱신 + 플랜 변경 통합 -->\n' +
'  <div class="card">\n' +
'    <h2>🔄 갱신 / 플랜 변경</h2>\n' +
'    <div class="field"><label>라이선스 키</label>\n' +
'      <input type="text" id="renewKey" placeholder="AE2025..." autocomplete="off" autocapitalize="characters">\n' +
'    </div>\n' +
'    <div class="field"><label>플랜 선택</label>\n' +
'      <select id="renewPlan">\n' +
'        <option value="monthly">월간 (1개월)</option>\n' +
'        <option value="yearly">연간 (1년)</option>\n' +
'      </select>\n' +
'    </div>\n' +
'    <button onclick="doRenew()">갱신 / 플랜 변경 적용</button>\n' +
'    <div class="result" id="renewResult"></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- 카드 2: 라이선스 목록 -->\n' +
'  <div class="card">\n' +
'    <h2>📋 라이선스 목록</h2>\n' +
'    <button onclick="loadList()">목록 새로고침</button>\n' +
'    <input type="text" id="listSearch" placeholder="이름 검색..." autocomplete="off" oninput="filterList()" style="margin-top:10px">\n' +
'    <div class="result" id="listResult" style="display:block;margin-top:10px;padding:0;background:transparent"></div>\n' +
'  </div>\n' +
'\n' +
'</div>\n' +
'\n' +
'<script>\n' +
'var API = "' + selfUrl + '";\n' +
'\n' +
'// 오늘 날짜 기본값 세팅\n' +
'(function(){\n' +
'  var today = new Date();\n' +
'  var y = today.getFullYear();\n' +
'  var m = String(today.getMonth()+1).padStart(2,"0");\n' +
'  var d = String(today.getDate()).padStart(2,"0");\n' +
'  document.getElementById("regStart").value = y+"-"+m+"-"+d;\n' +
'  updateExpiryPreview();\n' +
'})();\n' +
'\n' +
'function updateExpiryPreview(){\n' +
'  var startVal = document.getElementById("regStart").value;\n' +
'  var plan     = document.getElementById("regPlan").value;\n' +
'  if(!startVal){document.getElementById("expiryPreview").textContent="—";return;}\n' +
'  var d = new Date(startVal);\n' +
'  if(plan==="yearly") d.setFullYear(d.getFullYear()+1);\n' +
'  else d.setMonth(d.getMonth()+1);\n' +
'  var y=d.getFullYear();\n' +
'  var mo=String(d.getMonth()+1).padStart(2,"0");\n' +
'  var day=String(d.getDate()).padStart(2,"0");\n' +
'  document.getElementById("expiryPreview").textContent=y+"-"+mo+"-"+day;\n' +
'}\n' +
'\n' +
'function generateKey(userName){\n' +
'  // Python generate_key 와 동일한 로직 (MD5 없이 간단 해시)\n' +
'  var now  = new Date();\n' +
'  var y    = now.getFullYear();\n' +
'  var mo   = String(now.getMonth()+1).padStart(2,"0");\n' +
'  var d    = String(now.getDate()).padStart(2,"0");\n' +
'  var raw  = userName + y + mo + d;\n' +
'  // 간단 해시 (서버 등록 후 반환된 키를 사용하므로 여기선 임시 표시용)\n' +
'  var hash = 0;\n' +
'  for(var i=0;i<raw.length;i++){hash=((hash<<5)-hash)+raw.charCodeAt(i);hash=hash&hash;}\n' +
'  hash = Math.abs(hash) % 1679616; // 36^4\n' +
'  var chars="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";\n' +
'  var hs="";\n' +
'  var n=hash;\n' +
'  for(var j=0;j<4;j++){hs=chars[n%36]+hs;n=Math.floor(n/36);}\n' +
'  return "AE"+y+mo+hs;\n' +
'}\n' +
'\n' +
'function doRegister(){\n' +
'  var name  = document.getElementById("regName").value.trim();\n' +
'  var plan  = document.getElementById("regPlan").value;\n' +
'  var start = document.getElementById("regStart").value;\n' +
'  if(!name){showResult("regResult","<span class=err>사용자 이름을 입력하세요</span>");return;}\n' +
'  if(!start){showResult("regResult","<span class=err>시작일을 선택하세요</span>");return;}\n' +
'\n' +
'  // 만료일 계산\n' +
'  var sd = new Date(start);\n' +
'  var ed = new Date(start);\n' +
'  if(plan==="yearly") ed.setFullYear(ed.getFullYear()+1);\n' +
'  else ed.setMonth(ed.getMonth()+1);\n' +
'  var expiryISO = ed.getFullYear()+"-"+String(ed.getMonth()+1).padStart(2,"0")+"-"+String(ed.getDate()).padStart(2,"0")+"T00:00:00.000Z";\n' +
'  var today = new Date();\n' +
'  var dateStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");\n' +
'  var key = generateKey(name);\n' +
'\n' +
'  showResult("regResult","<span class=warn>⏳ 서버 등록 중...</span>");\n' +
'  api({action:"register",key:key,user:name,date:dateStr,plan:plan,expiry_date:expiryISO}).then(function(r){\n' +
'    if(r.status==="registered"){\n' +
'      var expiryDisp = expiryISO.substr(0,10);\n' +
'      var planStr = plan==="yearly"?"연간":"월간";\n' +
'      showResult("regResult",\n' +
'        "<span class=ok>✅ 등록 성공</span><br>"\n' +
'        +"<div style=\'margin-top:8px;padding:8px;background:var(--bg);border-radius:6px;font-family:monospace;font-size:13px;color:var(--accent);letter-spacing:1px\'>"+key+"</div>"\n' +
'        +"<small style=\'color:var(--fg-dim)\'>"+planStr+" / 만료: "+expiryDisp+"</small>"\n' +
'        +"<br><button onclick=\\"copyKey(\'"+key+"\')\\" style=\'height:36px;margin-top:8px;font-size:13px\'>키 복사</button>"\n' +
'      );\n' +
'      loadList();\n' +
'    } else {\n' +
'      showResult("regResult","<span class=err>❌ "+(r.message||r.status)+"</span>");\n' +
'    }\n' +
'  }).catch(function(){showResult("regResult","<span class=err>❌ 네트워크 오류</span>");});\n' +
'}\n' +
'\n' +
'function copyKey(key){\n' +
'  if(navigator.clipboard){navigator.clipboard.writeText(key);}\n' +
'  else{var t=document.createElement("textarea");t.value=key;document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);}\n' +
'  alert("복사됨: "+key);\n' +
'}\n' +
'\n' +
'function api(params){\n' +
'  var qs = Object.keys(params).map(function(k){\n' +
'    return encodeURIComponent(k)+"="+encodeURIComponent(params[k]);\n' +
'  }).join("&");\n' +
'  return fetch(API+"?"+qs).then(function(r){return r.json();});\n' +
'}\n' +
'\n' +
'function showResult(id, html){\n' +
'  var el=document.getElementById(id);\n' +
'  el.style.display="block";\n' +
'  el.innerHTML=html;\n' +
'}\n' +
'\n' +
'function doRenew(){\n' +
'  var key=document.getElementById("renewKey").value.trim();\n' +
'  var plan=document.getElementById("renewPlan").value;\n' +
'  if(!key){showResult("renewResult","<span class=err>키를 입력하세요</span>");return;}\n' +
'  showResult("renewResult","<span class=warn>처리 중...</span>");\n' +
'  api({action:"renew",key:key,plan:plan}).then(function(r){\n' +
'    if(r.status==="renewed"){\n' +
'      showResult("renewResult",\n' +
'        "<span class=ok>✅ "+r.message+"</span><br>"\n' +
'        +"<small style=\'color:var(--fg-dim)\'>플랜: "+r.plan+" / 만료: "+r.expiry_display+"</small>");\n' +
'    } else {\n' +
'      showResult("renewResult","<span class=err>❌ "+(r.message||r.status)+"</span>");\n' +
'    }\n' +
'  }).catch(function(e){showResult("renewResult","<span class=err>❌ 네트워크 오류</span>");});\n' +
'}\n' +
'\n' +
'var _allLicenses=[];\n' +
'\n' +
'function loadList(){\n' +
'  var el=document.getElementById("listResult");\n' +
'  document.getElementById("listSearch").value="";\n' +
'  el.innerHTML="<span class=warn>로딩 중...</span>";\n' +
'  api({action:"list"}).then(function(r){\n' +
'    if(!r.licenses||r.licenses.length===0){\n' +
'      _allLicenses=[];\n' +
'      el.innerHTML="<span class=warn>등록된 라이선스 없음</span>";\n' +
'      return;\n' +
'    }\n' +
'    _allLicenses=r.licenses;\n' +
'    renderList(_allLicenses);\n' +
'  }).catch(function(){\n' +
'    el.innerHTML="<span class=err>❌ 불러오기 실패</span>";\n' +
'  });\n' +
'}\n' +
'\n' +
'function filterList(){\n' +
'  var q=document.getElementById("listSearch").value.toLowerCase().trim();\n' +
'  var filtered=q?_allLicenses.filter(function(lic){return lic.user&&lic.user.toLowerCase().indexOf(q)!==-1;}):_allLicenses;\n' +
'  renderList(filtered);\n' +
'}\n' +
'\n' +
'function renderList(list){\n' +
'  var el=document.getElementById("listResult");\n' +
'  if(!list||list.length===0){\n' +
'    el.innerHTML="<span class=warn>검색 결과 없음</span>";\n' +
'    return;\n' +
'  }\n' +
'  var html="";\n' +
'  list.forEach(function(lic){\n' +
'    var badgeCls,badgeTxt;\n' +
'    if(lic.sub_status==="expired"){badgeCls="badge-err";badgeTxt="만료";}\n' +
'    else if(lic.sub_status==="grace"){badgeCls="badge-warn";badgeTxt="유예";}\n' +
'    else if(lic.sub_status==="permanent"){badgeCls="badge-ok";badgeTxt="영구";}\n' +
'    else{badgeCls="badge-ok";badgeTxt=(lic.days_remaining!=null?lic.days_remaining+"일":"유효");}\n' +
'    var planStr=lic.plan==="yearly"?"연간":"월간";\n' +
'    var expStr=lic.expiry_date?lic.expiry_date.substr(0,10):"만료일없음";\n' +
'    var safeKey=lic.key.replace(/\'/g,"\\\\\'");\n' +
'    html+=\'<div class="list-item">\';\n' +
'    html+=\'<div class="list-key" onclick="copyLicenseKey(this,\\\'\'+safeKey+\'\\\')" title="클릭하여 복사">\'+lic.key+\'</div>\';\n' +
'    html+=\'<div class="list-user">\'+lic.user+\' <span class="badge \'+badgeCls+\'">\'+badgeTxt+\'</span></div>\';\n' +
'    html+=\'<div class="list-meta">\'+planStr+\' · 만료 \'+expStr;\n' +
'    if(lic.computers)html+=\' · PC: \'+lic.computers;\n' +
'    html+=\'</div></div>\';\n' +
'  });\n' +
'  el.innerHTML=html;\n' +
'}\n' +
'\n' +
'function copyLicenseKey(el,key){\n' +
'  navigator.clipboard.writeText(key).then(function(){\n' +
'    el.classList.add("list-key-copied");\n' +
'    var orig=el.textContent;\n' +
'    el.textContent="✓ 복사됨";\n' +
'    setTimeout(function(){el.classList.remove("list-key-copied");el.textContent=orig;},1500);\n' +
'  }).catch(function(){\n' +
'    var ta=document.createElement("textarea");\n' +
'    ta.value=key;document.body.appendChild(ta);ta.select();\n' +
'    document.execCommand("copy");document.body.removeChild(ta);\n' +
'    el.classList.add("list-key-copied");\n' +
'    var orig=el.textContent;\n' +
'    el.textContent="✓ 복사됨";\n' +
'    setTimeout(function(){el.classList.remove("list-key-copied");el.textContent=orig;},1500);\n' +
'  });\n' +
'}\n' +
'\n' +
'// 페이지 로드 시 자동 목록 조회\n' +
'loadList();\n' +
'</script>\n' +
'</body></html>';
}

// ============================================
// 라이선스 신규 등록
// [A:Key, B:HWIDs, C:User, D:ActiveDate, E:Computers, F:Max, G:IssuedDate, H:Plan, I:ExpiryDate]
// ============================================
function registerLicense(licenseKey, userName, issuedDate, plan, expiryDate) {
  try {
    var sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
    var planVal = plan || "";
    var expiryVal = expiryDate || "";
    sheet.appendRow([licenseKey, "", userName, "", "", 1, issuedDate, planVal, expiryVal]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "registered",
      message: "License " + licenseKey + " registered successfully"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error", message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// 라이선스 해제
// ============================================
function deactivateLicense(licenseKey, hwid) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === licenseKey) {
      var rawHwidVal  = String(data[i][1] || "");
      var rawCompVal  = String(data[i][4] || "");
      var rawHwids    = rawHwidVal ? rawHwidVal.split(",") : [];
      var rawComputers = rawCompVal ? rawCompVal.split(",") : [];
      var storedHwids = rawHwids.map(function(item) { return item.trim(); });
      var storedComputers = rawComputers.map(function(item) { return item.trim(); });
      var targetHWID  = hwid.trim();
      var targetIndex = storedHwids.indexOf(targetHWID);

      if (targetIndex !== -1) {
        var removedHWID = storedHwids[targetIndex];
        var removedComp = (targetIndex < storedComputers.length) ? storedComputers[targetIndex] : "N/A";

        storedHwids.splice(targetIndex, 1);
        if (targetIndex < storedComputers.length) {
          storedComputers.splice(targetIndex, 1);
        }

        var newHwidString    = storedHwids.join(",");
        var newComputerString = storedComputers.join(", ");

        sheet.getRange(i + 1, 2).setValue(newHwidString);
        sheet.getRange(i + 1, 5).setValue(newComputerString);
        if (newHwidString === "") {
          sheet.getRange(i + 1, 4).setValue("");
        }

        return ContentService.createTextOutput(JSON.stringify({
          status: "deactivated",
          debug_info: {
            found_index:    targetIndex,
            removed_id:     removedHWID,
            removed_name:   removedComp,
            remaining_ids:  storedHwids.length,
            remaining_names: storedComputers.length,
            before_name_list: rawCompVal,
            after_name_list: newComputerString
          },
          message: "삭제완료: " + removedComp
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "ID 매칭 실패",
          debug: { target: targetHWID, list: storedHwids.join("|") }
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "not_found"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 체험판 관리 (Trials 시트)
// ============================================
function getTrialSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Trials");
  if (!sheet) {
    sheet = ss.insertSheet("Trials");
    sheet.appendRow(["HWID", "StartDate", "LastCheck"]);
  }
  return sheet;
}

function checkTrial(hwid) {
  if (!hwid) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error", message: "HWID 없음"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getTrialSheet();
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === hwid.trim()) {
      var startDate    = new Date(data[i][1]);
      var elapsed      = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      var daysRemaining = TRIAL_DAYS - elapsed;

      sheet.getRange(i + 1, 3).setValue(
        Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss")
      );

      if (daysRemaining > 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "trial_active",
          days_remaining: daysRemaining,
          start_date: Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd")
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "trial_expired", days_remaining: 0
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "trial_not_found"
  })).setMimeType(ContentService.MimeType.JSON);
}

function registerTrial(hwid) {
  if (!hwid) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error", message: "HWID 없음"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getTrialSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === hwid.trim()) {
      return checkTrial(hwid);
    }
  }

  var now    = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([hwid.trim(), nowStr, nowStr]);

  return ContentService.createTextOutput(JSON.stringify({
    status: "trial_active",
    days_remaining: TRIAL_DAYS,
    start_date: Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd")
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 라이선스 유효성 확인
// ============================================
function checkLicense(licenseKey, hwid) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === licenseKey) {
      var rawHwids    = data[i][1] ? String(data[i][1]).split(",") : [];
      var storedHwids = rawHwids.map(function(item) { return item.trim(); });
      var userName    = data[i][2];
      var plan        = String(data[i][7] || "");
      var expiryDate  = String(data[i][8] || "");

      if (storedHwids.indexOf(hwid.trim()) !== -1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "valid", user: userName, plan: plan, expiry_date: expiryDate
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        if (storedHwids.length === 0) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "not_activated", user: userName, plan: plan, expiry_date: expiryDate
          })).setMimeType(ContentService.MimeType.JSON);
        }
        var maxDevices = data[i][5] ? parseInt(data[i][5]) : 1;
        if (storedHwids.length < maxDevices) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "not_activated", user: userName, plan: plan, expiry_date: expiryDate
          })).setMimeType(ContentService.MimeType.JSON);
        } else {
          return ContentService.createTextOutput(JSON.stringify({
            status: "used", user: userName, computer: "Limit Reached"
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "not_found"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 라이선스 활성화
// ============================================
function activateLicense(licenseKey, hwid, userName, computerName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === licenseKey) {
      var rawHwids    = data[i][1] ? String(data[i][1]).split(",") : [];
      var storedHwids = rawHwids.map(function(item) { return item.trim(); });
      var maxDevices  = data[i][5] ? parseInt(data[i][5]) : 1;
      var plan        = String(data[i][7] || "");
      var expiryDate  = String(data[i][8] || "");

      if (storedHwids.indexOf(hwid.trim()) !== -1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "already_activated", plan: plan, expiry_date: expiryDate
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (storedHwids.length < maxDevices) {
        storedHwids.push(hwid.trim());
        var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

        sheet.getRange(i + 1, 2).setValue(storedHwids.join(","));
        if (userName && userName !== "undefined") {
          sheet.getRange(i + 1, 3).setValue(userName);
        }
        sheet.getRange(i + 1, 4).setValue(now);

        var rawComputers = data[i][4] ? String(data[i][4]).split(",") : [];
        var storedComps  = rawComputers
          .map(function(item) { return item.trim(); })
          .filter(function(item) { return item !== ""; });
        storedComps.push(computerName.trim());
        sheet.getRange(i + 1, 5).setValue(storedComps.join(", "));

        return ContentService.createTextOutput(JSON.stringify({
          status: "activated", plan: plan, expiry_date: expiryDate
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error", message: "License limit reached"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "not_found"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 구독 상태 확인 (7일 주기 서버 재확인용)
// ============================================
function checkSubscription(licenseKey, hwid) {
  if (!licenseKey || !hwid) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error", message: "파라미터 없음"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === licenseKey) {
      var rawHwids    = data[i][1] ? String(data[i][1]).split(",") : [];
      var storedHwids = rawHwids.map(function(item) { return item.trim(); });

      if (storedHwids.indexOf(hwid.trim()) === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "not_found"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var plan         = String(data[i][7] || "");
      var expiryDateStr = String(data[i][8] || "");

      if (!expiryDateStr) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "valid", plan: plan, expiry_date: "", days_remaining: 99999
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var now          = new Date();
      var expiryDate   = new Date(expiryDateStr);
      var diffMs       = expiryDate - now;
      var daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysRemaining > 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "valid", plan: plan, expiry_date: expiryDateStr, days_remaining: daysRemaining
        })).setMimeType(ContentService.MimeType.JSON);
      } else if (daysRemaining > -GRACE_DAYS) {
        var graceDaysLeft = GRACE_DAYS + daysRemaining;
        return ContentService.createTextOutput(JSON.stringify({
          status: "grace", plan: plan, expiry_date: expiryDateStr, days_remaining: graceDaysLeft
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "expired", plan: plan, expiry_date: expiryDateStr, days_remaining: 0
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "not_found"
  })).setMimeType(ContentService.MimeType.JSON);
}