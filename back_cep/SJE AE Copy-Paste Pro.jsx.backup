(function (thisObj) {

    // ============================================
    // 🔧 JSON 폴리필 (ExtendScript용)
    // ============================================
    if (typeof JSON === "undefined") {
        JSON = {
            parse: function (str) {
                return eval("(" + str + ")");
            },
            stringify: function (obj) {
                var t = typeof obj;
                if (t !== "object" || obj === null) {
                    if (t === "string") return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                    return String(obj);
                }
                var arr = obj instanceof Array;
                var parts = [];
                for (var k in obj) {
                    if (!obj.hasOwnProperty(k)) continue;
                    var v = this.stringify(obj[k]);
                    if (arr) {
                        parts.push(v);
                    } else {
                        parts.push('"' + k + '":' + v);
                    }
                }
                return arr ? "[" + parts.join(",") + "]" : "{" + parts.join(",") + "}";
            }
        };
    }

    // ============================================
    // 🔐 하드웨어 기반 라이선스 시스템 (Google Sheets 서버)
    // ============================================
    var LICENSE_SERVER_URL = "https://script.google.com/macros/s/AKfycbxbWTVGiIEdmylDkq4BXJdsq8EGIEYjqY8ZmQyNmfxLdCVwkhYUNa8Bb5U3EYgse7aH/exec";

    var authFolder = new Folder(Folder.myDocuments.fsName + "/CopyPastePro");
    if (!authFolder.exists) {
        authFolder.create();
    }
    var authFile = new File(authFolder.fsName + "/license.key");

    function getHardwareID() {
        var isWindows = $.os.indexOf("Windows") !== -1;
        var HWID = "";

        if (isWindows) {
            try {
                var tempFile = new File(Folder.myDocuments.fsName + "\\ae_hw_uuid.txt");
                var vbsFile = new File(Folder.myDocuments.fsName + "\\get_hw_uuid.vbs");

                var vbsCode = 'Set objWMIService = GetObject("winmgmts:\\\\.\\root\\cimv2")\n' +
                    'Set colItems = objWMIService.ExecQuery("Select UUID from Win32_ComputerSystemProduct")\n' +
                    'For Each objItem in colItems\n' +
                    '    strUUID = objItem.UUID\n' +
                    'Next\n' +
                    'Set fso = CreateObject("Scripting.FileSystemObject")\n' +
                    'Set f = fso.CreateTextFile("' + tempFile.fsName.replace(/\\/g, "\\\\") + '", True)\n' +
                    'f.WriteLine strUUID\n' +
                    'f.Close';

                vbsFile.open("w");
                vbsFile.write(vbsCode);
                vbsFile.close();

                var cmd = 'wscript.exe "' + vbsFile.fsName + '"';
                system.callSystem(cmd);
                $.sleep(800);

                if (tempFile.exists) {
                    tempFile.open("r");
                    var result = tempFile.read();
                    tempFile.close();
                    tempFile.remove();
                    vbsFile.remove();

                    if (result && result.length > 10) {
                        HWID = result.replace(/^\s+|\s+$/g, "").toUpperCase();
                    }
                } else {
                    if (vbsFile.exists) vbsFile.remove();
                }
            } catch (e) {
            }
        } else {
            try {
                var result = system.callSystem("system_profiler SPHardwareDataType | grep 'Hardware UUID'");
                if (result && result.length > 0) {
                    var match = result.match(/([0-9A-F-]{36})/i);
                    if (match && match[1]) {
                        HWID = match[1].toUpperCase();
                    }
                }
            } catch (e) { }
        }

        if (!HWID || HWID === "") {
            var computerName = $.getenv("COMPUTERNAME") || "UNKNOWN";
            var userName = $.getenv("USERNAME") || "UNKNOWN";
            HWID = "FALLBACK_" + computerName + "_" + userName;
        }

        return HWID;
    }

    function simpleHash(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var charCode = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + charCode;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    function httpGet(url) {
        var cleanUrl = url.replace(/\s+/g, '');
        var result = null;
        var tempID = new Date().getTime();

        try {
            if ($.os.indexOf("Windows") !== -1) {
                var tempRes = new File(Folder.desktop.fsName + "/hm_" + tempID + ".txt");
                var psFile = new File(Folder.desktop.fsName + "/hm_" + tempID + ".ps1");

                psFile.encoding = "UTF-8";
                psFile.open("w");
                psFile.writeln('[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true};');
                psFile.writeln('$client = New-Object System.Net.WebClient;');
                psFile.writeln('$client.Encoding = [System.Text.Encoding]::UTF8;');
                psFile.writeln('$url = "' + cleanUrl + '";');
                psFile.writeln('try {');
                psFile.writeln('    $content = $client.DownloadString($url);');
                psFile.writeln('    [System.IO.File]::WriteAllText("' + tempRes.fsName + '", $content, [System.Text.Encoding]::UTF8);');
                psFile.writeln('} catch {');
                psFile.writeln('    echo "ERROR: $_" | Out-File "' + tempRes.fsName + '" -Encoding UTF8;');
                psFile.writeln('}');
                psFile.close();

                var psPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
                var sysRes = system.callSystem('cmd /c ""' + psPath + '" -ExecutionPolicy Bypass -File "' + psFile.fsName + '" 2>&1"');

                $.sleep(1000);

                for (var k = 1; k <= 10; k++) {
                    if (tempRes.exists && tempRes.length > 0) {
                        break;
                    }
                    $.sleep(500);
                }

                if (tempRes.exists) {
                    tempRes.open("r");
                    tempRes.encoding = "UTF-8";
                    result = tempRes.read();
                    tempRes.close();
                    if (result && result.indexOf("ERROR") === -1) {
                        tempRes.remove();
                        if (psFile.exists) psFile.remove();
                    }
                }
            } else {
                var cmd = 'curl -L -k -s "' + cleanUrl + '"';
                var sysRes = system.callSystem(cmd);
                if (sysRes) result = sysRes;
            }

            if (result && result.length > 0) {
                result = result.replace(/^\uFEFF/, '').replace(/^\s+|\s+$/g, "");
                if (result.indexOf("{") !== -1 || result.indexOf("status") !== -1) {
                    return result;
                }
            }
            return null;

        } catch (e) {
            return null;
        }
    }

    function urlEncode(str) {
        return encodeURIComponent(str);
    }

    function encodePassword(pw) {
        var result = "";
        for (var i = 0; i < pw.length; i++) {
            result += pw.charCodeAt(i).toString(16);
        }
        return result;
    }

    function saveLicense(password, hwid, userName, expiryDate, plan) {
        try {
            if (!authFolder.exists) {
                if (!authFolder.create()) {
                    alert("[Fatal Error] 라이선스 폴더 생성 실패:\n" + authFolder.fsName);
                    return;
                }
            }

            var licenseData = {
                p: encodePassword(password),
                h: simpleHash(hwid),
                u: userName,
                t: new Date().getTime(),
                expiry_date: expiryDate || "",
                plan: plan || "",
                last_verified: Math.floor(new Date().getTime() / 1000),
                notified_7d: false,
                notified_30d: false
            };

            authFile.encoding = "UTF-8";
            if (authFile.open("w")) {
                authFile.write(JSON.stringify(licenseData));
                authFile.close();
            } else {
                alert("[Fatal Error] 쓰기 권한 없음 (Open Failed):\n" + authFile.fsName);
            }
        } catch (e) {
            alert("[Fatal Error] 라이선스 저장 중 예외 발생:\n" + e.toString());
        }
    }

    function deleteLocalLicense() {
        try {
            if (authFile.exists) authFile.remove();
        } catch (e) { }
    }

    function decodePassword(encoded) {
        var result = "";
        for (var i = 0; i + 1 < encoded.length; i += 2) {
            result += String.fromCharCode(parseInt(encoded.substr(i, 2), 16));
        }
        return result;
    }

    function parseISODate(str) {
        // ExtendScript는 ISO 8601 파싱 불가 → 수동 파싱
        try {
            var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (!m) return new Date(0);
            return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        } catch (e) {
            return new Date(0);
        }
    }

    function getLicenseExpiryDisplay() {
        try {
            if (!authFile.exists) return null;
            authFile.encoding = "UTF-8";
            authFile.open("r");
            var content = authFile.read();
            authFile.close();
            var data = JSON.parse(content);
            if (!data.expiry_date) return null;
            var planStr = data.plan === "yearly" ? "연간" : (data.plan === "monthly" ? "월간" : "");
            var dateStr = data.expiry_date.substr(0, 10);
            var keyStr = data.p ? decodePassword(data.p) : "";
            var expiryPart = (planStr ? planStr + " \u00b7 " : "") + "\ub9cc\ub8cc " + dateStr;
            return keyStr ? expiryPart + "  |  " + keyStr : expiryPart;
        } catch (e) {
            return null;
        }
    }

    function validateLicense() {
        if (!authFile.exists) return false;

        try {
            authFile.encoding = "UTF-8";
            authFile.open("r");
            var content = authFile.read();
            authFile.close();

            var licenseData = JSON.parse(content);
            var currentHWID = getHardwareID();

            // 1. HWID 검증
            if (licenseData.h !== simpleHash(currentHWID)) {
                alert("라이선스 인증 실패: 하드웨어 정보가 변경되었습니다.");
                return false;
            }

            // 2. 만료일 없으면 영구 라이선스 (구버전 호환)
            if (!licenseData.expiry_date) return true;

            var now = new Date();
            var expiryDate = parseISODate(licenseData.expiry_date);
            var daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            var plan = licenseData.plan || "";

            // 3. 7일 주기 서버 재확인
            var lastVerified = licenseData.last_verified || 0;
            var nowSec = Math.floor(now.getTime() / 1000);
            var daysSinceVerify = (nowSec - lastVerified) / (60 * 60 * 24);

            if (daysSinceVerify >= 7) {
                var licenseKey = decodePassword(licenseData.p);
                var serverResult = checkSubscriptionOnServer(licenseKey, currentHWID);

                if (serverResult.status === "valid") {
                    licenseData.last_verified = nowSec;
                    if (serverResult.expiry_date) {
                        licenseData.expiry_date = serverResult.expiry_date;
                        expiryDate = parseISODate(licenseData.expiry_date);
                        daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    }
                    if (serverResult.plan) {
                        licenseData.plan = serverResult.plan;
                        plan = licenseData.plan;
                    }
                    authFile.encoding = "UTF-8";
                    authFile.open("w");
                    authFile.write(JSON.stringify(licenseData));
                    authFile.close();
                } else if (serverResult.status === "grace") {
                    licenseData.last_verified = nowSec;
                    authFile.encoding = "UTF-8";
                    authFile.open("w");
                    authFile.write(JSON.stringify(licenseData));
                    authFile.close();
                } else if (serverResult.status === "expired") {
                    deleteLocalLicense();
                    alert("❌ 구독이 만료되었습니다.\n\n새로운 라이선스 키를 입력해주세요.");
                    return false;
                }
                // offline / error → 로컬 판단으로 fallback
            }

            // 4. 만료일 기준 처리
            if (daysRemaining > 0) {
                // 만료 알림 (1회)
                var notified_30d = licenseData.notified_30d || false;
                var notified_7d = licenseData.notified_7d || false;
                var needSave = false;

                if (plan === "yearly" && !notified_30d && daysRemaining <= 30) {
                    alert("📅 구독 만료 알림\n\n" + daysRemaining + "일 후 구독이 만료됩니다. (연간 플랜)\n갱신을 준비해 주세요.");
                    licenseData.notified_30d = true;
                    needSave = true;
                }
                if (!notified_7d && daysRemaining <= 7) {
                    alert("⚠️ 구독 만료 임박\n\n" + daysRemaining + "일 후 구독이 만료됩니다.\n갱신을 진행해 주세요.");
                    licenseData.notified_7d = true;
                    needSave = true;
                }
                if (needSave) {
                    authFile.encoding = "UTF-8";
                    authFile.open("w");
                    authFile.write(JSON.stringify(licenseData));
                    authFile.close();
                }
                return true;

            } else if (daysRemaining > -7) {
                // 유예기간 (만료 후 7일 이내)
                var graceDaysLeft = 7 + daysRemaining;
                alert("⚠️ 구독이 만료되었습니다.\n\n유예기간 " + graceDaysLeft + "일 남음.\n갱신하지 않으면 사용이 중단됩니다.");
                return true;

            } else {
                // 완전 만료
                deleteLocalLicense();
                alert("❌ 구독이 만료되었습니다.\n\n새로운 라이선스 키를 입력해주세요.");
                return false;
            }

        } catch (e) {
            return false;
        }
    }

    function checkLicenseOnServer(licenseKey, hwid) {
        if (LICENSE_SERVER_URL === "PASTE_YOUR_GOOGLE_SCRIPT_URL_HERE") {
            return { status: "offline", message: "서버 URL 미설정" };
        }

        var cleanUrl = LICENSE_SERVER_URL.replace(/\s+/g, '');
        var cleanKey = String(licenseKey).replace(/\s+/g, '');
        var cleanHwid = String(hwid).replace(/\s+/g, '');

        var url = cleanUrl + "?action=check" + "&key=" + urlEncode(cleanKey) + "&hwid=" + urlEncode(cleanHwid);
        var response = httpGet(url);

        if (!response) {
            return { status: "offline", message: "서버 연결 실패" };
        }

        try {
            return JSON.parse(response);
        } catch (e) {
            return { status: "error", message: "응답 파싱 실패" };
        }
    }

    function activateLicenseOnServer(licenseKey, hwid, userName) {
        if (LICENSE_SERVER_URL === "PASTE_YOUR_GOOGLE_SCRIPT_URL_HERE") {
            return { status: "offline", message: "서버 URL 미설정" };
        }

        var cleanUrl = LICENSE_SERVER_URL.replace(/\s+/g, '');
        var cleanKey = String(licenseKey).replace(/\s+/g, '');
        var cleanHwid = String(hwid).replace(/\s+/g, '');
        var cleanUser = String(userName).replace(/^\s+|\s+$/g, '');

        var rawCompName = $.getenv("COMPUTERNAME") || $.getenv("HOSTNAME") || "UNKNOWN_PC";
        var computerName = rawCompName.replace(/\s+/g, '');

        var url = cleanUrl + "?action=activate" + "&key=" + urlEncode(cleanKey) + "&hwid=" + urlEncode(cleanHwid) + "&user=" + urlEncode(cleanUser) + "&computer=" + urlEncode(computerName);
        var response = httpGet(url);

        if (!response) {
            return { status: "offline", message: "서버 연결 실패" };
        }

        try {
            return JSON.parse(response);
        } catch (e) {
            return { status: "error", message: "응답 파싱 실패" };
        }
    }

    function checkTrialOnServer(hwid) {
        var cleanUrl = LICENSE_SERVER_URL.replace(/\s+/g, '');
        var cleanHwid = String(hwid).replace(/\s+/g, '');
        var url = cleanUrl + "?action=trial_check&hwid=" + urlEncode(cleanHwid);
        var response = httpGet(url);

        if (!response) return { status: "offline" };
        try {
            return JSON.parse(response);
        } catch (e) {
            return { status: "error" };
        }
    }

    function checkSubscriptionOnServer(licenseKey, hwid) {
        var cleanUrl = LICENSE_SERVER_URL.replace(/\s+/g, '');
        var url = cleanUrl + "?action=check_subscription&key=" + urlEncode(licenseKey) + "&hwid=" + urlEncode(hwid);
        var response = httpGet(url);
        if (!response) return { status: "offline" };
        try {
            return JSON.parse(response);
        } catch (e) {
            return { status: "error" };
        }
    }

    function registerTrialOnServer(hwid) {
        var cleanUrl = LICENSE_SERVER_URL.replace(/\s+/g, '');
        var cleanHwid = String(hwid).replace(/\s+/g, '');
        var url = cleanUrl + "?action=trial_register&hwid=" + urlEncode(cleanHwid);
        var response = httpGet(url);

        if (!response) return { status: "offline" };
        try {
            return JSON.parse(response);
        } catch (e) {
            return { status: "error" };
        }
    }

    function deactivateLicenseOnServer(licenseKey, hwid) {
        if (LICENSE_SERVER_URL === "PASTE_YOUR_GOOGLE_SCRIPT_URL_HERE") {
            return { status: "offline", message: "서버 URL 미설정" };
        }

        var cleanUrl = LICENSE_SERVER_URL.replace(/\s+/g, '');
        var cleanKey = String(licenseKey).replace(/\s+/g, '');
        var cleanHwid = String(hwid).replace(/\s+/g, '');

        var url = cleanUrl + "?action=deactivate" + "&key=" + urlEncode(cleanKey) + "&hwid=" + urlEncode(cleanHwid);
        var response = httpGet(url);

        if (!response) {
            return { status: "offline", message: "서버 연결 실패" };
        }

        try {
            return JSON.parse(response);
        } catch (e) {
            return { status: "error", message: "응답 파싱 실패" };
        }
    }

    // ── 라이선스 키 입력 흐름 (체험 만료 / 직접 등록 공용) ──
    // 성공 시 true, 실패/취소 시 false 반환
    function runLicenseKeyFlow(hwid) {
        var maxAttempts = 3;
        var attempts = 0;

        while (attempts < maxAttempts) {
            var inputPassword = prompt(
                "🔒 AE SJE Copy-Paste Pro 라이선스 인증\n\n" +
                "발급받은 라이선스 키를 입력하세요:\n" +
                "(이 컴퓨터에서 최초 1회만 입력)\n\n" +
                "시도: " + (attempts + 1) + "/" + maxAttempts,
                ""
            );

            if (inputPassword === null) {
                alert("인증이 취소되었습니다.");
                return false;
            }

            var serverCheck = checkLicenseOnServer(inputPassword, hwid);

            if (serverCheck.status === "offline" || serverCheck.status === "error") {
                alert("❌ 서버 연결 실패\n\n오류 내용: " + (serverCheck.message || "알 수 없음"));
                return false;
            } else if (serverCheck.status === "used") {
                alert("❌ 라이선스 사용 불가\n\n이미 다른 PC에서 사용 중인 라이선스입니다.\n현재 사용자: " + serverCheck.user + "\n사용 중인 PC: " + serverCheck.computer);
                return false;
            } else if (serverCheck.status === "valid") {
                saveLicense(inputPassword, hwid, serverCheck.user, serverCheck.expiry_date, serverCheck.plan);
                return true;
            } else if (serverCheck.status === "not_activated") {
                var userName = serverCheck.user;
                var actResult = activateLicenseOnServer(inputPassword, hwid, userName);
                if (actResult.status === "activated") {
                    saveLicense(inputPassword, hwid, userName, actResult.expiry_date, actResult.plan);
                    alert("✅ 라이선스 등록 완료!\n환영합니다, " + userName + "님.");
                    return true;
                } else {
                    alert("❌ 활성화 실패: " + (actResult.message || "알 수 없는 오류"));
                    return false;
                }
            } else if (serverCheck.status === "not_found") {
                attempts++;
                if (attempts < maxAttempts) {
                    alert("❌ 잘못된 라이선스 키입니다.\n\n남은 시도: " + (maxAttempts - attempts));
                } else {
                    alert("❌ 인증 실패\n\n최대 시도 횟수를 초과했습니다.");
                    return false;
                }
            } else {
                alert("❌ 알 수 없는 응답: " + JSON.stringify(serverCheck));
                return false;
            }
        }
        return false;
    }

    if (!validateLicense()) {
        var hwid = getHardwareID();

        // ── 체험판 확인 (서버 필수, 오프라인이면 실행 불가) ──
        var trialResult = checkTrialOnServer(hwid);

        if (trialResult.status === "trial_not_found") {
            // ── 최초 실행: 선택 다이얼로그 ──
            var choiceDlg = new Window("dialog", "AE SJE Copy-Paste Pro");
            choiceDlg.orientation = "column";
            choiceDlg.spacing = 12;
            choiceDlg.margins = 20;

            choiceDlg.add("statictext", undefined, "AE SJE Copy-Paste Pro 시작 방법을 선택하세요.");

            var sep = choiceDlg.add("panel", undefined, "");
            sep.alignment = "fill";

            var btnGroup = choiceDlg.add("group");
            btnGroup.orientation = "column";
            btnGroup.spacing = 8;
            btnGroup.alignment = "fill";

            var btnLicense = btnGroup.add("button", undefined, "라이선스 키 입력");
            var btnTrial = btnGroup.add("button", undefined, "무료 체험 시작");
            var btnCancel = btnGroup.add("button", undefined, "취소");

            btnLicense.preferredSize = [200, 30];
            btnTrial.preferredSize = [200, 30];
            btnCancel.preferredSize = [200, 30];

            var userChoice = null;
            btnLicense.onClick = function () { userChoice = "license"; choiceDlg.close(); };
            btnTrial.onClick = function () { userChoice = "trial"; choiceDlg.close(); };
            btnCancel.onClick = function () { userChoice = null; choiceDlg.close(); };

            choiceDlg.show();

            if (userChoice === null) {
                return;
            } else if (userChoice === "license") {
                if (!runLicenseKeyFlow(hwid)) return;
            } else if (userChoice === "trial") {
                var regResult = registerTrialOnServer(hwid);
                if (regResult.status === "trial_active") {
                    alert("🎉 체험판 시작!\n\n" + regResult.days_remaining + "일간 무료로 사용하실 수 있습니다.\n체험 기간 이후에는 라이선스 키가 필요합니다.");
                } else {
                    alert("❌ 서버 연결 실패\n\n체험판 등록에 실패했습니다.\n인터넷 연결을 확인 후 다시 실행해주세요.");
                    return;
                }
            }

        } else if (trialResult.status === "trial_active") {
            // ── 체험 중: 남은 일수 + 라이선스 등록 옵션 ──
            var trialDlg = new Window("dialog", "AE SJE Copy-Paste Pro 체험판");
            trialDlg.orientation = "column";
            trialDlg.spacing = 12;
            trialDlg.margins = 20;

            trialDlg.add("statictext", undefined, "남은 체험 기간: " + trialResult.days_remaining + "일");
            trialDlg.add("statictext", undefined, "정식 라이선스를 등록하면 기간 제한 없이 사용 가능합니다.");

            var sep2 = trialDlg.add("panel", undefined, "");
            sep2.alignment = "fill";

            var trialBtnGroup = trialDlg.add("group");
            trialBtnGroup.orientation = "column";
            trialBtnGroup.spacing = 8;
            trialBtnGroup.alignment = "fill";

            var btnRegister = trialBtnGroup.add("button", undefined, "라이선스 키 등록");
            var btnContinue = trialBtnGroup.add("button", undefined, "계속 체험판으로 사용");

            btnRegister.preferredSize = [200, 30];
            btnContinue.preferredSize = [200, 30];

            var trialChoice = null;
            btnRegister.onClick = function () { trialChoice = "register"; trialDlg.close(); };
            btnContinue.onClick = function () { trialChoice = "continue"; trialDlg.close(); };

            trialDlg.show();

            if (trialChoice === "register") {
                if (!runLicenseKeyFlow(hwid)) return;
            } else if (trialChoice === null) {
                return;
            }
            // "continue" 는 그냥 통과

        } else if (trialResult.status === "trial_expired") {
            // ── 체험 만료 ──
            alert("⏰ 체험 기간이 종료되었습니다.\n\n계속 사용하시려면 라이선스 키를 입력해주세요.");
            if (!runLicenseKeyFlow(hwid)) return;

        } else {
            // offline / error
            alert("❌ 서버 연결 실패\n\n체험판은 인터넷 연결이 필요합니다.\n정식 라이선스 사용자는 오프라인에서도 실행 가능합니다.\n\n인터넷 연결을 확인 후 다시 실행해주세요.");
            return;
        }
    }

    // ============================================
    // 🎨 타입별 색상 정의
    // ============================================
    function getTypeColor(typeLabel) {
        switch (typeLabel) {
            case "[Text]": return [1, 0.8, 0.2];
            case "[Shape]": return [0.4, 0.9, 0.4];
            case "[Comp]": return [0.5, 0.7, 1];
            case "[Solid]": return [0.8, 0.5, 1];
            case "[Null]": return [0.7, 0.7, 0.7];
            case "[AVI]": return [1, 0.6, 0.3];
            case "[Cam]": return [1, 0.4, 0.4];
            case "[Light]": return [1, 1, 0.5];
            default: return [0.8, 0.8, 0.8];
        }
    }

    function applyTextColor(textElement, colorArray) {
        try {
            textElement.graphics.foregroundColor = textElement.graphics.newPen(
                textElement.graphics.PenType.SOLID_COLOR,
                colorArray,
                1
            );
        } catch (e) { }
    }

    // ============================================
    // ✅ 메인 코드
    // ============================================

    var isPanel = (thisObj instanceof Panel);
    var win;

    if (isPanel) {
        win = thisObj;
    } else {
        win = new Window("palette", "AE SJE Copy-Paste Pro", undefined, { resizeable: false });
    }

    win.orientation = "column";
    win.spacing = 8;
    win.margins = 12;

    var slots = [];
    var slotCountText; // 슬롯 총 개수 표시용
    var saveFile = null;

    var configFolder = Folder.myDocuments.fsName + "/CopyPastePro/";
    var configFile = configFolder + "config.json";

    var folder = new Folder(configFolder);
    if (!folder.exists) folder.create();

    // ============================================
    // 📁 경로 정규화 및 설정 관리
    // ============================================
    function normalizePath(path) {
        if (!path) return null;
        try {
            return decodeURI(path).replace(/\\/g, '/');
        } catch (e) {
            return path.replace(/\\/g, '/');
        }
    }

    function getCurrentProjectPath() {
        try {
            if (app.project && app.project.file) {
                return normalizePath(app.project.file.fsName);
            }
        } catch (e) { }
        return null;
    }

    function loadFullConfig() {
        try {
            var configF = new File(configFile);
            if (!configF.exists) return { projects: {}, lastPath: null };

            configF.encoding = "UTF-8";
            configF.open("r");
            var content = configF.read();
            configF.close();

            if (content && content.length > 0) {
                var data = JSON.parse(content);
                if (!data.projects) data.projects = {};
                return data;
            }
        } catch (e) { }
        return { projects: {}, lastPath: null };
    }

    function saveConfig() {
        if (!saveFile) return false;

        try {
            var config = loadFullConfig();
            var projectPath = getCurrentProjectPath();
            var normalSavePath = normalizePath(saveFile.fsName);

            if (projectPath) {
                config.projects[projectPath] = normalSavePath;
            }

            config.lastPath = normalSavePath;

            var configF = new File(configFile);
            configF.encoding = "UTF-8";
            if (configF.open("w")) {
                configF.write(JSON.stringify(config));
                configF.close();
                return true;
            }
        } catch (e) { }
        return false;
    }

    function loadConfig(isShowAlert) {
        try {
            var config = loadFullConfig();
            var projectPath = getCurrentProjectPath();

            if (projectPath && config.projects && config.projects[projectPath]) {
                var mappedPath = config.projects[projectPath];
                var f = new File(mappedPath);

                if (f.exists) {
                    return f;
                }
            }

            if (config.lastPath) {
                var f = new File(config.lastPath);
                if (f.exists) {
                    return f;
                }
            }

        } catch (e) { }
        return null;
    }

    function getLayerTypeLabel(layer) {
        try {
            if (layer instanceof TextLayer) {
                return "[Text]";
            } else if (layer instanceof ShapeLayer) {
                return "[Shape]";
            } else if (layer instanceof CameraLayer) {
                return "[Cam]";
            } else if (layer instanceof LightLayer) {
                return "[Light]";
            } else if (layer.nullLayer) {
                return "[Null]";
            } else if (layer.source instanceof CompItem) {
                return "[Comp]";
            } else if (layer.source instanceof FootageItem && layer.source.mainSource instanceof SolidSource) {
                return "[Solid]";
            } else {
                return "[AVI]";
            }
        } catch (e) {
            return "[?]";
        }
    }

    function saveSlots() {
        if (!saveFile) return;

        try {
            var data = { _slots: [] };
            for (var i = 0; i < slots.length; i++) {
                if (slots[i].layer) {
                    try {
                        var testName = slots[i].layer.name;
                        var testComp = slots[i].layer.containingComp.name;

                        var slotData = {
                            compName: testComp,
                            layerName: testName,
                            layerType: getLayerTypeLabel(slots[i].layer),
                            displayName: slots[i].displayName || ""
                        };
                        data._slots.push(slotData);
                    } catch (e) {
                        if (slots[i].savedData) {
                            var sd = slots[i].savedData;
                            sd.displayName = slots[i].displayName || sd.displayName || "";
                            data._slots.push(sd);
                        } else {
                            data._slots.push({ empty: true });
                        }
                    }
                } else if (slots[i].savedData) {
                    var sd = slots[i].savedData;
                    sd.displayName = slots[i].displayName || sd.displayName || "";
                    data._slots.push(sd);
                } else {
                    data._slots.push({ empty: true });
                }
            }

            saveFile.encoding = "UTF-8";
            if (saveFile.open("w")) {
                saveFile.write(JSON.stringify(data));
                saveFile.close();
                saveConfig();
            }
        } catch (e) {
            alert("슬롯 저장 오류: " + e.toString());
        }
    }

    function loadSlots() {
        if (!saveFile || !saveFile.exists) return null;
        try {
            saveFile.encoding = "UTF-8";
            saveFile.open("r");
            var content = saveFile.read();
            saveFile.close();
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    }

    function findLayerFromData(data) {
        if (!data || !data.compName || !data.layerName) return null;

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === data.compName) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var layer = item.layer(j);
                    if (layer.name === data.layerName) return layer;
                }
            }
        }
        return null;
    }

    function clearAllSlots() {
        for (var i = slots.length - 1; i >= 0; i--) {
            // 수정됨: slotContainer 내부의 그룹을 제거
            slotContainer.remove(slots[i].group);
        }
        slots = [];
        updateSlotNumbers();
        updateScroll(); // 스크롤 초기화
    }

    function getSlotDisplayText(slotObj) {
        if (slotObj.displayName && slotObj.displayName !== "") {
            return slotObj.displayName;
        }
        if (slotObj.layer) {
            try {
                return slotObj.layer.name;
            } catch (e) { }
        }
        if (slotObj.savedData && slotObj.savedData.layerName) {
            return slotObj.savedData.layerName;
        }
        return "";
    }

    function restoreSlots() {
        var data = loadSlots();
        if (!data || !data._slots) return;

        clearAllSlots();

        for (var i = 0; i < data._slots.length; i++) {
            var slotData = data._slots[i];
            createSlot();

            if (!slotData.empty && slotData.compName && slotData.layerName) {
                slots[i].savedData = slotData;
                slots[i].displayName = slotData.displayName || "";

                var layer = findLayerFromData(slotData);
                var typeLabel = slotData.layerType || "[?]";
                var showName = slots[i].displayName || slotData.layerName;

                if (layer) {
                    slots[i].layer = layer;
                    typeLabel = getLayerTypeLabel(layer);
                    slots[i].typeText.text = typeLabel;
                    slots[i].nameText.text = "✓ " + showName;
                    slots[i].nameText.helpTip = "표시명: " + showName + "\nComp: " + slotData.compName + "\nLayer: " + layer.name;
                    applyTextColor(slots[i].typeText, getTypeColor(typeLabel));
                    applyTextColor(slots[i].nameText, [0.9, 0.9, 0.9]);
                } else {
                    slots[i].layer = null;
                    slots[i].typeText.text = typeLabel;
                    slots[i].nameText.text = "⚠ " + showName;
                    slots[i].nameText.helpTip = "❌ 레이어를 찾을 수 없음\n\n표시명: " + showName + "\nComp: " + slotData.compName + "\nLayer: " + slotData.layerName;
                    applyTextColor(slots[i].typeText, getTypeColor(typeLabel));
                    applyTextColor(slots[i].nameText, [1, 0.6, 0.3]);
                }
            }
        }
        updateSlotNumbers();
        win.layout.layout(true);
        updateScroll();
    }

    function reconnectAllSlots() {
        var reconnected = 0;
        var failed = 0;

        for (var i = 0; i < slots.length; i++) {
            if (slots[i].savedData && !slots[i].layer) {
                var layer = findLayerFromData(slots[i].savedData);
                if (layer) {
                    slots[i].layer = layer;
                    var typeLabel = getLayerTypeLabel(layer);
                    var showName = getSlotDisplayText(slots[i]);
                    slots[i].typeText.text = typeLabel;
                    slots[i].nameText.text = "✓ " + showName;
                    slots[i].nameText.helpTip = "표시명: " + showName + "\nComp: " + slots[i].savedData.compName + "\nLayer: " + layer.name;
                    applyTextColor(slots[i].typeText, getTypeColor(typeLabel));
                    applyTextColor(slots[i].nameText, [0.9, 0.9, 0.9]);
                    reconnected++;
                } else {
                    failed++;
                }
            }
        }

        return { reconnected: reconnected, failed: failed };
    }

    function updateSlotNumbers() {
        for (var i = 0; i < slots.length; i++) {
            slots[i].label.text = "Slot " + (i + 1) + ":";
        }
        if (slotCountText) {
            slotCountText.text = "(" + slots.length + ")";
        }
    }

    // ============================================
    // 복사/붙여넣기 유틸리티 함수들 (기존과 동일)
    // ============================================
    function copyExpressionsRecursive(srcGroup, tgtGroup) {
        if (!srcGroup || !tgtGroup) return;

        try {
            var numProps = srcGroup.numProperties;
        } catch (e) {
            return;
        }

        for (var i = 1; i <= srcGroup.numProperties; i++) {
            try {
                var srcProp = srcGroup.property(i);
                var tgtProp = tgtGroup.property(i);

                if (!srcProp || !tgtProp) continue;

                if (srcProp.propertyType === PropertyType.PROPERTY) {
                    if (srcProp.canSetExpression && srcProp.expression !== "") {
                        try {
                            tgtProp.expression = srcProp.expression;
                            tgtProp.expressionEnabled = srcProp.expressionEnabled;
                        } catch (e) { }
                    }
                } else if (srcProp.propertyType === PropertyType.INDEXED_GROUP ||
                    srcProp.propertyType === PropertyType.NAMED_GROUP) {
                    copyExpressionsRecursive(srcProp, tgtProp);
                }
            } catch (e) { }
        }
    }

    function copyMarkersWithFullData(srcLayer, tgtLayer) {
        var srcMarkers = srcLayer.property("ADBE Marker");
        var tgtMarkers = tgtLayer.property("ADBE Marker");

        if (!srcMarkers || srcMarkers.numKeys === 0) return;

        for (var m = tgtMarkers.numKeys; m >= 1; m--) {
            tgtMarkers.removeKey(m);
        }

        for (var i = 1; i <= srcMarkers.numKeys; i++) {
            var time = srcMarkers.keyTime(i);
            var srcMV = srcMarkers.keyValue(i);
            tgtMarkers.setValueAtTime(time, srcMV);
        }
    }

    function copyEffectsWithExpressions(srcLayer, tgtLayer) {
        var srcEffects = srcLayer.property("ADBE Effect Parade");
        var tgtEffects = tgtLayer.property("ADBE Effect Parade");

        if (!srcEffects || srcEffects.numProperties === 0) return;

        while (tgtEffects.numProperties > 0) {
            tgtEffects.property(1).remove();
        }

        var comp = tgtLayer.containingComp;
        comp.openInViewer();
        app.executeCommand(app.findMenuCommandId("Deselect All"));

        for (var i = 1; i <= srcEffects.numProperties; i++) {
            srcEffects.property(i).selected = true;
        }

        app.executeCommand(app.findMenuCommandId("Copy"));
        app.executeCommand(app.findMenuCommandId("Deselect All"));

        tgtLayer.selected = true;
        app.executeCommand(app.findMenuCommandId("Paste"));
        tgtLayer.selected = false;

        app.executeCommand(app.findMenuCommandId("Deselect All"));

        $.sleep(50);

        var newTgtEffects = tgtLayer.property("ADBE Effect Parade");

        if (newTgtEffects) {
            for (var j = 1; j <= srcEffects.numProperties; j++) {
                var srcEffect = srcEffects.property(j);

                for (var k = 1; k <= newTgtEffects.numProperties; k++) {
                    var tgtEffect = newTgtEffects.property(k);
                    if (tgtEffect.matchName === srcEffect.matchName) {
                        copyExpressionsRecursive(srcEffect, tgtEffect);
                        break;
                    }
                }
            }
        }
    }

    function copyLayerStyles(srcLayer, tgtLayer) {
        try {
            var srcStyles = srcLayer.property("ADBE Layer Styles");
            var tgtStyles = tgtLayer.property("ADBE Layer Styles");

            if (!srcStyles || !tgtStyles) return;

            var comp = tgtLayer.containingComp;
            comp.openInViewer();
            app.executeCommand(app.findMenuCommandId("Deselect All"));

            srcStyles.selected = true;
            app.executeCommand(app.findMenuCommandId("Copy"));
            app.executeCommand(app.findMenuCommandId("Deselect All"));

            tgtLayer.selected = true;
            app.executeCommand(app.findMenuCommandId("Paste"));
            tgtLayer.selected = false;

            app.executeCommand(app.findMenuCommandId("Deselect All"));
            $.sleep(50);
        } catch (e) {
            // 레이어 스타일이 없을 경우 selected 과정에서 숨김 속성 에러가 발생하므로 무시
        }
    }

    function copyShapeContents(srcLayer, tgtLayer) {
        var comp = tgtLayer.containingComp;
        var srcContents = srcLayer.property("ADBE Root Vectors Group");
        var tgtContents = tgtLayer.property("ADBE Root Vectors Group");

        if (!srcContents || srcContents.numProperties === 0) return;

        while (tgtContents.numProperties > 0) {
            tgtContents.property(1).remove();
        }

        var srcComp = srcLayer.containingComp;
        srcComp.openInViewer();
        app.executeCommand(app.findMenuCommandId("Deselect All"));

        for (var i = 1; i <= srcContents.numProperties; i++) {
            srcContents.property(i).selected = true;
        }

        app.executeCommand(app.findMenuCommandId("Copy"));
        app.executeCommand(app.findMenuCommandId("Deselect All"));

        comp.openInViewer();
        tgtLayer.selected = true;
        app.executeCommand(app.findMenuCommandId("Paste"));
        tgtLayer.selected = false;

        app.executeCommand(app.findMenuCommandId("Deselect All"));
    }

    function resetLayerClean(layer) {
        var comp = layer.containingComp;
        var newLayer = null;

        var layerInfo = {
            name: layer.name,
            index: layer.index,
            startTime: layer.startTime,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            enabled: layer.enabled,
            shy: layer.shy,
            solo: layer.solo,
            locked: false,
            label: layer.label,
            threeDLayer: false,  // 리셋 시 3D 체크 해제
            collapseTransformation: layer.collapseTransformation,
            blendingMode: layer.blendingMode,
            preserveTransparency: layer.preserveTransparency,
            trackMatteType: layer.trackMatteType,
            parent: layer.parent,
            autoOrient: layer.autoOrient
        };

        var transform = layer.property("ADBE Transform Group");
        var transformValues = {};

        try {
            transformValues.anchorPoint = transform.property("ADBE Anchor Point").value;
            transformValues.position = transform.property("ADBE Position").value;
            transformValues.scale = transform.property("ADBE Scale").value;
            transformValues.opacity = transform.property("ADBE Opacity").value;

            if (layer.threeDLayer) {
                transformValues.rotationX = transform.property("ADBE Rotate X").value;
                transformValues.rotationY = transform.property("ADBE Rotate Y").value;
                transformValues.rotationZ = transform.property("ADBE Rotate Z").value;
                transformValues.orientation = transform.property("ADBE Orientation").value;
            } else {
                transformValues.rotation = transform.property("ADBE Rotate Z").value;
            }
        } catch (e) { }

        layer.locked = false;

        if (layer instanceof TextLayer) {
            var textDoc = layer.property("ADBE Text Properties").property("Source Text").value;
            newLayer = comp.layers.addText(textDoc);

        } else if (layer instanceof ShapeLayer) {
            newLayer = comp.layers.addShape();
            copyShapeContents(layer, newLayer);

        } else if (layer.nullLayer) {
            newLayer = comp.layers.addNull();

        } else if (layer instanceof CameraLayer) {
            var cameraOptions = [layer.name, layer.cameraOption.zoom.value];
            newLayer = comp.layers.addCamera(layer.name, [comp.width / 2, comp.height / 2]);

        } else if (layer instanceof LightLayer) {
            newLayer = comp.layers.addLight(layer.name, [comp.width / 2, comp.height / 2]);

        } else if (layer.source) {
            newLayer = comp.layers.add(layer.source);
        }

        if (!newLayer) {
            return null;
        }

        try {
            newLayer.name = layerInfo.name;
            newLayer.startTime = layerInfo.startTime;
            newLayer.inPoint = layerInfo.inPoint;
            newLayer.outPoint = layerInfo.outPoint;
            newLayer.enabled = layerInfo.enabled;
            newLayer.shy = layerInfo.shy;
            newLayer.solo = layerInfo.solo;
            newLayer.label = layerInfo.label;
            newLayer.blendingMode = layerInfo.blendingMode;

            if (!(newLayer instanceof CameraLayer) && !(newLayer instanceof LightLayer)) {
                newLayer.threeDLayer = layerInfo.threeDLayer;
                try { newLayer.collapseTransformation = layerInfo.collapseTransformation; } catch (e) { }
                try { newLayer.preserveTransparency = layerInfo.preserveTransparency; } catch (e) { }
            }
        } catch (e) { }

        var newTransform = newLayer.property("ADBE Transform Group");
        try {
            newTransform.property("ADBE Anchor Point").setValue(transformValues.anchorPoint);
            newTransform.property("ADBE Position").setValue(transformValues.position);
            newTransform.property("ADBE Scale").setValue(transformValues.scale);
            newTransform.property("ADBE Opacity").setValue(transformValues.opacity);

            if (newLayer.threeDLayer) {
                newTransform.property("ADBE Rotate X").setValue(transformValues.rotationX);
                newTransform.property("ADBE Rotate Y").setValue(transformValues.rotationY);
                newTransform.property("ADBE Rotate Z").setValue(transformValues.rotationZ);
                try { newTransform.property("ADBE Orientation").setValue(transformValues.orientation); } catch (e) { }
            } else {
                newTransform.property("ADBE Rotate Z").setValue(transformValues.rotation);
            }
        } catch (e) { }

        try {
            newLayer.moveBefore(layer);
        } catch (e) {
            try {
                newLayer.moveAfter(layer);
            } catch (e2) { }
        }

        if (layerInfo.parent) {
            try {
                newLayer.parent = layerInfo.parent;
            } catch (e) { }
        }

        if (layerInfo.trackMatteType && layerInfo.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) {
            try {
                newLayer.trackMatteType = layerInfo.trackMatteType;
            } catch (e) { }
        }

        layer.remove();

        return newLayer;
    }

    function copyPropertyDeep(srcProp, tgtProp) {
        if (!srcProp || !tgtProp) return;
        if (srcProp.propertyType !== PropertyType.PROPERTY) return;

        while (tgtProp.numKeys > 0) tgtProp.removeKey(1);

        if (srcProp.numKeys > 0) {
            for (var k = 1; k <= srcProp.numKeys; k++) {
                var t = srcProp.keyTime(k);
                var v = srcProp.keyValue(k);
                var inInterp = srcProp.keyInInterpolationType(k);
                var outInterp = srcProp.keyOutInterpolationType(k);
                tgtProp.setValueAtTime(t, v);

                if (srcProp.isSpatial) {
                    var inTan = srcProp.keyInSpatialTangent(k);
                    var outTan = srcProp.keyOutSpatialTangent(k);
                    tgtProp.setSpatialTangentsAtKey(tgtProp.numKeys, inTan, outTan);
                }

                tgtProp.setInterpolationTypeAtKey(tgtProp.numKeys, inInterp, outInterp);

                if (inInterp === KeyframeInterpolationType.BEZIER && outInterp === KeyframeInterpolationType.BEZIER) {
                    try {
                        var inEase = srcProp.keyInTemporalEase(k);
                        var outEase = srcProp.keyOutTemporalEase(k);
                        tgtProp.setTemporalEaseAtKey(tgtProp.numKeys, inEase, outEase);
                    } catch (e) { }
                }
            }
        } else {
            try {
                tgtProp.setValue(srcProp.value);
            } catch (e) { }
        }

        if (srcProp.canSetExpression && srcProp.expression !== "") {
            try {
                tgtProp.expression = srcProp.expression;
                tgtProp.expressionEnabled = srcProp.expressionEnabled;
            } catch (e) { }
        }
    }

    function applyPositionOffset(prop, offset) {
        try {
            var wasEnabled = prop.expressionEnabled;
            prop.expressionEnabled = false;

            if (prop.dimensionsSeparated) {
                var xProp = prop.property("ADBE Position_0");
                var yProp = prop.property("ADBE Position_1");
                var zProp = prop.property("ADBE Position_2");

                if (xProp) applySinglePropOffset(xProp, offset[0]);
                if (yProp) applySinglePropOffset(yProp, offset[1]);
                if (zProp && offset.length > 2) {
                    applySinglePropOffset(zProp, offset[2]);
                }
            } else {
                if (prop.numKeys > 0) {
                    for (var k = 1; k <= prop.numKeys; k++) {
                        var val = prop.keyValue(k);
                        var newVal = [val[0] + offset[0], val[1] + offset[1]];
                        if (val.length === 3) newVal.push(val[2] + (offset[2] || 0));
                        prop.setValueAtKey(k, newVal);
                    }
                } else {
                    var val = prop.value;
                    var newVal = [val[0] + offset[0], val[1] + offset[1]];
                    if (val.length === 3) newVal.push(val[2] + (offset[2] || 0));
                    prop.setValue(newVal);
                }
            }
            prop.expressionEnabled = wasEnabled;
        } catch (e) { }
    }

    function applySinglePropOffset(prop, valOffset) {
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) {
                prop.setValueAtKey(k, prop.keyValue(k) + valOffset);
            }
        } else {
            prop.setValue(prop.value + valOffset);
        }
    }

    function applyScaleRatio(prop, ratio) {
        try {
            var wasEnabled = prop.expressionEnabled;
            prop.expressionEnabled = false;
            if (prop.numKeys > 0) {
                for (var k = 1; k <= prop.numKeys; k++) {
                    var val = prop.keyValue(k);
                    var newVal = [val[0] * ratio[0], val[1] * ratio[1]];
                    if (val.length === 3) newVal.push(val[2] * (ratio[2] || 1));
                    prop.setValueAtKey(k, newVal);
                }
            } else {
                var val = prop.value;
                var newVal = [val[0] * ratio[0], val[1] * ratio[1]];
                if (val.length === 3) newVal.push(val[2] * (ratio[2] || 1));
                prop.setValue(newVal);
            }
            prop.expressionEnabled = wasEnabled;
        } catch (e) { }
    }

    function copyLayerToCompAsTemp(srcLayer, targetComp) {
        var srcComp = srcLayer.containingComp;

        if (srcComp === targetComp) {
            return srcLayer.duplicate();
        }

        var originalTime = targetComp.time;

        // 🛡️ 소스 컴포지션 활성화 및 안정화
        srcComp.openInViewer();
        $.sleep(80);
        app.executeCommand(app.findMenuCommandId("Deselect All"));
        srcLayer.selected = true;

        // 🛡️ [오류 해결] 부모/익스프레션 임시 해제
        var originalParent = srcLayer.parent;
        var originalExprs = [];
        try {
            if (originalParent) {
                var posProp = srcLayer.property("ADBE Transform Group").property("ADBE Position");
                var currentPosValue = posProp.value;
                srcLayer.parent = null;
                try { posProp.setValue(currentPosValue); } catch (e) { }
            }
            var transform = srcLayer.property("ADBE Transform Group");
            if (transform) {
                for (var i = 1; i <= transform.numProperties; i++) {
                    var p = transform.property(i);
                    if (p.canSetExpression && p.expressionEnabled) {
                        originalExprs.push({ prop: p, matchName: p.matchName });
                        p.expressionEnabled = false;
                    }
                }
            }
        } catch (e) { }

        $.sleep(50);
        app.executeCommand(app.findMenuCommandId("Copy"));
        $.sleep(50);

        // 🛡️ 원본 상태 즉시 복구
        try {
            if (originalParent) srcLayer.parent = originalParent;
            for (var i = 0; i < originalExprs.length; i++) {
                originalExprs[i].prop.expressionEnabled = true;
            }
        } catch (e) { }

        srcLayer.selected = false;

        // 🛡️ 타겟 컴포지션 활성화 및 안정화
        targetComp.openInViewer();
        $.sleep(80);
        targetComp.time = 0;
        app.executeCommand(app.findMenuCommandId("Deselect All"));
        app.executeCommand(app.findMenuCommandId("Paste"));
        $.sleep(50);

        var pastedLayer = null;
        if (targetComp.selectedLayers.length > 0) {
            pastedLayer = targetComp.selectedLayers[0];
        }

        // 🛡️ 붙여넣어진 레이어의 익스프레션도 다시 활성화
        if (pastedLayer && originalExprs.length > 0) {
            try {
                var pastedTransform = pastedLayer.property("ADBE Transform Group");
                if (pastedTransform) {
                    for (var i = 0; i < originalExprs.length; i++) {
                        var mn = originalExprs[i].matchName;
                        var pp = pastedTransform.property(mn);
                        if (pp && pp.canSetExpression) {
                            pp.expressionEnabled = true;
                        }
                    }
                }
            } catch (e) { }
        }

        app.executeCommand(app.findMenuCommandId("Deselect All"));
        targetComp.time = originalTime;

        return pastedLayer;
    }

    function swapShapeContents(sourceLayerCopy, targetLayerOriginal) {
        var copyContents = sourceLayerCopy.property("Contents");
        if (copyContents) {
            for (var i = copyContents.numProperties; i >= 1; i--) {
                copyContents.property(i).remove();
            }
        }

        var srcComp = targetLayerOriginal.containingComp;
        var tgtComp = sourceLayerCopy.containingComp;

        srcComp.openInViewer();
        $.sleep(50);
        app.executeCommand(app.findMenuCommandId("Deselect All"));

        var targetContents = targetLayerOriginal.property("Contents");
        var hasContent = false;
        if (targetContents) {
            for (var j = 1; j <= targetContents.numProperties; j++) {
                targetContents.property(j).selected = true;
                hasContent = true;
            }
        }

        if (hasContent) {
            app.executeCommand(app.findMenuCommandId("Copy"));
            $.sleep(30);
            app.executeCommand(app.findMenuCommandId("Deselect All"));

            tgtComp.openInViewer();
            $.sleep(50);
            copyContents.selected = true;
            app.executeCommand(app.findMenuCommandId("Paste"));
            $.sleep(30);
            app.executeCommand(app.findMenuCommandId("Deselect All"));
        }
    }

    function copyPropertyDeepWithTimeOffset(srcProp, tgtProp, timeOffset) {
        if (!srcProp || !tgtProp) return;
        if (srcProp.propertyType !== PropertyType.PROPERTY) return;

        while (tgtProp.numKeys > 0) tgtProp.removeKey(1);

        if (srcProp.numKeys > 0) {
            for (var k = 1; k <= srcProp.numKeys; k++) {
                var t = srcProp.keyTime(k) + timeOffset;
                var v = srcProp.keyValue(k);
                var inInterp = srcProp.keyInInterpolationType(k);
                var outInterp = srcProp.keyOutInterpolationType(k);
                tgtProp.setValueAtTime(t, v);

                if (srcProp.isSpatial) {
                    var inTan = srcProp.keyInSpatialTangent(k);
                    var outTan = srcProp.keyOutSpatialTangent(k);
                    tgtProp.setSpatialTangentsAtKey(tgtProp.numKeys, inTan, outTan);
                }

                tgtProp.setInterpolationTypeAtKey(tgtProp.numKeys, inInterp, outInterp);

                if (inInterp === KeyframeInterpolationType.BEZIER && outInterp === KeyframeInterpolationType.BEZIER) {
                    try {
                        var inEase = srcProp.keyInTemporalEase(k);
                        var outEase = srcProp.keyOutTemporalEase(k);
                        tgtProp.setTemporalEaseAtKey(tgtProp.numKeys, inEase, outEase);
                    } catch (e) { }
                }
            }
        } else {
            try {
                tgtProp.setValue(srcProp.value);
            } catch (e) { }
        }

        if (srcProp.canSetExpression && srcProp.expression !== "") {
            try {
                tgtProp.expression = srcProp.expression;
                tgtProp.expressionEnabled = srcProp.expressionEnabled;
            } catch (e) { }
        }
    }

    function copyMarkersWithTimeOffsetDirect(srcLayer, tgtLayer, timeOffset) {
        var srcMarkers = srcLayer.property("ADBE Marker");
        var tgtMarkers = tgtLayer.property("ADBE Marker");

        if (!srcMarkers || srcMarkers.numKeys === 0) return;

        for (var m = tgtMarkers.numKeys; m >= 1; m--) {
            tgtMarkers.removeKey(m);
        }

        for (var i = 1; i <= srcMarkers.numKeys; i++) {
            var time = srcMarkers.keyTime(i) + timeOffset;
            var srcMV = srcMarkers.keyValue(i);
            tgtMarkers.setValueAtTime(time, srcMV);
        }
    }


    // ============================================
    // 🎨 UI 레이아웃
    // ============================================

    // ── 로고 헤더 ──
    var logoGroup = win.add("group");
    logoGroup.orientation = "column";
    logoGroup.alignment = ["fill", "top"];
    logoGroup.spacing = 1;
    logoGroup.margins = [4, 6, 4, 4];

    var logoTitle = logoGroup.add("statictext", undefined, "AE SJE COPY-PASTE PRO");
    logoTitle.alignment = ["center", "center"];
    try {
        logoTitle.graphics.font = ScriptUI.newFont("Arial Black", ScriptUI.FontStyle.BOLD, 18);
    } catch (e) {
        try { logoTitle.graphics.font = ScriptUI.newFont("Arial", ScriptUI.FontStyle.BOLD, 18); } catch (e2) { }
    }
    try {
        logoTitle.graphics.foregroundColor = logoTitle.graphics.newPen(
            logoTitle.graphics.PenType.SOLID_COLOR, [1, 0.75, 0.1], 1
        );
    } catch (e) { }

    var logoSub = logoGroup.add("statictext", undefined, "v2.0  \u2014  Motion & Preset Manager");
    logoSub.alignment = ["center", "center"];
    try {
        logoSub.graphics.font = ScriptUI.newFont("Arial", ScriptUI.FontStyle.REGULAR, 9);
    } catch (e) { }
    try {
        logoSub.graphics.foregroundColor = logoSub.graphics.newPen(
            logoSub.graphics.PenType.SOLID_COLOR, [0.65, 0.65, 0.65], 1
        );
    } catch (e) { }

    var expiryDisplay = getLicenseExpiryDisplay();
    if (expiryDisplay) {
        var logoExpiry = logoGroup.add("statictext", undefined, expiryDisplay);
        logoExpiry.alignment = ["center", "center"];
        try {
            logoExpiry.graphics.font = ScriptUI.newFont("Arial", ScriptUI.FontStyle.REGULAR, 9);
        } catch (e) { }
        try {
            logoExpiry.graphics.foregroundColor = logoExpiry.graphics.newPen(
                logoExpiry.graphics.PenType.SOLID_COLOR, [0.5, 0.85, 0.55], 1
            );
        } catch (e) { }
    }

    // 구분선
    var divider = win.add("panel", undefined, "");
    divider.alignment = ["fill", "top"];
    divider.preferredSize.height = 2;
    divider.margins = [0, 0, 0, 0];

    // 📂 파일 경로 표시
    var pathPanel = win.add("panel", undefined, "📂 현재 파일");
    pathPanel.alignment = ["fill", "top"];
    pathPanel.margins = 10;

    var pathText = pathPanel.add("statictext", undefined, "[파일 없음]");
    pathText.alignment = ["fill", "center"];
    pathText.characters = 35;

    // 🔧 파일 관리 버튼
    var filePanel = win.add("panel", undefined, "파일 관리");
    filePanel.alignment = ["fill", "top"];
    filePanel.margins = 10;

    var fileRow = filePanel.add("group");
    fileRow.alignment = ["fill", "top"];
    fileRow.spacing = 5;

    var btnSaveAs = fileRow.add("button", undefined, "📁 저장 위치");
    btnSaveAs.preferredSize = [85, 26];

    var btnSave = fileRow.add("button", undefined, "💾 저장");
    btnSave.preferredSize = [65, 26];

    var btnLoad = fileRow.add("button", undefined, "📂 불러오기");
    btnLoad.preferredSize = [85, 26];

    // 🔄 프로젝트 연결 버튼
    var syncPanel = win.add("panel", undefined, "프로젝트 연결");
    syncPanel.alignment = ["fill", "top"];
    syncPanel.margins = 10;

    var syncRow = syncPanel.add("group");
    syncRow.alignment = ["fill", "top"];
    syncRow.spacing = 5;

    var btnSync = syncRow.add("button", undefined, "🔄 프로젝트 인식 & 로드");
    btnSync.preferredSize = [140, 26];

    var btnNotice = syncRow.add("button", undefined, "📢 필독");
    btnNotice.preferredSize = [60, 26];

    var btnHelp = syncRow.add("button", undefined, "?");
    btnHelp.preferredSize = [26, 26];

    // 🔓 라이선스 해제 버튼
    var licensePanel = win.add("panel", undefined, "라이선스 관리");
    licensePanel.alignment = ["fill", "top"];
    licensePanel.margins = 10;

    var licenseRow = licensePanel.add("group");
    licenseRow.alignment = ["fill", "top"];
    licenseRow.spacing = 5;

    var btnDeactivate = licenseRow.add("button", undefined, "🔓 라이선스 해제");
    btnDeactivate.preferredSize = [200, 26];
    btnDeactivate.helpTip = "다른 PC로 이동하기 전에 클릭하세요";


    // ============================================
    // 버튼 이벤트
    // ============================================

    btnSync.onClick = function () {
        var lastFile = loadConfig(false);
        if (lastFile) {
            saveFile = lastFile;
            pathText.text = decodeURI(lastFile.name);
            restoreSlots();
            var result = reconnectAllSlots();
        } else {
            alert("로드할 파일이 없습니다.\n'저장 위치' 또는 '불러오기'로 파일을 지정해주세요.");
        }
    };

    btnNotice.onClick = function () {
        var noticeText = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
            "⚠️ 구매 전 필독\n" +
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            "✅ 테스트 완료 버전\n" +
            "Adobe After Effects 2024, 2025\n\n" +
            "⚠️ 호환성 안내\n" +
            "본 제품은 After Effects 2024, 2025에서 \n" +
            "테스트되었습니다. \n\n" +
            "Adobe의 향후 업데이트로 인해 발생하는 \n" +
            "호환성 문제는 환불 대상이 아니지만, \n" +
            "가능한 범위 내에서 업데이트를 제공합니다.\n\n" +
            "🔄 업데이트 정책\n" +
            "주요 버전 업데이트 시 무료 패치를 제공하기 위해 \n" +
            "노력하나, 이는 의무 사항이 아닙니다.\n\n" +
            "📦 환불 정책\n" +
            "제품 구매 후 7일 이내에 기술적 결함이 \n" +
            "발견된 경우에만 환불이 가능합니다.\n\n" +
            "본 제품을 구매하시면 위 내용에 \n" +
            "동의하신 것으로 간주됩니다.\n" +
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
        alert(noticeText);
    };

    btnHelp.onClick = function () {
        var helpText =
            "═══════════════════════════════════════\n" +
            "            AE SJE Copy-Paste Pro v2.0\n" +
            "═══════════════════════════════════════\n" +
            "               © 2026 Created by SJE\n" +
            "═══════════════════════════════════════\n\n" +

            "【 자동 로드가 안 될 때 】\n\n" +
            "스크립트가 에펙보다 먼저 켜져서 프로젝트를 못 찾을 수 있습니다.\n\n" +
            "👉 [🔄 프로젝트 인식 & 로드] 버튼을 누르세요!\n\n" +

            "═══════════════════════════════════════\n\n" +

            "【 기본 사용법 】\n\n" +
            "▶ Copy: 슬롯에 저장\n" +
            "▶ Paste: 모션/프리셋 적용\n" +
            "   (플레이헤드가 마커 앞이면 알림 후 자동 이동)\n\n" +

            "▶ ✏️: 슬롯 표시 이름 변경\n" +
            "▶ Reset: 선택한 레이어의 효과 제거 및 초기화\n" +
            "▶ 창 크기 조절: 창 가장자리를 드래그\n\n";

        alert(helpText);
    };

    btnSaveAs.onClick = function () {
        var file = File.saveDialog("저장 위치 선택", "JSON 파일:*.json");
        if (file) {
            saveFile = file;
            pathText.text = decodeURI(file.name);
            saveSlots();
        }
    };

    btnSave.onClick = function () {
        if (saveFile) {
            saveSlots();
            alert("저장되었습니다.");
        } else {
            alert("저장할 파일이 없습니다.\n'저장 위치' 버튼으로 먼저 파일을 지정해주세요.");
        }
    };

    btnLoad.onClick = function () {
        var file = File.openDialog("슬롯 파일 선택", "JSON 파일:*.json");
        if (file) {
            saveFile = file;
            pathText.text = decodeURI(file.name);
            saveConfig();
            restoreSlots();
        }
    };

    btnDeactivate.onClick = function () {
        if (!authFile.exists) {
            alert("❌ 라이선스 해제 실패\n\n이 PC에 활성화된 라이선스가 없습니다.");
            return;
        }

        var confirmMsg =
            "⚠️ 라이선스 해제 확인\n\n" +
            "정말로 이 PC에서 라이선스를 해제하시겠습니까?\n\n" +
            "※ 해제하면 다른 PC에서 이 라이선스를 사용할 수 있습니다.\n" +
            "※ 이 PC에서 다시 사용하려면 라이선스 키를 다시 입력해야 합니다.";

        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            authFile.encoding = "UTF-8";
            authFile.open("r");
            var content = authFile.read();
            authFile.close();

            var licenseData = JSON.parse(content);
            var hwid = getHardwareID();

            var encodedPw = licenseData.p;
            var password = "";
            for (var i = 0; i < encodedPw.length; i += 2) {
                var hexChar = encodedPw.substr(i, 2);
                password += String.fromCharCode(parseInt(hexChar, 16));
            }

            var result = deactivateLicenseOnServer(password, hwid);

            if (result.status === "deactivated") {
                authFile.remove();
                alert(
                    "✅ 라이선스 해제 완료!\n\n" +
                    "이제 다른 PC에서 이 라이선스 키를 사용할 수 있습니다.\n\n" +
                    "※ 이 PC에서 다시 사용하려면 스크립트를 재실행하여 라이선스 키를 입력하세요."
                );
            } else if (result.status === "offline" || result.status === "error") {
                alert(
                    "❌ 서버 연결 실패\n\n" +
                    result.message + "\n\n" +
                    "※ 인터넷 연결을 확인하고 다시 시도해주세요."
                );
            } else if (result.status === "not_found") {
                alert("❌ 라이선스 정보를 찾을 수 없습니다.\n서버에 등록된 정보가 없습니다.");
            } else {
                alert("❌ 알 수 없는 오류가 발생했습니다.\n나중에 다시 시도해주세요.");
            }
        } catch (e) {
            alert("❌ 오류 발생: " + e.toString());
        }
    };

    // ============================================
    // 슬롯 영역 (수정된 스크롤 구조)
    // ============================================
    var slotPanel = win.add("panel", undefined, "슬롯");
    slotPanel.alignment = ["fill", "fill"];
    slotPanel.margins = 8;
    slotPanel.orientation = "column";

    // ── 상단 버튼 그룹 (Add Slot, Remove Slot & Reset) ──
    var topBtnGroup = slotPanel.add("group");
    topBtnGroup.alignment = ["fill", "top"];
    topBtnGroup.spacing = 8;

    var btnAddSlot = topBtnGroup.add("button", undefined, "+ Add Slot");
    btnAddSlot.preferredSize = [90, 26];

    var btnRemoveSlot = topBtnGroup.add("button", undefined, "- Remove Slot");
    btnRemoveSlot.preferredSize = [90, 26];

    slotCountText = topBtnGroup.add("statictext", undefined, "(" + slots.length + ")");
    slotCountText.preferredSize = [40, 22];

    topBtnGroup.add("statictext", undefined, "").preferredSize = [10, -1];

    var btnReset = topBtnGroup.add("button", undefined, "🔄 Reset");
    btnReset.preferredSize = [90, 26];
    btnReset.alignment = ["right", "center"];

    // ── [변경됨] 스크롤 가능한 구조 생성 ──
    var SLOT_HEIGHT = 30;    // 슬롯 1개 높이
    var SLOT_SPACING = 5;    // 슬롯 간격
    var VISIBLE_COUNT = 10;  // 보이는 슬롯 개수
    var VISIBLE_HEIGHT = VISIBLE_COUNT * (SLOT_HEIGHT + SLOT_SPACING) - SLOT_SPACING; // 마지막 간격 제외 약 345px

    var listGroup = slotPanel.add("group");
    listGroup.orientation = "row";
    listGroup.alignment = ["fill", "top"];
    listGroup.alignChildren = ["left", "top"];

    // 1. 마스크 그룹 (stack으로 해야 내부 객체가 y좌표 이동 시 clip됨)
    var maskGroup = listGroup.add("group");
    maskGroup.orientation = "stack";
    maskGroup.alignment = ["fill", "top"];
    maskGroup.alignChildren = ["left", "top"];
    maskGroup.preferredSize.height = VISIBLE_HEIGHT;
    maskGroup.maximumSize.height = VISIBLE_HEIGHT;

    // 2. 내부 컨텐츠 그룹 (Y좌표 이동함)
    var slotContainer = maskGroup.add("group");
    slotContainer.orientation = "column";
    slotContainer.spacing = SLOT_SPACING;
    slotContainer.alignment = ["fill", "top"];
    slotContainer.margins = 0;

    // 3. 우측 스크롤바 (항상 노출, 11개부터 활성화)
    var sbar = listGroup.add("scrollbar", undefined, 0, 0, 0);
    sbar.alignment = ["right", "fill"];
    sbar.preferredSize.width = 20; // 30에서 20으로 조절
    sbar.enabled = false;

    // 스크롤 동기화 변수 및 함수
    // 스크롤바 수치에 따라 내부 컨테이너의 y 위치를 음수로 즉각 갱신
    var isScrolling = false;
    function syncScroll(value) {
        if (isScrolling) return;
        isScrolling = true;
        slotContainer.location = [0, -value];
        isScrolling = false;
    }

    sbar.onChanging = function () { syncScroll(this.value); };
    sbar.onChange = function () { syncScroll(this.value); };

    // 마우스 휠 스크롤 지원 (윈도우 레벨에서 감지하여 버튼 차단 우회)
    var isOverSlots = false;
    slotPanel.addEventListener("mouseover", function (e) { isOverSlots = true; });
    slotPanel.addEventListener("mouseout", function (e) { isOverSlots = false; });

    win.addEventListener("mousewheel", function (e) {
        if (isOverSlots && sbar.enabled) {
            // 휠 방향에 따라 값 조절
            sbar.value -= (e.delta * sbar.stepdelta);
            syncScroll(sbar.value);
            e.preventDefault();
        }
    });

    win.addEventListener("keydown", function (e) {
        if (e.keyName === "Up" && sbar.enabled) {
            sbar.value -= sbar.stepdelta;
            syncScroll(sbar.value);
            e.preventDefault();
        } else if (e.keyName === "Down" && sbar.enabled) {
            sbar.value += sbar.stepdelta;
            syncScroll(sbar.value);
            e.preventDefault();
        }
    });

    // 스크롤 업데이트 함수 (슬롯 추가/삭제시 호출)
    function updateScroll() {
        // 레이아웃이 정확히 계산되도록 먼저 초기화
        slotContainer.location = [0, 0];
        win.layout.layout(true); // 높이 계산 트리거

        // layout 직후에 실제 할당된 사이즈 사용 (마진 등의 오차를 없앰)
        var maskHeight = maskGroup.size.height || VISIBLE_HEIGHT;
        var totalHeight = slotContainer.size.height;

        // 아이템이 없거나 측정 실패 시 기존 식으로 대체
        if (totalHeight === 0 && slots.length > 0) {
            totalHeight = (slots.length * (SLOT_HEIGHT + SLOT_SPACING)) - SLOT_SPACING;
        }

        var maxScroll = totalHeight - maskHeight;

        if (maxScroll > 0) {
            sbar.enabled = true;
            sbar.minvalue = 0;
            sbar.maxvalue = maxScroll;
            sbar.stepdelta = 10; // 35에서 10으로 축소 (더 미세하게 이동)
            sbar.jumpdelta = VISIBLE_HEIGHT;

            if (sbar.value > maxScroll) sbar.value = maxScroll;
        } else {
            sbar.enabled = false;
            sbar.value = 0;
        }

        // 위치 반영
        syncScroll(sbar.value);
    }

    // ============================================
    // 슬롯 생성 함수
    // ============================================
    function createSlot() {
        var slotIndex = slots.length;
        // 이제 slotContainer는 스크롤되는 내부 그룹임
        var group = slotContainer.add("group");
        group.orientation = "row";
        group.alignment = ["fill", "top"];
        group.preferredSize.height = SLOT_HEIGHT;

        var label = group.add("statictext", undefined, "Slot " + (slotIndex + 1) + ":");
        label.characters = 6;

        var btnCopy = group.add("button", undefined, "Copy");
        btnCopy.preferredSize = [42, 22];

        var btnPaste = group.add("button", undefined, "Paste");
        btnPaste.preferredSize = [42, 22];

        var btnRename = group.add("button", undefined, "✏️");
        btnRename.preferredSize = [24, 22];

        var btnClear = group.add("button", undefined, "X");
        btnClear.preferredSize = [22, 22];

        var typeText = group.add("statictext", undefined, "");
        typeText.characters = 7;

        var nameText = group.add("statictext", undefined, "[Empty]");
        nameText.characters = 15;

        var slotObj = {
            group: group,
            label: label,
            typeText: typeText,
            nameText: nameText,
            layer: null,
            savedData: null,
            displayName: ""
        };
        slots.push(slotObj);

        btnCopy.onClick = function () {
            var comp = app.project.activeItem;
            if (comp && comp.selectedLayers.length > 0) {
                var layer = comp.selectedLayers[0];

                slotObj.layer = layer;

                var typeLabel = getLayerTypeLabel(layer);
                var compName = layer.containingComp.name;

                slotObj.displayName = "";
                slotObj.savedData = {
                    compName: compName,
                    layerName: layer.name,
                    layerType: typeLabel,
                    displayName: ""
                };

                slotObj.typeText.text = typeLabel;
                slotObj.nameText.text = "✓ " + layer.name;
                slotObj.nameText.helpTip = "Comp: " + compName + "\nLayer: " + layer.name;

                applyTextColor(slotObj.typeText, getTypeColor(typeLabel));
                applyTextColor(slotObj.nameText, [0.9, 0.9, 0.9]);

                saveSlots();
            }
        };

        btnRename.onClick = function () {
            if (!slotObj.layer && !slotObj.savedData) {
                alert("슬롯이 비어있습니다.\n먼저 Copy로 레이어를 저장해주세요.");
                return;
            }

            var currentDisplay = getSlotDisplayText(slotObj);
            var newName = prompt("슬롯 표시 이름 변경\n\n현재: " + currentDisplay + "\n\n새 이름을 입력하세요:\n(빈칸 입력 시 레이어 원래 이름으로 복원)", currentDisplay);

            if (newName === null) return;

            slotObj.displayName = newName;
            if (slotObj.savedData) {
                slotObj.savedData.displayName = newName;
            }

            var showName = getSlotDisplayText(slotObj);

            if (slotObj.layer) {
                try {
                    var testName = slotObj.layer.name;
                    slotObj.nameText.text = "✓ " + showName;
                    slotObj.nameText.helpTip = "표시명: " + showName + "\nComp: " + slotObj.savedData.compName + "\nLayer: " + slotObj.layer.name;
                    applyTextColor(slotObj.nameText, [0.9, 0.9, 0.9]);
                } catch (e) {
                    slotObj.nameText.text = "⚠ " + showName;
                    applyTextColor(slotObj.nameText, [1, 0.6, 0.3]);
                }
            } else {
                slotObj.nameText.text = "⚠ " + showName;
                slotObj.nameText.helpTip = "❌ 레이어를 찾을 수 없음\n\n표시명: " + showName + "\nComp: " + slotObj.savedData.compName + "\nLayer: " + slotObj.savedData.layerName;
                applyTextColor(slotObj.nameText, [1, 0.6, 0.3]);
            }

            saveSlots();
        };

        btnClear.onClick = function () {
            var idx = -1;
            for (var i = 0; i < slots.length; i++) {
                if (slots[i] === slotObj) { idx = i; break; }
            }
            if (idx >= 0) {
                slotContainer.remove(group);
                slots.splice(idx, 1);
                updateSlotNumbers();
                updateScroll(); // 스크롤 갱신
                saveSlots();
            }
        };

        btnPaste.onClick = function () {
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) {
                alert("컴포지션을 선택해주세요.");
                return;
            }

            var savedLayer = slotObj.layer;
            var targetLayers = comp.selectedLayers;

            if (!savedLayer) {
                alert("저장된 레이어 없음\n\n⚠ 표시된 슬롯은 프로젝트를 열고\n'🔄 프로젝트 인식 & 로드' 버튼을 눌러주세요.");
                return;
            }
            if (targetLayers.length === 0) { alert("대상 레이어 선택 필요"); return; }

            try {
                var testName = savedLayer.name;
            } catch (e) {
                alert("소스 레이어가 더 이상 존재하지 않습니다.\n다시 Copy해주세요.");
                slotObj.layer = null;
                if (slotObj.savedData) {
                    var showName = getSlotDisplayText(slotObj);
                    slotObj.nameText.text = "⚠ " + showName;
                    applyTextColor(slotObj.nameText, [1, 0.6, 0.3]);
                }
                return;
            }

            if (savedLayer instanceof TextLayer) {
                for (var idx = 0; idx < targetLayers.length; idx++) {
                    if (!(targetLayers[idx] instanceof TextLayer)) {
                        alert("텍스트 레이어의 효과는 텍스트 레이어에만 붙여넣을 수 있습니다.");
                        return;
                    }
                }
            }

            var srcComp = savedLayer.containingComp;
            var srcInPoint = savedLayer.inPoint;

            var srcMarkers = savedLayer.property("ADBE Marker");
            if (srcMarkers && srcMarkers.numKeys > 0) {
                var firstSrcMarkerTime = srcMarkers.keyTime(1);
                var firstTarget = targetLayers[0];
                var timeOffset = firstTarget.inPoint - srcInPoint;
                var firstMarkerTimeInTarget = firstSrcMarkerTime + timeOffset;

                if (comp.time < firstMarkerTimeInTarget) {
                    var oneFrame = comp.frameDuration;
                    comp.time = firstMarkerTimeInTarget + oneFrame;
                }
            }

            app.beginUndoGroup("Paste Motion & Markers");

            try {
                var srcTransform = savedLayer.property("ADBE Transform Group");
                var srcPosProp = srcTransform.property("ADBE Position");
                var srcScaleProp = srcTransform.property("ADBE Scale");

                var srcCurrentPos = srcPosProp.value;
                var srcCurrentScale = srcScaleProp.value;

                var targetInfos = [];
                for (var i = 0; i < targetLayers.length; i++) {
                    var target = targetLayers[i];
                    var tgtTransform = target.property("ADBE Transform Group");
                    var tgtIsAV = !(target instanceof TextLayer) && !(target instanceof ShapeLayer) && !target.nullLayer && !(target instanceof CameraLayer) && !(target instanceof LightLayer) && (target.source != null);

                    // 🛡️ 자식 레이어 수집 (이 레이어를 parent로 가진 레이어들)
                    var childIndices = [];
                    for (var c = 1; c <= comp.numLayers; c++) {
                        if (comp.layer(c).parent === target) {
                            childIndices.push(c);
                        }
                    }

                    targetInfos.push({
                        layer: target,
                        name: target.name,
                        index: target.index,
                        pos: tgtTransform.property("ADBE Position").value,
                        scale: tgtTransform.property("ADBE Scale").value,
                        anchorPoint: tgtTransform.property("ADBE Anchor Point").value,
                        isText: target instanceof TextLayer,
                        isShape: target instanceof ShapeLayer,
                        isAV: tgtIsAV,
                        source: tgtIsAV ? target.source : null,
                        textDoc: (target instanceof TextLayer) ?
                            target.property("ADBE Text Properties").property("Source Text").value : null,
                        inPoint: target.inPoint,
                        startTime: target.startTime,
                        outPoint: target.outPoint,
                        parent: target.parent,
                        childIndices: childIndices,
                        label: target.label
                    });
                }

                for (var i = 0; i < targetInfos.length; i++) {
                    var info = targetInfos[i];
                    var target = info.layer;

                    var tgtCurrentPos = info.pos;
                    var tgtCurrentScale = info.scale;
                    var tgtAnchorPoint = info.anchorPoint;

                    var savedIsAV = !(savedLayer instanceof TextLayer) && !(savedLayer instanceof ShapeLayer) && !savedLayer.nullLayer && !(savedLayer instanceof CameraLayer) && !(savedLayer instanceof LightLayer) && (savedLayer.source != null);
                    var isSameType = (savedLayer instanceof TextLayer && info.isText) ||
                        (savedLayer instanceof ShapeLayer && info.isShape) ||
                        (savedIsAV && info.isAV);

                    if (isSameType) {
                        var newLayer = copyLayerToCompAsTemp(savedLayer, comp);

                        if (!newLayer) {
                            alert("레이어 복사 실패");
                            continue;
                        }

                        newLayer.moveBefore(target);
                        newLayer.name = info.name;
                        newLayer.startTime = info.startTime;
                        newLayer.inPoint = info.inPoint;
                        newLayer.outPoint = info.outPoint;
                        newLayer.label = info.label; // 🛡️ 라벨 컬러 유지

                        var apProp = newLayer.property("ADBE Transform Group").property("ADBE Anchor Point");
                        if (apProp.numKeys === 0) {
                            apProp.setValue(tgtAnchorPoint);
                        }

                        if (savedLayer instanceof TextLayer && info.textDoc) {
                            newLayer.property("ADBE Text Properties").property("Source Text").setValue(info.textDoc);
                        }
                        else if (savedLayer instanceof ShapeLayer) {
                            swapShapeContents(newLayer, target);
                        }
                        else if (info.isAV && info.source) {
                            try { newLayer.replaceSource(info.source, false); } catch (e) { }
                        }

                        var newTransform = newLayer.property("ADBE Transform Group");
                        var posOffset = [tgtCurrentPos[0] - srcCurrentPos[0], tgtCurrentPos[1] - srcCurrentPos[1]];
                        if (tgtCurrentPos.length > 2) posOffset.push(tgtCurrentPos[2] - srcCurrentPos[2]);

                        var scaleRatio = [tgtCurrentScale[0] / (srcCurrentScale[0] || 1), tgtCurrentScale[1] / (srcCurrentScale[1] || 1)];
                        if (tgtCurrentScale.length > 2) scaleRatio.push(tgtCurrentScale[2] / (srcCurrentScale[2] || 1));

                        applyPositionOffset(newTransform.property("ADBE Position"), posOffset);
                        applyScaleRatio(newTransform.property("ADBE Scale"), scaleRatio);

                        // 🛡️ 부모 복구
                        try { if (info.parent) newLayer.parent = info.parent; } catch (e) { }

                        // 🛡️ 자식 레이어들 재연결
                        try {
                            for (var ci = 0; ci < info.childIndices.length; ci++) {
                                var childLayer = comp.layer(info.childIndices[ci]);
                                if (childLayer && childLayer !== newLayer) {
                                    childLayer.parent = newLayer;
                                }
                            }
                        } catch (e) { }

                        target.remove();
                    }
                    else {
                        var newLayer = target.duplicate();
                        newLayer.moveBefore(target);
                        newLayer.name = info.name;
                        newLayer.startTime = info.startTime;
                        newLayer.inPoint = info.inPoint;
                        newLayer.outPoint = info.outPoint;
                        newLayer.label = info.label; // 🛡️ 라벨 컬러 유지

                        var newTransform = newLayer.property("ADBE Transform Group");
                        var tempSourceLayer = copyLayerToCompAsTemp(savedLayer, comp);

                        if (tempSourceLayer) {
                            newLayer.threeDLayer = tempSourceLayer.threeDLayer;

                            var srcPos = tempSourceLayer.property("ADBE Transform Group").property("ADBE Position");
                            var tgtPos = newTransform.property("ADBE Position");
                            if (srcPos && tgtPos) {
                                if (srcPos.dimensionsSeparated && !tgtPos.dimensionsSeparated) {
                                    tgtPos.dimensionsSeparated = true;
                                } else if (!srcPos.dimensionsSeparated && tgtPos.dimensionsSeparated) {
                                    tgtPos.dimensionsSeparated = false;
                                }
                            }

                            copyEffectsWithExpressions(tempSourceLayer, newLayer);
                            copyLayerStyles(tempSourceLayer, newLayer);

                            var timeOffset = info.inPoint - srcInPoint;
                            var tempTransform = tempSourceLayer.property("ADBE Transform Group");

                            for (var p = 1; p <= tempTransform.numProperties; p++) {
                                var srcProp = tempTransform.property(p);
                                var matchName = srcProp.matchName;
                                var tgtProp = newTransform.property(matchName);

                                if (!tgtProp) continue;

                                if (matchName === "ADBE Anchor Point") {
                                    if (srcProp.numKeys > 0) {
                                        copyPropertyDeepWithTimeOffset(srcProp, tgtProp, timeOffset);
                                    }
                                    if (srcProp.canSetExpression && srcProp.expression !== "") {
                                        try {
                                            tgtProp.expression = srcProp.expression;
                                            tgtProp.expressionEnabled = srcProp.expressionEnabled;
                                        } catch (e) { }
                                    }
                                } else {
                                    copyPropertyDeepWithTimeOffset(srcProp, tgtProp, timeOffset);
                                }
                            }

                            copyMarkersWithTimeOffsetDirect(tempSourceLayer, newLayer, timeOffset);
                            tempSourceLayer.remove();
                        }

                        var posOffset = [tgtCurrentPos[0] - srcCurrentPos[0], tgtCurrentPos[1] - srcCurrentPos[1]];
                        if (tgtCurrentPos.length > 2) posOffset.push(tgtCurrentPos[2] - srcCurrentPos[2]);

                        var scaleRatio = [tgtCurrentScale[0] / (srcCurrentScale[0] || 1), tgtCurrentScale[1] / (srcCurrentScale[1] || 1)];
                        if (tgtCurrentScale.length > 2) scaleRatio.push(tgtCurrentScale[2] / (srcCurrentScale[2] || 1));

                        applyPositionOffset(newTransform.property("ADBE Position"), posOffset);
                        applyScaleRatio(newTransform.property("ADBE Scale"), scaleRatio);

                        // 🛡️ 부모 복구
                        try { if (info.parent) newLayer.parent = info.parent; } catch (e) { }

                        // 🛡️ 자식 레이어들 재연결
                        try {
                            for (var ci = 0; ci < info.childIndices.length; ci++) {
                                var childLayer = comp.layer(info.childIndices[ci]);
                                if (childLayer && childLayer !== newLayer) {
                                    childLayer.parent = newLayer;
                                }
                            }
                        } catch (e) { }

                        target.remove();
                    }
                }

                comp.openInViewer();

            } catch (err) {
                alert("오류: " + err.toString() + "\nLine: " + err.line);
            }
            app.endUndoGroup();
        };
    }

    // ── 초기 슬롯 13개 생성 ──
    for (var i = 0; i < 13; i++) {
        createSlot();
    }
    updateSlotNumbers(); // 초기 생성 후 갯수 표시 갱신
    // 초기 생성 후 스크롤 상태 업데이트
    updateScroll();

    // ============================================
    // 버튼 이벤트: Add Slot & Reset
    // ============================================

    btnAddSlot.onClick = function () {
        createSlot();
        updateSlotNumbers(); // 갯수 표시 갱신
        win.layout.layout(true);
        updateScroll(); // 추가 후 스크롤 갱신
        saveSlots();
    };

    btnRemoveSlot.onClick = function () {
        if (slots.length > 1) {
            var lastSlot = slots.pop();
            if (lastSlot && lastSlot.group) {
                slotContainer.remove(lastSlot.group);
            }
            updateSlotNumbers(); // 갯수 표시 갱신
            win.layout.layout(true);
            updateScroll(); // 삭제 후 스크롤 갱신
            saveSlots();
        } else {
            alert("최소 1개의 슬롯은 유지해야 합니다.");
        }
    };

    btnReset.onClick = function () {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("컴포지션을 선택해주세요.");
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("레이어를 선택해주세요.");
            return;
        }

        var layerRefs = [];
        for (var i = 0; i < selectedLayers.length; i++) {
            layerRefs.push(selectedLayers[i]);
        }

        var earliestMarkerTime = null;

        for (var i = 0; i < layerRefs.length; i++) {
            var markers = layerRefs[i].property("ADBE Marker");
            if (markers && markers.numKeys > 0) {
                var markerTime = markers.keyTime(1);
                if (earliestMarkerTime === null || markerTime < earliestMarkerTime) {
                    earliestMarkerTime = markerTime;
                }
            }
        }

        if (earliestMarkerTime !== null) {
            var oneFrame = comp.frameDuration;
            comp.time = earliestMarkerTime + oneFrame;
        }

        app.beginUndoGroup("Reset Layers (Clean)");

        try {
            var successCount = 0;
            var failCount = 0;

            for (var i = 0; i < layerRefs.length; i++) {
                var result = resetLayerClean(layerRefs[i]);
                if (result) {
                    successCount++;
                } else {
                    failCount++;
                }
            }

            if (failCount > 0) {
                alert("완료: " + successCount + "개 성공, " + failCount + "개 실패");
            }

        } catch (err) {
            alert("오류 발생: " + err.toString() + "\nLine: " + err.line);
        }

        app.endUndoGroup();
    };

    // ============================================
    // 🔄 리사이즈 이벤트
    // ============================================
    win.onResizing = win.onResize = function () {
        this.layout.resize();
        updateScroll();
    };

    // ============================================
    // 시작 시 config 로드
    // ============================================
    var lastFile = loadConfig(false);
    if (lastFile) {
        saveFile = lastFile;
        pathText.text = decodeURI(lastFile.name);
        restoreSlots();
    }

    // 데이터가 아예 없는 경우에만 최소 1개 생성
    if (slots.length === 0) {
        createSlot();
    }

    updateSlotNumbers();
    win.layout.layout(true);
    updateScroll();

    if (win instanceof Window) {
        win.preferredSize = [380, 600];
        win.minimumSize = [380, 600];
        win.maximumSize = [380, 600];
        win.center();
        win.show();
    } else {
        // 패널 모드에서도 스크롤 너비나 기본적인 크기는 유지
        win.minimumSize = [380, win.size[1]];
    }
})(this);