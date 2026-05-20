import json
import os
import queue
import socket
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-pc-control")

HTTP_HOST = "127.0.0.1"
HTTP_PORT = 8765

# 명령 큐: UXP가 GET /poll 로 가져감
_command_queue = queue.Queue()
# 응답 대기: id -> threading.Event + result holder
_pending = {}
_pending_lock = threading.Lock()


class BridgeHandler(BaseHTTPRequestHandler):
    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/poll":
            # 짧은 대기로 명령을 가져온다. 없으면 빈 응답.
            try:
                cmd = _command_queue.get(timeout=25.0)
                self._send_json(200, cmd)
            except queue.Empty:
                self._send_json(200, {})
        elif self.path == "/ping":
            self._send_json(200, {"ok": True})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "invalid json"})
            return

        if self.path == "/result":
            cid = data.get("id")
            with _pending_lock:
                slot = _pending.get(cid)
            if slot:
                slot["result"] = data.get("result")
                slot["event"].set()
            self._send_json(200, {"ok": True})
        elif self.path == "/submit":
            # 다른 인스턴스(또는 자기 자신)가 위임한 명령. 큐에 넣고 결과를 동기 대기.
            command = data.get("command") or {}
            timeout = float(data.get("timeout", 10.0))
            result = _submit_local(command, timeout)
            self._send_json(200, {"result": result})
        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, format, *args):
        pass  # silence stderr


def _start_http_server():
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), BridgeHandler)
    server.serve_forever()


def _port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.connect((host, port))
            return True
        except OSError:
            return False


if _port_in_use(HTTP_HOST, HTTP_PORT):
    print(
        f"[bridge] {HTTP_HOST}:{HTTP_PORT} already in use — another instance is running. Exiting PID {os.getpid()}.",
        file=sys.stderr,
    )
    sys.exit(0)
else:
    threading.Thread(target=_start_http_server, daemon=True).start()


def _submit_local(command: dict, timeout: float = 10.0):
    """이 프로세스의 큐에 명령을 넣고 UXP 응답을 동기 대기. 브리지를 가진 프로세스에서만 의미 있음."""
    cid = str(uuid.uuid4())
    command = dict(command)
    command["id"] = cid

    event = threading.Event()
    slot = {"event": event, "result": None}
    with _pending_lock:
        _pending[cid] = slot

    _command_queue.put(command)

    if not event.wait(timeout):
        with _pending_lock:
            _pending.pop(cid, None)
        return {"ok": False, "error": "timeout waiting for UXP"}

    with _pending_lock:
        _pending.pop(cid, None)
    return slot["result"]


def _send_to_uxp(command: dict, timeout: float = 10.0):
    """무조건 8765 HTTP 브리지로 위임. 어느 인스턴스에서 호출되든 결과가 동일하다.

    1) 자기 프로세스가 브리지를 가졌으면 localhost 루프백으로 자기에게 POST → _submit_local 호출.
    2) 다른 프로세스가 가졌으면 그쪽에 POST.
    이렇게 해서 명령 큐가 8765 LISTEN 프로세스 하나로 모인다.
    """
    payload = json.dumps({"command": command, "timeout": timeout}).encode("utf-8")
    req = urllib.request.Request(
        f"http://{HTTP_HOST}:{HTTP_PORT}/submit",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    # HTTP 자체 타임아웃은 UXP 타임아웃 + 여유 5초.
    try:
        with urllib.request.urlopen(req, timeout=timeout + 5.0) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body).get("result")
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"bridge unreachable: {e}"}
    except Exception as e:
        return {"ok": False, "error": f"bridge call failed: {e}"}


@mcp.tool()
def open_premiere():
    """Adobe Premiere Pro 2026를 실행합니다."""
    path = r"C:\Program Files\Adobe\Adobe Premiere Pro 2026\Adobe Premiere Pro.exe"
    if os.path.exists(path):
        try:
            subprocess.Popen([path], creationflags=subprocess.CREATE_NEW_CONSOLE)
            return "프리미어 프로 2026 실행 명령을 성공적으로 보냈습니다."
        except Exception as e:
            return f"실행 중 오류 발생: {str(e)}"
    else:
        return f"프리미어 2026 설치 경로({path})를 찾을 수 없습니다."


@mcp.tool()
def cut_at_playhead():
    """프리미어 프로 타임라인의 현재 재생 헤드 위치에서 컷(분할)을 실행합니다. UXP 플러그인을 통해 호출됩니다."""
    result = _send_to_uxp({"type": "cut_at_playhead"})
    if isinstance(result, dict) and result.get("ok"):
        return "현재 재생 헤드 위치에서 컷(분할)을 완료했습니다."
    return f"컷 실행 실패: {result}"


@mcp.tool()
def get_sequence_info():
    """현재 활성 시퀀스의 트랙/클립 구성과 재생헤드 위치(초 단위)를 반환합니다."""
    return _send_to_uxp({"type": "get_sequence_info"}, timeout=20.0)


@mcp.tool()
def import_media(file_paths: list[str]):
    """파일 경로 리스트를 활성 프로젝트의 루트 빈에 임포트합니다."""
    return _send_to_uxp({"type": "import_media", "filePaths": file_paths}, timeout=60.0)


@mcp.tool()
def add_clip_to_sequence(
    item_name: str,
    time_seconds: float = 0.0,
    video_track_index: int = 0,
    audio_track_index: int = 0,
    overwrite: bool = False,
):
    """프로젝트 아이템(itemName)을 활성 시퀀스의 지정 트랙·시각에 삽입(또는 덮어쓰기)합니다."""
    return _send_to_uxp({
        "type": "add_clip_to_sequence",
        "itemName": item_name,
        "timeSeconds": time_seconds,
        "videoTrackIndex": video_track_index,
        "audioTrackIndex": audio_track_index,
        "overwrite": overwrite,
    }, timeout=30.0)


@mcp.tool()
def add_marker(
    name: str,
    time_seconds: float,
    duration_seconds: float = 0.0,
    comment: str = "",
):
    """활성 시퀀스의 지정 시각에 마커를 추가합니다."""
    return _send_to_uxp({
        "type": "add_marker",
        "name": name,
        "timeSeconds": time_seconds,
        "durationSeconds": duration_seconds,
        "comment": comment,
    }, timeout=15.0)


@mcp.tool()
def create_bin(bin_name: str):
    """활성 프로젝트 루트에 새 빈(폴더)을 생성합니다."""
    return _send_to_uxp({"type": "create_bin", "binName": bin_name}, timeout=10.0)


@mcp.tool()
def move_items_to_bin(bin_name: str, item_names: list[str]):
    """프로젝트 아이템들을 지정한 빈으로 이동합니다. bin_name: 대상 빈 이름, item_names: 이동할 아이템 이름 목록."""
    return _send_to_uxp({"type": "move_items_to_bin", "binName": bin_name, "itemNames": item_names}, timeout=15.0)


@mcp.tool()
def delete_bin(bin_name: str):
    """지정한 빈(폴더)을 삭제합니다."""
    return _send_to_uxp({"type": "delete_bin", "binName": bin_name}, timeout=10.0)


@mcp.tool()
def export_frame(file_path: str, time_seconds: float = 0):
    """활성 시퀀스의 특정 시각(초)을 이미지 파일로 추출합니다. file_path: 저장 경로 (예: E:/유튜브/frame.png)."""
    return _send_to_uxp({"type": "export_frame", "filePath": file_path, "timeSeconds": time_seconds}, timeout=30.0)


@mcp.tool()
def mute_track(track_kind: str, track_index: int, mute: bool):
    """트랙을 음소거하거나 해제합니다. track_kind: 'V' 또는 'A'. mute: True=음소거, False=해제."""
    return _send_to_uxp({"type": "mute_track", "trackKind": track_kind, "trackIndex": track_index, "mute": mute}, timeout=10.0)


@mcp.tool()
def export_sequence(output_path: str, preset_path: str, use_ame: bool = False):
    """활성 시퀀스를 익스포트합니다. use_ame=False(기본): Premiere 내부 렌더링. use_ame=True: AME 큐에 등록(AME 자동시작 옵션 필요)."""
    return _send_to_uxp({
        "type": "export_sequence",
        "outputPath": output_path,
        "presetPath": preset_path,
        "useAme": use_ame,
    }, timeout=600.0)


@mcp.tool()
def set_playhead(time_seconds: float):
    """활성 시퀀스의 재생헤드를 지정 시각(초)으로 이동합니다."""
    return _send_to_uxp({"type": "set_playhead", "timeSeconds": time_seconds}, timeout=10.0)


@mcp.tool()
def delete_clip(track_kind: str, track_index: int, clip_index: int, ripple: bool = False):
    """활성 시퀀스의 특정 클립을 삭제합니다. track_kind는 'V' 또는 'A'. clip_index는 get_sequence_info가 돌려주는 clips 배열의 인덱스."""
    return _send_to_uxp({
        "type": "delete_clip",
        "trackKind": track_kind,
        "trackIndex": track_index,
        "clipIndex": clip_index,
        "ripple": ripple,
    }, timeout=15.0)


@mcp.tool()
def insert_srt(item_name: str):
    """프로젝트 패널의 SRT 파일을 활성 시퀀스의 캡션 트랙에 삽입합니다. item_name: 프로젝트 패널에 있는 SRT 파일 이름."""
    return _send_to_uxp({
        "type": "insert_srt",
        "itemName": item_name,
    }, timeout=15.0)


@mcp.tool()
def insert_mogrt(mogrt_path: str, time_seconds: float = 0.0, video_track_index: int = 0):
    """MOGRT 템플릿 파일을 활성 시퀀스의 지정 시각/트랙에 삽입합니다. mogrt_path: .mogrt 파일의 전체 경로."""
    return _send_to_uxp({
        "type": "insert_mogrt",
        "mogrtPath": mogrt_path,
        "timeSeconds": time_seconds,
        "videoTrackIndex": video_track_index,
    }, timeout=30.0)


@mcp.tool()
def close_gaps(track_kind: str = "video", track_index: int = 0):
    """활성 시퀀스의 지정 트랙에서 클립 사이의 빈 공간을 모두 제거합니다(앞으로 당기기). track_kind: 'video' 또는 'audio'."""
    return _send_to_uxp({
        "type": "close_gaps",
        "trackKind": track_kind,
        "trackIndex": track_index,
    }, timeout=30.0)


@mcp.tool()
def set_clip_start_end(track_kind: str, track_index: int, clip_index: int, start_time_ticks: int, end_time_ticks: int):
    """활성 시퀀스의 특정 클립의 시작/끝 시간을 틱 단위로 직접 설정합니다. get_sequence_info로 현재 틱 값을 먼저 확인하세요."""
    return _send_to_uxp({
        "type": "set_clip_start_end",
        "trackKind": track_kind,
        "trackIndex": track_index,
        "clipIndex": clip_index,
        "startTimeTicks": start_time_ticks,
        "endTimeTicks": end_time_ticks,
    }, timeout=15.0)


@mcp.tool()
def move_clip(track_kind: str, track_index: int, clip_index: int, new_start_seconds: float):
    """활성 시퀀스의 특정 클립을 새 시작 시각으로 이동합니다."""
    return _send_to_uxp({
        "type": "move_clip",
        "trackKind": track_kind,
        "trackIndex": track_index,
        "clipIndex": clip_index,
        "newStartSeconds": new_start_seconds,
    }, timeout=15.0)


@mcp.tool()
def list_project_items():
    """활성 프로젝트의 모든 빈 아이템 목록(이름, 타입, 하위 빈 포함)을 반환합니다."""
    return _send_to_uxp({"type": "list_project_items"}, timeout=15.0)


@mcp.tool()
def set_clip_disabled(track_kind: str, track_index: int, clip_index: int, disabled: bool):
    """활성 시퀀스의 특정 클립을 활성/비활성으로 설정합니다."""
    return _send_to_uxp({
        "type": "set_clip_disabled",
        "trackKind": track_kind,
        "trackIndex": track_index,
        "clipIndex": clip_index,
        "disabled": disabled,
    }, timeout=10.0)


@mcp.tool()
def set_sequence_settings(frame_rate: float = None, width: int = None, height: int = None):
    """활성 시퀀스의 설정을 변경합니다. frame_rate: 초당 프레임 수 (예: 30, 29.97, 24). width/height: 프레임 크기(픽셀)."""
    return _send_to_uxp({
        "type": "set_sequence_settings",
        "frameRate": frame_rate,
        "width": width,
        "height": height,
    }, timeout=15.0)


@mcp.tool()
def open_work_folder():
    """자주 사용하는 작업 폴더를 엽니다."""
    path = r"E:\custom_script"
    try:
        os.startfile(path)
        return f"작업 폴더({path})를 열었습니다."
    except Exception as e:
        return f"폴더 열기 중 오류 발생: {str(e)}"


if __name__ == "__main__":
    import sys
    if "--bridge-only" in sys.argv:
        print(f"HTTP bridge listening on http://{HTTP_HOST}:{HTTP_PORT} (Ctrl+C to stop)")
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            pass
    else:
        mcp.run()
