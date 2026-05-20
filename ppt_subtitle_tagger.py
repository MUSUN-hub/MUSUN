import tkinter as tk
from tkinter import filedialog, ttk, messagebox
import threading
import os
import re
import unicodedata
import queue
import json
import urllib.request
import urllib.parse
import socket
import sys
import ctypes
import platform
from difflib import SequenceMatcher

# ── 라이선스 서버 ─────────────────────────────────────────
LICENSE_SERVER_URL = "https://script.google.com/macros/s/AKfycbwJLdZV5U0dZOl6lgBebpWbZLIyl1MJYZytD9e8E-AvJkN46l44UIRaPl1iO79o87ux/exec"
LICENSE_PATH = os.path.join(os.environ.get("APPDATA", ""), "PPTTools", "license.key")

_UXP_LICENSE_PATHS = [
    os.path.join(os.environ.get("APPDATA", ""), "Adobe", "UXP", "PluginsStorage", "PPRO", "26",
                 "Developer", "com.sje.pr.edit.pro", "PluginData", "SJE_PR_EDIT_PRO", "license.key"),
    os.path.join(os.environ.get("APPDATA", ""), "Adobe", "UXP", "PluginsStorage", "PPRO", "25",
                 "Developer", "com.sje.pr.edit.pro", "PluginData", "SJE_PR_EDIT_PRO", "license.key"),
]

_SYS_FONT = "Apple SD Gothic Neo" if platform.system() == "Darwin" else "Malgun Gothic"

BG_DEEP    = "#0e0e12"
BG_CARD    = "#16161d"
BG_INPUT   = "#1e1e28"
BG_BORDER  = "#2a2a38"
ACCENT     = "#c9a85c"
ACCENT_DIM = "#8a7040"
FG_PRIMARY = "#e8e6e0"
FG_MUTED   = "#7a7870"
FG_LOG     = "#9db8a0"

try:
    from pptx import Presentation
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False


# ══════════════════════════════════════════════════════════
# 라이선스
# ══════════════════════════════════════════════════════════

def _api(params: dict):
    url = LICENSE_SERVER_URL + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"status": "error", "message": str(e)}

def _load_uxp_license():
    for p in _UXP_LICENSE_PATHS:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return None

def load_local_license():
    if os.path.exists(LICENSE_PATH):
        try:
            with open(LICENSE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def save_local_license(data: dict):
    os.makedirs(os.path.dirname(LICENSE_PATH), exist_ok=True)
    with open(LICENSE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f)

def generate_hwid():
    uxp_device_paths = [
        os.path.join(os.environ.get("APPDATA", ""), "Adobe", "UXP", "PluginsStorage", "PPRO", "26",
                     "Developer", "com.sje.pr.edit.pro", "PluginData", "SJE_PR_EDIT_PRO", "device.id"),
        os.path.join(os.environ.get("APPDATA", ""), "Adobe", "UXP", "PluginsStorage", "PPRO", "25",
                     "Developer", "com.sje.pr.edit.pro", "PluginData", "SJE_PR_EDIT_PRO", "device.id"),
    ]
    for p in uxp_device_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    uid = f.read().strip()
                if uid and len(uid) > 10:
                    return uid
            except Exception:
                pass
    try:
        import subprocess
        r = subprocess.check_output(
            "wmic csproduct get UUID", shell=True).decode().strip().split()
        return r[-1] if r else socket.gethostname()
    except Exception:
        return socket.gethostname()

def get_expiry_display(expiry_date, plan):
    if not expiry_date:
        return ""
    try:
        from datetime import date
        exp = date.fromisoformat(expiry_date[:10])
        diff = (exp - date.today()).days
        label = "월간 구독" if plan == "subscription" else "체험판"
        if diff < 0:
            return f"✕ {label} — 만료됨 ({expiry_date[:10]})"
        elif diff <= 7:
            return f"⚠ {label} — 만료 {diff}일 전 ({expiry_date[:10]})"
        else:
            return f"△ {label} — 만로 {diff}일 전 ({expiry_date[:10]})"
    except Exception:
        return ""


class LicenseInfo:
    def __init__(self):
        self.expiry_date = ""
        self.plan = ""
        self.license_info = ""
        self.remaining = 0


def check_license() -> LicenseInfo:
    info = LicenseInfo()
    hwid = generate_hwid()

    uxp = _load_uxp_license()
    if uxp and uxp.get("key"):
        r = _api({"action": "check_subscription", "key": uxp["key"], "hwid": hwid})
        if r.get("status") == "active":
            info.expiry_date = r.get("expiry_date", "")
            info.plan = "subscription"
            save_local_license({"key": uxp["key"], "hwid": hwid,
                                 "expiry_date": info.expiry_date, "plan": "subscription"})
            return info

    local = load_local_license()
    if local and local.get("key"):
        r = _api({"action": "check_subscription", "key": local["key"], "hwid": hwid})
        if r.get("status") == "active":
            info.expiry_date = r.get("expiry_date", "")
            info.plan = "subscription"
            save_local_license({"key": local["key"], "hwid": hwid,
                                 "expiry_date": info.expiry_date, "plan": "subscription"})
            return info

    if local and local.get("email"):
        r = _api({"action": "trial_check", "hwid": hwid, "email": local["email"]})
        if r.get("status") == "active":
            remaining = r.get("days_remaining", 0)
            info.remaining = remaining
            info.plan = "trial"
            info.license_info = f"체험판  |  남은 기간: {remaining}일"
            return info
        elif r.get("status") == "expired":
            info.license_info = "체험판 만료"
            return info

    return None  # 인증 필요


# ══════════════════════════════════════════════════════════
# 라이선스 다이얼로그
# ══════════════════════════════════════════════════════════

class LicenseDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("SJE PPT Subtitle Tagger — 라이선스 인증")
        self.configure(bg=BG_DEEP)
        self.geometry("460x320")
        self.resizable(False, False)
        self.result = None
        self._hwid = generate_hwid()
        self._email = ""
        self._build()
        self.grab_set()

    def _lbl(self, parent, text, fg=FG_PRIMARY, size=10, bold=False):
        f = (_SYS_FONT, size, "bold") if bold else (_SYS_FONT, size)
        tk.Label(parent, text=text, bg=BG_DEEP, fg=fg, font=f).pack(anchor="w", pady=(0, 4))

    def _entry(self, parent):
        e = tk.Entry(parent, bg=BG_INPUT, fg=FG_PRIMARY, insertbackground=ACCENT,
                     relief="flat", font=(_SYS_FONT, 10), bd=0)
        e.pack(fill="x", ipady=7, pady=(0, 12))
        return e

    def _btn(self, parent, text, cmd, accent=False):
        bg = ACCENT if accent else BG_BORDER
        fg = BG_DEEP if accent else FG_PRIMARY
        b = tk.Button(parent, text=text, command=cmd, bg=bg, fg=fg,
                      relief="flat", font=(_SYS_FONT, 10, "bold"),
                      activebackground=ACCENT_DIM, cursor="hand2", padx=16, pady=8)
        b.pack(fill="x", pady=(0, 8))
        return b

    def _build(self):
        self._frame = tk.Frame(self, bg=BG_DEEP, padx=32, pady=24)
        self._frame.pack(fill="both", expand=True)
        self._show_start()

    def _clear(self):
        for w in self._frame.winfo_children():
            w.destroy()

    def _show_start(self):
        self._clear()
        self._lbl(self._frame, "SJE PPT Subtitle Tagger", size=13, bold=True, fg=ACCENT)
        self._lbl(self._frame, "라이선스 키 또는 이메일로 인증하세요.", fg=FG_MUTED)
        tk.Frame(self._frame, bg=BG_BORDER, height=1).pack(fill="x", pady=12)
        self._lbl(self._frame, "라이선스 키")
        self._key_entry = self._entry(self._frame)
        self._btn(self._frame, "키로 인증", self._check_key, accent=True)
        tk.Frame(self._frame, bg=BG_BORDER, height=1).pack(fill="x", pady=4)
        self._btn(self._frame, "이메일로 체험판 인증", self._show_email_step)

    def _check_key(self):
        key = self._key_entry.get().strip()
        if not key:
            return messagebox.showwarning("!", "키를 입력하세요.", parent=self)
        r = _api({"action": "check_subscription", "key": key, "hwid": self._hwid})
        if r.get("status") == "active":
            save_local_license({"key": key, "hwid": self._hwid,
                                 "expiry_date": r.get("expiry_date", ""), "plan": "subscription"})
            self.result = LicenseInfo()
            self.result.expiry_date = r.get("expiry_date", "")
            self.result.plan = "subscription"
            self.destroy()
        else:
            messagebox.showerror("오류", r.get("message", "인증 실패"), parent=self)

    def _show_email_step(self):
        self._clear()
        self._lbl(self._frame, "이메일 입력", size=12, bold=True, fg=ACCENT)
        self._lbl(self._frame, "체험판 인증 코드를 이메일로 발송합니다.", fg=FG_MUTED)
        tk.Frame(self._frame, bg=BG_BORDER, height=1).pack(fill="x", pady=12)
        self._lbl(self._frame, "이메일")
        self._email_entry = self._entry(self._frame)
        self._btn(self._frame, "인증 코드 발송", self._send_code, accent=True)
        self._btn(self._frame, "뒤로", self._show_start)

    def _send_code(self):
        email = self._email_entry.get().strip()
        if not email:
            return messagebox.showwarning("!", "이메일을 입력하세요.", parent=self)
        self._email = email
        r = _api({"action": "trial_request_code", "email": email, "hwid": self._hwid})
        if r.get("status") in ("ok", "sent"):
            self._show_code_step()
        else:
            messagebox.showerror("오류", r.get("message", "발송 실패"), parent=self)

    def _show_code_step(self):
        self._clear()
        self._lbl(self._frame, "인증 코드 입력", size=12, bold=True, fg=ACCENT)
        self._lbl(self._frame, f"{self._email} 으로 발송된 코드를 입력하세요.", fg=FG_MUTED)
        tk.Frame(self._frame, bg=BG_BORDER, height=1).pack(fill="x", pady=12)
        self._lbl(self._frame, "인증 코드")
        self._code_entry = self._entry(self._frame)
        self._btn(self._frame, "확인", self._verify_code, accent=True)
        self._btn(self._frame, "뒤로", self._show_email_step)

    def _verify_code(self):
        code = self._code_entry.get().strip()
        if not code:
            return messagebox.showwarning("!", "코드를 입력하세요.", parent=self)
        r = _api({"action": "trial_verify_code", "email": self._email,
                  "hwid": self._hwid, "code": code})
        if r.get("status") == "active":
            save_local_license({"email": self._email, "hwid": self._hwid, "plan": "trial"})
            self.result = LicenseInfo()
            self.result.plan = "trial"
            self.result.remaining = r.get("days_remaining", 0)
            self.result.license_info = f"체험판  |  남은 기간: {self.result.remaining}일"
            self.destroy()
        else:
            messagebox.showerror("오류", r.get("message", "인증 실패"), parent=self)


# ══════════════════════════════════════════════════════════
# 헬퍼 위젯
# ══════════════════════════════════════════════════════════

def _make_card(parent, title):
    outer = tk.Frame(parent, bg=BG_DEEP, pady=0)
    outer.pack(fill="x", pady=(0, 14))
    hdr = tk.Frame(outer, bg=BG_DEEP)
    hdr.pack(fill="x", pady=(0, 6))
    tk.Label(hdr, text="▎", font=(_SYS_FONT, 11), fg=ACCENT, bg=BG_DEEP).pack(side="left")
    tk.Label(hdr, text=title, font=(_SYS_FONT, 10), fg=FG_PRIMARY, bg=BG_DEEP).pack(side="left", padx=(4, 0))
    inner = tk.Frame(outer, bg=BG_CARD, highlightbackground=BG_BORDER, highlightthickness=1, padx=16, pady=14)
    inner.pack(fill="x")
    return inner

def _make_entry(parent, **kw):
    return tk.Entry(parent, bg=BG_INPUT, fg=FG_PRIMARY, insertbackground=ACCENT,
                    relief="flat", font=(_SYS_FONT, 10), bd=0, **kw)

def _make_btn(parent, text, cmd, pady=8, font=None, accent=True):
    bg = ACCENT if accent else BG_BORDER
    fg = BG_DEEP if accent else FG_PRIMARY
    f = font or (_SYS_FONT, 10, "bold")
    return tk.Button(parent, text=text, command=cmd, bg=bg, fg=fg,
                     relief="flat", font=f, activebackground=ACCENT_DIM,
                     activeforeground=FG_PRIMARY, cursor="hand2", pady=pady)


# ══════════════════════════════════════════════════════════
# 메인 탭 — 자막 해시태그 삽입
# ══════════════════════════════════════════════════════════

class TaggerTab(tk.Frame):
    TAG_PATTERN = re.compile(r'\[Slide\s*\d+\](\[[^\]]*\])?\s*|#\s*\d+(?:\s*-\s*\d+)?\s*')
    SPACE_PATTERN = re.compile(r'[\s​﻿]+')

    def __init__(self, parent):
        super().__init__(parent, bg=BG_DEEP)
        self.last_directory = os.path.expanduser("~")
        self.ui_queue = queue.Queue()
        self._slides_cache = None  # PPT 데이터 분석 결과 캐시
        self._angle_cache = {}
        self._ppt_cache_path = ""
        self._build()
        self._poll()

    def _poll(self):
        try:
            while True:
                self.ui_queue.get_nowait()()
        except queue.Empty:
            pass
        self.after(50, self._poll)

    def _build(self):
        main = tk.Frame(self, bg=BG_DEEP, padx=24, pady=18)
        main.pack(fill="both", expand=True)

        hdr = tk.Frame(main, bg=BG_DEEP)
        hdr.pack(fill="x", pady=(0, 18))
        tk.Label(hdr, text="자막 해시태그 삽입", font=(_SYS_FONT, 13, "bold"),
                 fg=ACCENT, bg=BG_DEEP).pack(side="left")
        help_btn = tk.Button(hdr, text="?", command=self._show_help,
                             bg=BG_BORDER, fg=FG_MUTED, relief="flat",
                             font=(_SYS_FONT, 9), padx=8, pady=2, cursor="hand2")
        help_btn.pack(side="right")

        # 파일 선택
        c1 = _make_card(main, "파일 선택")
        c1.columnconfigure(1, weight=1)
        self.entry_sub = self._file_row(c1, "자막 파일", 0, self._browse_sub)
        self.entry_ppt = self._file_row(c1, "PPT 파일", 1, self._browse_ppt)

        # 인식 키워드
        c2 = _make_card(main, "인식 키워드")
        tk.Label(c2, text="PPT 도형에서 아래 키워드로 시작하는 텍스트를 찾습니다  (쉼표 구분)",
                 bg=BG_CARD, fg=FG_MUTED, font=(_SYS_FONT, 8)).pack(anchor="w", pady=(0, 6))
        self.keyword_var = tk.StringVar(value="SME, 아나운서, 성우, 내레이션")
        _make_entry(c2, textvariable=self.keyword_var).pack(fill="x", ipady=5)

        # 슬라이드 범위
        c3 = _make_card(main, "슬라이드 범위  (비워두면 전체)")
        rr = tk.Frame(c3, bg=BG_CARD)
        rr.pack(anchor="w")
        tk.Label(rr, text="시작", bg=BG_CARD, fg=FG_MUTED, font=(_SYS_FONT, 9)).pack(side="left")
        self.entry_start = _make_entry(rr, width=7)
        self.entry_start.pack(side="left", padx=(6, 16), ipady=4)
        tk.Label(rr, text="끝", bg=BG_CARD, fg=FG_MUTED, font=(_SYS_FONT, 9)).pack(side="left")
        self.entry_end = _make_entry(rr, width=7)
        self.entry_end.pack(side="left", padx=(6, 0), ipady=4)

        # 버튼
        btn_row = tk.Frame(main, bg=BG_DEEP)
        btn_row.pack(fill="x", pady=(0, 12))
        btn1 = _make_btn(btn_row, "PPT 데이터 분석", self._start_analyze, pady=9,
                         font=(_SYS_FONT, 10), accent=False)
        btn1.configure(bg=BG_BORDER, fg=FG_PRIMARY,
                       activebackground=BG_BORDER, activeforeground=ACCENT)
        btn1.bind("<Enter>", lambda e: btn1.config(bg="#3a3a50"))
        btn1.bind("<Leave>", lambda e: btn1.config(bg=BG_BORDER))
        btn1.pack(side="left", expand=True, fill="x", padx=(0, 8))
        btn2 = _make_btn(btn_row, "해시태그 삽입 실행", self._start_process, pady=9)
        btn2.pack(side="left", expand=True, fill="x", padx=(0, 8))
        btn3 = _make_btn(btn_row, "전체 초기화", self._reset, pady=9,
                         font=(_SYS_FONT, 10), accent=False)
        btn3.configure(bg=BG_BORDER, fg=FG_MUTED,
                       activebackground=BG_BORDER, activeforeground=FG_PRIMARY)
        btn3.bind("<Enter>", lambda e: btn3.config(bg="#3a3a50"))
        btn3.bind("<Leave>", lambda e: btn3.config(bg=BG_BORDER))
        btn3.pack(side="left", fill="x", padx=(0, 0))

        # 로그
        log_hdr = tk.Frame(main, bg=BG_DEEP)
        log_hdr.pack(fill="x", pady=(0, 6))
        tk.Label(log_hdr, text="▎", font=(_SYS_FONT, 11), fg=ACCENT, bg=BG_DEEP).pack(side="left")
        tk.Label(log_hdr, text="진행 로그", font=(_SYS_FONT, 10), fg=FG_PRIMARY, bg=BG_DEEP).pack(side="left", padx=(4, 0))

        log_card = tk.Frame(main, bg=BG_CARD, highlightbackground=BG_BORDER, highlightthickness=1)
        log_card.pack(fill="both", expand=True)
        self.log_text = tk.Text(log_card, font=(_SYS_FONT, 9), bg=BG_CARD, fg=FG_LOG,
                                relief="flat", padx=14, pady=10, state="disabled",
                                insertbackground=ACCENT, selectbackground=ACCENT_DIM, wrap="word")
        sc = tk.Scrollbar(log_card, orient="vertical", command=self.log_text.yview,
                          bg=BG_CARD, troughcolor=BG_CARD, relief="flat")
        self.log_text.configure(yscrollcommand=sc.set)
        sc.pack(side="right", fill="y")
        self.log_text.pack(fill="both", expand=True)

    def _file_row(self, master, label, row, cmd):
        tk.Label(master, text=label, bg=BG_CARD, fg=FG_MUTED,
                 font=(_SYS_FONT, 9), width=8, anchor="w").grid(row=row, column=0, sticky="w", pady=4)
        entry = _make_entry(master)
        entry.grid(row=row, column=1, padx=(8, 8), sticky="ew", ipady=5)
        btn = _make_btn(master, "열기", cmd, pady=4, font=(_SYS_FONT, 9, "bold"))
        btn.grid(row=row, column=2)
        master.columnconfigure(1, weight=1)
        return entry

    def _browse_sub(self):
        f = filedialog.askopenfilename(initialdir=self.last_directory,
                                       filetypes=[("Subtitle", "*.srt *.vtt")])
        if f:
            self.last_directory = os.path.dirname(f)
            self.entry_sub.delete(0, tk.END)
            self.entry_sub.insert(0, f)

    def _browse_ppt(self):
        f = filedialog.askopenfilename(initialdir=self.last_directory,
                                       filetypes=[("PowerPoint", "*.pptx *.ppt")])
        if f:
            self.last_directory = os.path.dirname(f)
            self.entry_ppt.delete(0, tk.END)
            self.entry_ppt.insert(0, f)
            # PPT 바뀌면 캐시 무효화
            self._slides_cache = None
            self._angle_cache = {}
            self._ppt_cache_path = ""

    def log(self, msg):
        self.ui_queue.put(lambda m=msg: self._log_write(m))

    def _log_write(self, msg):
        self.log_text.config(state="normal")
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state="disabled")

    def _log_clear(self):
        self.log_text.config(state="normal")
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state="disabled")

    def _reset(self):
        self.entry_sub.delete(0, tk.END)
        self.entry_ppt.delete(0, tk.END)
        self.keyword_var.set("SME, 아나운서, 성우, 내레이션")
        self.entry_start.delete(0, tk.END)
        self.entry_end.delete(0, tk.END)
        self._slides_cache = None
        self._angle_cache = {}
        self._ppt_cache_path = ""
        self._log_clear()

    def _show_help(self):
        messagebox.showinfo("사용법",
            "【 SJE PPT Subtitle Tagger 사용법 】\n\n"
            "━━ 기본 순서 ━━\n"
            "1. 자막 파일(SRT/VTT)을 선택합니다.\n"
            "2. 분석할 PPT 파일(.pptx)을 선택합니다.\n"
            "3. [PPT 데이터 분석] 버튼으로 슬라이드·해시태그 목록을 확인합니다.\n"
            "4. [해시태그 삽입 실행]을 누르면 자막에 태그가 삽입된\n"
            "   _tagged 파일과 마커 JSON/XML이 같은 폴더에 저장됩니다.\n\n"
            "━━ 인식 키워드 ━━\n"
            "PPT 도형 텍스트 중 해당 키워드로 시작하는 도형을\n"
            "강사 슬라이드로 인식합니다. 쉼표로 여러 개 입력 가능.\n"
            "기본값: SME, 아나운서, 성우, 내레이션\n\n"
            "━━ 슬라이드 범위 ━━\n"
            "시작/끝을 입력하면 해당 범위만 처리합니다.\n"
            "비워두면 전체 슬라이드를 대상으로 합니다.\n\n"
            "━━ 출력 파일 ━━\n"
            "· 자막_tagged.srt  — 해시태그·[Slide N]·앵글 태그가 삽입된 자막\n"
            "· 자막_마커.json   — PR Edit Pro CEP 마커 불러오기용\n"
            "· 자막_마커.xml    — Premiere Pro FCP XML 마커 가져오기용\n\n"
            "━━ 앵글 자동 적용 ━━\n"
            "PPT에서 인식 키워드 도형의 가로 위치를 기준으로\n"
            "강사 앵글(정면/좌측/우측)을 자동 판단합니다.\n"
            "  · 도형 중심이 슬라이드 폭의 38% 미만 → 좌측\n"
            "  · 도형 중심이 슬라이드 폭의 62% 초과 → 우측\n"
            "  · 그 외 → 정면\n\n"
            "━━ mapping.json ━━\n"
            "실행 파일과 같은 폴더에 mapping.json을 두면\n"
            "영어→한글 변환 매핑을 커스터마이즈할 수 있습니다.\n"
            "예: {\"figma\": \"피그마\", \"prototype\": \"프로토타입\"}"
        )

    def _get_keywords(self):
        return [k.strip().lower() for k in self.keyword_var.get().split(",") if k.strip()]

    def _get_range(self):
        s_v = self.entry_start.get().strip()
        e_v = self.entry_end.get().strip()
        return (int(s_v) if s_v.isdigit() else None,
                int(e_v) if e_v.isdigit() else None)

    def _load_mapping_json(self):
        default = {'figma': '피그마', 'figjam': '피그잼', 'dev': '데브', 'draw': '드로우',
                   'design': '디자인', 'prototype': '프로토타입', 'component': '컴포넌트'}
        try:
            base = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
            p = os.path.join(base, "mapping.json")
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.log(f"✅ mapping.json 로드 완료 ({len(data)}개)")
                return data
        except Exception as e:
            self.log(f"⚠️ mapping.json 로드 실패: {e}")
        return default

    # ── PPT 파싱 ──────────────────────────────────────────

    def _calc_angle(self, shape, slide_width_emu):
        try:
            pct = (shape.left + shape.width / 2) / slide_width_emu * 100
            if pct < 38:   return "좌측", pct
            elif pct > 62: return "우측", pct
            else:          return "정면", pct
        except Exception:
            return "정면", 50.0

    def _scan_shapes_for_angle(self, shapes, keywords, slide_width_emu):
        for shape in shapes:
            try:
                if not (hasattr(shape, "has_text_frame") and shape.has_text_frame):
                    continue
                text = unicodedata.normalize('NFC', shape.text_frame.text or "").strip().lower()
                if any(text.startswith(kw) for kw in keywords):
                    return self._calc_angle(shape, slide_width_emu)
            except Exception:
                continue
        return None

    def _get_slide_angle(self, slide, keywords, slide_width_emu):
        # 레이아웃 → 마스터 순으로 탐색
        try:
            r = self._scan_shapes_for_angle(slide.slide_layout.shapes, keywords, slide_width_emu)
            if r: return r
        except Exception:
            pass
        try:
            r = self._scan_shapes_for_angle(slide.slide_layout.slide_master.shapes, keywords, slide_width_emu)
            if r: return r
        except Exception:
            pass
        return "정면", 50.0

    def _get_sme_slides(self, ppt_path, start, end):
        try:
            prs = Presentation(ppt_path)
            keywords = self._get_keywords()
            slide_width_emu = prs.slide_width
            data = []
            for i, slide in enumerate(prs.slides, 1):
                if (start and i < start) or (end and i > end):
                    continue
                for shape in slide.shapes:
                    if not (hasattr(shape, "has_text_frame") and shape.has_text_frame):
                        continue
                    text = unicodedata.normalize('NFC', shape.text_frame.text or "")
                    text_lower = text.strip().lower()
                    if not any(text_lower.startswith(kw) for kw in keywords):
                        continue
                    # 마스터/레이아웃에서 앵글 계산
                    angle, pct = self._get_slide_angle(slide, keywords, slide_width_emu)
                    content = text.strip()
                    for kw in keywords:
                        if content.lower().startswith(kw):
                            content = content[len(kw):].strip()
                            break
                    merged = []
                    intro_txt = re.split(r'#', content, 1)[0].strip()
                    if len(intro_txt) >= 2:
                        merged.append((None, " ", intro_txt))
                    raw_tags = list(re.finditer(r'(#\s*\d{1,2}(?:\s*-\s*\d{1,2})?)', content))
                    if raw_tags:
                        current_tags = []
                        for m in raw_tags:
                            tag = m.group(1).replace(" ", "")
                            rem = content[m.end():]
                            search_idx = 0
                            while search_idx < len(rem):
                                m_sp = self.SPACE_PATTERN.match(rem[search_idx:])
                                if m_sp:
                                    search_idx += m_sp.end()
                                if search_idx < len(rem) and rem[search_idx] == '#':
                                    m_tag = re.match(r'#\s*\d{1,2}(?:\s*-\s*\d{1,2})?', rem[search_idx:])
                                    if m_tag:
                                        search_idx += m_tag.end()
                                        continue
                                break
                            wm = re.search(r'[^#\n]+', rem[search_idx:])
                            if wm:
                                phrase = wm.group(0).strip()
                                clean = re.sub(r'[\*\_\~\:\(\)\[\]]', ' ', phrase).strip()
                                words = clean.split()
                                word = " ".join(words[:2]) if len(words) >= 2 else clean
                                current_tags.append({'tag': tag, 'word': word})
                        if current_tags:
                            tt, tw = current_tags[0]['tag'], current_tags[0]['word']
                            for nx in current_tags[1:]:
                                if nx['word'] == tw:
                                    tt += " " + nx['tag']
                                else:
                                    merged.append((tt, " ", tw))
                                    tt, tw = nx['tag'], nx['word']
                            merged.append((tt, " ", tw))
                    if merged:
                        data.append({'slide': i, 'hashtags': merged, 'angle': angle, 'pct': round(pct, 1)})
                        break
            return data
        except Exception as e:
            self.log(f"❌ PPT 읽기 오류: {e}")
            return []

    # ── PPT 데이터 분석 버튼 ──────────────────────────────

    def _start_analyze(self):
        threading.Thread(target=self._analyze, daemon=True).start()

    def _analyze(self):
        ppt_p = self.entry_ppt.get()
        if not ppt_p:
            self.ui_queue.put(lambda: messagebox.showwarning("!", "PPT 파일을 선택하세요."))
            return
        self.ui_queue.put(self._log_clear)
        keywords = self._get_keywords()
        self.log(f"🔍 인식 키워드: {', '.join(keywords)}")
        self.log("-" * 40)
        s, e = self._get_range()
        slides = self._get_sme_slides(ppt_p, s, e)
        # 캐시 저장
        self._slides_cache = slides
        self._ppt_cache_path = ppt_p
        if not slides:
            self.log("⚠️ 인식된 슬라이드가 없습니다.")
        else:
            for sd in slides:
                angle_str = f" [{sd['angle']}]" if sd.get('angle') else ""
                self.log(f"[슬라이드 {sd['slide']}]{angle_str}")
                for t, _, w in sd['hashtags']:
                    self.log(f"  - {t if t else '[INTRO]'} {w}")
        self.log("-" * 40)
        self.log(f"✅ 분석 완료 — {len(slides)}개 슬라이드 / 이제 '해시태그 삽입 실행' 하세요.")

    # ── 해시태그 삽입 실행 버튼 ──────────────────────────

    def _start_process(self):
        threading.Thread(target=self._process, daemon=True).start()

    def _process(self):
        sub_p = self.entry_sub.get()
        ppt_p = self.entry_ppt.get()
        if not sub_p or not ppt_p:
            self.ui_queue.put(lambda: messagebox.showwarning("!", "파일을 선택하세요."))
            return

        self.ui_queue.put(self._log_clear)
        ENG_HAN_MAP = self._load_mapping_json()
        keywords = self._get_keywords()
        self.log(f"🔍 인식 키워드: {', '.join(keywords)}")
        self.log("-" * 40)

        # 캐시된 분석 결과 사용, 없으면 새로 분석
        if self._slides_cache is not None and self._ppt_cache_path == ppt_p:
            self.log("📋 캐시된 PPT 분석 데이터 사용")
            slides_data = self._slides_cache
        else:
            self.log("🔄 PPT 분석 중...")
            s, e = self._get_range()
            slides_data = self._get_sme_slides(ppt_p, s, e)
            self._slides_cache = slides_data
            self._ppt_cache_path = ppt_p

        try:
            with open(sub_p, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except UnicodeDecodeError:
            with open(sub_p, "r", encoding="cp949") as f:
                lines = f.readlines()

        clean_lines = []
        for line in lines:
            ls = line.strip()
            if not ls or "-->" in ls or ls.isdigit():
                clean_lines.append(line)
            else:
                clean_lines.append(self.TAG_PATTERN.sub('', ls).strip() + "\n")

        last_match_idx = 0
        total = 0
        consecutive_skips = 0
        markers = []

        self.log("🚀 해시태그 삽입 시작...")

        for slide_idx, s in enumerate(slides_data):
            slide_num = s['slide']
            angle_info = s.get('angle', "")
            tags_list = s['hashtags']
            num_tags = len([t for t, _, w in tags_list if t])

            next_boundary = self._estimate_boundary(slides_data, slide_idx, clean_lines,
                                                     last_match_idx, ENG_HAN_MAP, num_tags)
            first_tag_idx = None
            for tag, _, word in tags_list:
                if tag:
                    targets = self._build_targets(word, tag, ENG_HAN_MAP)
                    idx = self._find_in_range(last_match_idx, next_boundary, clean_lines, targets)
                    if idx is None:
                        idx = self._find_in_range(last_match_idx, next_boundary, clean_lines, targets, 0.80)
                    if idx is None and consecutive_skips >= 2:
                        rb = max(0, last_match_idx - 50)
                        idx = self._find_in_range(rb, len(clean_lines), clean_lines, targets, 0.80)
                        if idx is not None:
                            self.log(f"  ↩️ Slide {slide_num} 롤백 탐색 성공")
                    if idx is not None:
                        first_tag_idx = idx
                        break

            if first_tag_idx is None:
                self.log(f"⚠️ Slide {slide_num} 스킵: 기준 태그 매칭 실패")
                consecutive_skips += 1
                continue

            consecutive_skips = 0
            current_idx = last_match_idx
            slide_tag_done = False

            for tag, _, word in tags_list:
                targets = self._build_targets(word, tag, ENG_HAN_MAP)
                search_end = first_tag_idx if not tag else next_boundary
                matched = self._find_in_range(current_idx, search_end, clean_lines, targets)
                if matched is None:
                    matched = self._find_in_range(current_idx, search_end, clean_lines, targets, 0.70)

                if matched is not None:
                    self._insert_tag(clean_lines, matched, tag, word, slide_num, angle_info, not slide_tag_done)
                    if not slide_tag_done:
                        slide_tag_done = True
                        for back in range(matched - 1, max(matched - 5, -1), -1):
                            if "-->" in lines[back]:
                                tc = lines[back].split("-->")[0].strip().replace(",", ".")
                                angle_label = angle_info if angle_info else "정면"
                                mname = f"[Slide {slide_num}], [{angle_label}], [{tag}]" if tag else f"[Slide {slide_num}], [{angle_label}]"
                                markers.append((tc, mname))
                                break
                    current_idx = matched
                    total += 1
                else:
                    self.log(f"⚠️ Slide {slide_num} {tag or '[INTRO]'} '{word}' 미발견")

            last_match_idx = current_idx

        base_name, ext = os.path.splitext(sub_p)
        out = base_name + "_tagged" + ext
        try:
            with open(out, "w", encoding="utf-8-sig") as f:
                f.writelines(clean_lines)
            self.log("-" * 40)
            self.log(f"✅ 작업 완료: 총 {total}개 삽입")
            self.log(f"💾 저장: {os.path.basename(out)}")
        except Exception as e:
            self.log(f"❌ 저장 실패: {e}")
            self.ui_queue.put(lambda: messagebox.showerror("오류", str(e)))
            return

        # 마커 JSON 저장 (CEP addMarkersFromJson용)
        marker_json_out = base_name + "_마커.json"
        try:
            marker_list = [{"tc": tc, "name": name} for tc, name in markers]
            with open(marker_json_out, "w", encoding="utf-8") as f:
                json.dump(marker_list, f, ensure_ascii=False, indent=2)
            self.log(f"📌 마커 JSON: {os.path.basename(marker_json_out)} ({len(markers)}개)")
        except Exception as e:
            self.log(f"⚠️ 마커 JSON 저장 실패: {e}")

        self.ui_queue.put(lambda: messagebox.showinfo("완료",
            f"총 {total}개 삽입 완료\n저장: {out}\n마커 JSON: {marker_json_out}"))

    # ── 검색/삽입 헬퍼 ───────────────────────────────────

    def _build_targets(self, word, tag, eng_han_map):
        wl = word.lower().strip()
        targets = [wl]
        if not tag:
            cw = re.sub(r'[^a-zA-Z0-9가-힣\s]', ' ', wl).strip()
            sw = cw.split()[:4]
            if sw: targets.append(" ".join(sw))
            if len(wl) > 15:
                targets.append(wl[:15].strip())
                targets.append(re.sub(r'\s+', '', wl[:15]))
        for eng, han in eng_han_map.items():
            if eng in wl:
                th = wl.replace(eng, han).strip()
                targets.append(th)
                if " " in th:
                    fw = th.split()[0]
                    if len(re.sub(r'[^\w]', '', fw)) >= 4:
                        targets.append(fw)
                targets.append(re.sub(r'\s+', '', th))
        combined = wl
        for eng, han in eng_han_map.items():
            if eng in combined:
                combined = combined.replace(eng, han)
        if combined != wl and combined not in targets:
            targets.append(combined)
        if " " in wl:
            fw = wl.split()[0]
            if len(re.sub(r'[^\w]', '', fw)) >= 2:
                targets.append(fw)
        return list(dict.fromkeys(targets))

    def _find_match_pos(self, line_text, targets, threshold=0.82):
        line = line_text.strip()
        if not line or "-->" in line or line.isdigit():
            return -1
        ll = line.lower()
        for t in targets:
            pos = ll.find(t.lower())
            if pos >= 0:
                return pos
        best_pos = -1
        max_ratio = 0.0
        for t in targets:
            tc = re.sub(r'[\*\_\~\:\(\)\[\]]', '', t)
            tokens = tc.split()
            tf = ' '.join(tokens[:2]) if len(tokens) >= 2 else tc
            tp = re.sub(r'[\s​﻿,.?!]', '', tf).lower()
            if len(tp) < 2:
                continue
            ws = len(tp)
            for i in range(len(ll) - ws + 1):
                wp = re.sub(r'[\s​﻿,.?!]', '', ll[i:i+ws])
                ratio = SequenceMatcher(None, tp, wp).ratio()
                if ratio > max_ratio and ratio >= threshold:
                    max_ratio = ratio
                    best_pos = i
        if best_pos == -1:
            words = ll.split()
            ci = 0
            for w in words:
                wp = re.sub(r'[^\w]', '', w)
                for t in targets:
                    tp = re.sub(r'[^\w]', '', t).lower()
                    if len(wp) >= 2 and SequenceMatcher(None, tp, wp).ratio() >= threshold * 0.97:
                        return ll.find(w, ci)
                ci = ll.find(w, ci) + len(w)
        return best_pos

    def _check_match(self, line_text, targets, threshold=0.82):
        return self._find_match_pos(line_text, targets, threshold) >= 0

    def _find_in_range(self, start, end, lines, targets, threshold=0.82):
        for i in range(start, min(end, len(lines))):
            line = lines[i]
            if not line.strip() or "-->" in line or line.strip().isdigit():
                continue
            if self._check_match(line, targets, threshold):
                return i
        return None

    def _insert_tag(self, lines, idx, tag, word, slide_num, angle_info, is_first):
        pure = lines[idx].strip()
        prefix = ""
        if is_first:
            angle_tag = f"[{angle_info}]" if angle_info else ""
            prefix = f"[Slide {slide_num}]{angle_tag} "
        pos = self._find_match_pos(pure, [word.lower().strip()])
        if pos >= 0:
            pre = pure[:pos]
            sep = " " if pre and not pre.endswith(" ") else ""
            new_line = f"{pre}{sep}{tag} {pure[pos:]}".replace("  ", " ").strip()
        else:
            new_line = f"{tag} {pure}".strip() if tag else pure
        if prefix:
            new_line = f"{prefix}{new_line}"
        lines[idx] = new_line + "\n"

    def _estimate_boundary(self, slides_data, slide_idx, clean_lines, last_match_idx, eng_han_map, num_tags):
        if slide_idx + 1 >= len(slides_data):
            return len(clean_lines)
        min_adv = max(40, min(num_tags * 10, 80))
        bss = last_match_idx + min_adv
        ns = slides_data[slide_idx + 1]
        for tag, _, word in ns['hashtags']:
            if tag:
                targets = self._build_targets(word, tag, eng_han_map)
                idx = self._find_in_range(bss, len(clean_lines), clean_lines, targets, 0.95)
                if idx is not None:
                    return idx
        return len(clean_lines)


# ══════════════════════════════════════════════════════════
# 메인 앱
# ══════════════════════════════════════════════════════════

class MainApp:
    def __init__(self, root, lic: LicenseInfo):
        self.root = root
        self.root.title("SJE PPT Subtitle Tagger")
        self.root.geometry("900x760")
        self.root.configure(bg=BG_DEEP)
        self.root.resizable(True, True)

        style = ttk.Style()
        style.theme_use("default")
        style.configure("TCombobox", fieldbackground=BG_INPUT, background=BG_INPUT,
                        foreground=FG_PRIMARY, selectbackground=ACCENT_DIM,
                        arrowcolor=ACCENT, borderwidth=0, relief="flat")
        style.map("TCombobox", fieldbackground=[("readonly", BG_INPUT)],
                  foreground=[("readonly", FG_PRIMARY)])

        # 상단 바
        topbar = tk.Frame(self.root, bg=BG_CARD, highlightbackground=BG_BORDER, highlightthickness=1)
        topbar.pack(fill="x")
        tk.Label(topbar, text="SJE PPT Subtitle Tagger  v1.0",
                 bg=BG_CARD, fg=FG_MUTED, font=(_SYS_FONT, 8)).pack(side="left", padx=16, pady=6)

        expiry_text = get_expiry_display(lic.expiry_date, lic.plan) if lic else ""
        if not expiry_text and lic:
            expiry_text = lic.license_info
        if expiry_text:
            fg = "#e06060" if "✕" in expiry_text else \
                 "#e0a030" if "⚠" in expiry_text or "△" in expiry_text else FG_MUTED
            tk.Label(topbar, text=expiry_text, bg=BG_CARD, fg=fg,
                     font=(_SYS_FONT, 8)).pack(side="right", padx=16, pady=6)

        TaggerTab(self.root).pack(fill="both", expand=True)


# ══════════════════════════════════════════════════════════
# 진입점
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    root = tk.Tk()
    root.withdraw()

    lic = check_license()
    if lic is None:
        dlg = LicenseDialog(root)
        root.wait_window(dlg)
        lic = dlg.result
        if lic is None:
            root.destroy()
            sys.exit(0)

    root.deiconify()
    MainApp(root, lic)
    root.mainloop()
