# SJE Premiere MCP

Adobe Premiere Pro 자동화를 위한 MCP 서버 패키지입니다.

## 구성

```
sje-premiere-mcp/
├── mcp_server/
│   ├── premiere_uxp_mcp.py   — UXP 브리지 MCP 서버 (get_sequence_info, close_gaps 등)
│   └── sje_cep_mcp.py        — CEP 브리지 MCP 서버 (razor, remove 등)
├── uxp_plugin/               — UXP 플러그인 (Premiere 2024+)
│   ├── manifest.json
│   ├── index.html
│   └── main.js
└── cep_plugin/               — CEP 플러그인 (ExtendScript/QE DOM)
    ├── CSXS/manifest.xml
    ├── index.html
    ├── main.js
    ├── host.jsx
    └── CSInterface.js
```

## 설치

### 1. Python 의존성 설치
```
uv pip install mcp --system
```

### 2. UXP 플러그인 설치
- Adobe UXP Developer Tool 실행
- `uxp_plugin/manifest.json` 로드

### 3. CEP 플러그인 설치
- `cep_plugin` 폴더를 `%APPDATA%\Adobe\CEP\extensions\SJECEPBridge` 에 복사
- 레지스트리: `HKCU\Software\Adobe\CSXS.12\PlayerDebugMode = 1`

### 4. MCP 서버 등록 (~/.claude.json)
```json
"mcpServers": {
  "premiere": {
    "type": "stdio",
    "command": "C:/Users/<유저명>/.local/bin/uv.exe",
    "args": ["run", "--python", "3.14", "<설치경로>/mcp_server/premiere_uxp_mcp.py"]
  },
  "premiere-sje-cep": {
    "type": "stdio",
    "command": "C:/Users/<유저명>/.local/bin/uv.exe",
    "args": ["run", "--python", "3.14", "<설치경로>/mcp_server/sje_cep_mcp.py"]
  }
}
```

## 사용법

Premiere Pro 실행 후:
1. Window → Extensions → **SJE CEP Bridge** 열기 (자동 연결)
2. Adobe UXP Developer Tool에서 UXP 플러그인 로드 → Connect 클릭

## 도구 목록

### premiere (UXP)
- `get_sequence_info` — 시퀀스 트랙/클립 정보
- `list_project_items` — 프로젝트 패널 아이템
- `add_clip_to_sequence` — 클립 삽입
- `set_clip_start_end` — 클립 트리밍 (틱 단위)
- `delete_clip` — 클립 삭제
- `close_gaps` — 빈 공간 제거
- `move_clip` — 클립 이동
- `set_clip_disabled` — 클립 활성/비활성
- `add_marker` — 마커 추가
- `import_media` — 미디어 임포트
- `export_sequence` — 시퀀스 익스포트
- `mute_track` — 트랙 음소거
- `export_frame` — 프레임 추출
- `create_bin` / `delete_bin` / `move_items_to_bin` — 빈 관리
- `set_sequence_settings` — 시퀀스 설정 (fps, 해상도)
- `set_playhead` — 재생헤드 이동
- `insert_srt` — SRT 자막 삽입
- `insert_mogrt` — MOGRT 템플릿 삽입

### premiere-sje-cep (CEP/ExtendScript)
- `razor_at_seconds(seconds)` — 단일 초 위치 razor
- `razor_multiple(seconds_list)` — 여러 초 위치 한 번에 razor
- `remove_clips_in_ranges(ranges)` — NG 구간 클립 삭제 (ripple=false)
- `get_sequence_info_cep()` — 시퀀스 기본 정보
