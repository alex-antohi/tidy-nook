/* Tidy Nook — hub logic */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const tiltFor = (id, max = 2.6) => ((hash(id) % 1000) / 1000 * 2 - 1) * max;
  const COLORS = ['butter', 'pink', 'sage', 'blue', 'lilac', 'peach'];

  /* ================= storage ================= */
  const LS_KEY = 'tidy-nook-data';
  const DEFAULT = () => ({
    version: 1,
    links: [],
    ideas: [],
    videos: [],
    songs: [],
    settings: { tidy: false, linkSort: 'visits', shelf: '', volume: 60, shuffle: false, loop: 'all', last: null, vtab: 'todo' },
  });
  let data = DEFAULT();
  let serverOK = location.protocol.startsWith('http');
  let saveTimer = null;

  function normalize(d) {
    const base = DEFAULT();
    if (!d || typeof d !== 'object') return base;
    return {
      ...base, ...d,
      links: Array.isArray(d.links) ? d.links : [],
      ideas: Array.isArray(d.ideas) ? d.ideas : [],
      videos: Array.isArray(d.videos) ? d.videos : [],
      songs: Array.isArray(d.songs) ? d.songs : [],
      settings: { ...base.settings, ...(d.settings || {}) },
    };
  }

  async function load() {
    let fromServer = null;
    if (serverOK) {
      try {
        const r = await fetch('/api/data', { cache: 'no-store' });
        if (!r.ok) throw new Error();
        fromServer = await r.json();
      } catch { serverOK = false; }
    }
    let fromLocal = null;
    try { fromLocal = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
    data = normalize(fromServer || fromLocal);
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 350);
  }
  function flush() {
    clearTimeout(saveTimer);
    const body = JSON.stringify(data);
    try { localStorage.setItem(LS_KEY, body); } catch {}
    if (serverOK) {
      fetch('/api/data', { method: 'PUT', body, headers: { 'Content-Type': 'application/json' }, keepalive: body.length < 60000 })
        .catch(() => toast('Couldn’t reach the nook server — saved in the browser for now'));
    }
  }
  window.addEventListener('pagehide', flush);

  /* ================= small helpers ================= */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  let actx;
  function tock(freq = 520) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq, actx.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, actx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, actx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.16);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.18);
    } catch {}
  }

  function sparkle(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'sparkle';
      s.textContent = ['✦', '✧', '·', '✶'][i % 4];
      const a = (Math.PI * 2 * i) / n, d = 30 + Math.random() * 40;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  function normalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    try { const u = new URL(s); return /^https?:$/.test(u.protocol) || u.protocol === 'file:' ? u.href : null; } catch { return null; }
  }
  function looksLikeUrl(s) {
    s = s.trim();
    if (/\s/.test(s)) return false;
    return /^https?:\/\//i.test(s) || /^localhost(:\d+)?(\/|$)/i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s);
  }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
  function guessName(url) {
    const h = hostOf(url).split('.');
    const core = h.length > 2 ? h[h.length - 2] : h[0];
    return core.charAt(0).toUpperCase() + core.slice(1);
  }

  function ytId(raw) {
    const s = String(raw || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(/^https?:/i.test(s) ? s : 'https://' + s);
      const host = u.hostname.replace(/^(www|m|music)\./, '');
      if (host === 'youtu.be') return u.pathname.slice(1, 12) || null;
      if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
        const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
        if (m) return m[2];
      }
    } catch {}
    return null;
  }
  async function ytInfo(id) {
    if (!serverOK) return {};
    try {
      const r = await fetch('/api/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
      return r.ok ? await r.json() : {};
    } catch { return {}; }
  }

  function ago(ts) {
    if (!ts) return '';
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const d = Math.floor(s / 86400);
    if (d < 30) return d + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const fmtTime = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  function fillRange(el) { const p = ((el.value - el.min) / (el.max - el.min)) * 100; el.style.setProperty('--p', p + '%'); }

  /* ================= header ================= */
  function tickClock() {
    const d = new Date(), h = d.getHours();
    const g = h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Cozy night';
    $('#greeting').textContent = g;
    $('#today').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function applyTidy(animate) {
    document.body.classList.toggle('tidy', !!data.settings.tidy);
    $('#tidyLabel').textContent = data.settings.tidy ? 'Mess it up' : 'Tidy up';
    if (animate) {
      const r = $('#tidyBtn').getBoundingClientRect();
      if (data.settings.tidy) { sparkle(r.left + r.width / 2, r.top + r.height / 2, 12); tock(660); setTimeout(() => tock(880), 120); }
      else tock(330);
    }
  }

  /* ================= links ================= */
  let linkFilter = '';
  let editingLink = null;
  let dragId = null;

  function sortedLinks() {
    const s = data.settings.linkSort;
    let list = data.links.slice();
    if (data.settings.shelf) list = list.filter((l) => (l.shelf || '') === data.settings.shelf);
    if (linkFilter) {
      const q = linkFilter.toLowerCase();
      list = list.filter((l) => (l.name + ' ' + l.url + ' ' + (l.shelf || '')).toLowerCase().includes(q));
    }
    if (s === 'visits') list.sort((a, b) => (b.visits || 0) - (a.visits || 0) || (b.lastVisit || 0) - (a.lastVisit || 0));
    else if (s === 'recent') list.sort((a, b) => (b.lastVisit || b.added || 0) - (a.lastVisit || a.added || 0));
    return list;
  }

  function renderShelves() {
    const shelves = [...new Set(data.links.map((l) => l.shelf).filter(Boolean))].sort();
    if (data.settings.shelf && !shelves.includes(data.settings.shelf)) data.settings.shelf = '';
    $('#shelves').innerHTML = shelves.length
      ? [`<button type="button" class="chip ${!data.settings.shelf ? 'on' : ''}" data-shelf="">everything</button>`]
        .concat(shelves.map((s) => `<button type="button" class="chip ${data.settings.shelf === s ? 'on' : ''}" data-shelf="${esc(s)}">${esc(s)}</button>`)).join('')
      : '';
    $('#shelfList').innerHTML = shelves.map((s) => `<option value="${esc(s)}">`).join('');
  }

  function renderLinks() {
    renderShelves();
    $$('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === data.settings.linkSort));
    document.body.classList.toggle('sort-manual', data.settings.linkSort === 'manual');
    const list = sortedLinks();
    const manual = data.settings.linkSort === 'manual' && !linkFilter && !data.settings.shelf;
    $('#links').innerHTML = list.map((l) => {
      const host = hostOf(l.url);
      const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
      return `<li class="link-tile" data-id="${l.id}" style="--c:var(--${COLORS.includes(l.color) ? l.color : COLORS[hash(l.id) % COLORS.length]});--t:${tiltFor(l.id).toFixed(2)}deg" ${manual ? 'draggable="true"' : ''}>
        <a href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.name)} — ${esc(host)}${l.visits ? ` · opened ${l.visits}×` : ''}">
          <span class="fav" data-l="${esc(l.name.charAt(0).toUpperCase())}"><img src="${icon}" alt="" loading="lazy" onerror="this.parentNode.textContent=this.parentNode.dataset.l"></span>
          <span class="link-name">${esc(l.name)}</span>
        </a>
        <span class="visits">${l.visits ? l.visits : ''}</span>
        <button type="button" class="tile-edit" title="Edit" aria-label="Edit ${esc(l.name)}">✎</button>
      </li>`;
    }).join('');
    $('#linksEmpty').hidden = data.links.length > 0;
    if (data.links.length && !list.length) {
      $('#linksEmpty').hidden = false;
      $('#linksEmpty').textContent = linkFilter ? 'No links match — press Enter to search the web instead.' : 'This shelf is empty.';
    } else {
      $('#linksEmpty').textContent = 'Nothing on the shelf yet. Add the sites you visit most — they\'ll sort themselves by how often you use them.';
    }
  }

  function visitLink(id) {
    const l = data.links.find((x) => x.id === id);
    if (!l) return;
    l.visits = (l.visits || 0) + 1;
    l.lastVisit = Date.now();
    save();
    // re-sort a moment later so the tile doesn't jump out from under the cursor
    setTimeout(renderLinks, 600);
  }

  function openLinkDialog(link) {
    editingLink = link || null;
    const f = $('#linkForm');
    f.reset();
    $('#linkDialogTitle').textContent = link ? 'Edit link' : 'Add a link';
    $('#linkDelete').hidden = !link;
    f.url.value = link ? link.url : '';
    f.name.value = link ? link.name : '';
    f.shelf.value = link ? link.shelf || '' : data.settings.shelf || '';
    const color = link?.color || COLORS[(data.links.length) % COLORS.length];
    $('.swatches').innerHTML = COLORS.map((c) =>
      `<button type="button" class="swatch" role="radio" aria-label="${c}" aria-checked="${c === color}" data-color="${c}" style="background:var(--${c})"></button>`).join('');
    $('#linkDialog').showModal();
    setTimeout(() => (link ? f.name : f.url).focus(), 30);
  }

  function saveLinkFromForm() {
    const f = $('#linkForm');
    const url = normalizeUrl(f.url.value);
    if (!url) { toast('That address doesn’t look right'); f.url.focus(); return false; }
    const name = f.name.value.trim() || guessName(url);
    const shelf = f.shelf.value.trim();
    const color = $('.swatch[aria-checked="true"]')?.dataset.color || 'butter';
    if (editingLink) Object.assign(editingLink, { url, name, shelf, color });
    else data.links.push({ id: uid(), url, name, shelf, color, visits: 0, added: Date.now() });
    save(); renderLinks();
    toast(editingLink ? 'Link updated' : `${name} is on the shelf`);
    return true;
  }

  function bindLinks() {
    $('#addLinkBtn').addEventListener('click', () => openLinkDialog());
    $('#linkCancel').addEventListener('click', () => $('#linkDialog').close());
    $('#linkForm').addEventListener('submit', (e) => { e.preventDefault(); if (saveLinkFromForm()) $('#linkDialog').close(); });
    $('#linkDelete').addEventListener('click', () => {
      if (!editingLink) return;
      data.links = data.links.filter((l) => l !== editingLink);
      save(); renderLinks(); $('#linkDialog').close();
      toast(`Removed ${editingLink.name}`);
    });
    $('.swatches').addEventListener('click', (e) => {
      const b = e.target.closest('.swatch'); if (!b) return;
      $$('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s === b)));
    });
    $('#shelves').addEventListener('click', (e) => {
      const c = e.target.closest('[data-shelf]'); if (!c) return;
      data.settings.shelf = c.dataset.shelf; save(); renderLinks();
    });
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => { data.settings.linkSort = b.dataset.sort; save(); renderLinks(); }));

    const grid = $('#links');
    const onOpen = (e) => {
      const a = e.target.closest('a'); if (!a) return;
      if (e.type === 'auxclick' && e.button !== 1) return;
      visitLink(a.closest('.link-tile').dataset.id);
    };
    grid.addEventListener('click', (e) => {
      const edit = e.target.closest('.tile-edit');
      if (edit) { openLinkDialog(data.links.find((l) => l.id === edit.closest('.link-tile').dataset.id)); return; }
      onOpen(e);
    });
    grid.addEventListener('auxclick', onOpen);
    grid.addEventListener('contextmenu', (e) => {
      const t = e.target.closest('.link-tile'); if (!t || e.shiftKey) return;
      e.preventDefault(); openLinkDialog(data.links.find((l) => l.id === t.dataset.id));
    });

    // drag to reorder (in "my order" mode)
    grid.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.link-tile[draggable="true"]'); if (!t) return;
      dragId = t.dataset.id; t.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    grid.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      $$('.drop-before', grid).forEach((x) => x.classList.remove('drop-before'));
      const t = e.target.closest('.link-tile');
      if (t && t.dataset.id !== dragId) t.classList.add('drop-before');
    });
    grid.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const t = e.target.closest('.link-tile');
      const from = data.links.findIndex((l) => l.id === dragId);
      const [moved] = data.links.splice(from, 1);
      let to = t ? data.links.findIndex((l) => l.id === t.dataset.id) : data.links.length;
      if (to < 0) to = data.links.length;
      data.links.splice(to, 0, moved);
      save(); renderLinks(); tock(600);
    });
    grid.addEventListener('dragend', () => { dragId = null; $$('.dragging,.drop-before', grid).forEach((x) => x.classList.remove('dragging', 'drop-before')); });
  }

  /* ================= search ================= */
  function bindSearch() {
    const q = $('#q');
    q.addEventListener('input', () => { linkFilter = q.value.trim(); renderLinks(); });
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = q.value.trim(); if (!v) return;
      const match = linkFilter && sortedLinks();
      let url;
      if (match && match.length === 1) { url = match[0].url; visitLink(match[0].id); }
      else if (looksLikeUrl(v)) url = normalizeUrl(v);
      else url = 'https://www.google.com/search?q=' + encodeURIComponent(v);
      window.open(url, '_blank', 'noopener');
      q.value = ''; linkFilter = ''; renderLinks();
    });
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; linkFilter = ''; renderLinks(); q.blur(); } });
  }

  /* ================= ideas ================= */
  let tagFilter = '';
  const tagsOf = (t) => [...new Set((t.match(/#[\p{L}\p{N}_-]+/gu) || []).map((x) => x.slice(1).toLowerCase()))];
  const ideaHtml = (t) => esc(t).replace(/#([\p{L}\p{N}_-]+)/gu, '<span class="tag">#$1</span>');
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6" fill="none" stroke="#4a3f3a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function ideaLi(i) {
    const plain = i.text.replace(/#[\p{L}\p{N}_-]+/gu, '').trim() || i.text;
    return `<li class="idea" data-id="${i.id}">
      <button type="button" class="check" title="${i.done ? 'Put back' : 'Looked into it'}" aria-label="Toggle done">${CHECK}</button>
      <div class="idea-body">
        <div class="idea-text" title="Double-click to edit">${ideaHtml(i.text)}</div>
        <div class="idea-meta">${i.done ? 'done ' + ago(i.doneAt) : ago(i.created)}</div>
      </div>
      <span class="idea-acts">
        <a class="mini-btn" href="https://www.google.com/search?q=${encodeURIComponent(plain)}" target="_blank" rel="noopener" title="Research this">🔍</a>
        <a class="mini-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(plain)}" target="_blank" rel="noopener" title="Search YouTube">▶</a>
        <button type="button" class="mini-btn del" title="Throw away">✕</button>
      </span>
    </li>`;
  }

  function renderIdeas() {
    const open = data.ideas.filter((i) => !i.done);
    const done = data.ideas.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const tags = [...new Set(open.flatMap((i) => tagsOf(i.text)))].sort();
    if (tagFilter && !tags.includes(tagFilter)) tagFilter = '';
    $('#tagChips').innerHTML = tags.length
      ? [`<button type="button" class="chip ${!tagFilter ? 'on' : ''}" data-tag="">all</button>`]
        .concat(tags.map((t) => `<button type="button" class="chip ${tagFilter === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`)).join('')
      : '';
    const shown = open.filter((i) => !tagFilter || tagsOf(i.text).includes(tagFilter)).sort((a, b) => b.created - a.created);
    $('#ideas').innerHTML = shown.map(ideaLi).join('');
    $('#ideasDone').innerHTML = done.map(ideaLi).join('');
    $$('#ideasDone .idea').forEach((li) => li.classList.add('done'));
    $('#ideaCount').textContent = open.length ? `(${open.length})` : '';
    $('#doneCount').textContent = done.length;
    $('#doneWrap').hidden = !done.length;
    $('#ideasEmpty').hidden = open.length > 0;
  }

  function bindIdeas() {
    $('#ideaForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#ideaInput'), text = inp.value.trim();
      if (!text) return;
      data.ideas.push({ id: uid(), text, done: false, created: Date.now() });
      inp.value = ''; save(); renderIdeas(); tock(700);
    });
    $('#tagChips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-tag]'); if (!c) return;
      tagFilter = c.dataset.tag; renderIdeas();
    });
    const onList = (e) => {
      const li = e.target.closest('.idea'); if (!li) return;
      const idea = data.ideas.find((i) => i.id === li.dataset.id); if (!idea) return;
      if (e.target.closest('.check')) {
        e.target.closest('.check').classList.add('ticking');
        li.classList.add('leaving'); tock(idea.done ? 400 : 780);
        setTimeout(() => { idea.done = !idea.done; idea.doneAt = idea.done ? Date.now() : null; save(); renderIdeas(); }, 380);
      } else if (e.target.closest('.del')) {
        li.classList.add('leaving');
        setTimeout(() => {
          const idx = data.ideas.indexOf(idea);
          data.ideas.splice(idx, 1); save(); renderIdeas();
          undoToast('Idea tossed', () => { data.ideas.splice(idx, 0, idea); save(); renderIdeas(); });
        }, 380);
      }
    };
    $('#ideas').addEventListener('click', onList);
    $('#ideasDone').addEventListener('click', onList);
    const onDbl = (e) => {
      const txt = e.target.closest('.idea-text'); if (!txt) return;
      const li = txt.closest('.idea'); const idea = data.ideas.find((i) => i.id === li.dataset.id);
      txt.textContent = idea.text;
      txt.contentEditable = 'true'; txt.focus();
      document.getSelection().selectAllChildren(txt); document.getSelection().collapseToEnd();
      const finish = (commit) => {
        txt.removeEventListener('blur', onBlur); txt.removeEventListener('keydown', onKey);
        const v = txt.textContent.trim();
        if (commit && v) { idea.text = v; save(); }
        renderIdeas();
      };
      const onBlur = () => finish(true);
      const onKey = (k) => { if (k.key === 'Enter') { k.preventDefault(); finish(true); } if (k.key === 'Escape') finish(false); };
      txt.addEventListener('blur', onBlur); txt.addEventListener('keydown', onKey);
    };
    $('#ideas').addEventListener('dblclick', onDbl);
    $('#ideasDone').addEventListener('dblclick', onDbl);
  }

  // toast with an undo action
  function undoToast(msg, undo) {
    const t = $('#toast');
    t.innerHTML = `${esc(msg)} · <u style="cursor:pointer;pointer-events:auto">undo</u>`;
    t.classList.add('show');
    const u = t.querySelector('u');
    u.addEventListener('click', () => { undo(); t.classList.remove('show'); }, { once: true });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  /* ================= videos ================= */
  let openVideo = null;
  let resumeMusicAfterVideo = false;

  function renderVideos() {
    const tab = data.settings.vtab;
    $$('[data-vtab]').forEach((b) => b.classList.toggle('on', b.dataset.vtab === tab));
    const todo = data.videos.filter((v) => !v.watched), done = data.videos.filter((v) => v.watched);
    $('#vTodoCount').textContent = todo.length ? `(${todo.length})` : '';
    $('#vDoneCount').textContent = done.length ? `(${done.length})` : '';
    const list = (tab === 'done' ? done.sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0)) : todo.sort((a, b) => b.added - a.added));
    $('#videos').innerHTML = list.map((v) => `
      <li class="polaroid" data-id="${v.id}" style="--t:${tiltFor(v.id, 2.2).toFixed(2)}deg">
        <button type="button" class="thumb play-v" title="Play">
          <img src="https://i.ytimg.com/vi/${esc(v.vid)}/mqdefault.jpg" alt="" loading="lazy">
        </button>
        <div class="p-title" title="${esc(v.title)}">${esc(v.title || 'YouTube video')}</div>
        <div class="p-sub">
          <span class="p-author">${esc(v.author || '')}${v.author ? ' · ' : ''}${ago(v.watched ? v.watchedAt : v.added)}</span>
          <span class="p-acts">
            <button type="button" class="mini-btn toggle-v" title="${v.watched ? 'Back to watch list' : 'Mark watched'}">${v.watched ? '↺' : '✓'}</button>
            <a class="mini-btn" href="https://www.youtube.com/watch?v=${esc(v.vid)}" target="_blank" rel="noopener" title="Open on YouTube">↗</a>
            <button type="button" class="mini-btn del-v" title="Remove">✕</button>
          </span>
        </div>
      </li>`).join('');
    const empty = $('#videosEmpty');
    empty.hidden = list.length > 0;
    empty.textContent = tab === 'done' ? 'Nothing watched yet.' : 'No videos waiting. Paste a YouTube link and it\'ll be pinned here.';
  }

  async function addVideo(raw) {
    const vid = ytId(raw);
    if (!vid) { toast('That doesn’t look like a YouTube link'); return; }
    if (data.videos.some((v) => v.vid === vid && !v.watched)) { toast('Already on your list'); return; }
    const v = { id: uid(), vid, title: 'Loading title…', author: '', added: Date.now(), watched: false };
    data.videos.push(v);
    data.settings.vtab = 'todo';
    renderVideos(); tock(640);
    const info = await ytInfo(vid);
    v.title = info.title || 'YouTube video';
    v.author = info.author || '';
    save(); renderVideos();
  }

  function playVideo(v) {
    openVideo = v;
    resumeMusicAfterVideo = player.isPlaying();
    if (resumeMusicAfterVideo) player.pause();
    $('#videoFrame').src = `https://www.youtube.com/embed/${encodeURIComponent(v.vid)}?autoplay=1&rel=0&modestbranding=1`;
    $('#videoDialogTitle').textContent = v.title;
    $('#videoWatched').textContent = v.watched ? 'back to list ↺' : 'mark watched ✓';
    $('#videoDialog').showModal();
  }

  function bindVideos() {
    $('#videoForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#videoInput'); const v = inp.value.trim(); if (!v) return;
      inp.value = ''; addVideo(v);
    });
    $$('[data-vtab]').forEach((b) => b.addEventListener('click', () => { data.settings.vtab = b.dataset.vtab; save(); renderVideos(); }));
    $('#videos').addEventListener('click', (e) => {
      const li = e.target.closest('.polaroid'); if (!li) return;
      const v = data.videos.find((x) => x.id === li.dataset.id); if (!v) return;
      if (e.target.closest('.play-v')) playVideo(v);
      else if (e.target.closest('.toggle-v')) { v.watched = !v.watched; v.watchedAt = v.watched ? Date.now() : null; save(); renderVideos(); tock(v.watched ? 780 : 420); }
      else if (e.target.closest('.del-v')) {
        const idx = data.videos.indexOf(v);
        data.videos.splice(idx, 1); save(); renderVideos();
        undoToast('Video removed', () => { data.videos.splice(idx, 0, v); save(); renderVideos(); });
      }
    });
    const dlg = $('#videoDialog');
    $('#videoClose').addEventListener('click', () => dlg.close());
    $('#videoWatched').addEventListener('click', () => {
      if (openVideo) { openVideo.watched = !openVideo.watched; openVideo.watchedAt = openVideo.watched ? Date.now() : null; save(); renderVideos(); }
      dlg.close();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => {
      $('#videoFrame').src = 'about:blank';
      openVideo = null;
      if (resumeMusicAfterVideo) { resumeMusicAfterVideo = false; player.resume(); }
    });
  }

  /* ================= music ================= */
  let localFiles = [];
  const queue = () => [
    ...localFiles.map((f) => ({ key: 'f:' + f, type: 'file', src: '/music/' + f.split('/').map(encodeURIComponent).join('/'), title: f.replace(/\.[^.]+$/, '').split('/').pop(), sub: 'from your music folder' })),
    ...data.songs.map((s) => ({ key: 'y:' + s.vid, type: 'yt', vid: s.vid, id: s.id, title: s.title || 'YouTube song', sub: s.author || 'YouTube' })),
  ];

  const player = (() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    let yt = null, ytReady = false, ytPending = null, ytApiLoading = false;
    let cur = null; // current track
    let playing = false;
    let history = [];

    function setPlaying(p) {
      playing = p;
      document.body.classList.toggle('playing', p);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
    }

    function loadYtApi() {
      if (ytApiLoading) return; ytApiLoading = true;
      window.onYouTubeIframeAPIReady = () => {
        yt = new YT.Player('ytPlayer', {
          width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
          events: {
            onReady: () => { ytReady = true; yt.setVolume(data.settings.volume); if (ytPending) { const p = ytPending; ytPending = null; p(); } },
            onStateChange: (e) => {
              if (cur?.type !== 'yt') return;
              if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
              else if (e.data === YT.PlayerState.PAUSED) setPlaying(false);
              else if (e.data === YT.PlayerState.ENDED) ended();
            },
            onError: (e) => {
              if (cur?.type !== 'yt') return;
              toast(e.data === 101 || e.data === 150 ? 'That song can’t be played outside YouTube — skipping' : 'Couldn’t play that one — skipping');
              setTimeout(() => next(true), 900);
            },
          },
        });
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => toast('YouTube player couldn’t load — are you online?');
      document.head.appendChild(s);
    }

    function withYt(fn) { if (ytReady) fn(); else { ytPending = fn; loadYtApi(); } }

    function play(track, { autoplay = true } = {}) {
      if (!track) return;
      if (cur && cur.key !== track.key) history.push(cur.key);
      cur = track;
      data.settings.last = track.key; save();
      $('#ytWrap').hidden = track.type !== 'yt';
      if (track.type === 'file') {
        if (ytReady) yt.stopVideo();
        audio.src = track.src;
        audio.volume = data.settings.volume / 100;
        if (autoplay) audio.play().catch(() => setPlaying(false));
        else setPlaying(false);
      } else {
        audio.pause(); audio.removeAttribute('src'); audio.load();
        withYt(() => {
          if (autoplay) yt.loadVideoById(track.vid); else yt.cueVideoById(track.vid);
        });
      }
      updateNow(); renderPlaylist(); mediaSession();
    }

    function pause() { if (!cur) return; if (cur.type === 'file') audio.pause(); else if (ytReady) yt.pauseVideo(); }
    function resume() {
      if (!cur) { const q = queue(); if (q.length) play(data.settings.shuffle ? q[Math.floor(Math.random() * q.length)] : q[0]); return; }
      if (cur.type === 'file') audio.play().catch(() => {}); else withYt(() => yt.playVideo());
    }
    function toggle() { playing ? pause() : resume(); }

    function next(auto = false) {
      const q = queue(); if (!q.length) return;
      if (auto && data.settings.loop === 'one' && cur) { seekTo(0); resume(); return; }
      let i = cur ? q.findIndex((t) => t.key === cur.key) : -1;
      if (data.settings.shuffle && q.length > 1) {
        let j; do { j = Math.floor(Math.random() * q.length); } while (j === i);
        play(q[j]); return;
      }
      i++;
      if (i >= q.length) { if (auto && data.settings.loop === 'off') { setPlaying(false); return; } i = 0; }
      play(q[i]);
    }
    function prev() {
      const q = queue(); if (!q.length) return;
      if (currentTime() > 4) { seekTo(0); return; }
      if (data.settings.shuffle && history.length) {
        const k = history.pop(); const t = q.find((x) => x.key === k);
        if (t) { cur = null; play(t); return; }
      }
      let i = cur ? q.findIndex((t) => t.key === cur.key) : 0;
      i = (i - 1 + q.length) % q.length;
      play(q[i]);
    }
    function ended() { setPlaying(false); next(true); }

    function currentTime() { if (!cur) return 0; return cur.type === 'file' ? audio.currentTime : ytReady && yt.getCurrentTime ? yt.getCurrentTime() : 0; }
    function duration() { if (!cur) return 0; return cur.type === 'file' ? (isFinite(audio.duration) ? audio.duration : 0) : ytReady && yt.getDuration ? yt.getDuration() : 0; }
    function seekTo(t) { if (!cur) return; if (cur.type === 'file') audio.currentTime = t; else if (ytReady) yt.seekTo(t, true); }
    function setVolume(v) { audio.volume = v / 100; if (ytReady) yt.setVolume(v); }

    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', () => { if (cur?.type === 'file' && audio.getAttribute('src')) { toast('Couldn’t play that file — skipping'); setTimeout(() => next(true), 800); } });

    function updateNow() {
      $('#nowTitle').textContent = cur ? cur.title : 'Nothing playing';
      $('#nowSub').textContent = cur ? cur.sub : 'pick a song below';
      document.title = cur && playing ? '♪ ' + cur.title + ' · Tidy Nook' : 'Tidy Nook';
    }

    function mediaSession() {
      if (!('mediaSession' in navigator) || !cur) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: cur.title, artist: cur.sub, album: 'Tidy Nook',
        artwork: cur.type === 'yt' ? [{ src: `https://i.ytimg.com/vi/${cur.vid}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }] : [],
      });
      navigator.mediaSession.setActionHandler('play', resume);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('previoustrack', prev);
    }

    // progress ticker
    let seeking = false;
    setInterval(() => {
      if (!cur || seeking) return;
      const t = currentTime(), d = duration();
      $('#tCur').textContent = fmtTime(t);
      $('#tDur').textContent = fmtTime(d);
      const s = $('#seek'); s.value = d ? Math.round((t / d) * 1000) : 0; fillRange(s);
      updateNow();
    }, 500);
    const seek = $('#seek');
    seek.addEventListener('input', () => { seeking = true; fillRange(seek); $('#tCur').textContent = fmtTime((seek.value / 1000) * duration()); });
    seek.addEventListener('change', () => { seekTo((seek.value / 1000) * duration()); seeking = false; });

    return { play, pause, resume, toggle, next, prev, setVolume, isPlaying: () => playing, current: () => cur, preloadYt: loadYtApi };
  })();

  function renderPlaylist() {
    const q = queue(), cur = player.current();
    $('#playlist').innerHTML = q.map((t, i) => `
      <li class="song ${cur && cur.key === t.key ? 'current' : ''}" data-key="${esc(t.key)}" title="${esc(t.title)}">
        <span class="song-n">${cur && cur.key === t.key && player.isPlaying() ? '♪' : i + 1}</span>
        <span class="song-title">${esc(t.title)}</span>
        <span class="song-kind">${t.type === 'yt' ? 'yt' : 'file'}</span>
        ${t.type === 'yt' ? '<button type="button" class="song-del" title="Remove" aria-label="Remove song">✕</button>' : ''}
      </li>`).join('');
    $('#playlistEmpty').hidden = q.length > 0;
    $('#songCount').textContent = q.length ? `${q.length} song${q.length === 1 ? '' : 's'}` : '';
  }

  function applyPlayerSettings() {
    $('#shuffleBtn').setAttribute('aria-pressed', String(!!data.settings.shuffle));
    const loop = data.settings.loop;
    $('#loopBtn').setAttribute('aria-pressed', String(loop !== 'off'));
    $('#loopBtn').title = 'Repeat: ' + (loop === 'one' ? 'this song' : loop);
    $('#loopOne').hidden = loop !== 'one';
    const vol = $('#vol'); vol.value = data.settings.volume; fillRange(vol);
  }

  async function scanMusic(showToast) {
    if (!serverOK) { localFiles = []; renderPlaylist(); return; }
    try {
      const r = await fetch('/api/music', { cache: 'no-store' });
      localFiles = r.ok ? await r.json() : [];
    } catch { localFiles = []; }
    renderPlaylist();
    if (showToast) toast(localFiles.length ? `Found ${localFiles.length} file${localFiles.length === 1 ? '' : 's'} in the music folder` : 'The music folder is empty');
  }

  function bindMusic() {
    $('#playBtn').addEventListener('click', () => player.toggle());
    $('#nextBtn').addEventListener('click', () => player.next());
    $('#prevBtn').addEventListener('click', () => player.prev());
    $('#shuffleBtn').addEventListener('click', () => { data.settings.shuffle = !data.settings.shuffle; save(); applyPlayerSettings(); tock(560); });
    $('#loopBtn').addEventListener('click', () => {
      const order = ['all', 'one', 'off'];
      data.settings.loop = order[(order.indexOf(data.settings.loop) + 1) % order.length];
      save(); applyPlayerSettings(); tock(560);
    });
    const vol = $('#vol');
    vol.addEventListener('input', () => { data.settings.volume = +vol.value; fillRange(vol); player.setVolume(+vol.value); save(); });
    $('#rescanBtn').addEventListener('click', () => scanMusic(true));

    $('#songForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = $('#songInput'); const vid = ytId(inp.value);
      if (!vid) { toast('That doesn’t look like a YouTube link'); return; }
      if (data.songs.some((s) => s.vid === vid)) { toast('That song is already in the list'); inp.value = ''; return; }
      inp.value = '';
      const s = { id: uid(), vid, title: 'Loading title…', author: '' };
      data.songs.push(s); renderPlaylist(); tock(640);
      const info = await ytInfo(vid);
      s.title = info.title || 'YouTube song'; s.author = info.author || '';
      save(); renderPlaylist();
    });

    $('#playlist').addEventListener('click', (e) => {
      const li = e.target.closest('.song'); if (!li) return;
      const key = li.dataset.key;
      if (e.target.closest('.song-del')) {
        const vid = key.slice(2);
        const idx = data.songs.findIndex((s) => s.vid === vid);
        const [removed] = data.songs.splice(idx, 1);
        save(); renderPlaylist();
        undoToast('Song removed', () => { data.songs.splice(idx, 0, removed); save(); renderPlaylist(); });
        return;
      }
      const cur = player.current();
      if (cur && cur.key === key) player.toggle();
      else player.play(queue().find((t) => t.key === key));
    });
  }

  /* ================= backup ================= */
  function bindBackup() {
    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tidy-nook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#importInput').addEventListener('change', async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try {
        const d = normalize(JSON.parse(await file.text()));
        if (!confirm(`Replace everything with this backup?\n${d.links.length} links · ${d.ideas.length} ideas · ${d.videos.length} videos · ${d.songs.length} songs`)) return;
        data = d; flush(); renderAll(); toast('Backup restored');
      } catch { toast('That file isn’t a Tidy Nook backup'); }
    });
  }

  /* ================= keyboard ================= */
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = e.target.closest('input, textarea, [contenteditable="true"]') || document.querySelector('dialog[open]');
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
      else if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); player.toggle(); }
      else if (e.key === 'n' && !e.ctrlKey && !e.metaKey) player.next();
      else if (e.key === 't' && !e.ctrlKey && !e.metaKey) $('#tidyBtn').click();
    });
  }

  /* ================= boot ================= */
  function renderAll() {
    applyTidy(false); renderLinks(); renderIdeas(); renderVideos(); applyPlayerSettings(); renderPlaylist();
  }

  // Retry title lookups that failed earlier (offline, YouTube hiccup…)
  async function healTitles() {
    const missing = [...data.videos, ...data.songs].filter((x) => !x.title || /^(YouTube (video|song)|Loading title…)$/.test(x.title));
    for (const item of missing) {
      const info = await ytInfo(item.vid);
      if (info.title) { item.title = info.title; item.author = info.author || ''; }
    }
    if (missing.length) { save(); renderVideos(); renderPlaylist(); }
  }

  async function boot() {
    tickClock(); setInterval(tickClock, 15000);
    await load();
    renderAll();
    bindSearch(); bindLinks(); bindIdeas(); bindVideos(); bindMusic(); bindBackup(); bindKeys();
    $('#tidyBtn').addEventListener('click', () => { data.settings.tidy = !data.settings.tidy; save(); applyTidy(true); });
    await scanMusic(false);
    // restore the last song (cued, not auto-playing — browsers block autoplay anyway)
    const last = data.settings.last && queue().find((t) => t.key === data.settings.last);
    if (last) player.play(last, { autoplay: false });
    else if (data.songs.length) player.preloadYt();
    if (!serverOK) toast('Running without the server — data is kept in this browser only');
    healTitles();
    // refresh relative times now and then
    setInterval(() => { if (!document.querySelector('[contenteditable="true"]')) { renderIdeas(); renderVideos(); } }, 60000);
  }

  boot();
})();
