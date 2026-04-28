# PPRS 작업 세션 로그
날짜: 2026-04-11

---

## 1. PPRS 프로젝트 파일 구조

**경로:** `E:\custom_script\PPRS`

- `index.html` — UI 및 버튼 로직
- `script.jsx` — Premiere Pro JSX 엔진
- `CSInterface.js` — CEP 통신 래퍼
- `CSXS/manifest.xml` — 확장 패널 설정

---

## 2. 작업 내역

### [1] 1단계 버튼 이름 변경 및 마커 연동

**요청:** 버튼 이름을 `[Slide 1]`로 변경, 버튼 클릭 시 버튼 이름이 마커 이름으로 플레이헤드 위치에 삽입

**수정 파일:** `index.html`

**변경 내용:**
- 마커명 입력 필드(`<input>`)와 `마커명` 라벨 제거
- 버튼 텍스트: `✂️🔖 자르기 + 마커 추가` → `[Slide 1]`
- JS 클릭 핸들러: `marker-name-input` 값 대신 `this.innerText.trim()` 사용

**수정 전 코드 (index.html):**
```html
<!-- 마커 이름 입력 -->
<div class="marker-input-row">
    <label>마커명</label>
    <input type="text" id="marker-name-input" value="Slide 1" placeholder="예: Slide 1" />
</div>
<!-- 자르기 + 마커 동시 -->
<button class="btn btn-marker" id="razor-marker-btn">✂️🔖 자르기 + 마커 추가</button>
```

**수정 후 코드 (index.html):**
```html
<!-- 자르기 + 마커 동시 -->
<button class="btn btn-marker" id="razor-marker-btn">[Slide 1]</button>
```

**JS 변경:**
```js
// 수정 전
document.getElementById('razor-marker-btn').onclick = function () {
    var markerName = document.getElementById('marker-name-input').value.trim();
    if (!markerName) {
        alert('마커 이름을 입력해주세요.');
        return;
    }
    var jsxCall = '$._PPP_.razorAndMark(' + JSON.stringify(markerName) + ')';
    runJsx(jsxCall, this, '⏳ 처리 중...', '✂️🔖 자르기 + 마커 추가');
};

// 수정 후
document.getElementById('razor-marker-btn').onclick = function () {
    var markerName = this.innerText.trim();
    var jsxCall = '$._PPP_.razorAndMark(' + JSON.stringify(markerName) + ')';
    var idleText = markerName;
    runJsx(jsxCall, this, '⏳ 처리 중...', idleText);
};
```

---

## 3. PR_Angle_Switcher 코드 파악

**경로:** `E:\custom_script\Subtitle\PR_Angle_Switcher`

**파악 목적:** PPRS에 필요한 기능을 가져오기 위한 사전 분석

### index.html 주요 기능
| 항목 | 내용 |
|---|---|
| 라이선스 시스템 | PowerShell로 HWID 조회, 구글 스크립트 서버 통신, 7일 체험/월간/연간 구독 관리 |
| 서버 통신 방식 | PS1 파일 임시 생성 → PowerShell 실행 → txt 결과 읽기 (CEP HTTPS 제한 우회) |
| 버튼 3개 | 1단계(자막 위치 자르기), 2단계(앵글 스위칭), 3단계(이미지 배치) |
| runWithAuth() | 버튼 클릭 시 인증 확인 후 JSX 실행 |
| runJsx() | 버튼 비활성화 → JSX 실행 → 버튼 복원 |

### script.jsx 주요 함수
| 함수 | 역할 |
|---|---|
| `getAuthState()` | 로컬 라이선스 파일 읽어 인증 상태 반환 |
| `saveLocalLicense()` / `deleteLocalLicense()` | 라이선스 파일 저장/삭제 |
| `razorAtSeconds()` | QE API로 특정 시간에 모든 트랙 자르기 |
| `autoRazorTracks()` | SRT 또는 클립명에서 Slide 위치 파싱 → 자르기 + 마커 생성 |
| `createMarkersFromCutData()` | Slide 위치에 마커 자동 생성 (`[Slide N]` 이름) |
| `autoSwitchAngle()` | cutData 기반으로 정면/좌측/우측 트랙 클립 활성/비활성 토글 |
| `autoPlaceImages()` | SRT 파싱 → 이미지 검색 → 트랙에 배치 + 길이 조정 |
| `findSrtInProject()` | 프로젝트 패널에서 SRT 파일 자동 탐색 |
| `parseSrtFile()` / `parseAllSrtBlocks()` | SRT 파싱 (Slide 포함 블록만 / 전체 블록) |
| `extractSlideNumber()` | `[Slide N]` 패턴에서 번호 추출 |
| `extractImageNumbers()` | `#N`, `#N-M` 패턴에서 이미지 번호 추출 |

---

## 4. PR_Angle_Switcher 2단계 기능 통합

**요청:** PR_Angle_Switcher의 2단계(앵글 자동 스위칭) 기능을 PPRS로 이식

### script.jsx 추가
- `STR` 상수 — `{ FRONT: "정면", LEFT: "좌측", RIGHT: "우측" }`
- `autoSwitchAngle()` — 원본과 동일한 로직, 단 `_cutData` 대신 **시퀀스 마커**를 직접 읽어 cutData 구성
- `applySwitch()` — 구간별 트랙 활성/비활성 보조 함수

### index.html 추가
- `.btn-switch` 스타일 (파란 계열 `#3a4a5a`)
- "앵글 자동 스위칭" 버튼 (`id="switch-btn"`)
- 클릭 시 `$._PPP_.autoSwitchAngle()` 호출

### 동작 방식
1. `[Slide 1]` 버튼으로 자르기 + 마커 추가 (마커 이름에 `정면`/`좌측`/`우측` 포함)
2. "앵글 자동 스위칭" 버튼 클릭 → 마커 이름 키워드 기반으로 해당 구간 트랙 활성/비활성 자동 처리

---

## 5. [Slide X] 번호 자동 증가 기능 구현

**요청:** 시작 번호를 직접 지정하고, 버튼 클릭마다 번호가 +1씩 증가

### index.html HTML 변경
- `시작 번호` 라벨 + `<input type="number">` (min=1, 기본값=1, id=`slide-start-input`) 추가
- CSS: `.slide-num-row` 스타일 추가

### index.html JS 변경
- `slideNum` 변수로 현재 번호 관리
- input `oninput` → `slideNum` 반영 + 버튼 텍스트 즉시 갱신
- Slide 버튼 클릭 핸들러: `csInterface.evalScript` 직접 호출
  - JSX 완료 콜백에서 `slideNum++` → 버튼 텍스트 + input 값 동시 갱신

---

## 6. 앵글 태그 버튼 추가 (정면/좌측/우측)

**요청:** `[Slide X]` 마커가 찍힌 위치에서 앵글 버튼을 누르면 같은 마커 이름에 `, [정면]` 형태로 append

### 동작 흐름
```
[Slide 3] 클릭 → 마커명: "[Slide 3]"
[정면]    클릭 → 마커명: "[Slide 3], [정면]"
[좌측]    클릭 → 마커명: "[Slide 3], [좌측]"  (교체)
```

### script.jsx 추가 — `appendAngleToLastMarker(angleName)`
- 플레이헤드 이하의 마커 중 가장 가까운 것 탐색
- 기존 앵글 태그(`[정면]`/`[좌측]`/`[우측]`) 제거 후 새 앵글 append
- 마커 없으면 alert

### index.html HTML 추가
- `.angle-row` (flex row) 안에 `정면` / `좌측` / `우측` 버튼 3개 (`btn-angle`, 보라 계열 `#4a3a5a`)

### index.html JS 추가
- `['front','left','right']` forEach로 각 버튼에 클릭 핸들러 등록
- 클릭 시 `$._PPP_.appendAngleToLastMarker("정면")` 형태로 JSX 호출

---

## 7. 3구역 분리 디자인

**요청:** 자르기 / 슬라이드 마커 / 앵글 스위칭을 구역별로 명확히 구분

### 변경 내용
- 단일 `.section` → 3개 독립 섹션으로 분리
- 각 섹션 헤더 좌측에 컬러 액센트 바 (2px)
  - 자르기: 회색 `#666`
  - 슬라이드 마커: 초록 `#4a8a4a`
  - 앵글 스위칭: 파랑 `#4a7aaa`
- 섹션 헤더 텍스트: 대문자 스타일, 10px, `#999`
- 버튼 색상 정리: razor(회색) / marker(진초록) / switch(진파랑) / angle(보라)

---

## 8. 이미지 번호 버튼 [#N] 추가

**요청:** 슬라이드 버튼처럼 시작번호 지정 + 클릭마다 +1 증가하는 `[#N]` 버튼

### index.html 변경
- `.btn-img` 스타일 추가 (주황 계열 `#5a4a2a` / 글자 `#f0d8a0`)
- `.section-divider` — 앵글 버튼과 이미지 버튼 사이 구분선
- `이미지 번호` 라벨 + `<input type="number">` (id=`img-start-input`, 기본값 1)
- `[#1]` 버튼 (id=`img-marker-btn`)
- `imgNum` 변수, `updateImgBtn()` 함수
- `img-start-input` oninput → `imgNum` 반영
- 버튼 클릭 시 `appendImgToLastMarker()` 호출 → 완료 후 `imgNum++`

### script.jsx 추가 — `appendImgToLastMarker(imgTag)`
- 플레이헤드 ±0.1초 이내 마커 탐색
  - 마커 **있음** → 기존 `[#N]` 태그 제거 후 새 태그 append/교체
  - 마커 **없음** → 새 마커 생성 후 `[#N]` 이름 설정 (초록색)

### 동작 흐름
```
Slide 마커 위치에서  →  [#1] 클릭  →  "[Slide 3], [#1]"
마커 없는 위치에서   →  [#1] 클릭  →  새 마커 생성 "[#1]"
같은 위치에서        →  [#2] 클릭  →  "[Slide 3], [#2]"  (교체)
```
