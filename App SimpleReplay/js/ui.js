/* ═══════════════════════════════════════════
   SimpleReplay — UI Rendering
   All DOM rendering and update functions
   ═══════════════════════════════════════════ */

const UI = (() => {

    const FLAG_EMOJI = {
        bueno: '👍',
        acorregir: '⚠️',
        duda: '❓',
        importante: '⭐'
    };

    const FLAG_LABELS = {
        bueno: 'Bueno',
        acorregir: 'A corregir',
        duda: 'Duda',
        importante: 'Importante'
    };

    // ── Helpers ──
    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    // ── Toast ──
    function toast(msg, type = '') {
        const container = $('#toast-container');
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.remove(); }, 2600);
    }

    // ═══ GAME SELECTOR ═══
    function renderGameSelector() {
        const sel = $('#game-selector');
        const games = AppState.get('games');
        const currentId = AppState.get('currentGameId');
        sel.innerHTML = '<option value="">— Seleccionar partido —</option>';
        games.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.title;
            if (g.id === currentId) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    // ═══ TAG BUTTONS (Below Video — Top & Bottom rows) ═══
    let _tagEditMode = false;
    let _editingTagId = null;

    function renderTagButtons() {
        const containerTop = $('#tag-buttons-a');
        const containerBottom = $('#tag-buttons-b');
        const tags = AppState.get('tagTypes');
        containerTop.innerHTML = '';
        containerBottom.innerHTML = '';

        function createTagBtn(tag) {
            const btn = document.createElement('button');
            const isRival = tag.row === 'bottom';
            btn.className = 'tag-btn' + (isRival ? ' tag-btn-rival' : '') +
                (_tagEditMode ? ' tag-edit-mode' : '') +
                (_editingTagId === tag.id ? ' tag-editing' : '');
            btn.dataset.tagId = tag.id;
            btn.textContent = tag.label;
            btn.title = _tagEditMode
                ? `Click para editar "${tag.label}"`
                : `${tag.label} — Pre: ${tag.pre_sec}s | Post: ${tag.post_sec}s`;

            btn.addEventListener('click', () => {
                if (_tagEditMode) {
                    openTagInlineEditor(tag);
                    return;
                }
                // Normal mode: create clip
                if (!AppState.get('currentGameId')) {
                    toast('Primero seleccioná un partido', 'error');
                    return;
                }
                const tSec = Math.round(YTPlayer.getCurrentTime());
                const clip = AppState.addClip(tag.id, tSec);
                if (clip) {
                    btn.classList.add('tag-flash');
                    setTimeout(() => btn.classList.remove('tag-flash'), 500);
                    toast(`Clip creado: ${tag.label} @ ${formatTime(tSec)}`, 'success');
                }
            });
            return btn;
        }

        tags.forEach(tag => {
            if (tag.row === 'bottom') {
                containerBottom.appendChild(createTagBtn(tag));
            } else {
                containerTop.appendChild(createTagBtn(tag));
            }
        });

        // In edit mode, add "+" buttons for adding new tags to each row
        if (_tagEditMode) {
            const addBtnTop = document.createElement('button');
            addBtnTop.className = 'tag-btn tag-btn-add';
            addBtnTop.textContent = '+';
            addBtnTop.title = 'Agregar tag (propio)';
            addBtnTop.addEventListener('click', () => openTagInlineEditor(null, 'top'));
            containerTop.appendChild(addBtnTop);

            const addBtnBottom = document.createElement('button');
            addBtnBottom.className = 'tag-btn tag-btn-rival tag-btn-add';
            addBtnBottom.textContent = '+';
            addBtnBottom.title = 'Agregar tag (rival)';
            addBtnBottom.addEventListener('click', () => openTagInlineEditor(null, 'bottom'));
            containerBottom.appendChild(addBtnBottom);
        }
    }

    // ═══ FLAG DROPDOWN HELPERS (per-clip flag assignment) ═══
    function buildFlagButton(clipId, activeFlags) {
        const hasFlags = activeFlags.length > 0;
        const flagsDisplay = hasFlags ? activeFlags.map(f => FLAG_EMOJI[f] || '').join('') : '';
        return `<span class="clip-flags-display">${flagsDisplay}</span><button class="clip-flag-btn${hasFlags ? ' has-flags' : ''}" data-clip-id="${clipId}" title="Flags">🚩</button>`;
    }

    function attachFlagDropdownHandlers(container, rerenderFn) {
        container.querySelectorAll('.clip-flag-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipId = btn.dataset.clipId;
                // Close any other open popover
                container.querySelectorAll('.flag-popover').forEach(p => p.remove());
                // Create popover
                const popover = document.createElement('div');
                popover.className = 'flag-popover';
                const allFlags = ['bueno', 'acorregir', 'duda', 'importante'];
                const currentFlags = AppState.getClipUserFlags(clipId);
                popover.innerHTML = allFlags.map(flag => {
                    const isActive = currentFlags.includes(flag);
                    return `<button class="flag-popover-btn${isActive ? ' active' : ''}" data-clip-id="${clipId}" data-flag="${flag}" title="${FLAG_LABELS[flag]}">${FLAG_EMOJI[flag]}</button>`;
                }).join('');
                btn.parentElement.style.position = 'relative';
                btn.parentElement.appendChild(popover);
                // Attach flag click handlers
                popover.querySelectorAll('.flag-popover-btn').forEach(fb => {
                    fb.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        AppState.toggleFlag(fb.dataset.clipId, fb.dataset.flag);
                        rerenderFn();
                    });
                });
                // Close on outside click
                const close = (ev) => {
                    if (!popover.contains(ev.target) && ev.target !== btn) {
                        popover.remove();
                        document.removeEventListener('click', close);
                    }
                };
                setTimeout(() => document.addEventListener('click', close), 0);
            });
        });
    }

    // ═══ CHAT / COMMENTS HELPERS ═══
    const MENTION_REGEX = /@(\w[\w\s]*?)(?=\s|$|[.,;:!?])/g;

    function highlightMentions(text) {
        return text.replace(MENTION_REGEX, '<span class="chat-mention">@$1</span>');
    }

    function buildChatButton(clipId) {
        const comments = AppState.getComments(clipId);
        const count = comments.length;
        const hasClass = count > 0 ? ' has-comments' : '';
        return `<button class="clip-chat-btn${hasClass}" data-clip-id="${clipId}" title="Chat (${count})">💬${count > 0 ? count : ''}</button>`;
    }

    function buildChatPanel(clipId) {
        const comments = AppState.getComments(clipId);
        const savedName = localStorage.getItem('sr_chat_name') || '';
        let messagesHtml = '';
        if (comments.length === 0) {
            messagesHtml = '<p style="color:var(--text-muted);font-size:0.7rem;text-align:center;">Sin comentarios</p>';
        } else {
            messagesHtml = comments.map(c => {
                const time = c.timestamp ? new Date(c.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
                return `<div class="chat-message"><span class="chat-name">${c.name}:</span>${highlightMentions(c.text)}<span class="chat-time">${time}</span></div>`;
            }).join('');
        }
        return `
        <div class="clip-chat-panel" data-clip-id="${clipId}">
            <div class="chat-messages">${messagesHtml}</div>
            <div class="chat-input-row">
                <input type="text" class="chat-name-input" placeholder="Nombre" value="${savedName}" data-role="chat-name" />
                <input type="text" class="chat-text-input" placeholder="Mensaje... (@Arq, @Del...)" data-role="chat-text" />
                <button class="btn btn-xs btn-primary chat-send-btn" data-clip-id="${clipId}">↩</button>
            </div>
        </div>`;
    }

    function attachChatHandlers(container, rerenderFn) {
        // Toggle chat panel
        container.querySelectorAll('.clip-chat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipId = btn.dataset.clipId;
                const parentEl = btn.closest('.clip-item');
                const existing = parentEl.querySelector('.clip-chat-panel');
                if (existing) {
                    existing.remove();
                } else {
                    // Close any other open chat
                    container.querySelectorAll('.clip-chat-panel').forEach(p => p.remove());
                    parentEl.insertAdjacentHTML('beforeend', buildChatPanel(clipId));
                    // Focus text input
                    const textInput = parentEl.querySelector('.chat-text-input');
                    if (textInput) textInput.focus();
                    // Send handler
                    const sendBtn = parentEl.querySelector('.chat-send-btn');
                    const nameInput = parentEl.querySelector('.chat-name-input');
                    const sendMessage = () => {
                        const name = nameInput.value.trim();
                        const text = textInput.value.trim();
                        if (!name) { toast('Escribí tu nombre', 'error'); nameInput.focus(); return; }
                        if (!text) return;
                        localStorage.setItem('sr_chat_name', name);
                        AppState.addComment(clipId, name, text);
                        rerenderFn();
                    };
                    sendBtn.addEventListener('click', sendMessage);
                    textInput.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') { ev.preventDefault(); sendMessage(); }
                    });
                }
            });
        });
    }

    // ═══ CLIP LIST (Analyze) ═══
    function renderAnalyzeClips() {
        const container = $('#analyze-clip-list');
        const clips = AppState.get('clips');
        const currentClipId = AppState.get('currentClipId');

        container.innerHTML = '';
        $('#clip-count').textContent = clips.length;

        if (clips.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px;">Sin clips. Usá los tags para crear.</p>';
            return;
        }

        clips.forEach(clip => {
            const tag = AppState.getTagType(clip.tag_type_id);
            const flags = AppState.getClipUserFlags(clip.id);
            const el = document.createElement('div');
            el.className = 'clip-item' + (clip.id === currentClipId ? ' active' : '');
            el.dataset.clipId = clip.id;

            const isRival = tag && tag.row === 'bottom';
            const badgeClass = isRival ? 'clip-tag-badge rival' : 'clip-tag-badge';
            const flagBtnHtml = buildFlagButton(clip.id, flags);
            const chatBtnHtml = buildChatButton(clip.id);
            el.innerHTML = `
        <span class="${badgeClass}">${tag ? tag.label : '?'}</span>
        <span class="clip-time">${formatTime(clip.start_sec)} → ${formatTime(clip.end_sec)}</span>
        <span class="clip-item-spacer"></span>
        ${flagBtnHtml}
        ${chatBtnHtml}
        <button class="clip-action-icon clip-add-playlist" data-clip-id="${clip.id}" title="Agregar a playlist">📋</button>
        <button class="clip-action-icon clip-delete-btn" data-clip-id="${clip.id}" title="Eliminar clip">🗑️</button>
      `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.clip-flag-btn')) return;
                if (e.target.closest('.flag-popover')) return;
                if (e.target.closest('.clip-chat-panel')) return;
                if (e.target.closest('.clip-chat-btn')) return;
                if (e.target.closest('.clip-action-icon')) return;
                AppState.setCurrentClip(clip.id);
                YTPlayer.playClip(clip.start_sec, clip.end_sec);
            });

            container.appendChild(el);
        });

        // Flag dropdown
        attachFlagDropdownHandlers(container, () => renderAnalyzeClips());

        // Playlist add buttons
        container.querySelectorAll('.clip-add-playlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToPlaylistModal(btn.dataset.clipId);
            });
        });

        // Delete buttons
        container.querySelectorAll('.clip-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                AppState.deleteClip(btn.dataset.clipId);
                toast('Clip eliminado', 'success');
            });
        });

        // Chat handlers
        attachChatHandlers(container, () => renderAnalyzeClips());
    }

    // ═══ CLIP LIST (View) ═══
    let _selectedClipIds = new Set();

    function renderViewClips() {
        const container = $('#view-clip-list');
        const clips = AppState.getFilteredClips();
        const currentClipId = AppState.get('currentClipId');

        container.innerHTML = '';
        $('#view-clip-count').textContent = clips.length;

        if (clips.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px;">Sin clips para esta selección.</p>';
            updateSelectionBar();
            return;
        }

        clips.forEach(clip => {
            const tag = AppState.getTagType(clip.tag_type_id);
            const flags = AppState.getClipUserFlags(clip.id);
            const el = document.createElement('div');
            el.className = 'clip-item' + (clip.id === currentClipId ? ' active' : '');
            el.dataset.clipId = clip.id;

            const isRival = tag && tag.row === 'bottom';
            const badgeClass = isRival ? 'clip-tag-badge rival' : 'clip-tag-badge';
            const flagBtnHtml = buildFlagButton(clip.id, flags);
            const chatBtnHtml = buildChatButton(clip.id);
            const checked = _selectedClipIds.has(clip.id) ? 'checked' : '';
            el.innerHTML = `
        <input type="checkbox" class="clip-checkbox" data-clip-id="${clip.id}" ${checked} />
        <span class="${badgeClass}">${tag ? tag.label : '?'}</span>
        <span class="clip-time">${formatTime(clip.start_sec)} → ${formatTime(clip.end_sec)}</span>
        <span class="clip-item-spacer"></span>
        ${flagBtnHtml}
        ${chatBtnHtml}
      `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.clip-flag-btn')) return;
                if (e.target.closest('.flag-popover')) return;
                if (e.target.classList.contains('clip-checkbox')) return;
                if (e.target.closest('.clip-chat-panel')) return;
                if (e.target.closest('.clip-chat-btn')) return;
                AppState.setCurrentClip(clip.id);
                YTPlayer.playClip(clip.start_sec, clip.end_sec);
            });

            container.appendChild(el);
        });

        // Checkbox handlers
        container.querySelectorAll('.clip-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const cid = cb.dataset.clipId;
                if (cb.checked) _selectedClipIds.add(cid);
                else _selectedClipIds.delete(cid);
                updateSelectionBar();
            });
        });

        // Flag dropdown
        attachFlagDropdownHandlers(container, () => renderViewClips());

        // Chat handlers
        attachChatHandlers(container, () => renderViewClips());

        updateSelectionBar();
    }

    function updateSelectionBar() {
        const bar = $('#view-selection-bar');
        if (!bar) return;
        if (_selectedClipIds.size > 0) {
            bar.style.display = 'flex';
            const countEl = $('#view-selected-count');
            if (countEl) countEl.textContent = _selectedClipIds.size;
        } else {
            bar.style.display = 'none';
        }
    }

    function getSelectedClipIds() { return [..._selectedClipIds]; }
    function clearClipSelection() { _selectedClipIds.clear(); updateSelectionBar(); }

    // ═══ CLIP EDIT CONTROLS ═══
    function updateClipEditControls() {
        const controls = $('#clip-edit-controls');
        const clip = AppState.getCurrentClip();
        if (clip && AppState.get('mode') === 'analyze') {
            controls.style.display = 'flex';
        } else {
            controls.style.display = 'none';
        }
    }

    // ═══ PLAYLISTS (Analyze) ═══
    function renderAnalyzePlaylists() {
        const container = $('#analyze-playlists');
        const playlists = AppState.get('playlists');
        container.innerHTML = '';

        playlists.forEach(pl => {
            const items = AppState.get('playlistItems')[pl.id] || [];
            const el = document.createElement('div');
            el.className = 'playlist-item';
            el.innerHTML = `
        <span class="pl-icon">📁</span>
        <span>${pl.name}</span>
        <span class="pl-count">${items.length} clips</span>
      `;
            container.appendChild(el);
        });
    }

    // ═══ SOURCE SELECTOR (View — Multi-tag) ═══
    function renderViewSources() {
        const tagsContainer = $('#source-tags');
        const playlistsContainer = $('#source-playlists');
        const tags = AppState.get('tagTypes');
        const playlists = AppState.get('playlists');
        const activeTagIds = AppState.get('activeTagFilters');
        const activePlaylistId = AppState.get('activePlaylistId');

        tagsContainer.innerHTML = '';
        playlistsContainer.innerHTML = '';

        // Update 'all' button
        const allBtn = $('#src-all');
        const hasAnyFilter = activeTagIds.length > 0 || activePlaylistId;
        allBtn.className = 'source-btn' + (!hasAnyFilter ? ' active' : '');
        allBtn.onclick = () => {
            AppState.clearTagFilters();
        };

        tags.forEach(tag => {
            const btn = document.createElement('button');
            const isRival = tag.row === 'bottom';
            const isActive = activeTagIds.includes(tag.id);
            btn.className = 'source-btn' + (isActive ? ' active' : '') + (isRival ? ' source-btn-rival' : '');
            btn.dataset.source = tag.id;
            btn.textContent = tag.label;
            btn.addEventListener('click', () => {
                AppState.toggleTagFilter(tag.id);
                // Auto-collapse after selection
                const body = document.getElementById('source-tags-list');
                const toggle = body?.previousElementSibling;
                if (body) body.classList.add('collapsed');
                if (toggle) toggle.classList.remove('open');
            });
            tagsContainer.appendChild(btn);
        });

        playlists.forEach(pl => {
            const btn = document.createElement('button');
            const isActive = activePlaylistId === pl.id;
            btn.className = 'source-btn' + (isActive ? ' active' : '');
            btn.dataset.source = pl.id;
            btn.textContent = pl.name;
            btn.addEventListener('click', () => {
                if (isActive) {
                    AppState.clearPlaylistFilter();
                } else {
                    AppState.setPlaylistFilter(pl.id);
                }
                const body = document.getElementById('source-playlists-list');
                const toggle = body?.previousElementSibling;
                if (body) body.classList.add('collapsed');
                if (toggle) toggle.classList.remove('open');
            });
            playlistsContainer.appendChild(btn);
        });

        // Render filter chips
        renderFilterChips(tags, playlists, activeTagIds, activePlaylistId);
    }

    function renderFilterChips(tags, playlists, activeTagIds, activePlaylistId) {
        const container = $('#active-filter-chip');
        container.innerHTML = '';

        const hasFilters = activeTagIds.length > 0 || activePlaylistId;

        if (!hasFilters) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        // Tag chips
        activeTagIds.forEach(tagId => {
            const tag = tags.find(t => t.id === tagId);
            if (!tag) return;
            const chip = document.createElement('span');
            const isRival = tag.row === 'bottom';
            chip.className = 'filter-chip' + (isRival ? ' rival' : '');
            chip.innerHTML = `${tag.label}<button class="filter-chip-x" data-remove-tag="${tag.id}" title="Quitar">✕</button>`;
            container.appendChild(chip);
        });

        // Playlist chip
        if (activePlaylistId) {
            const pl = playlists.find(p => p.id === activePlaylistId);
            if (pl) {
                const chip = document.createElement('span');
                chip.className = 'filter-chip playlist';
                chip.innerHTML = `📁 ${pl.name}<button class="filter-chip-x" data-remove-playlist="1" title="Quitar">✕</button>`;
                container.appendChild(chip);
            }
        }

        // Attach remove handlers
        container.querySelectorAll('[data-remove-tag]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                AppState.removeTagFilter(btn.dataset.removeTag);
            });
        });
        container.querySelectorAll('[data-remove-playlist]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                AppState.clearPlaylistFilter();
            });
        });
    }

    // ═══ FLAG FILTER BAR ═══
    function updateFlagFilterBar() {
        const activeFilters = AppState.get('filterFlags');
        const clearBtn = $('#btn-clear-flag-filter');
        clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        $$('#flag-filter-bar .flag-btn').forEach(btn => {
            const flag = btn.dataset.flag;
            btn.classList.toggle('filter-active', activeFilters.includes(flag));
        });
    }

    // ═══ FLAG BUTTONS (for current clip in View mode) ═══
    function updateFlagButtons() {
        const clip = AppState.getCurrentClip();
        if (!clip) return;
        const userFlags = AppState.getClipUserFlags(clip.id);

        $$('#flag-filter-bar .flag-btn').forEach(btn => {
            const flag = btn.dataset.flag;
            btn.classList.toggle('active', userFlags.includes(flag));
        });
    }

    // ═══ FOCUS VIEW ═══
    function updateFocusView() {
        const active = AppState.get('focusView');
        const overlay = $('#focus-overlay');
        const clip = AppState.getCurrentClip();

        overlay.classList.toggle('hidden', !active || !clip);

        if (active && clip) {
            const tag = AppState.getTagType(clip.tag_type_id);
            const flags = AppState.getClipUserFlags(clip.id);
            $('#focus-clip-name').textContent = tag ? `${tag.label} @ ${formatTime(clip.t_sec)}` : '';
            $('#focus-clip-flags').textContent = flags.map(f => FLAG_EMOJI[f] || '').join(' ');
        }

        // Toggle focus button text
        const btn = $('#btn-focus-view');
        if (btn) {
            btn.innerHTML = active ? '<span>↩️</span> Salir Foco' : '<span>🔍</span> Vista Foco';
        }
    }

    // ═══ PANEL COLLAPSE ═══
    function updatePanelState() {
        const collapsed = AppState.get('panelCollapsed');
        const panel = $('#side-panel');
        const expandBtn = $('#btn-expand-panel');

        panel.classList.toggle('collapsed', collapsed);
        expandBtn.classList.toggle('hidden', !collapsed);
        document.body.classList.toggle('panel-collapsed', collapsed);
    }

    // ═══ MODE SWITCH ═══
    function updateMode() {
        const mode = AppState.get('mode');
        const panelAnalyze = $('#panel-analyze');
        const panelView = $('#panel-view');
        const navArrows = $('#nav-arrows');
        const tagBar = $('#tag-bar');
        const slider = $('#mode-slider');

        // Toggle panels
        panelAnalyze.classList.toggle('hidden', mode !== 'analyze');
        panelView.classList.toggle('hidden', mode !== 'view');

        // Toggle nav arrows (only in view mode)
        navArrows.classList.toggle('hidden', mode !== 'view');

        // Toggle tag bar (only in analyze mode)
        tagBar.classList.toggle('hidden', mode !== 'analyze');

        // Toggle buttons active
        $('#btn-mode-analyze').classList.toggle('active', mode === 'analyze');
        $('#btn-mode-view').classList.toggle('active', mode === 'view');

        // Slider animation
        slider.classList.toggle('right', mode === 'view');

        // Exit focus when switching to analyze
        if (mode === 'analyze' && AppState.get('focusView')) {
            AppState.toggleFocusView();
        }

        // Refresh appropriate list
        if (mode === 'analyze') {
            renderAnalyzeClips();
            updateClipEditControls();
        } else {
            renderViewClips();
            renderViewSources();
            updateFlagFilterBar();
        }
    }

    // ═══ OVERLAY (no game) ═══
    function updateNoGameOverlay() {
        const overlay = $('#no-game-overlay');
        const hasGame = !!AppState.get('currentGameId');
        overlay.classList.toggle('hidden', hasGame);
    }

    // ═══ ADD TO PLAYLIST MODAL ═══
    let _pendingClipForPlaylist = null;

    function showAddToPlaylistModal(clipId) {
        _pendingClipForPlaylist = clipId;
        const modal = $('#modal-add-to-playlist');
        const list = $('#playlist-select-list');
        const playlists = AppState.get('playlists');

        list.innerHTML = '';
        if (playlists.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">No hay playlists. Creá una primero.</p>';
        } else {
            playlists.forEach(pl => {
                const btn = document.createElement('button');
                btn.className = 'playlist-select-item';
                btn.textContent = pl.name;
                btn.addEventListener('click', () => {
                    AppState.addClipToPlaylist(pl.id, clipId);
                    toast(`Clip agregado a "${pl.name}"`, 'success');
                    hideModal('modal-add-to-playlist');
                });
                list.appendChild(btn);
            });
        }
        modal.classList.remove('hidden');
    }

    function showModal(id) {
        const modal = $('#' + id);
        modal.classList.remove('hidden');
    }

    function hideModal(id) {
        const modal = $('#' + id);
        modal.classList.add('hidden');
    }

    // ═══ FULL REFRESH ═══
    function refreshAll() {
        renderGameSelector();
        renderTagButtons();
        updateNoGameOverlay();
        updateMode();
        renderAnalyzePlaylists();
        updatePanelState();
        updateFocusView();
    }

    // ═══ TAG EDITOR ═══
    function toggleTagEditor() {
        _tagEditMode = !_tagEditMode;
        _editingTagId = null;
        const btn = $('#btn-toggle-tag-editor');
        const inlineEditor = $('#tag-editor-inline');
        btn.classList.toggle('active', _tagEditMode);
        inlineEditor.style.display = 'none';
        renderTagButtons();
    }

    function openTagInlineEditor(tag, defaultRow) {
        const inlineEditor = $('#tag-editor-inline');
        const isNewTag = !tag;
        _editingTagId = tag ? tag.id : '__new__';

        // Populate fields
        $('#edit-tag-label').value = tag ? tag.label : '';
        $('#edit-tag-pre').value = tag ? tag.pre_sec : 3;
        $('#edit-tag-post').value = tag ? tag.post_sec : 8;
        $('#edit-tag-row').value = tag ? tag.row : (defaultRow || 'top');

        // Show/hide delete button
        $('#btn-delete-tag').style.display = isNewTag ? 'none' : 'inline-flex';
        // Change save label
        $('#btn-save-tag').textContent = isNewTag ? '+ Crear' : 'Guardar';

        inlineEditor.style.display = 'block';
        renderTagButtons(); // re-render to highlight the editing tag

        // Focus the label input
        setTimeout(() => $('#edit-tag-label').focus(), 50);
    }

    function closeTagInlineEditor() {
        _editingTagId = null;
        $('#tag-editor-inline').style.display = 'none';
        renderTagButtons();
    }

    function saveTagFromEditor() {
        const label = $('#edit-tag-label').value.trim();
        if (!label) { toast('Ingresá un nombre', 'error'); return; }
        const pre_sec = parseInt($('#edit-tag-pre').value, 10) || 3;
        const post_sec = parseInt($('#edit-tag-post').value, 10) || 8;
        const row = $('#edit-tag-row').value;

        if (_editingTagId === '__new__') {
            const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            AppState.addTagType({ key, label, row, pre_sec, post_sec });
            toast(`Tag creado: ${label}`, 'success');
        } else {
            AppState.updateTagType(_editingTagId, { label, pre_sec, post_sec, row });
            toast(`Tag actualizado: ${label}`, 'success');
        }
        closeTagInlineEditor();
    }

    function deleteTagFromEditor() {
        if (_editingTagId && _editingTagId !== '__new__') {
            AppState.deleteTagType(_editingTagId);
            toast('Tag eliminado', 'success');
        }
        closeTagInlineEditor();
    }

    return {
        $, $$, toast, formatTime,
        FLAG_EMOJI, FLAG_LABELS,
        renderGameSelector, renderTagButtons,
        renderAnalyzeClips, renderViewClips,
        updateClipEditControls,
        renderAnalyzePlaylists,
        renderViewSources, updateFlagFilterBar, updateFlagButtons,
        updateFocusView, updatePanelState, updateMode,
        updateNoGameOverlay,
        showAddToPlaylistModal, showModal, hideModal,
        toggleTagEditor, saveTagFromEditor, deleteTagFromEditor, closeTagInlineEditor,
        getSelectedClipIds, clearClipSelection,
        refreshAll
    };
})();
