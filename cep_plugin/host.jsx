// SJE CEP Bridge — ExtendScript host
// 모든 함수는 JSON 문자열을 반환합니다.

var SJE = {};

// 초 → HH:MM:SS:FF (30fps 기준)
SJE.secondsToTimecode = function (seconds, fps) {
    fps = fps || 30;
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var f = Math.round((seconds % 1) * fps);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
};

// 지정 초에 모든 트랙 razor
SJE.razorAtSeconds = function (seconds) {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ ok: false, error: "no active sequence" });

        var tc = SJE.secondsToTimecode(seconds);
        for (var v = 0; v < qeSeq.numVideoTracks; v++) {
            var vt = qeSeq.getVideoTrackAt(v);
            if (vt && typeof vt.razor === "function") vt.razor(tc);
        }
        for (var a = 0; a < qeSeq.numAudioTracks; a++) {
            var at = qeSeq.getAudioTrackAt(a);
            if (at && typeof at.razor === "function") at.razor(tc);
        }
        return JSON.stringify({ ok: true, tc: tc });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
};

// 여러 초에 한 번에 razor
SJE.razorMultiple = function (secondsArray) {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ ok: false, error: "no active sequence" });

        var results = [];
        for (var i = 0; i < secondsArray.length; i++) {
            var tc = SJE.secondsToTimecode(secondsArray[i]);
            try {
                for (var v = 0; v < qeSeq.numVideoTracks; v++) {
                    var vt = qeSeq.getVideoTrackAt(v);
                    if (vt && typeof vt.razor === "function") vt.razor(tc);
                }
                for (var a = 0; a < qeSeq.numAudioTracks; a++) {
                    var at = qeSeq.getAudioTrackAt(a);
                    if (at && typeof at.razor === "function") at.razor(tc);
                }
                results.push({ sec: secondsArray[i], tc: tc, ok: true });
            } catch (e) {
                results.push({ sec: secondsArray[i], tc: tc, ok: false, error: String(e) });
            }
        }
        return JSON.stringify({ ok: true, results: results });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
};

// NG 구간 클립 삭제 (ripple=false, 멀티트랙 싱크 유지)
SJE.removeClipsInRanges = function (ranges) {
    // ranges: [[startSec, endSec], ...]
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence" });

        var removed = 0;
        var errors = [];
        var MARGIN = 0.1;

        for (var r = 0; r < ranges.length; r++) {
            var ngStart = ranges[r][0];
            var ngEnd   = ranges[r][1];

            for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                var track = seq.videoTracks[v];
                for (var c = track.clips.numItems - 1; c >= 0; c--) {
                    var clip = track.clips[c];
                    var cs = parseFloat(clip.start.seconds);
                    var ce = parseFloat(clip.end.seconds);
                    if (cs >= ngStart - MARGIN && ce <= ngEnd + MARGIN) {
                        try { clip.remove(false, false); removed++; }
                        catch (e) { errors.push("V" + v + "/" + c + ": " + e.message); }
                    }
                }
            }
            for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                var atrack = seq.audioTracks[a];
                for (var c = atrack.clips.numItems - 1; c >= 0; c--) {
                    var clip = atrack.clips[c];
                    var cs = parseFloat(clip.start.seconds);
                    var ce = parseFloat(clip.end.seconds);
                    if (cs >= ngStart - MARGIN && ce <= ngEnd + MARGIN) {
                        try { clip.remove(false, false); removed++; }
                        catch (e) { errors.push("A" + a + "/" + c + ": " + e.message); }
                    }
                }
            }
        }
        return JSON.stringify({ ok: true, removed: removed, errors: errors });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
};

// 시퀀스 기본 정보 조회
SJE.getSequenceInfo = function () {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence" });
        return JSON.stringify({
            ok: true,
            name: seq.name,
            videoTracks: seq.videoTracks.numTracks,
            audioTracks: seq.audioTracks.numTracks
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
};
