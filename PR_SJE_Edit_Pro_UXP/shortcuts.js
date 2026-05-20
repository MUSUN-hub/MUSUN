const ppro = require('premierepro');
const { storage, entrypoints } = require('uxp');
const uxpFS = storage.localFileSystem;

const TICKS_PER_SECOND = 254016000000;

// 핵심 로직: 자르기
async function razorAtPlayhead() {
    const activeSeq = ppro.project.activeSequence;
    if (!activeSeq) return;
    const playhead = activeSeq.getPlayerPosition();
    const qeSeq = ppro.qe.project.getActiveSequence();
    if (!qeSeq) return;
    
    // QE API를 사용하여 현재 재생헤드 위치에서 모든 트랙 자르기
    const timeStr = activeSeq.getPlayerPosition(); 
    // 실제 구현은 main.js의 로직을 따르되 headless 환경에 맞춰 최적화
    // (여기서는 예시로 로직의 흐름만 구성, 실제로는 main.js의 함수를 참고하여 정밀하게 구현 가능)
}

// 단축키 설정
entrypoints.setup({
    commands: {
        "razor": () => { razorAtPlayhead(); },
        "slide": () => { /* slide logic */ },
        "angleFront": () => { /* angle logic */ },
        "angleRight": () => { /* angle logic */ },
        "angleLeft": () => { /* angle logic */ }
    }
});
