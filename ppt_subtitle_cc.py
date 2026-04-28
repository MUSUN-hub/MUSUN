import tkinter as tk
from tkinter import filedialog, ttk, messagebox
import threading
import os
import re
import unicodedata
import datetime
import traceback
import queue
import json
import subprocess
import urllib.request
import urllib.parse
import socket
import sys
import ctypes
from difflib import SequenceMatcher

# ── 라이선스 서버 ─────────────────────────────────────────
LICENSE_SERVER_URL = "https://script.google.com/macros/s/AKfycbzx9K_0KmVZph-O_MyEXAH7AbKWOwL5zu5Z3_re2b2w6PoZJnClGPipoU9Wah_dhNaL/exec"
LICENSE_PATH = os.path.join(os.environ.get("APPDATA", ""), "PPTSubtitleHelper", "license.key")

def generate_hwid():
    try:
        result = subprocess.check_output(
            'powershell -NoProfile -Command "(Get-WmiObject -Class Win32_ComputerSystemProduct).UUID"',
            shell=True, timeout=5
        ).decode().strip()
        if result and len(result) > 10:
            return result.upper()
    except Exception:
        pass
    hostname = socket.gethostname()
    username = os.environ.get("USERNAME", "UNKNOWN")
    return f"FALLBACK_{hostname}_{username}"

def server_request(action, params=None):
    try:
        qs = {"action": action}
        if params:
            qs.update(params)
        url = LICENSE_SERVER_URL + "?" + urllib.parse.urlencode(qs)
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None

def load_local_license():
    try:
        if not os.path.exists(LICENSE_PATH):
            return None
        with open(LICENSE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def delete_local_license():
    try:
        if os.path.exists(LICENSE_PATH):
            os.remove(LICENSE_PATH)
    except Exception:
        pass

def save_local_license(hwid, key, last_verified=None, expiry_date="", plan="",
                       notified_30d=False, notified_7d=False):
    try:
        import time
        os.makedirs(os.path.dirname(LICENSE_PATH), exist_ok=True)
        with open(LICENSE_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "hwid": hwid,
                "key": key,
                "last_verified": last_verified or time.time(),
                "expiry_date": expiry_date,
                "plan": plan,
                "notified_30d": notified_30d,
                "notified_7d": notified_7d
            }, f)
        return True
    except Exception:
        return False

def get_expiry_display(expiry_date, plan):
    if not expiry_date:
        return ""
    try:
        from datetime import datetime, timezone
        expiry = datetime.fromisoformat(expiry_date.replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        days = (expiry - now).days
        plan_str = "월간" if plan == "monthly" else "연간"
        date_str = expiry.strftime("%Y-%m-%d")
        if days < 0:
            grace_left = 7 + days
            if grace_left > 0:
                return f"⚠  구독 만료 — 유예기간 {grace_left}일 남음 ({date_str})"
            else:
                return f"✕  구독 만료 ({date_str})"
        elif days <= 7:
            return f"⚠  {plan_str} 구독 — 만료 {days}일 전 ({date_str})"
        elif days <= 30:
            return f"△  {plan_str} 구독 — 만료 {days}일 전 ({date_str})"
        else:
            return f"{plan_str} 구독  |  만료일: {date_str}"
    except Exception:
        return ""

# ── 컬러 팔레트 ──────────────────────────────────────────
BG_DEEP    = "#0e0e12"
BG_CARD    = "#16161d"
BG_INPUT   = "#1e1e28"
BG_BORDER  = "#2a2a38"
ACCENT     = "#c9a85c"
ACCENT_DIM = "#8a7040"
FG_PRIMARY = "#e8e6e0"
FG_MUTED   = "#7a7870"
FG_LOG     = "#9db8a0"
BTN_BG     = "#c9a85c"
BTN_FG     = "#0e0e12"
BTN_HOV    = "#e0bf70"
BTN_DIS    = "#2a2a38"
# ─────────────────────────────────────────────────────────

PPTX_AVAILABLE = True
try:
    from pptx import Presentation
except ImportError:
    PPTX_AVAILABLE = False
    Presentation = None

HANGUL_VARIANTS = {
    '기': ['기', '키'], '긴': ['긴', '킨'], '포': ['포', '프'],
    '레': ['레', '래'], '지': ['지', '제'], '가': ['가', '까', '카'],
    '치': ['치', '지', '이', '시']
}

def _make_btn(parent, text, command, width=None, pady=8, font=None):
    """공통 버튼 팩토리 — 호버 효과 포함"""
    btn = tk.Button(
        parent, text=text, command=command,
        bg=BTN_BG, fg=BTN_FG,
        activebackground=BTN_HOV, activeforeground=BTN_FG,
        relief="flat", cursor="hand2",
        font=font or ("Malgun Gothic", 10, "bold"),
        pady=pady,
        **({"width": width} if width else {})
    )
    btn.bind("<Enter>", lambda e: btn.config(bg=BTN_HOV))
    btn.bind("<Leave>", lambda e: btn.config(bg=BTN_BG) if str(btn["state"]) != "disabled" else None)
    return btn

def _make_entry(parent, textvariable=None, width=None, **kw):
    return tk.Entry(
        parent,
        **({"textvariable": textvariable} if textvariable else {}),
        bg=BG_INPUT, fg=FG_PRIMARY, insertbackground=ACCENT,
        relief="flat", font=("Malgun Gothic", 10),
        highlightbackground=BG_BORDER, highlightthickness=1,
        **({"width": width} if width else {}),
        **kw
    )

def _make_card(parent, title, pady_top=0):
    """▎ 골드바 + 제목 + 카드 프레임 반환"""
    wrap = tk.Frame(parent, bg=BG_DEEP)
    wrap.pack(fill="x", pady=(pady_top, 16))
    hdr = tk.Frame(wrap, bg=BG_DEEP)
    hdr.pack(fill="x", pady=(0, 6))
    tk.Label(hdr, text="▎", font=("Malgun Gothic", 11), fg=ACCENT, bg=BG_DEEP).pack(side="left")
    tk.Label(hdr, text=title, font=("Malgun Gothic", 10), fg=FG_PRIMARY, bg=BG_DEEP).pack(side="left", padx=(4, 0))
    body = tk.Frame(wrap, bg=BG_CARD, padx=16, pady=12,
                    highlightbackground=BG_BORDER, highlightthickness=1)
    body.pack(fill="x")
    return body


class BaseTab(tk.Frame):
    def __init__(self, parent):
        super().__init__(parent, bg=BG_DEEP)
        self.last_directory = os.path.expanduser("~")
        self.ui_queue = queue.Queue()
        self.process_ui_queue()

    def process_ui_queue(self):
        try:
            while True:
                task = self.ui_queue.get_nowait()
                task()
        except queue.Empty:
            pass
        finally:
            self.after(100, self.process_ui_queue)

    def queue_ui_update(self, func):
        self.ui_queue.put(func)

    def format_timestamp(self, seconds, decimal_marker=','):
        if seconds is None: seconds = 0.0
        total_seconds = int(seconds)
        hours, remainder = divmod(total_seconds, 3600)
        minutes, secs = divmod(remainder, 60)
        millis = int((seconds - total_seconds) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}{decimal_marker}{millis:03d}"

    def log(self, message):
        if hasattr(self, 'log_text'):
            self.queue_ui_update(lambda msg=message: self._log_internal(msg))

    def _log_internal(self, message):
        self.log_text.config(state='normal')
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state='disabled')

    def browse_file(self, entry_widget=None, filetypes=None):
        if filetypes is None:
            filetypes = [("모든 파일", "*.*")]
        f = filedialog.askopenfilename(initialdir=self.last_directory, filetypes=filetypes)
        if f:
            self.last_directory = os.path.dirname(f)
            if entry_widget:
                entry_widget.delete(0, tk.END)
                entry_widget.insert(0, f)
        return f



# --- 2. 해시태그 삽입기 ---
class HashtagInjectorTab(BaseTab):
    TAG_PATTERN = re.compile(r'\[Slide\s*\d+\](\[[^\]]*\])?\s*|#\s*\d+(?:\s*-\s*\d+)?\s*')
    SLIDE_PATTERN = re.compile(r'\[Slide \d+\]')
    SPACE_PATTERN = re.compile(r'[\s\ufeff\u200b]+')

    def __init__(self, parent):
        super().__init__(parent)
        self.setup_ui()

    def setup_ui(self):
        if not PPTX_AVAILABLE:
            tk.Label(self, text="python-pptx가 없습니다.  pip install python-pptx",
                     fg="#e06060", bg=BG_DEEP, font=("Malgun Gothic", 11, "bold")).pack(pady=30)
            return

        main = tk.Frame(self, bg=BG_DEEP, padx=24, pady=18)
        main.pack(fill="both", expand=True)

        # 헤더
        hdr = tk.Frame(main, bg=BG_DEEP)
        hdr.pack(fill="x", pady=(0, 18))
        tk.Label(hdr, text="자막 해시태그 삽입", font=("Malgun Gothic", 13, "bold"),
                 fg=ACCENT, bg=BG_DEEP).pack(side="left")
        help_btn = tk.Button(hdr, text="?", command=self.show_help,
                             bg=BG_BORDER, fg=FG_MUTED, relief="flat",
                             font=("Malgun Gothic", 9), padx=8, pady=2, cursor="hand2")
        help_btn.pack(side="right")

        # 파일 선택
        c1 = _make_card(main, "파일 선택")
        c1.columnconfigure(1, weight=1)
        self.entry_sub = self.add_file_row(c1, "자막 파일", 0, self.browse_sub)
        self.entry_ppt = self.add_file_row(c1, "PPT 파일", 1, self.browse_ppt)

        # 키워드
        c2 = _make_card(main, "인식 키워드")
        tk.Label(c2, text="PPT 도형에서 아래 키워드로 시작하는 텍스트를 찾습니다  (쉼표 구분)",
                 bg=BG_CARD, fg=FG_MUTED, font=("Malgun Gothic", 8)).pack(anchor="w", pady=(0, 6))
        self.keyword_var = tk.StringVar(value="SME, 아나운서, 성우, 내레이션")
        self.entry_keyword = _make_entry(c2, textvariable=self.keyword_var)
        self.entry_keyword.pack(fill="x", ipady=5)

        # 슬라이드 범위
        c3 = _make_card(main, "슬라이드 범위  (비워두면 전체)")
        range_row = tk.Frame(c3, bg=BG_CARD)
        range_row.pack(anchor="w")
        tk.Label(range_row, text="시작", bg=BG_CARD, fg=FG_MUTED,
                 font=("Malgun Gothic", 9)).pack(side="left")
        self.entry_start = _make_entry(range_row, width=7)
        self.entry_start.pack(side="left", padx=(6, 16), ipady=4)
        tk.Label(range_row, text="끝", bg=BG_CARD, fg=FG_MUTED,
                 font=("Malgun Gothic", 9)).pack(side="left")
        self.entry_end = _make_entry(range_row, width=7)
        self.entry_end.pack(side="left", padx=(6, 0), ipady=4)

        # 실행 버튼
        btn_row = tk.Frame(main, bg=BG_DEEP)
        btn_row.pack(fill="x", pady=(0, 12))
        btn1 = _make_btn(btn_row, "PPT 데이터 분석", self.start_check_ppt, pady=9,
                         font=("Malgun Gothic", 10))
        btn1.configure(bg=BG_BORDER, fg=FG_PRIMARY,
                       activebackground=BG_BORDER, activeforeground=ACCENT)
        btn1.bind("<Enter>", lambda e: btn1.config(bg="#3a3a50"))
        btn1.bind("<Leave>", lambda e: btn1.config(bg=BG_BORDER))
        btn1.pack(side="left", expand=True, fill="x", padx=(0, 8))

        btn2 = _make_btn(btn_row, "해시태그 삽입 실행", self.start_process, pady=9)
        btn2.pack(side="left", expand=True, fill="x")

        # 로그
        log_hdr = tk.Frame(main, bg=BG_DEEP)
        log_hdr.pack(fill="x", pady=(0, 6))
        tk.Label(log_hdr, text="▎", font=("Malgun Gothic", 11),
                 fg=ACCENT, bg=BG_DEEP).pack(side="left")
        tk.Label(log_hdr, text="진행 로그", font=("Malgun Gothic", 10),
                 fg=FG_PRIMARY, bg=BG_DEEP).pack(side="left", padx=(4, 0))

        log_card = tk.Frame(main, bg=BG_CARD,
                            highlightbackground=BG_BORDER, highlightthickness=1)
        log_card.pack(fill="both", expand=True)
        self.log_text = tk.Text(
            log_card, font=("Malgun Gothic", 9, "normal"),
            bg=BG_CARD, fg=FG_LOG, relief="flat",
            padx=14, pady=10, state="disabled",
            insertbackground=ACCENT, selectbackground=ACCENT_DIM, wrap="word"
        )
        sc = tk.Scrollbar(log_card, orient="vertical", command=self.log_text.yview,
                          bg=BG_CARD, troughcolor=BG_CARD, relief="flat")
        self.log_text.configure(yscrollcommand=sc.set)
        sc.pack(side="right", fill="y")
        self.log_text.pack(fill="both", expand=True)

    def start_check_ppt(self):
        threading.Thread(target=self.check_ppt, daemon=True).start()

    def start_process(self):
        threading.Thread(target=self.process, daemon=True).start()

    def show_help(self):
        messagebox.showinfo("사용법", "PPT 파일과 자막 파일을 선택한 후\n1. PPT 데이터 분석으로 확인\n2. 해시태그 삽입 실행")

    def add_file_row(self, master, label, row, cmd):
        tk.Label(master, text=label, bg=BG_CARD, fg=FG_MUTED,
                 font=("Malgun Gothic", 9), width=8, anchor="w").grid(row=row, column=0, sticky="w", pady=4)
        entry = _make_entry(master)
        entry.grid(row=row, column=1, padx=(8, 8), sticky="ew", ipady=5)
        btn = _make_btn(master, "열기", cmd, pady=4, font=("Malgun Gothic", 9, "bold"))
        btn.grid(row=row, column=2)
        master.columnconfigure(1, weight=1)
        return entry

    def add_range_field(self, master, label, col):
        # 이 메서드는 setup_ui에서 직접 구현으로 대체됨 (호환성 유지)
        tk.Label(master, text=label, bg=BG_CARD, fg=FG_MUTED,
                 font=("Malgun Gothic", 9)).grid(row=0, column=col)
        entry = _make_entry(master, width=8)
        entry.grid(row=0, column=col+1, padx=5, ipady=4)
        return entry

    def browse_sub(self):
        self.browse_file(self.entry_sub, [("Subtitle","*.srt *.vtt")])

    def browse_ppt(self):
        self.browse_file(self.entry_ppt, [("PowerPoint","*.pptx")])

    def get_keywords(self):
        return [k.strip().lower() for k in self.keyword_var.get().split(",") if k.strip()]

    def load_mapping_json(self):
        """mapping.json 로드 (워크 플랜 81-82번 항목 대응)"""
        default_map = {
            'figma': '피그마', 'figjam': '피그잼', 'dev': '데브', 'draw': '드로우',
            'design': '디자인', 'prototype': '프로토타입', 'component': '컴포넌트'
        }
        try:
            # 스크립트와 같은 경로의 mapping.json 탐색
            json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mapping.json")
            if os.path.exists(json_path):
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.log(f"✅ mapping.json 로드 완료 ({len(data)}개 항목)")
                    return data
            return default_map
        except Exception as e:
            self.log(f"⚠️ mapping.json 로드 실패: {e}")
            return default_map

    def get_sme_slides(self, ppt_path, start, end):
        try:
            prs = Presentation(ppt_path)
            data = []
            keywords = self.get_keywords()
            for i, slide in enumerate(prs.slides, 1):
                if (start and i < start) or (end and i > end): continue
                for shape in slide.shapes:
                    if hasattr(shape,"has_text_frame") and shape.has_text_frame:
                        text = unicodedata.normalize('NFC', shape.text_frame.text or "")
                        text_lower = text.strip().lower()
                        if any(text_lower.startswith(kw) for kw in keywords):
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
                                    # 태그 내부 공백 제거하여 표준화 (예: "# 2 - 1" -> "#2-1")
                                    tag = m.group(1).replace(" ", "")
                                    rem = content[m.end():]
                                    search_idx = 0
                                    while search_idx < len(rem):
                                        m_space = self.SPACE_PATTERN.match(rem[search_idx:])
                                        if m_space: search_idx += m_space.end()
                                        if search_idx < len(rem) and rem[search_idx] == '#':
                                            m_tag = re.match(r'#\s*\d{1,2}(?:\s*-\s*\d{1,2})?', rem[search_idx:])
                                            if m_tag: search_idx += m_tag.end(); continue
                                        break
                                    word_match = re.search(r'[^#\n]+', rem[search_idx:])
                                    if word_match:
                                        phrase = word_match.group(0).strip()
                                        clean_phrase = re.sub(r'[\*\_\~\:\(\)\[\]]', ' ', phrase).strip()
                                        words_list = clean_phrase.split()
                                        word = " ".join(words_list[:2]) if len(words_list) >= 2 else clean_phrase.strip()
                                        current_tags.append({'tag': tag, 'word': word})
                                if current_tags:
                                    temp_tag = current_tags[0]['tag']
                                    temp_word = current_tags[0]['word']
                                    for next_item in current_tags[1:]:
                                        if next_item['word'] == temp_word: temp_tag += " " + next_item['tag']
                                        else:
                                            merged.append((temp_tag, " ", temp_word))
                                            temp_tag = next_item['tag']; temp_word = next_item['word']
                                    merged.append((temp_tag, " ", temp_word))
                                    data.append({'slide': i, 'hashtags': merged})
            return data
        except Exception as e:
            self.log(f"오류: {e}"); return []

    def check_ppt(self):
        ppt_path = self.entry_ppt.get()
        if not ppt_path:
            self.queue_ui_update(lambda: messagebox.showwarning("!", "PPT 파일을 선택하세요."))
            return
        def clear_log():
            self.log_text.config(state='normal'); self.log_text.delete(1.0, tk.END); self.log_text.config(state='disabled')
        self.queue_ui_update(clear_log)
        keywords = self.get_keywords()
        self.log(f"🔍 인식 키워드: {', '.join(keywords)}")
        self.log("-" * 40)
        s_v, e_v = self.entry_start.get().strip(), self.entry_end.get().strip()
        slides = self.get_sme_slides(self.entry_ppt.get(), int(s_v) if s_v.isdigit() else None, int(e_v) if e_v.isdigit() else None)
        if not slides:
            self.log("⚠️ 인식된 슬라이드가 없습니다.")
        else:
            for s in slides:
                self.log(f"[슬라이드 {s['slide']}] 분석됨")
                for t, _, w in s['hashtags']: self.log(f"  - {t} {w}")

    def _build_search_targets(self, word, tag, eng_han_map):
        """검색 타겟 생성: 영어 원문 + 한글 변환 + 첫 단어 분리"""
        word_lower = word.lower().strip()
        targets = [word_lower]

        if not tag:
            cleaned_word = re.sub(r'[^a-zA-Z0-9가-힣\s]', ' ', word_lower).strip()
            short_words = cleaned_word.split()[:4]
            if short_words: targets.append(" ".join(short_words))
            if len(word_lower) > 15:
                targets.append(word_lower[:15].strip())
                targets.append(re.sub(r'\s+', '', word_lower[:15]))

        for eng, han in eng_han_map.items():
            if eng in word_lower:
                target_han = word_lower.replace(eng, han).strip()
                targets.append(target_han)
                if " " in target_han:
                    first_han_word = target_han.split()[0]
                    # 3글자 이하 한글 단어는 너무 일반적이므로 단독 타겟 제외 (오탐 방지)
                    if len(re.sub(r'[^\w]', '', first_han_word)) >= 4:
                        targets.append(first_han_word)             # 첫 단어만
                targets.append(re.sub(r'\s+', '', target_han))     # 붙여쓰기

        # ★ Fix 1: 다중 영어 키워드 동시 변환 (예: "Figma Sites는" → "피그마 사이트는")
        combined = word_lower
        for eng, han in eng_han_map.items():
            if eng in combined:
                combined = combined.replace(eng, han)
        if combined != word_lower and combined not in targets:
            targets.append(combined)
            if " " in combined:
                first_combined = combined.split()[0]
                if len(re.sub(r'[^\w]', '', first_combined)) >= 4:
                    targets.append(first_combined)
            targets.append(re.sub(r'\s+', '', combined))

        # ★ 항상 첫 단어를 타겟에 포함 (자막이 줄바꿈으로 분리된 경우 대응)
        if " " in word_lower:
            first_word = word_lower.split()[0]
            # 너무 일반적인 단어는 제외 (2글자 미만 한글 또는 1글자 영어)
            if len(re.sub(r'[^\w]', '', first_word)) >= 2:
                targets.append(first_word)

        return list(dict.fromkeys(targets))  # 중복 제거 (순서 유지)

    def _find_match_in_range(self, start_idx, end_idx, lines, targets, threshold=0.82):
        """지정된 범위에서 첫 매칭 줄 반환"""
        for i in range(start_idx, min(end_idx, len(lines))):
            line = lines[i]
            if not line.strip() or "-->" in line or line.strip().isdigit(): continue
            if self._check_match(line, targets, threshold=threshold):
                return i
        return None

    def _insert_tag_at_line(self, lines, idx, tag, word, slide_num, angle_info, is_first_tag):
        """지정 줄에 태그 삽입"""
        pure_line = lines[idx].strip()
        slide_prefix = ""
        if is_first_tag:
            angle_tag = f"[{angle_info}]" if angle_info else ""
            slide_prefix = f"[Slide {slide_num}]{angle_tag} "
        pos = self._find_match_pos(pure_line, [word.lower().strip()])
        if pos >= 0:
            prefix = pure_line[:pos]
            sep = " " if prefix and not prefix.endswith(" ") else ""
            new_line = f"{prefix}{sep}{tag} {pure_line[pos:]}".replace("  "," ").strip()
        else:
            new_line = f"{tag} {pure_line}".strip() if tag else pure_line
        if slide_prefix:
            new_line = f"{slide_prefix}{new_line}"
        lines[idx] = new_line + "\n"

    def _estimate_slide_boundary(self, slides_data, slide_idx, clean_lines, last_match_idx, eng_han_map, num_tags):
        """
        ★ 핵심 수정 v1.7: 다음 슬라이드 경계 추정
        - 최소 거리 보장: 현재 위치 + max(40줄, 태그수 × 10줄) 이후부터만 탐색
        - 높은 임계값(0.90) 사용으로 오탐 방지
        """
        if slide_idx + 1 >= len(slides_data):
            return len(clean_lines)

        # ★ 최소 거리: 태그 수가 많을수록 더 많은 공간 확보 (단, 80줄 상한으로 오버슈트 방지)
        min_advance = max(40, min(num_tags * 10, 80))
        boundary_search_start = last_match_idx + min_advance

        # 최소 거리 이후부터만 다음 슬라이드의 첫 태그를 탐색
        next_slide = slides_data[slide_idx + 1]
        for tag, _, word in next_slide['hashtags']:
            if tag:
                targets = self._build_search_targets(word, tag, eng_han_map)
                idx = self._find_match_in_range(
                    boundary_search_start, len(clean_lines), clean_lines,
                    targets, threshold=0.95  # ★ 높은 임계값으로 오탐 방지 (0.90→0.95: 유사 단어 구분)
                )
                if idx is not None:
                    return idx

        return len(clean_lines)  # 못 찾으면 파일 끝까지

    def process(self):
        sub_p, ppt_p = self.entry_sub.get(), self.entry_ppt.get()
        if not sub_p or not ppt_p:
            return messagebox.showwarning("!", "파일을 선택하세요.")

        # ★ 외부 매핑 로드 (v1.8)
        ENG_HAN_MAP = self.load_mapping_json()
        
        self.log_text.config(state='normal'); self.log_text.delete(1.0, tk.END); self.log_text.config(state='disabled')
        keywords = self.get_keywords()
        self.log(f"🔍 인식 키워드: {', '.join(keywords)}")
        self.log("-" * 40)

        s_v, e_v = self.entry_start.get().strip(), self.entry_end.get().strip()
        slides_data = self.get_sme_slides(
            ppt_p,
            int(s_v) if s_v.isdigit() else None,
            int(e_v) if e_v.isdigit() else None
        )

        try:
            with open(sub_p,"r",encoding="utf-8") as f: lines = f.readlines()
        except UnicodeDecodeError:
            with open(sub_p,"r",encoding="cp949") as f: lines = f.readlines()

        # 1단계: 기존 태그 제거
        clean_lines = []
        for line in lines:
            line_str = line.strip()
            if not line_str or "-->" in line_str or line_str.isdigit():
                clean_lines.append(line)
            else:
                pure_text = self.TAG_PATTERN.sub('', line_str).strip()
                clean_lines.append(pure_text + "\n")

        # 앵글 JSON 로드
        angle_dict = {}
        json_path = ppt_p.replace(".pptx","_분석.json").replace(".ppt","_분석.json")
        if os.path.exists(json_path):
            try:
                with open(json_path,"r",encoding="utf-8") as f:
                    analysis_data = json.load(f)
                if isinstance(analysis_data,dict) and "slides" in analysis_data:
                    for item in analysis_data.get("slides",[]):
                        sn = item.get("slide_number")
                        ang = item.get("angle","front")
                        angle_dict[sn] = {"front":"정면","left":"좌측","right":"우측"}.get(ang,"정면")
                    self.log(f"📊 분석 데이터 로드: {len(angle_dict)}개 슬라이드 앵글 적용")
            except Exception as e:
                self.log(f"⚠️ 분석 데이터 로드 실패: {e}")
        else:
            self.log("ℹ️ 분석 파일 없음 (앵글 정보 미적용)")

        # 2단계: 순차 탐색 + 경계 제한
        last_match_idx = 0
        total = 0
        consecutive_skips = 0

        self.log("🚀 해시태그 삽입 시작 (v1.7 - 경계 최소 거리 보장)...")

        for slide_idx, s in enumerate(slides_data):
            slide_num = s['slide']
            angle_info = angle_dict.get(slide_num, "")
            tags_list = s['hashtags']
            num_tags = len([t for t, _, w in tags_list if t])  # 해시태그 수

            # ★ 경계 추정: 최소 거리 보장 + 높은 임계값
            next_slide_boundary = self._estimate_slide_boundary(
                slides_data, slide_idx, clean_lines,
                last_match_idx, ENG_HAN_MAP, num_tags
            )

            # 이 슬라이드의 첫 번째 해시태그 위치 찾기
            first_tag_idx = None
            for tag, _, word in tags_list:
                if tag:
                    targets = self._build_search_targets(word, tag, ENG_HAN_MAP)

                    # 1차: 기본 임계값, 경계 내
                    idx = self._find_match_in_range(last_match_idx, next_slide_boundary, clean_lines, targets)
                    # 2차: 임계값 완화 (★ Fix 2: 0.70→0.80, first_tag_idx 오탐 방지)
                    if idx is None:
                        idx = self._find_match_in_range(last_match_idx, next_slide_boundary, clean_lines, targets, threshold=0.80)
                    # 3차: 연속 스킵 2+이면 50줄 롤백 + 경계 무시
                    if idx is None and consecutive_skips >= 2:
                        rollback_idx = max(0, last_match_idx - 50)
                        idx = self._find_match_in_range(rollback_idx, len(clean_lines), clean_lines, targets, threshold=0.80)
                        if idx is not None:
                            self.log(f"  ↩️ Slide {slide_num} 롤백 탐색 성공 (→{idx})")

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
                targets = self._build_search_targets(word, tag, ENG_HAN_MAP)

                if not tag:
                    search_start = current_idx
                    search_end = first_tag_idx
                else:
                    search_start = current_idx
                    search_end = next_slide_boundary  # ★ 경계 이내

                # 1차 매칭
                matched_idx = self._find_match_in_range(search_start, search_end, clean_lines, targets)
                # 2차: 임계값 완화
                if matched_idx is None:
                    matched_idx = self._find_match_in_range(search_start, search_end, clean_lines, targets, threshold=0.70)

                if matched_idx is not None:
                    self._insert_tag_at_line(clean_lines, matched_idx, tag, word, slide_num, angle_info, not slide_tag_done)
                    if not slide_tag_done: slide_tag_done = True
                    current_idx = matched_idx  # ★ 같은 줄에 여러 태그(예: 정확한 UI, 창의적인 표현)가 있을 수 있으므로 +1 제거
                    total += 1
                else:
                    disp = tag if tag else "[INTRO]"
                    self.log(f"⚠️ Slide {slide_num} {disp} '{word}' 미발견")

            last_match_idx = current_idx

        # 3단계: 저장
        base_name, ext = os.path.splitext(sub_p)
        out = base_name + "_tagged" + ext
        try:
            with open(out,"w",encoding="utf-8-sig") as f:
                f.writelines(clean_lines)
            self.log("-" * 40)
            self.log(f"✅ 작업 완료: 총 {total}개 삽입")
            self.log(f"💾 저장: {os.path.basename(out)}")
            messagebox.showinfo("완료", f"총 {total}개 삽입 완료\n저장: {out}")
        except Exception as e:
            self.log(f"❌ 저장 실패: {e}")
            messagebox.showerror("오류", f"저장 중 오류: {e}")

    def _find_match_pos(self, line_text, targets, threshold=0.82):
        """단어 일치 및 유사도 체크 후 위치 반환"""
        line = line_text.strip()
        if not line or "-->" in line or line.isdigit(): return -1
        line_lower = line.lower()

        # 1. 완전 일치
        for t in targets:
            pos = line_lower.find(t.lower())
            if pos >= 0: return pos

        # 2. 유사도 슬라이딩 윈도우
        best_pos = -1; max_ratio = 0.0
        for t in targets:
            t_clean = re.sub(r'[\*\_\~\:\(\)\[\]]', '', t)
            # 2단어 이상이면 앞 2단어 사용 (1단어만 쓰면 '디자인' 같은 짧은 단어로 오탐 발생)
            tokens = t_clean.split()
            t_first_token = ' '.join(tokens[:2]) if len(tokens) >= 2 else t_clean
            t_pure = re.sub(r'[\s\ufeff\u200b,.?!]', '', t_first_token).lower()
            if len(t_pure) < 2: continue
            win_size = len(t_pure)
            for i in range(len(line_lower) - win_size + 1):
                win_pure = re.sub(r'[\s\ufeff\u200b,.?!]', '', line_lower[i:i+win_size])
                ratio = SequenceMatcher(None, t_pure, win_pure).ratio()
                if ratio > max_ratio and ratio >= threshold:
                    max_ratio = ratio; best_pos = i

        # 3. 어절 단위
        if best_pos == -1:
            words = line_lower.split(); current_idx = 0
            for word in words:
                word_pure = re.sub(r'[^\w]', '', word)
                for t in targets:
                    t_pure = re.sub(r'[^\w]', '', t).lower()
                    if len(word_pure) >= 2 and SequenceMatcher(None, t_pure, word_pure).ratio() >= threshold * 0.97:
                        return line_lower.find(word, current_idx)
                current_idx = line_lower.find(word, current_idx) + len(word)

        return best_pos

    def _check_match(self, line_text, targets, threshold=0.82):
        return self._find_match_pos(line_text, targets, threshold=threshold) >= 0


# --- 라이선스 다이얼로그 ---
class LicenseDialog:
    def __init__(self, root):
        self.root = root
        self.hwid = generate_hwid()
        self.result = False
        self.expiry_date = ""
        self.plan = ""
        self.license_info = ""

    def check_and_run(self):
        import time
        VERIFY_INTERVAL = 7 * 24 * 3600  # 7일

        local = load_local_license()
        if local and local.get("hwid") == self.hwid and local.get("key"):
            last_verified = local.get("last_verified", 0)
            elapsed = time.time() - last_verified

            if elapsed < VERIFY_INTERVAL:
                self.expiry_date = local.get("expiry_date", "")
                self.plan = local.get("plan", "")
                self._check_expiry_and_proceed()
                return

            resp = server_request("check_subscription", {"hwid": self.hwid, "key": local.get("key")})
            if resp is None:
                self.expiry_date = local.get("expiry_date", "")
                self.plan = local.get("plan", "")
                self._check_expiry_and_proceed()
                return
            status = resp.get("status", "")
            if status == "active":
                self.expiry_date = resp.get("expiry_date", "")
                self.plan = resp.get("plan", "")
                save_local_license(self.hwid, local.get("key"),
                                   expiry_date=self.expiry_date, plan=self.plan)
                self._check_expiry_and_proceed()
                return
            elif status == "grace_period":
                self.expiry_date = resp.get("expiry_date", "")
                self.plan = resp.get("plan", "")
                grace_left = resp.get("grace_days_left", 0)
                save_local_license(self.hwid, local.get("key"),
                                   expiry_date=self.expiry_date, plan=self.plan)
                messagebox.showwarning(
                    "구독 만료",
                    f"구독이 만료되었습니다.\n유예기간: {grace_left}일 남았습니다.\n갱신해주세요."
                )
                self.result = True
                return
            elif status == "expired":
                delete_local_license()
                messagebox.showerror("구독 만료", "구독이 만료되었습니다.\n라이선스 키를 다시 입력해주세요.")
                self._show_key_input()
                return
            else:
                self.expiry_date = local.get("expiry_date", "")
                self.plan = local.get("plan", "")
                self._check_expiry_and_proceed()
                return

        resp = server_request("trial_check", {"hwid": self.hwid})

        if resp is None:
            messagebox.showerror("오프라인",
                "인터넷 연결이 필요합니다.\n라이선스 인증 또는 체험판은 인터넷이 필요합니다.")
            self.result = False
            return

        status = resp.get("status", "")
        if status == "trial_not_found":
            self._show_start_dialog()
        elif status == "trial_active":
            remaining = resp.get("remaining", 0)
            self.license_info = f"체험판  |  남은 기간: {remaining}일"
            self._show_trial_active(remaining)
        elif status == "trial_expired":
            self._show_expired_dialog()
        else:
            messagebox.showerror("오류", f"서버 응답 오류: {status}")
            self.result = False

    def _check_expiry_and_proceed(self):
        if not self.expiry_date:
            self.license_info = "라이선스 활성"
            self.result = True
            return
        try:
            from datetime import datetime, timezone
            expiry = datetime.fromisoformat(self.expiry_date.replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days = (expiry - now).days
            is_yearly = self.plan == "yearly"

            local = load_local_license()
            notified_30d = local.get("notified_30d", False) if local else False
            notified_7d  = local.get("notified_7d",  False) if local else False

            if days > 30:
                self.result = True

            elif days > 7:
                if is_yearly and not notified_30d:
                    messagebox.showinfo("구독 갱신 안내",
                        f"구독 만료까지 {days}일 남았습니다.\n기간 내 갱신해주세요.")
                    save_local_license(local["hwid"], local["key"],
                                       last_verified=local.get("last_verified"),
                                       expiry_date=self.expiry_date, plan=self.plan,
                                       notified_30d=True, notified_7d=notified_7d)
                self.result = True

            elif days > 0:
                if not notified_7d:
                    messagebox.showwarning("구독 만료 임박",
                        f"구독 만료까지 {days}일 남았습니다!\n빠른 시일 내 갱신해주세요.")
                    save_local_license(local["hwid"], local["key"],
                                       last_verified=local.get("last_verified"),
                                       expiry_date=self.expiry_date, plan=self.plan,
                                       notified_30d=notified_30d, notified_7d=True)
                self.result = True

            elif days >= -7:
                grace_left = 7 + days
                messagebox.showwarning("구독 만료 — 유예기간",
                    f"구독이 만료되었습니다.\n유예기간: {grace_left}일 남았습니다.\n갱신해주세요.")
                self.result = True

            else:
                messagebox.showerror("구독 만료",
                    "구독 유예기간이 종료되었습니다.\n라이선스 키를 다시 입력해주세요.")
                delete_local_license()
                self._show_key_input()
        except Exception:
            self.result = True

    def _show_start_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("PPT Subtitle Helper")
        win.geometry("400x260")
        win.configure(bg=BG_DEEP)
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text="PPT SUBTITLE HELPER",
                 font=("Malgun Gothic", 14, "bold"), fg=ACCENT, bg=BG_DEEP).pack(pady=(30, 4))
        tk.Label(win, text="이 소프트웨어는 라이선스가 필요합니다.",
                 font=("Malgun Gothic", 9), fg=FG_MUTED, bg=BG_DEEP).pack()
        tk.Label(win, text="7일 무료 체험판을 시작하거나 라이선스 키를 입력하세요.",
                 font=("Malgun Gothic", 9), fg=FG_MUTED, bg=BG_DEEP).pack(pady=(2, 20))

        def start_trial():
            resp = server_request("trial_register", {"hwid": self.hwid})
            if resp and resp.get("status") == "trial_active":
                win.destroy()
                messagebox.showinfo("체험 시작", f"체험판이 시작되었습니다.\n남은 기간: {resp.get('remaining', 7)}일")
                self.result = True
            else:
                messagebox.showerror("오류", "체험 등록 실패. 잠시 후 다시 시도하세요.")

        def enter_key():
            win.destroy()
            self._show_key_input()

        btn_frame = tk.Frame(win, bg=BG_DEEP)
        btn_frame.pack(fill="x", padx=40)

        tk.Button(btn_frame, text="7일 무료 체험 시작", command=start_trial,
                  bg=BTN_BG, fg=BTN_FG, relief="flat",
                  font=("Malgun Gothic", 10, "bold"), cursor="hand2", pady=9).pack(fill="x", pady=(0, 8))
        tk.Button(btn_frame, text="라이선스 키 입력", command=enter_key,
                  bg=BG_CARD, fg=FG_PRIMARY, relief="flat",
                  font=("Malgun Gothic", 10), cursor="hand2", pady=9,
                  highlightbackground=BG_BORDER, highlightthickness=1).pack(fill="x")

        win.wait_window()

    def _show_trial_active(self, remaining):
        win = tk.Toplevel(self.root)
        win.title("PPT Subtitle Helper — 체험판")
        win.geometry("400x240")
        win.configure(bg=BG_DEEP)
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text="PPT SUBTITLE HELPER",
                 font=("Malgun Gothic", 14, "bold"), fg=ACCENT, bg=BG_DEEP).pack(pady=(30, 4))
        tk.Label(win, text=f"체험판 사용 중  |  남은 기간: {remaining}일",
                 font=("Malgun Gothic", 10), fg=FG_PRIMARY, bg=BG_DEEP).pack(pady=(4, 20))

        def continue_trial():
            win.destroy()
            self.result = True

        def enter_key():
            win.destroy()
            self._show_key_input()

        btn_frame = tk.Frame(win, bg=BG_DEEP)
        btn_frame.pack(fill="x", padx=40)

        tk.Button(btn_frame, text="계속 체험판으로 사용", command=continue_trial,
                  bg=BTN_BG, fg=BTN_FG, relief="flat",
                  font=("Malgun Gothic", 10, "bold"), cursor="hand2", pady=9).pack(fill="x", pady=(0, 8))
        tk.Button(btn_frame, text="라이선스 키 등록", command=enter_key,
                  bg=BG_CARD, fg=FG_PRIMARY, relief="flat",
                  font=("Malgun Gothic", 10), cursor="hand2", pady=9,
                  highlightbackground=BG_BORDER, highlightthickness=1).pack(fill="x")

        win.wait_window()

    def _show_expired_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("체험 기간 만료")
        win.geometry("400x220")
        win.configure(bg=BG_DEEP)
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text="체험 기간이 종료되었습니다.",
                 font=("Malgun Gothic", 13, "bold"), fg=ACCENT, bg=BG_DEEP).pack(pady=(36, 6))
        tk.Label(win, text="계속 사용하려면 라이선스 키를 등록하세요.",
                 font=("Malgun Gothic", 9), fg=FG_MUTED, bg=BG_DEEP).pack(pady=(0, 24))

        def enter_key():
            win.destroy()
            self._show_key_input()

        tk.Button(win, text="라이선스 키 입력", command=enter_key,
                  bg=BTN_BG, fg=BTN_FG, relief="flat",
                  font=("Malgun Gothic", 10, "bold"), cursor="hand2", pady=9).pack(fill="x", padx=40)

        win.wait_window()

    def _show_key_input(self):
        win = tk.Toplevel(self.root)
        win.title("라이선스 키 입력")
        win.geometry("420x200")
        win.configure(bg=BG_DEEP)
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text="라이선스 키를 입력하세요.",
                 font=("Malgun Gothic", 11, "bold"), fg=FG_PRIMARY, bg=BG_DEEP).pack(pady=(30, 12))

        key_var = tk.StringVar()
        entry = tk.Entry(win, textvariable=key_var, font=("Malgun Gothic", 11),
                         bg=BG_INPUT, fg=FG_PRIMARY, insertbackground=ACCENT,
                         relief="flat", highlightbackground=BG_BORDER, highlightthickness=1,
                         justify="center")
        entry.pack(fill="x", padx=40, ipady=7)
        entry.focus()

        msg_label = tk.Label(win, text="", font=("Malgun Gothic", 9), bg=BG_DEEP, fg=FG_MUTED)
        msg_label.pack(pady=(6, 0))

        def activate():
            key = key_var.get().strip()
            if not key:
                msg_label.config(text="키를 입력하세요.")
                return
            msg_label.config(text="확인 중...")
            win.update()
            resp = server_request("activate", {"hwid": self.hwid, "key": key})
            if resp is None:
                msg_label.config(text="서버 연결 실패. 인터넷을 확인하세요.", fg="#e06060")
                return
            status = resp.get("status", "")
            if status in ("activated", "already_active"):
                self.expiry_date = resp.get("expiry_date", "")
                self.plan = resp.get("plan", "")
                save_local_license(self.hwid, key,
                                   expiry_date=self.expiry_date, plan=self.plan)
                win.destroy()
                messagebox.showinfo("인증 완료", "라이선스가 등록되었습니다.")
                self.result = True
            elif status == "invalid_key":
                msg_label.config(text="유효하지 않은 키입니다.", fg="#e06060")
            elif status == "max_reached":
                msg_label.config(text=f"최대 등록 기기 수 초과 ({resp.get('max', 1)}대).", fg="#e06060")
            else:
                msg_label.config(text=f"오류: {status}", fg="#e06060")

        tk.Button(win, text="확인", command=activate,
                  bg=BTN_BG, fg=BTN_FG, relief="flat",
                  font=("Malgun Gothic", 10, "bold"), cursor="hand2", pady=8).pack(fill="x", padx=40, pady=(12, 0))

        win.wait_window()


# --- 메인 앱 ---
class App:
    def __init__(self, root, expiry_date="", plan="", license_info=""):
        self.root = root
        self.expiry_date = expiry_date
        self.plan = plan
        self.license_info = license_info
        self.root.title("PPT Subtitle Helper")
        self.root.geometry("820x740")
        self.root.configure(bg=BG_DEEP)

        # ttk 스타일
        style = ttk.Style()
        style.theme_use("default")
        style.configure("TNotebook",
                        background=BG_DEEP, borderwidth=0, tabmargins=[0, 0, 0, 0])
        style.configure("TNotebook.Tab",
                        background=BG_CARD, foreground=FG_MUTED,
                        font=("Malgun Gothic", 10), padding=[20, 9], borderwidth=0)
        style.map("TNotebook.Tab",
                  background=[("selected", BG_DEEP), ("active", BG_BORDER)],
                  foreground=[("selected", ACCENT), ("active", FG_PRIMARY)])
        style.configure("TCombobox",
                        fieldbackground=BG_INPUT, background=BG_INPUT,
                        foreground=FG_PRIMARY, selectbackground=ACCENT_DIM,
                        arrowcolor=ACCENT, borderwidth=0, relief="flat")
        style.map("TCombobox",
                  fieldbackground=[("readonly", BG_INPUT)],
                  foreground=[("readonly", FG_PRIMARY)])
        style.configure("TProgressbar",
                        background=ACCENT, troughcolor=BG_BORDER,
                        borderwidth=0, thickness=4)

        # 탭 위 상단 바 (라이선스 정보 표시)
        topbar = tk.Frame(self.root, bg=BG_CARD,
                          highlightbackground=BG_BORDER, highlightthickness=1)
        topbar.pack(fill="x")
        tk.Label(topbar, text="PPT Subtitle Helper  v1.7",
                 bg=BG_CARD, fg=FG_MUTED, font=("Malgun Gothic", 8)).pack(side="left", padx=16, pady=6)

        expiry_text = get_expiry_display(self.expiry_date, self.plan) or self.license_info
        if expiry_text:
            fg = "#e06060" if "✕" in expiry_text or ("만료" in expiry_text and "유예" in expiry_text) \
                 else "#e0a030" if "⚠" in expiry_text or "△" in expiry_text \
                 else FG_MUTED
            tk.Label(topbar, text=expiry_text,
                     bg=BG_CARD, fg=fg, font=("Malgun Gothic", 8)).pack(side="right", padx=16, pady=6)

        self.nb = ttk.Notebook(self.root)
        self.nb.pack(fill="both", expand=True)
        self.nb.add(HashtagInjectorTab(self.nb),   text="  해시태그 삽입  ")

if __name__ == "__main__":
    mutex_name = "Global\SJE_PPT_Subtitle_Helper_Mutex"
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, False, mutex_name)
    if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        root_temp = tk.Tk()
        root_temp.withdraw()
        from tkinter import messagebox
        messagebox.showwarning("경고", "프로그램이 이미 실행 중입니다.")
        import sys
        sys.exit(0)
    root = tk.Tk()
    root.withdraw()

    lic = LicenseDialog(root)
    lic.check_and_run()

    if not lic.result:
        root.destroy()
        sys.exit(0)

    root.deiconify()
    app = App(root, expiry_date=lic.expiry_date, plan=lic.plan, license_info=lic.license_info)
    root.mainloop()