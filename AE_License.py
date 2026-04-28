"""
Copy-Paste Pro — 라이선스 키 생성기
"""

import tkinter as tk

import hashlib
import datetime
import urllib.request
import urllib.parse
import json
import os

LICENSE_SERVER_URL = "https://script.google.com/macros/s/AKfycbxbWTVGiIEdmylDkq4BXJdsq8EGIEYjqY8ZmQyNmfxLdCVwkhYUNa8Bb5U3EYgse7aH/exec"
LOG_PATH = os.path.join(os.path.expanduser("~"), "Documents", "CopyPastePro", "license_log.txt")

# ── 컬러 팔레트 ──
BG      = "#0f0f17"
BG2     = "#1a1a28"
BG3     = "#12121e"
ACCENT  = "#c8a84b"
ACCENT2 = "#a07830"
FG      = "#e0e0e0"
FG_DIM  = "#666680"
FG_LOG  = "#888899"
BTN_BG  = "#c8a84b"
BTN_FG  = "#0f0f17"
BORDER  = "#2a2a3a"
BTN2_BG = "#2a2a3a"


def generate_key(prefix: str, user_name: str) -> str:
    now = datetime.date.today()
    raw = f"{user_name}{now.year}{now.month:02d}{now.day:02d}"
    h = int(hashlib.md5(raw.encode()).hexdigest(), 16) % (36 ** 4)
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    hash_str = ""
    n = h
    for _ in range(4):
        hash_str = chars[n % 36] + hash_str
        n //= 36
    return f"{prefix.upper()}{now.year}{now.month:02d}{hash_str}"


def server_request(params: dict) -> dict | None:
    try:
        qs = urllib.parse.urlencode(params)
        url = f"{LICENSE_SERVER_URL}?{qs}"
        req = urllib.request.Request(url, headers={"User-Agent": "CopyPastePro-Generator"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"status": "error", "message": str(e)}


def append_log(text: str):
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"[{ts}] {text}\n")


def load_log() -> str:
    if not os.path.exists(LOG_PATH):
        return ""
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        return f.read()


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Copy-Paste Pro — License Generator")
        self.configure(bg=BG)
        self.resizable(False, False)
        self._build_ui()
        self._load_log()

    # ── 공통 위젯 헬퍼 ──
    def _section_label(self, parent, text):
        f = tk.Frame(parent, bg=BG)
        tk.Frame(f, bg=ACCENT, width=4).pack(side="left", fill="y")
        tk.Label(f, text=f"  {text}", bg=BG, fg=FG,
                 font=("맑은 고딕", 11, "bold")).pack(side="left", pady=2)
        return f

    def _field_label(self, parent, text):
        return tk.Label(parent, text=text, bg=BG2, fg=FG_DIM,
                        font=("맑은 고딕", 9))

    def _entry(self, parent, var, width=28, readonly=False):
        state = "readonly" if readonly else "normal"
        e = tk.Entry(parent, textvariable=var, width=width, state=state,
                     bg=BG3, fg=FG if not readonly else ACCENT,
                     readonlybackground=BG3,
                     insertbackground=FG,
                     relief="flat",
                     font=("맑은 고딕", 10) if not readonly else ("Courier New", 11, "bold"),
                     highlightthickness=1,
                     highlightbackground=BORDER,
                     highlightcolor=ACCENT)
        return e

    def _build_ui(self):
        # ── 타이틀 ──
        title_frame = tk.Frame(self, bg=BG, pady=16)
        title_frame.pack(fill="x")
        tk.Label(title_frame, text="COPY-PASTE PRO", bg=BG, fg=ACCENT,
                 font=("맑은 고딕", 18, "bold")).pack()
        tk.Label(title_frame, text="라이선스 키 생성기", bg=BG, fg=FG_DIM,
                 font=("맑은 고딕", 9)).pack()

        tk.Frame(self, bg=BORDER, height=1).pack(fill="x")

        # ── 사용자 정보 섹션 ──
        sec1 = tk.Frame(self, bg=BG, padx=20, pady=12)
        sec1.pack(fill="x")
        self._section_label(sec1, "사용자 정보").pack(anchor="w", pady=(0, 10))

        frame_in = tk.Frame(sec1, bg=BG2, padx=14, pady=12,
                            highlightthickness=1, highlightbackground=BORDER)
        frame_in.pack(fill="x")

        # 사용자 이름
        self._field_label(frame_in, "사용자 이름").grid(row=0, column=0, sticky="w", pady=(0, 2))
        self.name_var = tk.StringVar()
        self._entry(frame_in, self.name_var, width=32).grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 10))

        # 구독 플랜
        self._field_label(frame_in, "구독 플랜").grid(row=2, column=0, sticky="w", pady=(0, 2))
        self.plan_var = tk.StringVar(value="monthly")
        plan_frame = tk.Frame(frame_in, bg=BG2)
        plan_frame.grid(row=3, column=0, sticky="w", pady=(0, 10))
        tk.Radiobutton(plan_frame, text="월간 (1개월)", variable=self.plan_var, value="monthly",
                       bg=BG2, fg=FG, selectcolor=BG3, activebackground=BG2,
                       font=("맑은 고딕", 9)).pack(side="left", padx=(0, 12))
        tk.Radiobutton(plan_frame, text="연간 (1년)", variable=self.plan_var, value="yearly",
                       bg=BG2, fg=FG, selectcolor=BG3, activebackground=BG2,
                       font=("맑은 고딕", 9)).pack(side="left")

        # 구독 시작일
        self._field_label(frame_in, "구독 시작일").grid(row=2, column=1, sticky="w", padx=(20, 0), pady=(0, 2))
        today = datetime.date.today().strftime("%Y-%m-%d")
        self.start_var = tk.StringVar(value=today)
        start_frame = tk.Frame(frame_in, bg=BG2)
        start_frame.grid(row=3, column=1, sticky="w", padx=(20, 0), pady=(0, 10))
        self._entry(start_frame, self.start_var, width=12).pack(side="left")
        tk.Label(start_frame, text="(YYYY-MM-DD)", bg=BG2, fg=FG_DIM,
                 font=("맑은 고딕", 8)).pack(side="left", padx=(6, 0))

        # 만료일 미리보기
        self.expiry_preview_var = tk.StringVar(value="")
        self._field_label(frame_in, "만료 예정일").grid(row=4, column=0, sticky="w", pady=(0, 2))
        tk.Label(frame_in, textvariable=self.expiry_preview_var, bg=BG2,
                 fg=ACCENT, font=("맑은 고딕", 9)).grid(row=5, column=0, columnspan=2, sticky="w", pady=(0, 4))

        self.plan_var.trace_add("write", lambda *_: self._update_expiry_preview())
        self.start_var.trace_add("write", lambda *_: self._update_expiry_preview())
        self._update_expiry_preview()

        # ── 생성 버튼 ──
        btn_frame = tk.Frame(self, bg=BG, padx=20, pady=4)
        btn_frame.pack(fill="x")
        tk.Button(btn_frame, text="라이선스 키 생성 및 서버 등록",
                  command=self._generate,
                  bg=BTN_BG, fg=BTN_FG,
                  font=("맑은 고딕", 11, "bold"),
                  activebackground=ACCENT2, activeforeground=FG,
                  relief="flat", cursor="hand2",
                  padx=0, pady=10).pack(fill="x")

        # ── 결과 섹션 ──
        sec2 = tk.Frame(self, bg=BG, padx=20, pady=12)
        sec2.pack(fill="x")
        self._section_label(sec2, "생성 결과").pack(anchor="w", pady=(0, 10))

        frame_out = tk.Frame(sec2, bg=BG2, padx=14, pady=12,
                             highlightthickness=1, highlightbackground=BORDER)
        frame_out.pack(fill="x")

        self._field_label(frame_out, "생성된 키").grid(row=0, column=0, sticky="w", pady=(0, 2))
        self.key_var = tk.StringVar()
        key_row = tk.Frame(frame_out, bg=BG2)
        key_row.grid(row=1, column=0, sticky="w", pady=(0, 8))
        self._entry(key_row, self.key_var, width=26, readonly=True).pack(side="left")
        tk.Button(key_row, text="복사", command=self._copy_key,
                  bg=BORDER, fg=FG, relief="flat", cursor="hand2",
                  font=("맑은 고딕", 9), padx=8, pady=4).pack(side="left", padx=(6, 0))

        self._field_label(frame_out, "서버 상태").grid(row=2, column=0, sticky="w", pady=(0, 2))
        self.status_var = tk.StringVar(value="—")
        tk.Label(frame_out, textvariable=self.status_var, bg=BG2,
                 fg=FG_DIM, font=("맑은 고딕", 9)).grid(row=3, column=0, sticky="w")

        tk.Frame(self, bg=BORDER, height=1).pack(fill="x", padx=20)

        # ── 갱신 / 플랜 변경 섹션 ──
        sec_renew = tk.Frame(self, bg=BG, padx=20, pady=12)
        sec_renew.pack(fill="x")
        self._section_label(sec_renew, "갱신 / 플랜 변경").pack(anchor="w", pady=(0, 10))

        frame_renew = tk.Frame(sec_renew, bg=BG2, padx=14, pady=12,
                               highlightthickness=1, highlightbackground=BORDER)
        frame_renew.pack(fill="x")

        # 갱신할 라이선스 키 입력
        self._field_label(frame_renew, "라이선스 키").grid(row=0, column=0, sticky="w", pady=(0, 2))
        self.renew_key_var = tk.StringVar()
        self._entry(frame_renew, self.renew_key_var, width=32).grid(
            row=1, column=0, columnspan=2, sticky="w", pady=(0, 10))

        # 변경할 플랜
        self._field_label(frame_renew, "변경할 플랜").grid(row=2, column=0, sticky="w", pady=(0, 2))
        self.renew_plan_var = tk.StringVar(value="monthly")
        renew_plan_frame = tk.Frame(frame_renew, bg=BG2)
        renew_plan_frame.grid(row=3, column=0, sticky="w", pady=(0, 10))
        tk.Radiobutton(renew_plan_frame, text="월간 (1개월)", variable=self.renew_plan_var, value="monthly",
                       bg=BG2, fg=FG, selectcolor=BG3, activebackground=BG2,
                       font=("맑은 고딕", 9)).pack(side="left", padx=(0, 12))
        tk.Radiobutton(renew_plan_frame, text="연간 (1년)", variable=self.renew_plan_var, value="yearly",
                       bg=BG2, fg=FG, selectcolor=BG3, activebackground=BG2,
                       font=("맑은 고딕", 9)).pack(side="left")

        # 갱신 상태
        self._field_label(frame_renew, "갱신 결과").grid(row=4, column=0, sticky="w", pady=(0, 2))
        self.renew_status_var = tk.StringVar(value="—")
        tk.Label(frame_renew, textvariable=self.renew_status_var, bg=BG2,
                 fg=FG_DIM, font=("맑은 고딕", 9), wraplength=280, justify="left").grid(
            row=5, column=0, columnspan=2, sticky="w", pady=(0, 4))

        # 갱신 버튼
        tk.Button(frame_renew, text="갱신 / 플랜 변경 적용",
                  command=self._renew,
                  bg=BTN2_BG, fg=ACCENT,
                  font=("맑은 고딕", 10, "bold"),
                  activebackground=ACCENT, activeforeground=BTN_FG,
                  relief="flat", cursor="hand2",
                  pady=8).grid(row=6, column=0, columnspan=2, sticky="ew", pady=(4, 0))

        tk.Frame(self, bg=BORDER, height=1).pack(fill="x", padx=20)

        # ── 로그 섹션 ──
        sec3 = tk.Frame(self, bg=BG, padx=20, pady=12)
        sec3.pack(fill="both", expand=True)

        log_header = tk.Frame(sec3, bg=BG)
        log_header.pack(fill="x", pady=(0, 6))
        self._section_label(log_header, "발급 기록").pack(side="left")

        # 검색창
        self.log_search_var = tk.StringVar()
        self.log_search_var.trace_add("write", lambda *_: self._filter_log())
        search_frame = tk.Frame(log_header, bg=BG)
        search_frame.pack(side="right")
        tk.Label(search_frame, text="이름 검색:", bg=BG, fg=FG_DIM,
                 font=("맑은 고딕", 9)).pack(side="left", padx=(0, 4))
        tk.Entry(search_frame, textvariable=self.log_search_var, width=14,
                 bg=BG3, fg=FG, insertbackground=FG, relief="flat",
                 font=("맑은 고딕", 9),
                 highlightthickness=1,
                 highlightbackground=BORDER,
                 highlightcolor=ACCENT).pack(side="left")

        log_frame = tk.Frame(sec3, bg=BG3, highlightthickness=1, highlightbackground=BORDER)
        log_frame.pack(fill="both", expand=True)

        self.log_box = tk.Text(
            log_frame, height=8,
            bg=BG3, fg=FG_LOG,
            font=("맑은 고딕", 9),
            relief="flat",
            state="disabled",
            wrap="none",
            cursor="arrow",
        )
        scrollbar_y = tk.Scrollbar(log_frame, orient="vertical", command=self.log_box.yview)
        scrollbar_x = tk.Scrollbar(log_frame, orient="horizontal", command=self.log_box.xview)
        self.log_box.configure(yscrollcommand=scrollbar_y.set, xscrollcommand=scrollbar_x.set)
        scrollbar_y.pack(side="right", fill="y")
        scrollbar_x.pack(side="bottom", fill="x")
        self.log_box.pack(fill="both", expand=True)

        # 클릭 복사용 태그
        self.log_box.tag_config("key_tag", foreground=ACCENT, underline=False)
        self.log_box.tag_bind("key_tag", "<Enter>",
                              lambda e: self.log_box.config(cursor="hand2"))
        self.log_box.tag_bind("key_tag", "<Leave>",
                              lambda e: self.log_box.config(cursor="arrow"))
        self.log_box.tag_bind("key_tag", "<Button-1>", self._log_key_click)
        self.log_box.tag_config("key_copied", foreground="#55c47a", underline=False)

        # 안내 레이블
        self.copy_hint_var = tk.StringVar(value="")
        tk.Label(sec3, textvariable=self.copy_hint_var, bg=BG, fg="#55c47a",
                 font=("맑은 고딕", 8)).pack(anchor="w", pady=(4, 0))

    def _update_expiry_preview(self):
        try:
            start = datetime.date.fromisoformat(self.start_var.get().strip())
            if self.plan_var.get() == "monthly":
                month = start.month + 1
                year = start.year + (month - 1) // 12
                month = (month - 1) % 12 + 1
                expiry = start.replace(year=year, month=month)
            else:
                expiry = start.replace(year=start.year + 1)
            self.expiry_preview_var.set(expiry.strftime("%Y-%m-%d"))
        except Exception:
            self.expiry_preview_var.set("날짜 형식 오류")

    def _generate(self):
        user = self.name_var.get().strip()
        if not user:
            self.status_var.set("⚠️ 사용자 이름을 입력하세요.")
            return

        try:
            start = datetime.date.fromisoformat(self.start_var.get().strip())
        except ValueError:
            self.status_var.set("⚠️ 시작일 형식이 올바르지 않습니다. (YYYY-MM-DD)")
            return

        plan = self.plan_var.get()
        if plan == "monthly":
            month = start.month + 1
            year = start.year + (month - 1) // 12
            month = (month - 1) % 12 + 1
            expiry = start.replace(year=year, month=month)
        else:
            expiry = start.replace(year=start.year + 1)
        expiry_iso = expiry.strftime("%Y-%m-%dT00:00:00.000Z")
        date_str = datetime.date.today().strftime("%Y-%m-%d")

        key = generate_key("AE", user)
        self.key_var.set(key)
        self.status_var.set("⏳ 서버 등록 중...")
        self.update()

        res = server_request({
            "action": "register",
            "key": key,
            "user": user,
            "date": date_str,
            "plan": plan,
            "expiry_date": expiry_iso,
        })

        plan_str = "월간" if plan == "monthly" else "연간"
        if res and res.get("status") == "registered":
            status_text = f"✅ 서버 등록 성공  ({plan_str} / 만료: {expiry.strftime('%Y-%m-%d')})"
            log_entry = f"발급: {key} → {user} ({plan_str}, 만료:{expiry}) — 성공"
        elif res and res.get("status") == "duplicate":
            status_text = "⚠️ 중복 키 (이미 등록됨)"
            log_entry = f"발급: {key} → {user} — 중복"
        else:
            msg = res.get("message", "응답 없음") if res else "응답 없음"
            status_text = f"❌ 등록 실패: {msg}"
            log_entry = f"발급: {key} → {user} — 실패 ({msg})"

        self.status_var.set(status_text)
        append_log(log_entry)
        self._append_log_ui(log_entry)

    def _renew(self):
        """갱신 + 플랜 변경 통합 처리"""
        key = self.renew_key_var.get().strip()
        if not key:
            self.renew_status_var.set("⚠️ 라이선스 키를 입력하세요.")
            return

        plan = self.renew_plan_var.get()
        plan_str = "월간" if plan == "monthly" else "연간"

        self.renew_status_var.set("⏳ 서버 처리 중...")
        self.update()

        res = server_request({
            "action": "renew",
            "key": key,
            "plan": plan,
        })

        if res and res.get("status") == "renewed":
            expiry_disp = res.get("expiry_display", "")
            plan_changed = res.get("plan_changed", False)
            prefix = "플랜 변경 + " if plan_changed else ""
            status_text = f"✅ {prefix}갱신 완료  ({plan_str} / 만료: {expiry_disp})"
            log_entry = f"갱신: {key} ({plan_str}, 만료:{expiry_disp}) — 성공"
        elif res and res.get("status") == "not_found":
            status_text = "❌ 라이선스 키를 찾을 수 없습니다."
            log_entry = f"갱신: {key} — 키 없음"
        else:
            msg = res.get("message", "응답 없음") if res else "응답 없음"
            status_text = f"❌ 갱신 실패: {msg}"
            log_entry = f"갱신: {key} — 실패 ({msg})"

        self.renew_status_var.set(status_text)
        append_log(log_entry)
        self._append_log_ui(log_entry)

    def _copy_key(self):
        key = self.key_var.get()
        if key:
            self.clipboard_clear()
            self.clipboard_append(key)
            self.status_var.set("📋 클립보드에 복사됨")

    def _insert_log_line(self, line: str):
        """한 줄을 log_box에 삽입. 라이선스 키(AE로 시작하는 토큰)에 클릭 태그 부착."""
        import re
        self.log_box.config(state="normal")
        tokens = re.split(r"(AE[A-Z0-9]{8,})", line)
        for token in tokens:
            if re.fullmatch(r"AE[A-Z0-9]{8,}", token):
                self.log_box.insert("end", token, "key_tag")
            else:
                self.log_box.insert("end", token)
        self.log_box.insert("end", "\n")
        self.log_box.config(state="disabled")

    def _load_log(self):
        content = load_log()
        if content:
            for line in content.splitlines():
                self._insert_log_line(line)
            self.log_box.see("end")

    def _append_log_ui(self, text: str):
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._insert_log_line(f"[{ts}] {text}")
        self.log_box.see("end")

    def _filter_log(self):
        """검색어로 로그 필터링 — 매칭 라인만 표시."""
        query = self.log_search_var.get().strip().lower()
        self.log_box.config(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.config(state="disabled")

        content = load_log()
        lines = content.splitlines() if content else []
        for line in lines:
            if not query or query in line.lower():
                self._insert_log_line(line)

        if query and not any(query in l.lower() for l in lines):
            self.log_box.config(state="normal")
            self.log_box.insert("end", "검색 결과 없음\n")
            self.log_box.config(state="disabled")

    def _log_key_click(self, event):
        """로그에서 키 태그 클릭 시 해당 키 복사."""
        idx = self.log_box.index(f"@{event.x},{event.y}")
        # 태그 범위 찾기
        ranges = self.log_box.tag_ranges("key_tag")
        for i in range(0, len(ranges), 2):
            start, end = ranges[i], ranges[i + 1]
            if self.log_box.compare(start, "<=", idx) and self.log_box.compare(idx, "<", end):
                key = self.log_box.get(start, end)
                self.clipboard_clear()
                self.clipboard_append(key)
                # 잠깐 초록색으로 강조
                self.log_box.config(state="normal")
                self.log_box.tag_add("key_copied", start, end)
                self.log_box.config(state="disabled")
                self.copy_hint_var.set(f"📋 복사됨: {key}")
                self.after(1500, lambda s=start, e=end: self._undo_copy_highlight(s, e))
                break

    def _undo_copy_highlight(self, start, end):
        self.log_box.config(state="normal")
        self.log_box.tag_remove("key_copied", start, end)
        self.log_box.config(state="disabled")
        self.copy_hint_var.set("")


if __name__ == "__main__":
    app = App()
    app.mainloop()