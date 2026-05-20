/*
    Timeline Check Engine v1.3
    - razorAtPlayhead  : 현재 헤드 위치에서만 자르기
    - razorAndMark     : 현재 헤드 위치에서 자르기 + 사용자 지정 이름으로 마커 추가
    - autoSwitchAngle  : 시퀀스 마커를 기반으로 앵글 트랙 자동 활성/비활성
    - 라이선스 시스템 추가 (체험판 7일 / 월간·연간 구독)
*/

if (typeof $ === 'undefined') { $ = {}; }

// ============================================================
//  라이선스 — 로컬 저장/로드 (서버 통신은 index.html Node.js 담당)
// ============================================================

function escStr(s) {
    if (s === null || s === undefined) return "";
    return (s + "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n");
}

function getLicensePath() {
    return Folder.userData.fsName + "/PPRS/license.key";
}

function loadLocalLicense() {
    try {
        var f = new File(getLicensePath());
        if (!f.exists) return "null";
        f.encoding = "UTF-8"; f.open("r");
        var c = f.read(); f.close();
        return c;
    } catch (e) { return "null"; }
}

function saveLocalLicense(jsonStr) {
    try {
        var path = getLicensePath();
        var dir  = new Folder(new File(path).parent.fsName);
        if (!dir.exists) dir.create();
        var f = new File(path);
        f.encoding = "UTF-8"; f.open("w");
        f.write(jsonStr);
        f.close();
        return "ok";
    } catch (e) { return "error"; }
}

function deleteLocalLicense() {
    try {
        var f = new File(getLicensePath());
        if (f.exists) f.remove();
        return "ok";
    } catch (e) { return "error"; }
}

function generateHWID() {
    var computerName = $.getenv("COMPUTERNAME") || "UNKNOWN";
    var userName     = $.getenv("USERNAME")     || "UNKNOWN";
    return "FALLBACK_" + computerName + "_" + userName;
}

// index.html에서 evalScript로 호출 — HWID + 라이선스 상태 JSON 반환
function getAuthState(hwidFromJS) {
    try {
        var hwid  = (hwidFromJS && hwidFromJS.length > 5) ? hwidFromJS : generateHWID();
        var raw   = loadLocalLicense();
        var local = null;
        try { local = eval('(' + raw + ')'); } catch (e) {}

        var licensed      = !!(local && local.hwid === hwid && local.key);
        var key           = licensed ? escStr(local.key)          : "";
        var last_verified = local ? (local.last_verified || 0) : 0;
        var expiry_date   = licensed ? escStr(local.expiry_date)  : "";
        var plan          = local ? escStr(local.plan || "")      : "";
        var email         = local ? escStr(local.email || "")     : "";
        var n30           = licensed ? (local.notified_30d ? "true" : "false") : "false";
        var n7            = licensed ? (local.notified_7d  ? "true" : "false") : "false";

        return '{"hwid":"'          + escStr(hwid) + '"'  +
               ',"licensed":'       + (licensed ? "true" : "false") +
               ',"key":"'           + key           + '"' +
               ',"email":"'         + email         + '"' +
               ',"last_verified":'  + last_verified       +
               ',"expiry_date":"'   + expiry_date   + '"' +
               ',"plan":"'          + plan          + '"' +
               ',"notified_30d":'   + n30                 +
               ',"notified_7d":'    + n7            + '}';
    } catch (e) {
        return '{"licensed":false,"_dbg":"ERR:' + escStr(e.toString()) + '"}';
    }
}

$._PPP_ = {

    STR: { FRONT: "정면", LEFT: "좌측", RIGHT: "우측" },

    secondsToTimecode: function (totalSeconds) {
        var h = Math.floor(totalSeconds / 3600);
        var m = Math.floor((totalSeconds % 3600) / 60);
        var s = Math.floor(totalSeconds % 60);
        var f = Math.floor((totalSeconds % 1) * 30);
        var pad = function (n) { return (n < 10 ? "0" : "") + n; };
        return pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
    },

    movePlayheadTo: function (seconds) {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "시퀀스 없음";
            var t = new Time();
            t.seconds = parseFloat(seconds);
            seq.setPlayerPosition(t.ticks);
            return "ok";
        } catch(e) { return e.message; }
    },

    razorAtSeconds: function (_seq, seconds, selectedOnly) {
        var result = { success: false };
        try { app.enableQE(); } catch (e) { return result; }

        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return result;

        var tc = this.secondsToTimecode(seconds);

        try {
            if (selectedOnly) {
                // 선택된 클립이 있는 트랙만 자르기
                for (var v = 0; v < _seq.videoTracks.numTracks; v++) {
                    var ppVTrack = _seq.videoTracks[v];
                    var hasSelected = false;
                    for (var ci = 0; ci < ppVTrack.clips.numItems; ci++) {
                        if (ppVTrack.clips[ci].isSelected()) { hasSelected = true; break; }
                    }
                    if (hasSelected) {
                        var qeVt = qeSeq.getVideoTrackAt(v);
                        if (qeVt && typeof qeVt.razor === 'function') qeVt.razor(tc);
                    }
                }
                for (var a = 0; a < _seq.audioTracks.numTracks; a++) {
                    var ppATrack = _seq.audioTracks[a];
                    var hasSelected = false;
                    for (var ci = 0; ci < ppATrack.clips.numItems; ci++) {
                        if (ppATrack.clips[ci].isSelected()) { hasSelected = true; break; }
                    }
                    if (hasSelected) {
                        var qeAt = qeSeq.getAudioTrackAt(a);
                        if (qeAt && typeof qeAt.razor === 'function') qeAt.razor(tc);
                    }
                }
            } else {
                for (var v = 0; v < qeSeq.numVideoTracks; v++) {
                    var vt = qeSeq.getVideoTrackAt(v);
                    if (vt && typeof vt.razor === 'function') vt.razor(tc);
                }
                for (var a = 0; a < qeSeq.numAudioTracks; a++) {
                    var at = qeSeq.getAudioTrackAt(a);
                    if (at && typeof at.razor === 'function') at.razor(tc);
                }
            }
            result.success = true;
        } catch (e) {}

        return result;
    },

    // 헤드 위치에서 전체 트랙 자르기
    razorAtPlayhead: function () {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        var seconds = parseFloat(seq.getPlayerPosition().seconds);
        var result  = this.razorAtSeconds(seq, seconds, false);

        if (result.success) {
            // alert("✅ 자르기 완료");
        } else {
            alert("❌ 자르기 실패 (트랙 잠금 상태 등을 확인하세요)");
        }
    },

    srtToSeconds: function (timeStr) {
        timeStr = timeStr.replace(/\s/g, '').replace('.', ',');
        var parts = timeStr.split(',');
        var ms = parseInt(parts[1], 10) || 0;
        var tp = parts[0].split(':');
        var h = parseInt(tp[0], 10) || 0;
        var m = parseInt(tp[1], 10) || 0;
        var s = parseInt(tp[2], 10) || 0;
        return h * 3600 + m * 60 + s + (ms / 1000);
    },

    getClipTextContent: function (clip) {
        var res = clip.name ? (clip.name + "") : "";
        try {
            var comps = clip.getComponents();
            if (comps) {
                for (var i = 0; i < comps.numItems; i++) {
                    var props = comps[i].properties;
                    if (props) {
                        for (var p = 0; p < props.numItems; p++) {
                            var val = props[p].getValue();
                            if (val && val.toString().length > 0) {
                                var vStr = val.toString();
                                if (vStr.indexOf('textEditValue') !== -1) {
                                    var m = vStr.match(/"textEditValue"\s*:\s*"([^"]+)"/);
                                    if (m && m[1]) vStr = m[1];
                                }
                                res += " " + vStr;
                            }
                        }
                    }
                }
            }
        } catch (e) { }
        return res;
    },

    findSrtInProject: function () {
        var root = app.project.rootItem;
        if (!root || !root.children) return null;
        for (var i = 0; i < root.children.numItems; i++) {
            var item = root.children[i];
            if (item.name && item.name.toLowerCase().indexOf('.srt') !== -1) {
                return item.getMediaPath() || "";
            }
        }
        return null;
    },

    parseSrtFile: function (filePath) {
        var results = [];
        var f = new File(filePath);
        if (!f.exists) return results;
        f.encoding = "UTF-8"; f.open('r');
        var content = f.read(); f.close();
        content = content.replace(/^\uFEFF/g, '').replace(/\u0000/g, '');
        var blocks = content.split(/[\r\n]+\s*[\r\n]+/);
        for (var b = 0; b < blocks.length; b++) {
            var block = blocks[b];
            var timeMatch = block.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{2,3})\s*-->/);
            if (timeMatch && block.toLowerCase().indexOf('slide') !== -1) {
                results.push({
                    seconds: this.srtToSeconds(timeMatch[1]),
                    text: block
                });
            }
        }
        return results;
    },

    createMarkersFromCutData: function (seq, cutTimes) {
        var count = 0;
        try {
            for (var i = 0; i < cutTimes.length; i++) {
                var seconds = cutTimes[i].seconds;
                var text = cutTimes[i].text || "";

                var slideNum = this.extractSlideNumber(text);
                var markerName = slideNum ? ("Slide " + slideNum) : ("Slide " + (i + 1));

                try {
                    var marker = seq.markers.createMarker(seconds);
                    marker.name = markerName;
                    marker.colorByIndex = 0; // 초록색
                    count++;
                } catch (e) { }
            }
        } catch (e) { }
        return count;
    },

    extractSlideNumber: function (text) {
        var match = text.match(/\[Slide\s*(\d+)\]/i);
        if (match) {
            var num = parseInt(match[1], 10);
            return num < 10 ? "0" + num : "" + num;
        }
        return null;
    },

    autoRazorTracks: function () {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        var cutTimes = [];

        var srtPath = this.findSrtInProject();
        if (srtPath) {
            cutTimes = this.parseSrtFile(srtPath);
        }

        if (cutTimes.length === 0) {
            for (var v = 0; v < 15; v++) {
                var vt = seq.videoTracks[v];
                if (!vt || vt.clips.numItems === 0) continue;
                for (var i = 0; i < vt.clips.numItems; i++) {
                    var content = this.getClipTextContent(vt.clips[i]);
                    if (content.toLowerCase().indexOf('slide') !== -1) {
                        var clipSec = parseFloat(vt.clips[i].start.seconds);
                        cutTimes.push({ seconds: clipSec, text: content });
                    }
                }
            }
        }

        if (cutTimes.length === 0) {
            alert("⚠️ Slide 정보를 찾지 못했습니다.");
            return;
        }

        cutTimes.sort(function (a, b) { return a.seconds - b.seconds; });

        var razorCount = 0;
        for (var i = cutTimes.length - 1; i >= 0; i--) {
            var result = this.razorAtSeconds(seq, cutTimes[i].seconds, false);
            if (result.success) {
                razorCount++;
            }
        }

        var markerCount = this.createMarkersFromCutData(seq, cutTimes);

        alert("✅ 완료\n\nSlide 포인트: " + cutTimes.length + "개\n마커 생성: " + markerCount + "개\n\n👀 타임라인 확인 후 [다음 단계]를 진행하세요.");
    },

    // 앵글 스위칭 — 시퀀스 마커 이름에서 정면/좌측/우측 키워드를 읽어 해당 구간 트랙 활성/비활성
    autoSwitchAngle: function () {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        // 마커에서 cutData 구성
        var cutData = [];
        try {
            var markers = seq.markers;
            for (var m = 0; m < markers.numMarkers; m++) {
                var mk = markers[m];
                cutData.push({
                    seconds: parseFloat(mk.start.seconds),
                    text: mk.name || ""
                });
            }
        } catch (e) {}

        if (cutData.length === 0) {
            alert("시퀀스 마커가 없습니다.\n먼저 자르기+마커 버튼으로 마커를 추가하세요.");
            return;
        }

        cutData.sort(function (a, b) { return a.seconds - b.seconds; });

        // 트랙 탐색 — 클립명에 정면/좌측/우측 포함 여부로 분류
        var trackMap = { front: null, left: null, right: null };
        for (var i = 0; i < 20; i++) {
            var vt = seq.videoTracks[i];
            if (!vt || vt.clips.numItems === 0) continue;
            for (var c = 0; c < vt.clips.numItems; c++) {
                var n = (vt.clips[c].name + "").toLowerCase();
                if (!trackMap.front && n.indexOf(this.STR.FRONT) !== -1) trackMap.front = vt;
                else if (!trackMap.left  && n.indexOf(this.STR.LEFT)  !== -1) trackMap.left  = vt;
                else if (!trackMap.right && n.indexOf(this.STR.RIGHT) !== -1) trackMap.right = vt;
            }
        }

        if (!trackMap.front && !trackMap.left && !trackMap.right) {
            alert("정면/좌측/우측 클립을 찾을 수 없습니다.\n클립 이름에 '정면', '좌측', '우측' 키워드가 포함되어 있는지 확인하세요.");
            return;
        }

        // 구간별 앵글 스위칭
        var count = 0;
        for (var s = 0; s < cutData.length; s++) {
            var d = cutData[s];
            var angle = "";
            if      (d.text.indexOf(this.STR.FRONT) !== -1) angle = "front";
            else if (d.text.indexOf(this.STR.LEFT)  !== -1) angle = "left";
            else if (d.text.indexOf(this.STR.RIGHT) !== -1) angle = "right";
            if (!angle) continue;

            var startSec = d.seconds;
            var endSec = (s + 1 < cutData.length) ? cutData[s + 1].seconds : 99999;

            this.applySwitch(trackMap, startSec, endSec, angle);
            count++;
        }

        if (count === 0) {
            alert("처리된 구간이 없습니다.\n마커 이름에 '정면', '좌측', '우측' 키워드가 포함되어 있는지 확인하세요.");
        } else {
            alert("✅ 앵글 스위칭 완료! 총 " + count + "개 구간 처리");
        }
    },

    applySwitch: function (trackMap, startSec, endSec, activeAngle) {
        var angles = ["front", "left", "right"];
        for (var i = 0; i < angles.length; i++) {
            var t = trackMap[angles[i]];
            if (!t) continue;
            var match = (angles[i] === activeAngle);
            for (var c = 0; c < t.clips.numItems; c++) {
                var clipStart = parseFloat(t.clips[c].start.seconds);
                if (clipStart >= startSec - 0.5 && clipStart < endSec) {
                    t.clips[c].disabled = !match;
                }
            }
        }
    },

    // 가장 가까운 직전 마커에 앵글 이름 추가/교체
    appendAngleToLastMarker: function (angleName) {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        var playhead = parseFloat(seq.getPlayerPosition().seconds);
        var markers  = seq.markers;
        var target   = null;
        var targetTime = -1;

        try {
            for (var m = 0; m < markers.numMarkers; m++) {
                var mk = markers[m];
                var t  = parseFloat(mk.start.seconds);
                if (t <= playhead + 0.5 && t > targetTime) {
                    targetTime = t;
                    target = mk;
                }
            }
        } catch (e) {}

        if (!target) {
            alert("직전 마커를 찾을 수 없습니다.\n먼저 Slide 버튼으로 마커를 추가하세요.");
            return;
        }

        // 기존 앵글 태그 제거 후 새 앵글 append
        var baseName = target.name.replace(/,?\s*\[(정면|좌측|우측)\]/g, "").replace(/,\s*$/, "").replace(/\s+$/, "");
        target.name  = baseName + ", [" + angleName + "]";
    },

    // 플레이헤드 위치에 마커가 있으면 이미지 번호 append, 없으면 마커 생성 후 설정
    appendImgToLastMarker: function (imgTag) {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        var playhead = parseFloat(seq.getPlayerPosition().seconds);
        var markers  = seq.markers;
        var target   = null;

        // 플레이헤드 ±0.1초 이내 마커 탐색
        try {
            for (var m = 0; m < markers.numMarkers; m++) {
                var mk = markers[m];
                var t  = parseFloat(mk.start.seconds);
                if (Math.abs(t - playhead) <= 0.1) {
                    target = mk;
                    break;
                }
            }
        } catch (e) {}

        if (target) {
            // 기존 마커에 append/교체
            var baseName = target.name.replace(/,?\s*\[#\d+\]/g, "").replace(/,\s*$/, "").replace(/\s+$/, "");
            target.name  = baseName ? baseName + ", [" + imgTag + "]" : "[" + imgTag + "]";
        } else {
            // 마커 없음 → 새로 생성
            try {
                var newMarker = markers.createMarker(playhead);
                newMarker.name = "[" + imgTag + "]";
                newMarker.colorByIndex = 0;
            } catch (e) {
                alert("마커 생성 실패: " + e.message);
            }
        }
    },

    extractImageNumbers: function (text) {
        var results = [];
        var regex = /#\s*(\d+)(?:\s*-\s*(\d+))?/g;
        var match;
        while ((match = regex.exec(text)) !== null) {
            var num = match[1];
            var subNum = match[2] || "";
            var subStr = subNum ? "-" + subNum : "";
            results.push({
                num: num,
                sub: subStr,
                suffix: "_" + (num.length === 1 ? "0" + num : num) + subStr
            });
        }
        return results;
    },

    findImageInProject: function (searchKey) {
        var root = app.project.rootItem;
        if (!root || !root.children) return null;
        var lowerKey = searchKey.toLowerCase();
        var searchInBin = function (bin) {
            for (var i = 0; i < bin.children.numItems; i++) {
                var item = bin.children[i];
                var itemName = (item.name || "").toLowerCase();
                if (itemName.indexOf(lowerKey) !== -1 && /\.(png|jpg|jpeg)$/.test(itemName)) {
                    return item;
                }
                if (item.children && item.children.numItems > 0) {
                    var found = searchInBin(item);
                    if (found) return found;
                }
            }
            return null;
        };
        return searchInBin(root);
    },

    getTargetedTrackIndex: function (seq) {
        var vt = seq.videoTracks;
        for (var i = 0; i < vt.numTracks; i++) {
            if (vt[i].isTargeted()) return i;
        }
        return -1;
    },

    addTracksAtPosition: function (count, position) {
        try {
            app.enableQE();
            var qeSeq = qe.project.getActiveSequence();
            if (qeSeq) {
                qeSeq.addTracks(count, position);
                return true;
            }
        } catch (e) {}
        return false;
    },

    // 3단계 — 시퀀스 마커에서 [Slide N], [#N] 태그를 읽어 이미지 자동 배치
    autoPlaceImages: function () {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        // 1) 마커 수집
        var markerData = [];
        try {
            var markers = seq.markers;
            for (var m = 0; m < markers.numMarkers; m++) {
                var mk = markers[m];
                markerData.push({
                    seconds: parseFloat(mk.start.seconds),
                    text: mk.name || ""
                });
            }
        } catch (e) {}

        if (markerData.length === 0) {
            alert("시퀀스 마커가 없습니다.\n먼저 [Slide N] / [#N] 마커를 추가하세요.");
            return;
        }

        markerData.sort(function (a, b) { return a.seconds - b.seconds; });

        var seqEndSeconds = parseFloat(seq.end.seconds);

        // 2) 슬라이드 구간 경계 계산
        var slideStarts = [];
        for (var i = 0; i < markerData.length; i++) {
            var slideMatch = markerData[i].text.match(/\[Slide\s*(\d+)\]/i);
            if (slideMatch) {
                slideStarts.push({
                    slideNum: parseInt(slideMatch[1], 10),
                    seconds: markerData[i].seconds
                });
            }
        }

        if (slideStarts.length === 0) {
            alert("마커에서 [Slide N] 태그를 찾을 수 없습니다.");
            return;
        }

        // 슬라이드 번호 → 시작/끝 시간 맵
        var slideRanges = {};
        for (var i = 0; i < slideStarts.length; i++) {
            var endSec = (i + 1 < slideStarts.length) ? slideStarts[i + 1].seconds : seqEndSeconds;
            slideRanges[slideStarts[i].slideNum] = {
                start: slideStarts[i].seconds,
                end: endSec
            };
        }

        // 3) 배치 계획 수립
        var placements = [];
        var currentSlideNum = null;

        for (var i = 0; i < markerData.length; i++) {
            var mk = markerData[i];
            var text = mk.text;
            var startSeconds = mk.seconds;

            var sm = text.match(/\[Slide\s*(\d+)\]/i);
            if (sm) currentSlideNum = parseInt(sm[1], 10);
            if (!currentSlideNum) continue;

            var imageNums = this.extractImageNumbers(text);
            if (imageNums.length === 0) continue;

            // 이 마커가 속한 슬라이드의 끝 시간 (다음 [Slide] 마커 직전)
            var slideEndSeconds = seqEndSeconds;
            for (var j = i + 1; j < markerData.length; j++) {
                if (markerData[j].text.match(/\[Slide\s*(\d+)\]/i)) {
                    slideEndSeconds = markerData[j].seconds;
                    break;
                }
            }

            for (var k = 0; k < imageNums.length; k++) {
                var imgInfo = imageNums[k];
                var sn = currentSlideNum < 10 ? "0" + currentSlideNum : "" + currentSlideNum;
                var searchKey = "p" + sn + imgInfo.suffix;
                var mainNum = parseInt(imgInfo.num, 10);
                var subNum  = imgInfo.sub ? parseInt(imgInfo.sub.replace("-", ""), 10) : 0;
                var trackOffset = (mainNum - 1) + subNum;

                placements.push({
                    searchKey:      searchKey,
                    startSeconds:   startSeconds,
                    slideEndSeconds: slideEndSeconds,
                    endSeconds:     slideEndSeconds,
                    trackOffset:    trackOffset,
                    hasSub:         !!imgInfo.sub
                });
            }
        }

        if (placements.length === 0) {
            alert("마커에서 [#N] 이미지 태그를 찾을 수 없습니다.");
            return;
        }

        // 4) 서브 아이템과 메인 아이템 트랙 충돌 해소
        for (var p = 0; p < placements.length; p++) {
            if (placements[p].hasSub) continue;
            var conflicted = true;
            while (conflicted) {
                conflicted = false;
                for (var q = 0; q < placements.length; q++) {
                    if (!placements[q].hasSub) continue;
                    if (placements[q].trackOffset !== placements[p].trackOffset) continue;
                    if (placements[q].startSeconds < placements[p].slideEndSeconds &&
                        placements[p].startSeconds < placements[q].slideEndSeconds) {
                        placements[p].trackOffset++;
                        conflicted = true;
                        break;
                    }
                }
            }
        }

        // 5) 같은 트랙 내 endSeconds 재계산 (겹침 방지)
        var placementsByTrack = {};
        for (var p = 0; p < placements.length; p++) {
            var tk = placements[p].trackOffset;
            if (!placementsByTrack[tk]) placementsByTrack[tk] = [];
            placementsByTrack[tk].push(placements[p]);
        }
        for (var tk in placementsByTrack) {
            var tpArr = placementsByTrack[tk];
            tpArr.sort(function (a, b) { return a.startSeconds - b.startSeconds; });
            for (var t = 0; t < tpArr.length; t++) {
                if (t + 1 < tpArr.length && tpArr[t + 1].startSeconds < tpArr[t].endSeconds) {
                    tpArr[t].endSeconds = tpArr[t + 1].startSeconds;
                }
            }
        }

        // 6) 타겟 트랙 확인
        var targetTrackIdx = this.getTargetedTrackIndex(seq);
        if (targetTrackIdx < 0) {
            alert("⚠️ 타겟 트랙을 선택해주세요!\n\n타임라인에서 이미지를 넣을 트랙(V4 등)을 클릭해서 타겟팅하세요.");
            return;
        }

        // 7) 트랙 추가 — 부족한 만큼만
        var maxOffset = 0;
        for (var p = 0; p < placements.length; p++) {
            if (placements[p].trackOffset > maxOffset) maxOffset = placements[p].trackOffset;
        }
        var totalRequired = targetTrackIdx + maxOffset + 1;
        var tracksToAdd = totalRequired - seq.videoTracks.numTracks;
        if (tracksToAdd > 0) {
            this.addTracksAtPosition(tracksToAdd, seq.videoTracks.numTracks);
        }
        seq = app.project.activeSequence;

        // 8) 기존 클립 청소
        for (var t = 0; t < 30; t++) {
            var tIdx = targetTrackIdx + t;
            if (tIdx >= seq.videoTracks.numTracks) break;
            var track = seq.videoTracks[tIdx];
            if (track) {
                for (var c = track.clips.numItems - 1; c >= 0; c--) {
                    track.clips[c].remove(false, false);
                }
            }
        }

        // 9) 이미지 배치
        var placedCount = 0;
        var notFound = [];

        for (var p = 0; p < placements.length; p++) {
            var pl = placements[p];
            var projectItem = this.findImageInProject(pl.searchKey);
            if (!projectItem) { notFound.push(pl.searchKey); continue; }

            var tIdx = targetTrackIdx + pl.trackOffset;
            if (tIdx >= seq.videoTracks.numTracks) continue;
            var targetTrack = seq.videoTracks[tIdx];
            if (!targetTrack) continue;

            try {
                var startTicks = Math.round(pl.startSeconds * 254016000000);
                targetTrack.insertClip(projectItem, startTicks.toString());
                placedCount++;

                // 끝 시간 조정
                for (var c = targetTrack.clips.numItems - 1; c >= 0; c--) {
                    var clip = targetTrack.clips[c];
                    if (Math.abs(parseFloat(clip.start.seconds) - pl.startSeconds) < 0.5) {
                        clip.end = Math.round(pl.endSeconds * 254016000000).toString();
                        break;
                    }
                }
            } catch (e) {}
        }

        // 10) 결과 알림
        var msg = "✅ 이미지 배치 완료\n배치: " + placedCount + "개";
        if (notFound.length > 0) {
            msg += "\n\n⚠️ 찾을 수 없는 이미지 (" + notFound.length + "개):\n" + notFound.slice(0, 10).join(", ");
        }
        alert(msg);
    },

    // 헤드 위치에서 자르기 + 마커 추가
    // markerName : index.html에서 전달하는 마커 이름 문자열 (예: "Slide 1")
    razorAndMark: function (markerName) {
        var seq = app.project.activeSequence;
        if (!seq) { alert("시퀀스 없음"); return; }

        var seconds = parseFloat(seq.getPlayerPosition().seconds);

        // 1) 자르기
        var cutResult = this.razorAtSeconds(seq, seconds);

        // 2) 마커 추가
        var markerOk = false;
        try {
            var marker = seq.markers.createMarker(seconds);
            marker.name = markerName;
            marker.colorByIndex = 0; // 초록색
            markerOk = true;
        } catch (e) {}

        if (cutResult.success && markerOk) {
            // alert("✅ 완료\n자르기 + 마커 [" + markerName + "] 추가");
        } else if (cutResult.success) {
            // alert("✅ 자르기 완료\n⚠️ 마커 추가 실패");
        } else {
            alert("❌ 자르기 실패 (트랙 잠금 상태 등을 확인하세요)");
        }
    },

    parseSrtFull: function (filePath) {
        var results = [];
        var f = new File(filePath);
        if (!f.exists) return results;
        f.encoding = "UTF-8"; f.open("r");
        var content = f.read(); f.close();
        content = content.replace(/^﻿/, "").replace(/ /g, " ");
        var blocks = content.split(/\r?\n\r?\n/);
        for (var b = 0; b < blocks.length; b++) {
            var lines = blocks[b].replace(/\r/g, "").split("\n");
            if (lines.length < 3) continue;
            var tm = lines[1].match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
            if (!tm) continue;
            var text = lines.slice(2).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
            results.push({ index: parseInt(lines[0],10)||(b+1), start: this.srtToSeconds(tm[1]), end: this.srtToSeconds(tm[2]), text: text });
        }
        return results;
    },

    parseNgTaggedSrt: function (filePath) {
        var results = [];
        var f = new File(filePath);
        if (!f.exists) return results;
        f.encoding = "UTF-8"; f.open("r");
        var content = f.read(); f.close();
        content = content.replace(/^﻿/, "").replace(/ /g, " ");
        var blocks = content.split(/\r?\n\r?\n/);
        for (var b = 0; b < blocks.length; b++) {
            var block = blocks[b].replace(/\r/g, "");
            if (block.indexOf("[NG]") === -1) continue;
            var lines = block.split("\n");
            if (lines.length < 3) continue;
            // [NG] 태그는 번호 줄 앞에 붙거나 별도 줄에 있을 수 있음
            var timeLineIdx = -1;
            for (var l = 0; l < lines.length; l++) {
                if (/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/.test(lines[l])) { timeLineIdx = l; break; }
            }
            if (timeLineIdx < 0) continue;
            var tm = lines[timeLineIdx].match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
            if (!tm) continue;
            var text = lines.slice(timeLineIdx + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\[NG\]/gi, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
            results.push({ start: this.srtToSeconds(tm[1]), end: this.srtToSeconds(tm[2]), text: text });
        }
        // 연속 구간 병합 (간격 0.5초 이하)
        results.sort(function(a,b){return a.start-b.start;});
        var merged = [];
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            if (merged.length > 0 && r.start - merged[merged.length-1].end <= 0.5) {
                merged[merged.length-1].end = Math.max(merged[merged.length-1].end, r.end);
                merged[merged.length-1].text += " " + r.text;
            } else {
                merged.push({ start: r.start, end: r.end, reason: "NG", text: r.text });
            }
        }
        return merged;
    },

    // SRT 파일에서 반복 발화 패턴으로 NG 구간 감지
    detectRepetitionNgFromSrt: function (filePath, similarityThreshold) {
        var segments = this.parseSrtFull(filePath);
        if (!segments || segments.length === 0)
            return JSON.stringify({ error: "SRT 파일을 읽을 수 없습니다." });

        var threshold = similarityThreshold || 0.6;

        function normalize(s) {
            return (s || "").replace(/\s+/g, " ").replace(/[.,!?。、，。~]/g, "").replace(/^\s+|\s+$/g, "");
        }
        function similarity(a, b) {
            a = normalize(a); b = normalize(b);
            if (!a || !b) return 0;
            if (a === b) return 1.0;
            var shorter = a.length <= b.length ? a : b;
            var longer  = a.length <= b.length ? b : a;
            if (longer.indexOf(shorter) >= 0 && shorter.length >= 4)
                return shorter.length / longer.length;
            // bigram 유사도
            var ba = {}, bb = {};
            for (var i = 0; i < a.length - 1; i++) ba[a.slice(i,i+2)] = 1;
            for (var j = 0; j < b.length - 1; j++) bb[b.slice(j,j+2)] = 1;
            var inter = 0, total = 0;
            for (var k in ba) { total++; if (bb[k]) inter++; }
            for (var k2 in bb) { total++; }
            return total === 0 ? 0 : (2 * inter) / total;
        }

        var ngRanges = [];
        var LOOK_BACK = 6;

        for (var i = 1; i < segments.length; i++) {
            var cur = segments[i];
            if (!cur.text || normalize(cur.text).length < 4) continue;
            var maxSim = 0, matchIdx = -1;
            for (var j = Math.max(0, i - LOOK_BACK); j < i; j++) {
                var sim = similarity(cur.text, segments[j].text);
                if (sim > maxSim) { maxSim = sim; matchIdx = j; }
            }
            if (maxSim >= threshold) {
                var ngStart = segments[matchIdx].start;
                var ngEnd   = cur.end;
                if (ngRanges.length > 0 && ngStart <= ngRanges[ngRanges.length-1].end + 1.5) {
                    ngRanges[ngRanges.length-1].end = Math.max(ngRanges[ngRanges.length-1].end, ngEnd);
                } else {
                    ngRanges.push({
                        start: ngStart,
                        end: ngEnd,
                        reason: "반복",
                        similarity: Math.round(maxSim * 100),
                        origText: segments[matchIdx].text,
                        matchText: cur.text
                    });
                }
            }
        }

        return JSON.stringify({ segments: segments.length, ngRanges: ngRanges });
    },

    removeNgClips: function (ngRangesJson, dryRun) {
        var ngRanges;
        try { ngRanges = eval('(' + ngRangesJson + ')'); } catch(e) { return JSON.stringify({success:false,message:"파싱오류"}); }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({success:false,message:"시퀀스 없음",count:0});
        if (!ngRanges||ngRanges.length===0) return JSON.stringify({success:true,message:"NG 구간 없음",count:0});
        if (dryRun) return JSON.stringify({success:true,message:"미리보기",count:ngRanges.length});
        try { app.enableQE(); } catch(e) { return JSON.stringify({success:false,message:"QE 비활성화",count:0}); }
        var sorted = ngRanges.slice().sort(function(a,b){return b.start-a.start;});
        var removed = 0;
        for (var i=0;i<sorted.length;i++) {
            var ng = sorted[i];
            if (ng.end<=ng.start) continue;
            this.razorAtSeconds(seq, ng.start, false);
            this.razorAtSeconds(seq, ng.end, false);
            seq = app.project.activeSequence;
            var cnt = 0;
            for (var v=0;v<seq.videoTracks.numTracks;v++) {
                var vt=seq.videoTracks[v];
                for (var c=vt.clips.numItems-1;c>=0;c--) {
                    var cl=vt.clips[c];
                    if (parseFloat(cl.start.seconds)>=ng.start-0.04 && parseFloat(cl.end.seconds)<=ng.end+0.04)
                        try{cl.remove(true,true);cnt++;}catch(e){}
                }
            }
            for (var a=0;a<seq.audioTracks.numTracks;a++) {
                var at=seq.audioTracks[a];
                for (var c=at.clips.numItems-1;c>=0;c--) {
                    var cl=at.clips[c];
                    if (parseFloat(cl.start.seconds)>=ng.start-0.04 && parseFloat(cl.end.seconds)<=ng.end+0.04)
                        try{cl.remove(true,true);cnt++;}catch(e){}
                }
            }
            if (cnt>0) removed++;
        }
        return JSON.stringify({success:true,message:"완료",count:removed});
    },

    // 시퀀스 자막 트랙 텍스트 읽기 테스트
    getCaptionTrackData: function () {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "시퀀스 없음" });

        var result = { videoTracks: [], captionTracks: [] };

        // 비디오 트랙 중 자막 트랙 탐색
        try {
            for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                var vt = seq.videoTracks[v];
                var trackInfo = { index: v, name: vt.name || ("V" + (v+1)), clips: [] };
                for (var c = 0; c < vt.clips.numItems; c++) {
                    var cl = vt.clips[c];
                    var clipInfo = {
                        index: c,
                        name: cl.name || "",
                        start: parseFloat(cl.start.seconds),
                        end: parseFloat(cl.end.seconds),
                        type: ""
                    };
                    // 컴포넌트에서 텍스트 추출 시도
                    try {
                        var comps = cl.getComponents();
                        if (comps) {
                            for (var i = 0; i < comps.numItems; i++) {
                                var comp = comps[i];
                                clipInfo.type += (comp.displayName || "") + " ";
                                try {
                                    var props = comp.properties;
                                    if (props) {
                                        for (var p = 0; p < props.numItems; p++) {
                                            var prop = props[p];
                                            var pName = prop.displayName || "";
                                            var pVal = "";
                                            try { pVal = prop.getValue() + ""; } catch(e) {}
                                            if (pVal && pVal.length > 0 && pVal.length < 500) {
                                                clipInfo[pName] = pVal;
                                            }
                                        }
                                    }
                                } catch(e) {}
                            }
                        }
                    } catch(e) { clipInfo.compErr = e.message; }
                    trackInfo.clips.push(clipInfo);
                }
                result.videoTracks.push(trackInfo);
            }
        } catch(e) { result.videoTrackErr = e.message; }

        // 자막 트랙 (captionTracks) 별도 탐색
        try {
            if (seq.captionTracks) {
                for (var ct = 0; ct < seq.captionTracks.numTracks; ct++) {
                    var ctrack = seq.captionTracks[ct];
                    var ctInfo = { index: ct, name: ctrack.name || ("C" + (ct+1)), clips: [] };
                    for (var cc = 0; cc < ctrack.clips.numItems; cc++) {
                        var ccl = ctrack.clips[cc];
                        var cclInfo = {
                            name: ccl.name || "",
                            start: parseFloat(ccl.start.seconds),
                            end: parseFloat(ccl.end.seconds)
                        };
                        try {
                            var ccomps = ccl.getComponents();
                            if (ccomps) {
                                for (var ci = 0; ci < ccomps.numItems; ci++) {
                                    var ccomp = ccomps[ci];
                                    cclInfo["comp_" + ci] = ccomp.displayName || "";
                                    try {
                                        var cprops = ccomp.properties;
                                        if (cprops) {
                                            for (var cp = 0; cp < cprops.numItems; cp++) {
                                                var cprop = cprops[cp];
                                                var cpVal = "";
                                                try { cpVal = cprop.getValue() + ""; } catch(e) {}
                                                if (cpVal && cpVal.length > 0 && cpVal.length < 500)
                                                    cclInfo[cprop.displayName || ("p"+cp)] = cpVal;
                                            }
                                        }
                                    } catch(e) {}
                                }
                            }
                        } catch(e) { cclInfo.err = e.message; }
                        ctInfo.clips.push(cclInfo);
                    }
                    result.captionTracks.push(ctInfo);
                }
            } else {
                result.captionTracksNote = "seq.captionTracks 없음";
            }
        } catch(e) { result.captionTrackErr = e.message; }

        return JSON.stringify(result);
    },

    // 캡션 트랙 텍스트를 읽어 반복 패턴으로 NG 구간 감지
    detectRepetitionNg: function (similarityThreshold) {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "시퀀스 없음" });

        var threshold = similarityThreshold || 0.6;

        // 캡션 트랙에서 세그먼트 수집
        var segments = [];

        // seq.captionTracks 탐색
        try {
            if (seq.captionTracks && seq.captionTracks.numTracks > 0) {
                for (var ct = 0; ct < seq.captionTracks.numTracks; ct++) {
                    var ctrack = seq.captionTracks[ct];
                    for (var cc = 0; cc < ctrack.clips.numItems; cc++) {
                        var ccl = ctrack.clips[cc];
                        var text = "";
                        try {
                            var ccomps = ccl.getComponents();
                            if (ccomps) {
                                for (var ci = 0; ci < ccomps.numItems; ci++) {
                                    var cprops = ccomps[ci].properties;
                                    if (cprops) {
                                        for (var cp = 0; cp < cprops.numItems; cp++) {
                                            try {
                                                var v = cprops[cp].getValue() + "";
                                                if (v && v.length > 1 && v.length < 300 && /[가-힣a-zA-Z]/.test(v)) {
                                                    text = v; break;
                                                }
                                            } catch(e) {}
                                        }
                                    }
                                    if (text) break;
                                }
                            }
                        } catch(e) {}
                        segments.push({
                            start: parseFloat(ccl.start.seconds),
                            end: parseFloat(ccl.end.seconds),
                            text: text
                        });
                    }
                }
            }
        } catch(e) {}

        if (segments.length === 0) {
            return JSON.stringify({ error: "캡션 트랙이 없거나 텍스트를 읽을 수 없습니다." });
        }

        // 시간순 정렬
        segments.sort(function(a, b) { return a.start - b.start; });

        // 반복 패턴 감지: 현재 세그먼트 텍스트가 이전 N개 중 하나와 유사하면 NG
        function normalize(s) {
            return (s || "").replace(/\s+/g, " ").replace(/[.,!?。、，。]/g, "").replace(/^\s+|\s+$/g, "");
        }
        function similarity(a, b) {
            a = normalize(a); b = normalize(b);
            if (!a || !b) return 0;
            if (a === b) return 1.0;
            // 포함 관계 체크 (긴 쪽이 짧은 쪽을 포함)
            var shorter = a.length <= b.length ? a : b;
            var longer  = a.length <= b.length ? b : a;
            if (longer.indexOf(shorter) >= 0 && shorter.length >= 4) {
                return shorter.length / longer.length;
            }
            // bigram 유사도
            function bigrams(s) {
                var bg = {};
                for (var i = 0; i < s.length - 1; i++) bg[s.slice(i, i+2)] = 1;
                return bg;
            }
            var ba = bigrams(a), bb = bigrams(b);
            var inter = 0;
            for (var k in ba) { if (bb[k]) inter++; }
            var total = 0;
            for (var k2 in ba) total++;
            for (var k3 in bb) total++;
            return total === 0 ? 0 : (2 * inter) / total;
        }

        var ngRanges = [];
        var LOOK_BACK = 5; // 앞 5개 세그먼트와 비교

        for (var i = 1; i < segments.length; i++) {
            var cur = segments[i];
            if (!cur.text || normalize(cur.text).length < 4) continue;
            var maxSim = 0;
            var matchIdx = -1;
            for (var j = Math.max(0, i - LOOK_BACK); j < i; j++) {
                var prev = segments[j];
                if (!prev.text) continue;
                var sim = similarity(cur.text, prev.text);
                if (sim > maxSim) { maxSim = sim; matchIdx = j; }
            }
            if (maxSim >= threshold) {
                // NG 구간: 이전 문장 시작 ~ 현재 문장 끝
                var ngStart = segments[matchIdx].start;
                var ngEnd = cur.end;
                // 이미 있는 NG 구간과 합치기
                if (ngRanges.length > 0 && ngStart <= ngRanges[ngRanges.length-1].end + 1.0) {
                    ngRanges[ngRanges.length-1].end = Math.max(ngRanges[ngRanges.length-1].end, ngEnd);
                    ngRanges[ngRanges.length-1].matchText = cur.text;
                } else {
                    ngRanges.push({
                        start: ngStart,
                        end: ngEnd,
                        reason: "반복",
                        similarity: Math.round(maxSim * 100),
                        origText: segments[matchIdx].text,
                        matchText: cur.text
                    });
                }
            }
        }

        return JSON.stringify({ segments: segments.length, ngRanges: ngRanges });
    },

    // PPT Subtitle Tagger에서 생성한 마커 JSON을 일괄 삽입
    // jsonStr: '[{"tc":"00:01:23.456","name":"Slide 6 | 정면 | #1"}, ...]'
    addMarkersFromJson: function (jsonStr) {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ ok: false, error: "시퀀스 없음" });
        var list;
        try { list = JSON.parse(jsonStr); } catch (e) { return JSON.stringify({ ok: false, error: "JSON 파싱 오류" }); }
        if (!list || !list.length) return JSON.stringify({ ok: false, error: "마커 데이터 없음" });
        var ok = 0, fail = 0;
        for (var i = 0; i < list.length; i++) {
            try {
                var tc = list[i].tc;
                var name = list[i].name;
                var parts = tc.replace(",", ".").split(":");
                var h = parseInt(parts[0], 10);
                var m = parseInt(parts[1], 10);
                var sp = parts[2].split(".");
                var s = parseInt(sp[0], 10);
                var ms = sp.length > 1 ? parseInt(sp[1], 10) : 0;
                var totalSec = h * 3600 + m * 60 + s + ms / 1000.0;
                var marker = seq.markers.createMarker(totalSec);
                marker.name = name;
                marker.comments = name;
                marker.colorByIndex = 0;
                ok++;
            } catch (e) { fail++; }
        }
        return JSON.stringify({ ok: true, inserted: ok, failed: fail });
    }

};
