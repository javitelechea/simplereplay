/* ═══════════════════════════════════════════
   SimpleReplay — YouTube Player Wrapper
   Uses YouTube IFrame API
   ═══════════════════════════════════════════ */

const YTPlayer = (() => {
    let player = null;
    let _ready = false;
    let _clipEndSec = null;
    let _pollTimer = null;
    let _onReadyCb = null;

    // Load YouTube IFrame API
    function init() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                _createPlayer(resolve);
                return;
            }
            _onReadyCb = resolve;
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        });
    }

    // YouTube API calls this globally
    window.onYouTubeIframeAPIReady = function () {
        _createPlayer(_onReadyCb);
    };

    function _createPlayer(resolve) {
        player = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            playerVars: {
                autoplay: 0,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                fs: 1,
                playsinline: 1,
            },
            events: {
                onReady: () => {
                    _ready = true;
                    if (resolve) resolve();
                },
                onStateChange: _onStateChange,
            }
        });
    }

    function _onStateChange(event) {
        // If playing and we have a clip end, start polling
        if (event.data === YT.PlayerState.PLAYING && _clipEndSec !== null) {
            _startPoll();
        }
        if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            _stopPoll();
        }
    }

    function _startPoll() {
        _stopPoll();
        _pollTimer = setInterval(() => {
            if (!player || _clipEndSec === null) { _stopPoll(); return; }
            const t = player.getCurrentTime();
            if (t >= _clipEndSec) {
                player.pauseVideo();
                _clipEndSec = null;
                _stopPoll();
            }
        }, 200);
    }

    function _stopPoll() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    function loadVideo(videoId) {
        if (!_ready || !player) return;
        _clipEndSec = null;
        _stopPoll();
        player.loadVideoById(videoId, 0);
        setTimeout(() => { if (player) player.pauseVideo(); }, 500);
    }

    function seekTo(seconds) {
        if (!_ready || !player) return;
        player.seekTo(seconds, true);
    }

    function play() {
        if (!_ready || !player) return;
        player.playVideo();
    }

    function pause() {
        if (!_ready || !player) return;
        player.pauseVideo();
    }

    function getCurrentTime() {
        if (!_ready || !player) return 0;
        return player.getCurrentTime() || 0;
    }

    function playClip(startSec, endSec) {
        if (!_ready || !player) return;
        _clipEndSec = endSec;
        player.seekTo(startSec, true);
        player.playVideo();
        _startPoll();
    }

    function clearClipEnd() {
        _clipEndSec = null;
        _stopPoll();
    }

    function isReady() { return _ready; }

    return { init, loadVideo, seekTo, play, pause, getCurrentTime, playClip, clearClipEnd, isReady };
})();
