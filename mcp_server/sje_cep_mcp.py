"""
SJE CEP MCP 서버
CEP 패널(sje_cep)과 파일 IPC로 통신합니다.
임시 폴더: %TEMP%/sje-cep-bridge
"""

import os
import sys
import time
import json
import tempfile
import uuid
from pathlib import Path
from mcp.server.fastmcp import FastMCP


def _acquire_singleton_lock() -> None:
    """이미 같은 스크립트의 다른 인스턴스가 실행 중이면 즉시 종료.
    Windows: 파일을 독점 모드로 열고 PID를 적어 둔다.
    잠금 파일은 OS가 프로세스 종료 시 자동으로 해제한다."""
    lock_path = Path(tempfile.gettempdir()) / "sje_cep_mcp.lock"
    try:
        if sys.platform == "win32":
            import msvcrt
            fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT)
            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            except OSError:
                os.close(fd)
                print(f"[singleton] another sje_cep_mcp.py is already running. Exiting PID {os.getpid()}.",
                      file=sys.stderr)
                sys.exit(0)
            os.write(fd, str(os.getpid()).encode())
            # fd는 프로세스 수명 동안 살아 있어야 lock이 유지됨 → 전역에 보관
            globals()["_lock_fd"] = fd
    except SystemExit:
        raise
    except Exception as e:
        print(f"[singleton] skipped: {e}", file=sys.stderr)


_acquire_singleton_lock()

mcp = FastMCP("sje-cep")

TEMP_DIR = Path(tempfile.gettempdir()) / "sje-cep-bridge"
TIMEOUT  = 30.0  # 초


def _send(script: str, timeout: float = TIMEOUT) -> dict:
    """ExtendScript를 CEP 패널로 전송하고 결과를 반환합니다."""
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    cmd_id   = uuid.uuid4().hex
    cmd_path = TEMP_DIR / f"cmd_{cmd_id}.jsx"
    res_path = TEMP_DIR / f"res_{cmd_id}.json"

    cmd_path.write_text(script, encoding="utf-8")

    deadline = time.time() + timeout
    while time.time() < deadline:
        if res_path.exists():
            try:
                result = json.loads(res_path.read_text(encoding="utf-8"))
                res_path.unlink(missing_ok=True)
                return result
            except Exception as e:
                return {"ok": False, "error": f"결과 파싱 실패: {e}"}
        time.sleep(0.1)

    try: cmd_path.unlink(missing_ok=True)
    except: pass
    return {"ok": False, "error": f"timeout ({timeout}s) — CEP 패널이 실행 중인지 확인하세요"}


def _jsx(call: str) -> str:
    """SJE.함수() 호출을 감싸는 ExtendScript 템플릿"""
    return f"SJE.{call};"


# ---------- MCP 도구 ----------

@mcp.tool()
def razor_at_seconds(seconds: float) -> dict:
    """지정한 초(seconds) 위치에서 모든 트랙을 razor(컷)합니다."""
    return _send(_jsx(f"razorAtSeconds({seconds})"))


@mcp.tool()
def razor_multiple(seconds_list: list) -> dict:
    """여러 초 위치를 한 번에 razor합니다. seconds_list: [초, 초, ...]"""
    return _send(_jsx(f"razorMultiple({json.dumps(seconds_list)})"))


@mcp.tool()
def remove_clips_in_ranges(ranges: list) -> dict:
    """
    NG 구간 클립을 삭제합니다 (ripple=false, 멀티트랙 싱크 유지).
    ranges: [[start_sec, end_sec], ...]
    """
    return _send(_jsx(f"removeClipsInRanges({json.dumps(ranges)})"))


@mcp.tool()
def get_sequence_info_cep() -> dict:
    """CEP 경유로 활성 시퀀스 기본 정보를 조회합니다."""
    return _send(_jsx("getSequenceInfo()"))


if __name__ == "__main__":
    mcp.run()
