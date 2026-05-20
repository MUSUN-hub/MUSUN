// SJE CEP Bridge — CEP 패널 메인
// 임시 폴더를 폴링해서 명령 파일(.jsx)을 실행하고 결과(.json)를 씁니다.

var cs = new CSInterface();
var fs = require("fs");
var path = require("path");
var os = require("os");

var TEMP_DIR = path.join(os.tmpdir(), "sje-cep-bridge");
var POLL_MS  = 200;
var running  = false;
var pollTimer = null;

// ---------- UI ----------
function setStatus(text, cls) {
    var el = document.getElementById("status");
    el.textContent = text;
    el.className = cls || "waiting";
}

function log(msg, cls) {
    var el = document.getElementById("log");
    var div = document.createElement("div");
    div.className = cls || "";
    div.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    while (el.children.length > 150) el.removeChild(el.firstChild);
}

// ---------- 파일 IPC ----------
function ensureDir(dir) {
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { log("디렉터리 생성 실패: " + e.message, "err"); }
}

function listCmdFiles() {
    try {
        if (!fs.existsSync(TEMP_DIR)) return [];
        return fs.readdirSync(TEMP_DIR)
            .filter(function (f) { return f.indexOf("cmd_") === 0 && f.slice(-4) === ".jsx"; })
            .sort();
    } catch (e) { return []; }
}

function processCommands() {
    var files = listCmdFiles();
    for (var i = 0; i < files.length; i++) {
        processOne(files[i]);
    }
}

function processOne(fileName) {
    var cmdPath = path.join(TEMP_DIR, fileName);
    var script;
    try { script = fs.readFileSync(cmdPath, "utf-8"); }
    catch (e) { return; }

    var id = fileName.replace("cmd_", "").replace(".jsx", "");
    var resPath = path.join(TEMP_DIR, "res_" + id + ".json");

    // 즉시 삭제해서 중복 처리 방지
    try { fs.unlinkSync(cmdPath); } catch (e) {}

    log("RX: " + fileName, "cmd");

    cs.evalScript(script, function (result) {
        var response;
        try {
            JSON.parse(result); // 유효한 JSON인지 확인
            response = result;
            log("OK: " + fileName, "ok");
        } catch (e) {
            if (result && result.indexOf("Error") === 0) {
                response = JSON.stringify({ ok: false, error: result });
                log("ERR: " + result, "err");
            } else {
                response = JSON.stringify({ ok: true, data: result || null });
                log("OK (raw): " + fileName, "ok");
            }
        }
        try { fs.writeFileSync(resPath, response, "utf-8"); }
        catch (e) { log("결과 쓰기 실패: " + e.message, "err"); }
    });
}

// ---------- 시작/정지 ----------
function start() {
    if (running) return;
    ensureDir(TEMP_DIR);
    running = true;
    setStatus("Connected (polling)", "connected");
    log("브리지 시작: " + TEMP_DIR, "ok");

    cs.evalScript("app.version", function (v) {
        if (v && v !== "undefined") log("Premiere Pro " + v, "ok");
        else log("Premiere Pro 버전 확인 실패", "err");
    });

    pollTimer = setInterval(function () {
        if (running) processCommands();
    }, POLL_MS);
}

function stop() {
    if (!running) return;
    running = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    setStatus("Disconnected", "disconnected");
    log("브리지 중지됨", "err");
}

// ---------- 버튼 ----------
document.getElementById("connectBtn").addEventListener("click", function () {
    if (running) stop();
    setTimeout(start, 100);
});
document.getElementById("stopBtn").addEventListener("click", stop);

// ---------- 초기 상태: 자동 시작 없음 ----------
(function init() {
    log("SJE CEP Bridge 로드됨 — Connect 버튼을 눌러 시작하세요");
    setStatus("Disconnected", "disconnected");
})();
