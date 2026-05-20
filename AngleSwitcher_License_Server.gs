// ============================================================
//  SJE License Server — 구독형 v2.1
//
//  [시트 구조]
//  PR Licenses: A:Key | B:HWIDs | C:User | D:ActiveDate | E:Computers | F:Max | G:IssuedDate | H:Plan | I:ExpiryDate
//  Trials:      A:Email | B:HWID | C:StartDate | D:LastCheck | E:VerifyCode | F:CodeExpiry | G:Verified
// ============================================================

var TRIAL_DAYS  = 7;
var GRACE_DAYS  = 7;   // 만료 후 유예기간
var SPREADSHEET_ID = ""; // ← 구글 시트 ID (필수 입력)
var ADMIN_PW   = "0590"; // ← 관리자 비밀번호 (필수 변경)

// ============================================================
//  메인 엔트리포인트
// ============================================================
function doPost(e) { return doGet(e); }

function doGet(e) {
  try {
    var p      = e.parameter || {};
    var action = p.action || "";
    var hwid   = p.hwid   || "";
    var key    = p.key    || "";

    // 관리자 대시보드 (action 없이 admin_pw 있을 때)
    if (!action) {
      if (p.admin_pw) {
        if (p.admin_pw !== ADMIN_PW) {
          return HtmlService.createHtmlOutput('<p style="color:red;font-family:sans-serif;padding:20px">Unauthorized</p>');
        }
        return HtmlService.createHtmlOutput(getAdminDashboardHtml())
          .setTitle('SJE PR Admin')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
      return respond({ status: "error", message: "action required" });
    }

    if (action === "activate")              return respond(activateLicense(hwid, key));
    if (action === "check_subscription")   return respond(checkSubscription(hwid, key));
    if (action === "deactivate")           return respond(deactivateLicense(hwid, key));
    if (action === "trial_check")          return respond(checkTrial(p.email, hwid));
    if (action === "trial_request_code")   return respond(requestTrialCode(p.email, hwid));
    if (action === "trial_verify_code")    return respond(verifyTrialCode(p.email, hwid, p.code));
    if (action === "inquiry")              return respond(sendInquiry(p.name, p.email, p.plan, p.message));

    // 관리자 전용 액션 — admin_pw 검증
    if (action === "register" || action === "renew" || action === "change_plan" || action === "list") {
      if (!p.admin_pw || p.admin_pw !== ADMIN_PW) {
        return respond({ status: "error", message: "unauthorized" });
      }
      if (action === "register")    return respond(registerLicenseKey(p.key, p.user, p.max, p.plan, p.expiry_date));
      if (action === "renew")       return respond(renewSubscription(p.key, p.plan));
      if (action === "change_plan") return respond(changePlan(p.key, p.plan));
      if (action === "list")        return respond(listLicenses());
    }

    return respond({ status: "error", message: "unknown action" });

  } catch (err) {
    return respond({ status: "error", message: err.toString() });
  }
}

// ============================================================
//  구독 갱신 (관리자용) — plan 파라미터로 플랜 변경 동시 가능
//  plan 생략 시 기존 시트 플랜 유지
// ============================================================
function renewSubscription(key, plan) {
  if (!key) return { status: "error", message: "key required" };

  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var rowKey     = (row[0] || "").toString().trim();
    var sheetPlan  = (row[7] || "monthly").toString().trim();
    var expiryDate = (row[8] || "").toString().trim();

    if (rowKey !== key) continue;

    // plan 파라미터가 유효하면 변경, 없으면 기존 유지
    var usePlan = (plan === "monthly" || plan === "yearly") ? plan : sheetPlan;
    var planChanged = (usePlan !== sheetPlan);

    var now  = new Date();
    var base;
    if (planChanged) {
      // 플랜이 바뀌는 경우: 오늘부터 새로 계산
      base = now;
    } else {
      // 같은 플랜 갱신: 만료 전이면 기존 만료일 기준, 만료 후면 오늘 기준
      base = expiryDate ? new Date(expiryDate) : now;
      if (base < now) base = now;
    }

    var newExpiry;
    if (usePlan === "yearly") {
      newExpiry = new Date(base);
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    } else {
      newExpiry = new Date(base);
      newExpiry.setMonth(newExpiry.getMonth() + 1);
    }

    var newExpiryISO = newExpiry.toISOString();
    sheet.getRange(i + 1, 8).setValue(usePlan);      // H열: Plan
    sheet.getRange(i + 1, 9).setValue(newExpiryISO); // I열: ExpiryDate

    return {
      status: "renewed",
      plan: usePlan,
      expiry_date: newExpiryISO
    };
  }

  return { status: "invalid_key" };
}

// ============================================================
//  라이선스 키 신규 등록 (관리자용)
// ============================================================
function registerLicenseKey(key, user, max, plan, expiry_date) {
  if (!key) return { status: "error", message: "key required" };
  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === key) {
      return { status: "duplicate", message: "이미 존재하는 키입니다." };
    }
  }

  var now = new Date().toISOString();
  sheet.appendRow([
    key,
    "",
    user || "",
    "",
    0,
    parseInt(max) || 1,
    now,
    plan || "monthly",
    expiry_date || ""
  ]);
  return { status: "registered" };
}

// ============================================================
//  플랜 변경 (관리자용)
// ============================================================
function changePlan(key, plan) {
  if (!key)  return { status: "error", message: "key required" };
  if (plan !== "monthly" && plan !== "yearly") {
    return { status: "error", message: "plan must be monthly or yearly" };
  }

  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var rowKey     = (row[0] || "").toString().trim();
    if (rowKey !== key) continue;

    var expiryDate = (row[8] || "").toString().trim();

    // 만료일 재계산: 현재 만료일이 미래면 그 기준, 과거면 오늘 기준
    var now  = new Date();
    var base = expiryDate ? new Date(expiryDate) : now;
    if (base < now) base = now;

    var newExpiry;
    if (plan === "yearly") {
      newExpiry = new Date(base);
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    } else {
      newExpiry = new Date(base);
      newExpiry.setMonth(newExpiry.getMonth() + 1);
    }

    var newExpiryISO = newExpiry.toISOString();
    sheet.getRange(i + 1, 8).setValue(plan);          // H열: Plan
    sheet.getRange(i + 1, 9).setValue(newExpiryISO);  // I열: ExpiryDate

    return { status: "plan_changed", plan: plan, new_expiry_date: newExpiryISO };
  }

  return { status: "invalid_key" };
}

// ============================================================
//  라이선스 목록 조회 (관리자용)
// ============================================================
function listLicenses() {
  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  var list  = [];

  for (var i = 1; i < data.length; i++) {
    var row       = data[i];
    var key       = (row[0] || "").toString().trim();
    if (!key) continue;
    var user      = (row[2] || "").toString();
    var plan      = (row[7] || "").toString();
    var expiryStr = (row[8] || "").toString();
    var daysRemaining = null;
    var subStatus = "permanent";
    if (expiryStr) {
      var expiry = new Date(expiryStr);
      var diff   = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      daysRemaining = diff;
      if      (diff > 0)           subStatus = "valid";
      else if (diff > -GRACE_DAYS) subStatus = "grace";
      else                         subStatus = "expired";
    }
    list.push({ key: key, user: user, plan: plan, expiry_date: expiryStr, days_remaining: daysRemaining, sub_status: subStatus });
  }

  return { status: "ok", licenses: list };
}

// ============================================================
//  라이선스 해제 (PC 이전용)
// ============================================================
function deactivateLicense(hwid, key) {
  if (!hwid || !key) return { status: "error", message: "hwid/key required" };

  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var rowKey   = (row[0] || "").toString().trim();
    var rowHwids = (row[1] || "").toString().trim();
    if (rowKey !== key) continue;

    var hwidList = rowHwids ? rowHwids.split(",").map(function(h) { return h.trim(); }) : [];
    var idx      = hwidList.indexOf(hwid.trim());
    if (idx === -1) return { status: "error", message: "hwid not found" };

    hwidList.splice(idx, 1);
    sheet.getRange(i + 1, 2).setValue(hwidList.join(","));
    sheet.getRange(i + 1, 5).setValue(hwidList.length);
    if (hwidList.length === 0) sheet.getRange(i + 1, 4).setValue("");

    return { status: "deactivated" };
  }

  return { status: "invalid_key" };
}

// ============================================================
//  라이선스 활성화
// ============================================================
function activateLicense(hwid, key) {
  if (!hwid || !key) return { status: "error", message: "hwid/key required" };
  if (!isValidHwid(hwid)) return { status: "error", message: "invalid hwid" };

  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var rowKey     = (row[0] || "").toString().trim();
    var rowHwids   = (row[1] || "").toString().trim();
    var maxCount   = parseInt(row[5]) || 1;
    var plan       = (row[7] || "monthly").toString().trim();
    var expiryDate = (row[8] || "").toString().trim();

    if (rowKey !== key) continue;

    var hwidList = rowHwids ? rowHwids.split(",") : [];
    for (var h = 0; h < hwidList.length; h++) {
      if (hwidList[h].trim() === hwid) {
        return {
          status: "already_active",
          plan: plan,
          expiry_date: expiryDate
        };
      }
    }

    if (hwidList.length >= maxCount) {
      return { status: "max_reached", max: maxCount };
    }

    hwidList.push(hwid);
    sheet.getRange(i + 1, 2).setValue(hwidList.join(","));
    sheet.getRange(i + 1, 4).setValue(new Date().toISOString());
    sheet.getRange(i + 1, 5).setValue(hwidList.length);

    return {
      status: "activated",
      plan: plan,
      expiry_date: expiryDate
    };
  }

  return { status: "invalid_key" };
}

// ============================================================
//  구독 상태 확인 (7일 주기 재확인용)
// ============================================================
function checkSubscription(hwid, key) {
  if (!hwid || !key) return { status: "error", message: "hwid/key required" };
  if (!isValidHwid(hwid)) return { status: "error", message: "invalid hwid" };

  var sheet = getLicenseSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var rowKey     = (row[0] || "").toString().trim();
    var rowHwids   = (row[1] || "").toString().trim();
    var plan       = (row[7] || "monthly").toString().trim();
    var expiryDate = (row[8] || "").toString().trim();

    if (rowKey !== key) continue;

    var hwidList = rowHwids ? rowHwids.split(",").map(function(h){ return h.trim(); }) : [];
    if (hwidList.indexOf(hwid) === -1) {
      return { status: "hwid_mismatch" };
    }

    if (!expiryDate) {
      return { status: "active", plan: plan, expiry_date: "", days_remaining: 9999 };
    }

    var now     = new Date();
    var expiry  = new Date(expiryDate);
    var diffMs  = expiry - now;
    var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return {
        status: "active",
        plan: plan,
        expiry_date: expiryDate,
        days_remaining: diffDays
      };
    } else {
      var graceDaysLeft = GRACE_DAYS + diffDays; // diffDays 음수
      if (graceDaysLeft > 0) {
        return {
          status: "grace_period",
          plan: plan,
          expiry_date: expiryDate,
          days_remaining: diffDays,      // 음수
          grace_days_left: graceDaysLeft
        };
      } else {
        return {
          status: "expired",
          plan: plan,
          expiry_date: expiryDate,
          days_remaining: diffDays
        };
      }
    }
  }

  return { status: "invalid_key" };
}

// ============================================================
//  체험판 상태 확인 (이메일 기반)
// ============================================================
function checkTrial(email, hwid) {
  if (!email) return { status: "error", message: "email required" };
  email = email.toLowerCase().trim();

  var sheet = getTrialSheet();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowEmail    = (data[i][0] || "").toString().toLowerCase().trim();
    var rowVerified = data[i][6];
    if (rowEmail !== email) continue;

    if (!rowVerified) return { status: "trial_pending" };

    var rowHwid = (data[i][1] || "").toString().trim();
    if (hwid && rowHwid && rowHwid !== hwid) {
      return { status: "trial_email_used" };
    }

    var startDate = new Date(data[i][2]);
    var now       = new Date();
    var elapsed   = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    var remaining = TRIAL_DAYS - elapsed;

    sheet.getRange(i + 1, 4).setValue(now.toISOString());

    if (remaining > 0) {
      return { status: "trial_active", remaining: remaining, elapsed: elapsed };
    } else {
      return { status: "trial_expired", remaining: 0 };
    }
  }

  return { status: "trial_not_found" };
}

// ============================================================
//  체험판 코드 요청 (이메일 발송)
// ============================================================
function requestTrialCode(email, hwid) {
  if (!email) return { status: "error", message: "email required" };
  if (!hwid)  return { status: "error", message: "hwid required" };
  if (!isValidHwid(hwid)) return { status: "error", message: "invalid hwid" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "invalid email" };

  email = email.toLowerCase().trim();

  var sheet = getTrialSheet();
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();

  // 이미 인증 완료된 이메일 차단
  for (var i = 1; i < data.length; i++) {
    var rowEmail    = (data[i][0] || "").toString().toLowerCase().trim();
    var rowVerified = data[i][6];
    if (rowEmail !== email) continue;
    if (rowVerified) {
      var rowHwid = (data[i][1] || "").toString().trim();
      if (rowHwid === hwid) return { status: "trial_already_active" };
      return { status: "trial_email_used" };
    }
    // 미인증 행: 마지막 발송 후 60초 제한
    var lastExpiry = data[i][5] ? new Date(data[i][5]) : null;
    if (lastExpiry && (lastExpiry - now) > 9 * 60 * 1000) {
      return { status: "code_already_sent" };
    }
    break;
  }

  // 6자리 코드 생성
  var code    = Math.floor(100000 + Math.random() * 900000).toString();
  var expiry  = new Date(now.getTime() + 10 * 60 * 1000); // 10분

  // 시트 업데이트 또는 신규 추가
  var found = false;
  for (var j = 1; j < data.length; j++) {
    var rEmail = (data[j][0] || "").toString().toLowerCase().trim();
    if (rEmail !== email) continue;
    sheet.getRange(j + 1, 2).setValue(hwid);
    sheet.getRange(j + 1, 5).setValue(code);
    sheet.getRange(j + 1, 6).setValue(expiry.toISOString());
    sheet.getRange(j + 1, 7).setValue(false);
    found = true;
    break;
  }
  if (!found) {
    sheet.appendRow([email, hwid, "", now.toISOString(), code, expiry.toISOString(), false]);
  }

  // 이메일 발송
  try {
    MailApp.sendEmail({
      to: email,
      subject: "[SJE PR Edit Pro] 체험판 인증 코드",
      body: "안녕하세요!\n\nSJE PR Edit Pro 체험판 인증 코드입니다.\n\n인증 코드: " + code + "\n\n이 코드는 10분간 유효합니다.\n본인이 요청하지 않은 경우 이 이메일을 무시하세요."
    });
  } catch (e) {
    return { status: "error", message: "email send failed: " + e.toString() };
  }

  return { status: "code_sent" };
}

// ============================================================
//  체험판 코드 인증
// ============================================================
function verifyTrialCode(email, hwid, code) {
  if (!email || !hwid || !code) return { status: "error", message: "email/hwid/code required" };
  if (!isValidHwid(hwid)) return { status: "error", message: "invalid hwid" };

  email = email.toLowerCase().trim();

  var sheet = getTrialSheet();
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();

  for (var i = 1; i < data.length; i++) {
    var rowEmail    = (data[i][0] || "").toString().toLowerCase().trim();
    if (rowEmail !== email) continue;

    if (data[i][6]) return { status: "trial_already_active" };

    var rowCode   = (data[i][4] || "").toString().trim();
    var rowExpiry = data[i][5] ? new Date(data[i][5]) : null;

    if (!rowExpiry || now > rowExpiry) return { status: "code_expired" };
    if (rowCode !== code.toString().trim()) return { status: "invalid_code" };

    // 인증 완료
    sheet.getRange(i + 1, 2).setValue(hwid);
    sheet.getRange(i + 1, 3).setValue(now.toISOString()); // StartDate
    sheet.getRange(i + 1, 4).setValue(now.toISOString()); // LastCheck
    sheet.getRange(i + 1, 5).setValue("");                // 코드 삭제
    sheet.getRange(i + 1, 6).setValue("");                // 만료 삭제
    sheet.getRange(i + 1, 7).setValue(true);              // Verified

    return { status: "verified", remaining: TRIAL_DAYS };
  }

  return { status: "trial_not_found" };
}

// ============================================================
//  헬퍼
// ============================================================
function isValidHwid(hwid) {
  // UUID 형식 (예: 550E8400-E29B-41D4-A716-446655440000) 또는 32자 hex 허용
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(hwid)
      || /^[0-9A-F]{32}$/i.test(hwid);
}
function getLicenseSheet() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName("PR Licenses");
  if (!sheet) {
    sheet = ss.insertSheet("PR Licenses");
    sheet.appendRow(["Key", "HWIDs", "User", "ActiveDate", "Computers", "Max", "IssuedDate", "Plan", "ExpiryDate"]);
  }
  return sheet;
}

function getTrialSheet() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName("Trials");
  if (!sheet) {
    sheet = ss.insertSheet("Trials");
    sheet.appendRow(["Email", "HWID", "StartDate", "LastCheck", "VerifyCode", "CodeExpiry", "Verified"]);
  }
  return sheet;
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  모바일 관리자 대시보드 HTML
// ============================================================
function getAdminDashboardHtml() {
  var gasUrl = ScriptApp.getService().getUrl();

  var initScript = '<script>'
    + 'var GAS_URL="' + gasUrl + '";'
    + 'var ADMIN_PW="' + ADMIN_PW + '";'
    + '<\/script>';

  var md5Impl = '<script>'
    + 'function md5(s){'
    + 'var hc="0123456789abcdef";'
    + 'function rh(n){var j,s="";for(j=0;j<=3;j++)s+=hc.charAt((n>>(j*8+4))&0xF)+hc.charAt((n>>(j*8))&0xF);return s;}'
    + 'function ad(x,y){var l=(x&0xFFFF)+(y&0xFFFF);var m=(x>>16)+(y>>16)+(l>>16);return(m<<16)|(l&0xFFFF);}'
    + 'function rl(n,c){return(n<<c)|(n>>>(32-c));}'
    + 'function cm(q,a,b,x,s,t){return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}'
    + 'function ff(a,b,c,d,x,s,t){return cm((b&c)|((~b)&d),a,b,x,s,t);}'
    + 'function gg(a,b,c,d,x,s,t){return cm((b&d)|(c&(~d)),a,b,x,s,t);}'
    + 'function hh(a,b,c,d,x,s,t){return cm(b^c^d,a,b,x,s,t);}'
    + 'function ii(a,b,c,d,x,s,t){return cm(c^(b|(~d)),a,b,x,s,t);}'
    + 'function sb(x){var i,nb=((x.length+8)>>6)+1,bl=new Array(nb*16);for(i=0;i<nb*16;i++)bl[i]=0;for(i=0;i<x.length;i++)bl[i>>2]|=x.charCodeAt(i)<<((i%4)*8);bl[i>>2]|=0x80<<((i%4)*8);bl[nb*16-2]=x.length*8;return bl;}'
    + 'var x=sb(s),a=1732584193,b=-271733879,c=-1732584194,d=271733878,i;'
    + 'for(i=0;i<x.length;i+=16){'
    + 'var oa=a,ob=b,oc=c,od=d;'
    + 'a=ff(a,b,c,d,x[i],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);'
    + 'a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);'
    + 'a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);'
    + 'a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);'
    + 'a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i],20,-373897302);'
    + 'a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);'
    + 'a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);'
    + 'a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);'
    + 'a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);'
    + 'a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);'
    + 'a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);'
    + 'a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);'
    + 'a=ii(a,b,c,d,x[i],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);'
    + 'a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);'
    + 'a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);'
    + 'a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);'
    + 'a=ad(a,oa);b=ad(b,ob);c=ad(c,oc);d=ad(d,od);}'
    + 'return rh(a)+rh(b)+rh(c)+rh(d);}'
    + '<\/script>';

  var appScript = '<script>'
    + 'function generateKey(prefix,userName){'
    + 'var now=new Date(),y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,"0"),d=String(now.getDate()).padStart(2,"0");'
    + 'var raw=userName+y+m+d;'
    + 'var hex=md5(raw);'
    + 'var h=Number(BigInt("0x"+hex)%BigInt(1679616));'
    + 'var chars="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",hs="",n=h;'
    + 'for(var i=0;i<4;i++){hs=chars[n%36]+hs;n=Math.floor(n/36);}'
    + 'return prefix.toUpperCase()+y+m+hs;}'

    + 'function calcExpiry(startStr,plan){'
    + 'var s=new Date(startStr),e=new Date(s);'
    + 'if(plan==="yearly")e.setFullYear(e.getFullYear()+1);'
    + 'else e.setMonth(e.getMonth()+1);'
    + 'return e.toISOString().slice(0,10);}'

    + 'function updatePreview(){'
    + 'var sd=document.getElementById("startDate").value;'
    + 'var pl=document.getElementById("planSel").value;'
    + 'var el=document.getElementById("expiryPreview");'
    + 'el.textContent=sd?"만료 예정일: "+calcExpiry(sd,pl):"만료 예정일: —";}'

    + 'async function apiCall(params){'
    + 'params.admin_pw=ADMIN_PW;'
    + 'var qs=Object.keys(params).map(function(k){return encodeURIComponent(k)+"="+encodeURIComponent(params[k]);}).join("&");'
    + 'var resp=await fetch(GAS_URL+"?"+qs,{redirect:"follow"});'
    + 'return await resp.json();}'

    + 'async function doRegister(){'
    + 'var user=document.getElementById("userName").value.trim();'
    + 'if(!user){showResult("regResult","사용자 이름을 입력하세요.","warn");return;}'
    + 'var sd=document.getElementById("startDate").value;'
    + 'if(!sd){showResult("regResult","시작일을 입력하세요.","warn");return;}'
    + 'var plan=document.getElementById("planSel").value;'
    + 'var maxDev=document.getElementById("maxDevSel").value;'
    + 'var expiryIso=calcExpiry(sd,plan)+"T00:00:00.000Z";'
    + 'var key=generateKey("PR",user);'
    + 'showResult("regResult","⏳ 서버 등록 중...","");'
    + 'try{'
    + 'var res=await apiCall({action:"register",key:key,user:user,max:maxDev,plan:plan,expiry_date:expiryIso});'
    + 'var ps=plan==="yearly"?"연간":"월간",ex=calcExpiry(sd,plan);'
    + 'if(res.status==="registered"){'
    + 'document.getElementById("genKey").textContent=key;'
    + 'setGenStatus("✅ 등록 성공 ("+ps+" / 만료: "+ex+")","ok");'
    + 'showResult("regResult","✅ 등록 성공","ok");loadList();}'
    + 'else if(res.status==="duplicate"){'
    + 'document.getElementById("genKey").textContent=key;'
    + 'setGenStatus("⚠️ 중복 키 (이미 등록됨)","warn");'
    + 'showResult("regResult","⚠️ 중복 키 (이미 등록됨)","warn");}'
    + 'else showResult("regResult","❌ 실패: "+(res.message||res.status),"err");'
    + '}catch(e){showResult("regResult","❌ 네트워크 오류: "+e.message,"err");}}'

    + 'async function doRenew(){'
    + 'var key=document.getElementById("renewKey").value.trim();'
    + 'if(!key){showResult("renewResult","키를 입력하세요.","warn");return;}'
    + 'var plan=document.getElementById("renewPlanSel").value;'
    + 'showResult("renewResult","⏳ 갱신 처리 중...","");'
    + 'try{'
    + 'var res=await apiCall({action:"renew",key:key,plan:plan});'
    + 'if(res.status==="renewed"){'
    + 'var ps=res.plan==="yearly"?"연간":"월간",ex=(res.expiry_date||"").slice(0,10);'
    + 'showResult("renewResult","✅ 갱신 완료 ("+ps+" / 새 만료일: "+ex+")","ok");loadList();}'
    + 'else if(res.status==="invalid_key")showResult("renewResult","❌ 유효하지 않은 키","err");'
    + 'else showResult("renewResult","❌ 실패: "+(res.message||res.status),"err");'
    + '}catch(e){showResult("renewResult","❌ 네트워크 오류: "+e.message,"err");}}'

    + 'function showResult(id,msg,type){'
    + 'var el=document.getElementById(id);'
    + 'el.textContent=msg;el.className="result "+(type||"");el.style.display="block";}'

    + 'function setGenStatus(msg,type){'
    + 'var el=document.getElementById("genStatus");'
    + 'el.textContent=msg;el.className="gen-status "+(type||"");}'

    + 'function copyKey(){'
    + 'var key=document.getElementById("genKey").textContent;'
    + 'if(key==="—")return;'
    + 'navigator.clipboard.writeText(key).then(function(){'
    + 'var btn=document.querySelector(".copy-btn");'
    + 'btn.textContent="✅ 복사됨";'
    + 'setTimeout(function(){btn.textContent="클립보드에 복사";},2000);});}'

    + 'async function loadList(){'
    + 'document.getElementById("licList").innerHTML=\'<div style="color:#666680;font-size:0.83rem">로딩 중...</div>\';'
    + 'try{'
    + 'var res=await apiCall({action:"list"});'
    + 'if(!res.licenses||res.licenses.length===0){document.getElementById("licList").innerHTML=\'<div style="color:#666680;font-size:0.83rem">등록된 라이선스 없음</div>\';return;}'
    + 'var h="";res.licenses.forEach(function(lic){'
    + 'var ps=lic.plan==="yearly"?"연간":"월간";'
    + 'var ex=lic.expiry_date?lic.expiry_date.slice(0,10):"만료일없음";'
    + 'var dr=lic.days_remaining!=null?lic.days_remaining+"일":"";'
    + 'var c=lic.sub_status==="expired"?"#f44336":lic.sub_status==="grace"?"#c8a84b":"#4caf50";'
    + 'h+=\'<div class="list-item" data-key="\'+lic.key+\'"><div class="list-key">\'+lic.key+\'</div><div class="list-user">\'+lic.user+\'</div><div class="list-meta" style="color:\'+c+\'">\'+ps+" · 만료 "+ex+(dr?" · "+dr:"")+\'</div></div>\';});'
    + 'document.getElementById("licList").innerHTML=h;'
    + 'document.querySelectorAll("#licList .list-item").forEach(function(el){'
    + 'el.addEventListener("click",function(){'
    + 'var k=this.getAttribute("data-key");'
    + 'document.getElementById("renewKey").value=k;'
    + 'document.getElementById("renewKey").scrollIntoView({behavior:"smooth",block:"center"});'
    + 'document.getElementById("renewKey").focus();});});'
    + '}catch(e){document.getElementById("licList").innerHTML=\'<div style="color:#f44336;font-size:0.83rem">목록 로드 실패</div>\';}}'

    + 'document.addEventListener("DOMContentLoaded",function(){'
    + 'document.getElementById("startDate").value=new Date().toISOString().slice(0,10);'
    + 'updatePreview();'
    + 'document.getElementById("startDate").addEventListener("change",updatePreview);'
    + 'document.getElementById("listRefresh").addEventListener("click",loadList);'
    + 'loadList();});'
    + '<\/script>';

  var css = '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{background:#0d1117;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;overflow-x:clip;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom,16px)}'
    + '.wrap{max-width:480px;margin:0 auto}'
    + '.hdr{background:#0d1117;padding:20px;text-align:center;border-bottom:2px solid #4d9fff;position:sticky;top:0;z-index:10}'
    + '.hdr h1{color:#4d9fff;font-size:1.3rem;letter-spacing:3px}'
    + '.hdr p{color:#5a6a80;font-size:0.72rem;margin-top:4px}'
    + '.card{background:#161d27;border:1px solid #1e2d3d;border-radius:8px;margin:14px;padding:16px}'
    + '.card-title{color:#4d9fff;font-size:0.82rem;font-weight:bold;letter-spacing:1px;margin-bottom:14px;padding-left:8px;border-left:3px solid #4d9fff}'
    + 'label.lbl{display:block;color:#7a8fa8;font-size:0.73rem;margin-bottom:4px;margin-top:10px}'
    + 'input[type=text],input[type=date]{width:100%;background:#0d1117;color:#e0e0e0;border:1px solid #1e2d3d;border-radius:4px;padding:10px 12px;font-size:16px;min-height:44px;touch-action:manipulation}'
    + 'input[type=date]{color-scheme:dark}'
    + 'input:focus{outline:none;border-color:#4d9fff}'
    + '.sel{width:100%;background:#0d1117;color:#e0e0e0;border:1px solid #1e2d3d;border-radius:4px;padding:10px 36px 10px 12px;font-size:16px;margin-top:4px;min-height:44px;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M0 0l6 8 6-8z\' fill=\'%237a8fa8\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;touch-action:manipulation}'
    + '.sel:focus{outline:none;border-color:#4d9fff}'
    + '.preview{color:#4d9fff;font-size:0.83rem;margin-top:8px;min-height:18px}'
    + '.btn{width:100%;background:#4d9fff;color:#0d1117;border:none;border-radius:4px;padding:13px;font-size:0.93rem;font-weight:bold;cursor:pointer;margin-top:14px;min-height:48px}'
    + '.btn:active{background:#2a7fd4}'
    + '.result{margin-top:10px;padding:10px 12px;border-radius:4px;font-size:0.83rem;background:#0d1117;border:1px solid #1e2d3d;display:none}'
    + '.result.ok{color:#4caf50;border-color:#4caf50}'
    + '.result.err{color:#f44336;border-color:#f44336}'
    + '.result.warn{color:#4d9fff;border-color:#4d9fff}'
    + '.key-row{display:flex;align-items:center;gap:8px;margin-top:4px}'
    + '.key-display{flex:1;min-width:0;background:#0d1117;border:1px solid #1e2d3d;border-radius:4px;padding:10px 12px;font-family:monospace;font-size:0.95rem;color:#4d9fff;word-break:break-all;min-height:42px}'
    + '.copy-btn-inline{background:#1e2d3d;color:#e0e0e0;border:none;border-radius:4px;padding:10px 14px;font-size:0.8rem;cursor:pointer;white-space:nowrap;flex-shrink:0}'
    + '.copy-btn-inline:active{background:#2a3d52}'
    + '.gen-status{margin-top:4px;font-size:0.83rem;color:#5a6a80;min-height:20px}'
    + '.gen-status.ok{color:#4caf50}'
    + '.gen-status.err{color:#f44336}'
    + '.gen-status.warn{color:#4d9fff}'
    + '.list-item{padding:8px 0;border-bottom:1px solid #1e2d3d;cursor:pointer}'
    + '.list-item:hover{background:#1a2535;border-radius:4px;padding-left:6px}'
    + '.list-key{font-family:monospace;color:#4d9fff;font-size:0.85rem}'
    + '.list-user{font-size:0.9rem;margin:2px 0}'
    + '.list-meta{font-size:0.75rem;color:#7a8fa8}'
    + '<\/style>';

  var body = ''
    + '<div class="hdr"><h1>PR_SJE_Edit_Pro</h1><p>Premiere Pro License Management Dashboard</p></div>'
    + '<div class="wrap">'

    + '<div class="card">'
    + '<div class="card-title">라이선스 발급</div>'
    + '<label class="lbl">사용자 이름</label>'
    + '<input type="text" id="userName" placeholder="홍길동">'
    + '<label class="lbl">최대 기기 수</label>'
    + '<select id="maxDevSel" class="sel"><option value="1">1대</option><option value="2">2대</option><option value="3">3대</option><option value="5">5대</option></select>'
    + '<label class="lbl">구독 플랜</label>'
    + '<select id="planSel" class="sel" onchange="updatePreview()"><option value="monthly">월간 (1개월)</option><option value="yearly">연간 (1년)</option></select>'
    + '<label class="lbl">구독 시작일</label>'
    + '<input type="date" id="startDate">'
    + '<div class="preview" id="expiryPreview">만료 예정일: —</div>'
    + '<button class="btn" onclick="doRegister()">라이선스 키 생성 및 서버 등록</button>'
    + '<div class="result" id="regResult"></div>'
    + '</div>'

    + '<div class="card">'
    + '<div class="card-title">생성 결과</div>'
    + '<label class="lbl">생성된 키</label>'
    + '<div class="key-row">'
    + '<div id="genKey" class="key-display">—</div>'
    + '<button class="copy-btn-inline" onclick="copyKey()">복사</button>'
    + '</div>'
    + '<label class="lbl">서버 상태</label>'
    + '<div id="genStatus" class="gen-status">—</div>'
    + '</div>'

    + '<div class="card">'
    + '<div class="card-title">갱신 승인 / 플랜 변경</div>'
    + '<label class="lbl">라이선스 키</label>'
    + '<input type="text" id="renewKey" placeholder="PR20260401XXXX">'
    + '<label class="lbl">구독 플랜</label>'
    + '<select id="renewPlanSel" class="sel"><option value="monthly">월간 (1개월)</option><option value="yearly">연간 (1년)</option></select>'
    + '<button class="btn" onclick="doRenew()">갱신 승인 (플랜 적용)</button>'
    + '<div class="result" id="renewResult"></div>'
    + '</div>'

    + '<div class="card">'
    + '<div class="card-title">라이선스 목록 <span id="listRefresh" style="cursor:pointer;font-size:0.75rem;color:#666680;font-weight:normal;margin-left:8px">↻ 새로고침</span></div>'
    + '<div id="licList"><div style="color:#666680;font-size:0.83rem">로딩 중...</div></div>'
    + '</div>'

    + '</div>';

  return '<!DOCTYPE html><html lang="ko"><head>'
    + '<meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>SJE PR Admin</title>'
    + css
    + '</head><body>'
    + body
    + initScript
    + md5Impl
    + appScript
    + '</body></html>';
}

function testMail() {
  MailApp.sendEmail('kimsj.glory@gmail.com', '[SJE] MailApp 권한 테스트', '권한 승인 테스트 메일입니다.');
}

// ============================================================
//  구매 문의 이메일 발송
// ============================================================
function sendInquiry(name, email, plan, message) {
  if (!name || !email) return { status: "error", message: "name and email required" };

  var planLabel = plan === "yearly" ? "연간 플랜" : plan === "monthly" ? "월간 플랜" : "미선택";
  var body =
    "=== SJE PR Edit Pro 구매 문의 ===\n\n" +
    "이름: " + name + "\n" +
    "이메일: " + email + "\n" +
    "플랜: " + planLabel + "\n" +
    "문의 내용:\n" + (message || "(없음)") + "\n\n" +
    "전송 시각: " + new Date().toLocaleString("ko-KR");

  try {
    MailApp.sendEmail({
      to: "kimsj.glory@gmail.com",
      subject: "[구매문의] " + name + " — " + planLabel,
      body: body
    });
    return { status: "sent" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}
