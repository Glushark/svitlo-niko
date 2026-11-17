(() => {
  'use strict';

  const API = {
    active: 'https://off.energy.mk.ua/api/v2/schedule/active',
    times: 'https://off.energy.mk.ua/api/schedule/time-series',
    queues: 'https://off.energy.mk.ua/api/outage-queue/by-type/3'
  };
  const DEFAULT_PROXY_URL = 'https://wandering-shadow-0be2.zenkasanya.workers.dev';
  const STORAGE_KEY = 'power-outage-mobile-v1';
  const REFRESH_MS = 60_000;
  const FALLBACK_QUEUES = ['1.1','1.2','2.1','2.2','3.1','3.2','4.1','4.2','5.1','5.2','6.1','6.2'];
  const $ = (id) => document.getElementById(id);
  const els = {
    select: $('queueSelect'), statusShort: $('statusShort'), statusText: $('statusText'), orb: $('statusOrb'),
    next: $('nextText'), freshness: $('freshness'), date: $('currentDate'), time: $('currentTime'),
    scheduleDate: $('scheduleDate'), list: $('scheduleList'), note: $('scheduleNote'), refresh: $('refreshButton'), toast: $('toast')
  };
  const state = { queueName: '2.2', queueId: 17, queues: [], slots: [], updatedAt: null, refreshing: false, theme: 'system', lastError: '', proxyUrl: DEFAULT_PROXY_URL };

  function readSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (typeof saved.queueName === 'string') state.queueName = saved.queueName;
      if (Number.isFinite(saved.queueId)) state.queueId = saved.queueId;
      if (['system','light','dark'].includes(saved.theme)) state.theme = saved.theme;
      if (typeof saved.proxyUrl === 'string' && saved.proxyUrl.trim()) state.proxyUrl = saved.proxyUrl.trim();
      if (Array.isArray(saved.slots) && saved.slots.length) state.slots = saved.slots;
      if (saved.updatedAt) state.updatedAt = saved.updatedAt;
      if (Array.isArray(saved.queues)) state.queues = saved.queues;
    } catch { /* Ignore invalid local cache. */ }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        queueName: state.queueName, queueId: state.queueId, theme: state.theme, proxyUrl: state.proxyUrl,
        slots: state.slots, updatedAt: state.updatedAt, queues: state.queues
      }));
    } catch { /* Storage may be unavailable in private browsing. */ }
  }

  function unbox(value) {
    for (let i = 0; i < 4; i++) {
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== 'object') return [];
      if (Array.isArray(value.value)) return value.value;
      if (Array.isArray(value.data)) return value.data;
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.results)) return value.results;
      if (value.value && typeof value.value === 'object') { value = value.value; continue; }
      if (value.data && typeof value.data === 'object') { value = value.data; continue; }
      break;
    }
    return [];
  }

  async function getJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status} при чтении расписания`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  function apiUrl(resource) {
    if (!state.proxyUrl) return API[resource];
    const url = new URL(state.proxyUrl);
    url.searchParams.set('resource', resource);
    return url.href;
  }

  function parseClock(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const total = value >= 0 && value < 1 ? Math.round(value * 1440) : Math.round(value / 60);
      return ((total % 1440) + 1440) % 1440;
    }
    const match = String(value ?? '').match(/(?:T|\s)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) return (Number(match[1]) * 60 + Number(match[2])) % 1440;
    const n = Number(value);
    if (Number.isFinite(n)) return parseClock(n);
    return null;
  }

  function statusRank(type) {
    switch (String(type || '').toUpperCase()) {
      case 'SURE_OFF': return 3;
      case 'OFF': return 2;
      case 'PROBABLY_OFF': case 'PROBABLY_ON': return 1;
      case 'SURE_ON': return 2;
      default: return 0;
    }
  }

  function group(type) {
    const value = String(type || '').toUpperCase();
    if (value === 'OFF' || value === 'SURE_OFF') return 'red';
    if (value === 'PROBABLY_OFF' || value === 'PROBABLY_ON') return 'yellow';
    return 'green';
  }

  function normalizeQueues(payload) {
    return unbox(payload).map((q) => ({ id: Number(q.id), name: String(q.name ?? '').trim() }))
      .filter((q) => q.name && Number.isFinite(q.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }

  function buildSlots(timesPayload, activePayload, queueId) {
    const times = unbox(timesPayload);
    const byId = new Map();
    for (const slot of times) {
      const start = parseClock(slot.start), end = parseClock(slot.end);
      if (start === null || end === null || slot.id === undefined) continue;
      byId.set(String(slot.id), { id: Number(slot.id), start, end, type: 'ON' });
    }
    const active = unbox(activePayload);
    for (const schedule of active) {
      const entries = Array.isArray(schedule?.series) ? schedule.series : (schedule?.outage_queue_id !== undefined ? [schedule] : []);
      for (const entry of entries) {
        if (Number(entry.outage_queue_id) !== Number(queueId)) continue;
        const slot = byId.get(String(entry.time_series_id));
        if (slot && statusRank(entry.type) > statusRank(slot.type)) slot.type = String(entry.type).toUpperCase();
      }
    }
    return [...byId.values()].sort((a, b) => a.id - b.id);
  }

  function formatTime(minutes) {
    const value = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`;
  }

  function groupRunEnd(slots, startIndex, targetGroup) {
    let end = startIndex;
    while (end + 1 < slots.length && group(slots[end + 1].type) === targetGroup) end++;
    return end;
  }

  function rangeFor(slots, startIndex, endIndex) {
    return `${formatTime(slots[startIndex].start)}–${formatTime(slots[endIndex].end)}`;
  }

  function findCurrentIndex(slots, nowMinutes) {
    return slots.findIndex((slot) => {
      if (slot.end > slot.start) return nowMinutes >= slot.start && nowMinutes < slot.end;
      return nowMinutes >= slot.start || nowMinutes < slot.end;
    });
  }

  function statusLabel(slot) {
    const type = String(slot.type || '').toUpperCase();
    if (type === 'OFF' || type === 'SURE_OFF') return ['СВЕТА НЕТ', 'Света нет', 'red'];
    if (type === 'PROBABLY_ON') return ['ВОЗМОЖНОЕ ВКЛЮЧЕНИЕ', 'Возможно включение', 'yellow'];
    if (type === 'PROBABLY_OFF') return ['ВОЗМОЖНОЕ ОТКЛЮЧЕНИЕ', 'Возможно отключение', 'yellow'];
    return ['СВЕТ ЕСТЬ', 'Свет есть', 'green'];
  }

  function nextMessage(slots, currentIndex) {
    const currentGroup = group(slots[currentIndex].type);
    const currentEnd = groupRunEnd(slots, currentIndex, currentGroup);
    const nextIndex = currentEnd + 1;
    if (nextIndex >= slots.length) {
      if (currentGroup === 'green') return 'Сегодня отключений больше не планируется';
      if (currentGroup === 'red') return 'Сегодня света больше не планируется';
      return 'Конец неопределённости на сегодня не предвидится';
    }
    const nextGroup = group(slots[nextIndex].type);
    const nextEnd = groupRunEnd(slots, nextIndex, nextGroup);
    const range = rangeFor(slots, nextIndex, nextEnd);
    if (currentGroup === 'green') {
      if (nextGroup === 'yellow') return `Возможное отключение: ${range}`;
      if (nextGroup === 'red') return `Точное отключение: ${range}`;
      return 'Сегодня отключений больше не планируется';
    }
    if (currentGroup === 'red') {
      if (nextGroup === 'yellow') return `Возможное включение: ${range}`;
      if (nextGroup === 'green') return `Точное включение: ${range}`;
      return 'Сегодня света больше не планируется';
    }
    const yellowCount = currentEnd - currentIndex + 1;
    if (nextGroup === 'green' && yellowCount >= 2) return `Конец неопределённости: ${formatTime(slots[nextIndex].start)}`;
    if (nextGroup === 'green') return `Возможное включение: ${range}`;
    if (nextGroup === 'red') return `Возможное отключение: ${range}`;
    return 'Конец неопределённости на сегодня не предвидится';
  }

  function applyStatusColor(groupName) {
    const map = { green: ['57,255,20','#39ff14'], yellow: ['255,234,25','#ffea19'], red: ['255,7,58','#ff073a'] };
    const [rgb, hex] = map[groupName] || map.green;
    document.documentElement.style.setProperty('--status-rgb', rgb);
    document.documentElement.style.setProperty('--status', hex);
    els.orb.dataset.status = groupName;
  }

  function renderQueues() {
    const queues = state.queues.length ? state.queues : FALLBACK_QUEUES.map((name) => ({ id: name === '2.2' ? 17 : NaN, name }));
    const names = new Set(queues.map((q) => q.name));
    if (!names.has(state.queueName)) queues.push({ id: state.queueName === '2.2' ? 17 : NaN, name: state.queueName });
    els.select.replaceChildren();
    for (const queue of queues) {
      const option = document.createElement('option');
      option.value = queue.name;
      option.textContent = `Очередь ${queue.name}`;
      option.selected = queue.name === state.queueName;
      els.select.append(option);
    }
  }

  function renderSchedule(nowMinutes, currentIndex) {
    if (!state.slots.length) {
      els.list.innerHTML = '<div class="empty-row">График пока недоступен</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    state.slots.forEach((slot, index) => {
      const [label, , color] = statusLabel(slot);
      const row = document.createElement('div');
      row.className = `schedule-row ${color}${index === currentIndex ? ' current' : ''}`;
      row.setAttribute('aria-current', index === currentIndex ? 'time' : 'false');
      const time = document.createElement('span'); time.className = 'row-time'; time.textContent = rangeFor(state.slots, index, index).replace('–','–');
      const text = document.createElement('span'); text.className = 'row-label'; text.textContent = label;
      const dot = document.createElement('i'); dot.className = 'row-dot'; dot.setAttribute('aria-hidden','true');
      row.append(time, text, dot); fragment.append(row);
    });
    els.list.replaceChildren(fragment);
  }

  function render() {
    const now = new Date();
    els.date.textContent = new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' }).format(now);
    els.time.textContent = new Intl.DateTimeFormat('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(now);
    els.scheduleDate.textContent = new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long' }).format(now);
    if (!state.slots.length) {
      applyStatusColor(state.lastError ? 'red' : 'green');
      $('liveText').textContent = state.lastError ? 'НЕТ СВЯЗИ' : 'ЗАГРУЗКА';
      $('liveBadge').classList.toggle('offline', Boolean(state.lastError));
      els.statusShort.textContent = state.lastError ? 'НЕТ СВЯЗИ' : 'ЗАГРУЗКА';
      els.statusText.textContent = state.lastError ? 'Не удалось обновить' : 'Загружаю график…';
      els.next.textContent = state.lastError ? 'Проверьте подключение к интернету и доступность API.' : 'Получаю данные…';
      els.freshness.textContent = state.lastError || 'Подключение к API…';
      els.freshness.className = `freshness${state.lastError ? ' error' : ''}`;
      renderSchedule(0, -1); return;
    }
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let currentIndex = findCurrentIndex(state.slots, nowMinutes);
    if (currentIndex < 0) currentIndex = 0;
    const [short, full, color] = statusLabel(state.slots[currentIndex]);
    els.statusShort.textContent = short;
    els.statusText.textContent = full;
    els.next.textContent = nextMessage(state.slots, currentIndex);
    applyStatusColor(color);
    const updated = state.updatedAt ? new Date(state.updatedAt) : null;
    const stale = !updated || (Date.now() - updated.getTime() > REFRESH_MS * 2);
    $('liveText').textContent = state.lastError || stale ? 'НЕТ СВЯЗИ' : 'LIVE';
    $('liveBadge').classList.toggle('offline', Boolean(state.lastError || stale));
    if (state.lastError) {
      els.freshness.textContent = `Не обновлено · последние данные ${updated ? `от ${new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(updated)}` : 'недоступны'}`;
      els.freshness.className = 'freshness offline';
    } else {
      els.freshness.textContent = updated ? `${stale ? 'Последнее обновление' : 'Обновлено'} · ${new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(updated)}` : 'Данные загружены';
      els.freshness.className = `freshness${stale ? ' offline' : ''}`;
    }
    renderSchedule(nowMinutes, currentIndex);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true; state.lastError = '';
    els.refresh.classList.add('spinning'); els.refresh.disabled = true;
    els.freshness.textContent = 'Обновляю данные…'; els.freshness.className = 'freshness';
    try {
      const [timesPayload, activePayload, queuesPayload] = await Promise.all([getJson(apiUrl('times')), getJson(apiUrl('active')), getJson(apiUrl('queues'))]);
      const queues = normalizeQueues(queuesPayload);
      if (queues.length) state.queues = queues;
      const chosen = state.queues.find((q) => q.name === state.queueName);
      if (chosen) state.queueId = chosen.id;
      else if (state.queueName === '2.2') state.queueId = 17;
      if (!Number.isFinite(state.queueId)) throw new Error(`API очередей не вернул ID для группы ${state.queueName}`);
      const slots = buildSlots(timesPayload, activePayload, state.queueId);
      if (!slots.length) throw new Error('Сайт вернул пустой график. Попробуйте обновить позже.');
      state.slots = slots; state.updatedAt = new Date().toISOString(); state.lastError = '';
      save(); renderQueues(); render();
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'Превышено время ожидания ответа API.' : (error?.message || 'Ошибка сети.');
      state.lastError = /fetch|network|cors/i.test(message) ? 'Нет доступа к API из браузера. Возможно, сайт ограничивает запросы (CORS).' : message;
      render(); showToast(state.lastError);
    } finally {
      state.refreshing = false; els.refresh.disabled = false; els.refresh.classList.remove('spinning');
    }
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach((button) => button.classList.toggle('is-active', button.dataset.themeChoice === theme));
    save();
  }

  els.refresh.addEventListener('click', refresh);
  $('proxyUrlInput').value = state.proxyUrl;
  $('saveProxyButton').addEventListener('click', () => {
    const value = $('proxyUrlInput').value.trim().replace(/\/$/, '');
    if (value && !/^https:\/\//i.test(value)) { showToast('Адрес прокси должен начинаться с https://'); return; }
    state.proxyUrl = value || DEFAULT_PROXY_URL; $('proxyUrlInput').value = state.proxyUrl; state.lastError = ''; save(); showToast('Адрес сохранён, проверяю подключение…'); refresh();
  });
  els.select.addEventListener('change', () => {
    state.queueName = els.select.value;
    const queue = state.queues.find((q) => q.name === state.queueName);
    state.queueId = queue ? queue.id : (state.queueName === '2.2' ? 17 : NaN);
    save(); refresh();
  });
  document.querySelectorAll('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));

  readSaved();
  $('proxyUrlInput').value = state.proxyUrl;
  setTheme(state.theme);
  renderQueues();
  render();
  setInterval(render, 1000);
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  refresh();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
