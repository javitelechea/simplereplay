/* ═══════════════════════════════════════════
   SimpleReplay — State Management
   Simple event-driven store
   ═══════════════════════════════════════════ */

const AppState = (() => {
  // Internal state
  const state = {
    mode: 'analyze',           // 'analyze' | 'view'
    currentGameId: null,
    currentClipId: null,
    currentClipIndex: -1,
    panelCollapsed: false,
    focusView: false,

    // Data
    games: [],
    tagTypes: [],
    clips: [],                 // clips for current game
    playlists: [],             // playlists for current game
    playlistItems: {},         // { playlistId: [clipId, ...] }
    clipFlags: {},             // { clipId: [{ flag, userId }] }
    clipComments: {},           // { clipId: [{ name, text, timestamp }] }

    // View mode filters
    activeTagFilters: [],      // array of tag type IDs
    activePlaylistId: null,    // single playlist ID or null
    filterFlags: [],           // active flag filters

    // Simulated user
    userId: 'demo-user-001',

    // Cloud project
    currentProjectId: null,
  };

  // Listeners
  const listeners = {};

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function off(event, cb) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(fn => fn !== cb);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  }

  // Getters
  function get(key) { return state[key]; }

  function getCurrentGame() {
    return state.games.find(g => g.id === state.currentGameId) || null;
  }

  function getCurrentClip() {
    return state.clips.find(c => c.id === state.currentClipId) || null;
  }

  function getTagType(id) {
    return state.tagTypes.find(t => t.id === id);
  }

  function getFilteredClips() {
    let clips = [...state.clips];

    // Filter by playlist (exclusive)
    if (state.activePlaylistId) {
      const itemClipIds = state.playlistItems[state.activePlaylistId] || [];
      clips = clips.filter(c => itemClipIds.includes(c.id));
    }

    // Filter by tags (any of selected, additive)
    if (state.activeTagFilters.length > 0) {
      clips = clips.filter(c => state.activeTagFilters.includes(c.tag_type_id));
    }

    // Filter by flags and/or chat (cross-filter)
    if (state.filterFlags.length > 0) {
      const realFlags = state.filterFlags.filter(f => f !== 'has_chat');
      const wantChat = state.filterFlags.includes('has_chat');
      clips = clips.filter(c => {
        let match = false;
        if (realFlags.length > 0) {
          const flags = (state.clipFlags[c.id] || [])
            .filter(f => f.userId === state.userId)
            .map(f => f.flag);
          match = realFlags.some(ff => flags.includes(ff));
        }
        if (wantChat) {
          match = match || (state.clipComments[c.id] && state.clipComments[c.id].length > 0);
        }
        return match;
      });
    }

    // Sort by t_sec
    clips.sort((a, b) => a.t_sec - b.t_sec);
    return clips;
  }

  function getClipUserFlags(clipId) {
    return (state.clipFlags[clipId] || [])
      .filter(f => f.userId === state.userId)
      .map(f => f.flag);
  }

  // Setters / mutations
  function setMode(mode) {
    state.mode = mode;
    emit('modeChanged', mode);
  }

  function setCurrentGame(gameId) {
    state.currentGameId = gameId;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    // Load clips/playlists for this game
    const game = getCurrentGame();
    if (game) {
      state.clips = DemoData.getClipsForGame(gameId);
      state.playlists = DemoData.getPlaylistsForGame(gameId);
      state.playlistItems = {};
      state.playlists.forEach(pl => {
        state.playlistItems[pl.id] = DemoData.getPlaylistItems(pl.id);
      });
      // Load flags for all clips
      state.clipFlags = {};
      state.clips.forEach(c => {
        state.clipFlags[c.id] = DemoData.getClipFlags(c.id);
      });
    } else {
      state.clips = [];
      state.playlists = [];
      state.playlistItems = {};
      state.clipFlags = {};
    }
    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.filterFlags = [];
    emit('gameChanged', game);
  }

  function setCurrentClip(clipId) {
    state.currentClipId = clipId;
    const filtered = getFilteredClips();
    state.currentClipIndex = filtered.findIndex(c => c.id === clipId);
    emit('clipChanged', getCurrentClip());
  }

  function addGame(title, youtubeVideoId) {
    const game = DemoData.createGame(title, youtubeVideoId);
    state.games = DemoData.getGames();
    emit('gamesUpdated', state.games);
    return game;
  }

  function addClip(tagTypeId, tSec) {
    const tag = getTagType(tagTypeId);
    if (!tag) return null;
    const startSec = Math.max(0, tSec - tag.pre_sec);
    const endSec = tSec + tag.post_sec;
    if (endSec <= startSec) return null;

    const clip = DemoData.createClip(state.currentGameId, tagTypeId, tSec, startSec, endSec);
    state.clips = DemoData.getClipsForGame(state.currentGameId);
    state.clipFlags[clip.id] = [];
    emit('clipsUpdated', state.clips);
    return clip;
  }

  function updateClipBounds(clipId, field, delta) {
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;

    if (field === 'start_sec') {
      clip.start_sec = Math.max(0, clip.start_sec + delta);
      if (clip.start_sec >= clip.end_sec) clip.start_sec = clip.end_sec - 1;
    } else if (field === 'end_sec') {
      clip.end_sec = clip.end_sec + delta;
      if (clip.end_sec <= clip.start_sec) clip.end_sec = clip.start_sec + 1;
    }
    DemoData.updateClip(clipId, { start_sec: clip.start_sec, end_sec: clip.end_sec });
    emit('clipsUpdated', state.clips);
    emit('clipChanged', clip);
  }

  function deleteClip(clipId) {
    DemoData.deleteClip(clipId);
    state.clips = DemoData.getClipsForGame(state.currentGameId);
    if (state.currentClipId === clipId) {
      state.currentClipId = null;
      state.currentClipIndex = -1;
    }
    delete state.clipFlags[clipId];
    emit('clipsUpdated', state.clips);
    emit('clipChanged', null);
  }

  function addPlaylist(name) {
    const pl = DemoData.createPlaylist(state.currentGameId, name);
    state.playlists = DemoData.getPlaylistsForGame(state.currentGameId);
    state.playlistItems[pl.id] = [];
    emit('playlistsUpdated', state.playlists);
    return pl;
  }

  function addClipToPlaylist(playlistId, clipId) {
    DemoData.addClipToPlaylist(playlistId, clipId);
    state.playlistItems[playlistId] = DemoData.getPlaylistItems(playlistId);
    emit('playlistsUpdated', state.playlists);
  }

  function toggleFlag(clipId, flag) {
    const flags = getClipUserFlags(clipId);
    if (flags.includes(flag)) {
      DemoData.removeFlag(clipId, state.userId, flag);
    } else {
      DemoData.addFlag(clipId, state.userId, flag);
    }
    state.clipFlags[clipId] = DemoData.getClipFlags(clipId);
    emit('flagsUpdated', { clipId, flags: getClipUserFlags(clipId) });
  }

  function toggleTagFilter(tagId) {
    if (state.activeTagFilters.length === 1 && state.activeTagFilters[0] === tagId) {
      // Same tag clicked again → deselect
      state.activeTagFilters = [];
    } else {
      // Replace with this single tag
      state.activeTagFilters = [tagId];
    }
    // Clear playlist when using tags
    state.activePlaylistId = null;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function removeTagFilter(tagId) {
    const idx = state.activeTagFilters.indexOf(tagId);
    if (idx >= 0) state.activeTagFilters.splice(idx, 1);
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function clearTagFilters() {
    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function clearAllFilters() {
    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.filterFlags = [];
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function setPlaylistFilter(playlistId) {
    state.activePlaylistId = playlistId;
    state.activeTagFilters = []; // playlists are exclusive
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function clearPlaylistFilter() {
    state.activePlaylistId = null;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function toggleFilterFlag(flag) {
    const idx = state.filterFlags.indexOf(flag);
    if (idx >= 0) {
      state.filterFlags.splice(idx, 1);
    } else {
      state.filterFlags.push(flag);
    }
    emit('viewFiltersChanged');
  }

  function clearFilterFlags() {
    state.filterFlags = [];
    emit('viewFiltersChanged');
  }

  // Tag CRUD
  function addTagType(data) {
    const tag = DemoData.createTagType(data);
    state.tagTypes = DemoData.getTagTypes();
    emit('tagTypesUpdated', state.tagTypes);
    return tag;
  }

  function updateTagType(id, changes) {
    DemoData.updateTagType(id, changes);
    state.tagTypes = DemoData.getTagTypes();
    emit('tagTypesUpdated', state.tagTypes);
  }

  function deleteTagType(id) {
    DemoData.deleteTagType(id);
    state.tagTypes = DemoData.getTagTypes();
    emit('tagTypesUpdated', state.tagTypes);
  }

  function togglePanel() {
    state.panelCollapsed = !state.panelCollapsed;
    emit('panelToggled', state.panelCollapsed);
  }

  function toggleFocusView() {
    state.focusView = !state.focusView;
    if (state.focusView && !state.panelCollapsed) {
      state.panelCollapsed = true;
      emit('panelToggled', true);
    } else if (!state.focusView && state.panelCollapsed) {
      state.panelCollapsed = false;
      emit('panelToggled', false);
    }
    emit('focusViewToggled', state.focusView);
  }

  function navigateClip(direction) {
    const filtered = getFilteredClips();
    if (filtered.length === 0) return;
    let idx = state.currentClipIndex;
    if (direction === 'next') {
      idx = Math.min(filtered.length - 1, idx + 1);
    } else {
      idx = Math.max(0, idx - 1);
    }
    if (idx >= 0 && idx < filtered.length) {
      setCurrentClip(filtered[idx].id);
    }
  }

  function init() {
    state.tagTypes = DemoData.getTagTypes();
    state.games = DemoData.getGames();
    emit('initialized', state);
  }

  // ── Chat / Comments ──
  function addComment(clipId, name, text) {
    if (!state.clipComments[clipId]) state.clipComments[clipId] = [];
    const comment = {
      name,
      text,
      timestamp: new Date().toISOString()
    };
    state.clipComments[clipId].push(comment);
    emit('commentAdded', { clipId, comment });
    return comment;
  }

  function getComments(clipId) {
    return state.clipComments[clipId] || [];
  }

  // ── Cloud save/load ──
  async function saveToCloud() {
    const game = getCurrentGame();
    const data = {
      title: game ? game.title : 'Sin título',
      youtubeVideoId: game ? game.youtube_video_id : '',
      tagTypes: state.tagTypes,
      games: state.games,
      clips: state.clips,
      playlists: state.playlists,
      playlistItems: state.playlistItems,
      clipFlags: state.clipFlags,
      clipComments: state.clipComments,
    };
    const projectId = await FirebaseData.saveProject(state.currentProjectId, data);
    state.currentProjectId = projectId;
    // Update URL
    const url = FirebaseData.getShareUrl(projectId);
    window.history.replaceState({}, '', url);
    emit('projectSaved', projectId);
    return projectId;
  }

  async function loadFromCloud(projectId) {
    const data = await FirebaseData.loadProject(projectId);
    if (!data) return false;

    state.currentProjectId = projectId;
    state.tagTypes = data.tagTypes || [];
    state.games = data.games || [];
    state.clips = data.clips || [];
    state.playlists = data.playlists || [];
    state.playlistItems = data.playlistItems || {};
    state.clipFlags = data.clipFlags || {};
    state.clipComments = data.clipComments || {};

    // Select the first game if any
    if (state.games.length > 0) {
      state.currentGameId = state.games[0].id;
    }

    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.filterFlags = [];
    state.currentClipId = null;
    state.currentClipIndex = -1;

    emit('projectLoaded', data);
    emit('gameChanged', getCurrentGame());
    return true;
  }

  return {
    on, off, emit, get, init,
    getCurrentGame, getCurrentClip, getTagType,
    getFilteredClips, getClipUserFlags,
    setMode, setCurrentGame, setCurrentClip,
    addGame, addClip, updateClipBounds, deleteClip,
    addPlaylist, addClipToPlaylist,
    toggleFlag,
    toggleTagFilter, removeTagFilter, clearTagFilters, clearAllFilters,
    setPlaylistFilter, clearPlaylistFilter,
    toggleFilterFlag, clearFilterFlags,
    addTagType, updateTagType, deleteTagType,
    togglePanel, toggleFocusView, navigateClip,
    saveToCloud, loadFromCloud,
    addComment, getComments
  };
})();
