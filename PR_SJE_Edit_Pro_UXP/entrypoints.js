// entrypoints.js - 단축키 명령어 전용 핸들러
const { entrypoints } = require('uxp');

// main.js의 전역 함수들이나 로직을 사용해야 하므로 main.js를 로드하거나 필요한 로직을 복사해야 함.
// 여기서는 가장 안전하게 main.js를 직접 참조하는 대신, 필요한 기능만 연결하도록 구성.

entrypoints.setup({
    commands: {
        "razor": () => { 
            // main.js에 정의된 전역 함수를 호출하기 위해 디스패치 이벤트를 보내거나 직접 호출 시도
            if (typeof razorAtPlayhead === 'function') razorAtPlayhead();
        },
        "slide": () => {
            if (typeof btnSlide === 'function') btnSlide();
        },
        "angleFront": () => {
            if (typeof appendAngleToLastMarker === 'function') appendAngleToLastMarker('정면');
        },
        "angleRight": () => {
            if (typeof appendAngleToLastMarker === 'function') appendAngleToLastMarker('우측');
        },
        "angleLeft": () => {
            if (typeof appendAngleToLastMarker === 'function') appendAngleToLastMarker('좌측');
        }
    }
});
