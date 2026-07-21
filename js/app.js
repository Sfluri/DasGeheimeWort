(() => {
  'use strict';

  const STORAGE_KEY = 'dasGeheimeWort.settings.v12';
  const ACTIVE_GAME_KEY = 'dasGeheimeWort.activeGame.v12';
  const WORD_BAG_KEY = 'dasGeheimeWort.wordBag.v1';
  const LEGACY_STORAGE_KEYS = ['dasGeheimeWort.settings.v11', 'dasGeheimeWort.settings.v10', 'dasGeheimeWort.settings.v8', 'dasGeheimeWort.settings.v7', 'dasGeheimeWort.settings.v6', 'dasGeheimeWort.settings.v5', 'dasGeheimeWort.settings.v4'];
  const categoryLabels = window.DGW_CATEGORY_LABELS || {};
  const wordDatabase = Array.isArray(window.DGW_WORDS) ? window.DGW_WORDS : [];

  const screens = Object.fromEntries([...document.querySelectorAll('.screen')].map(el => [el.id.replace('screen-', ''), el]));
  const state = {
    players: 5, traitors: 1, categories: ['alltag', 'essen'], difficulty: 'mixed', familyFriendlyOnly: true, fakeWord: false, secretVote: false, traitorsKnowEachOther: false,
    names: [], avatars: [], gamePlayers: [], civilianWord: '', fakeWordValue: '', selectedWordCategory: '', revealIndex: 0, revealedOnce: false,
    round: 1, starterId: null, voterIndex: 0, votes: {}, selectedCandidateId: null, voteCandidates: null,
    eliminatedId: null, winner: null, currentScreen: 'start', gameActive: false
  };
  let toastTimer;
  let avatarRoleTimer;
  let scrollIndicatorTimer;
  let wakeLock = null;

  const $ = id => document.getElementById(id);
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  // Gleichmaessige Zufallszahl ohne Modulo-Bias. Auf modernen Browsern wird
  // crypto.getRandomValues verwendet; Math.random bleibt nur als Fallback.
  const randomInt = maxExclusive => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive muss eine positive Ganzzahl sein.');
    }
    if (globalThis.crypto?.getRandomValues) {
      const range = 0x100000000;
      const limit = range - (range % maxExclusive);
      const buffer = new Uint32Array(1);
      do globalThis.crypto.getRandomValues(buffer);
      while (buffer[0] >= limit);
      return buffer[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  };

  // Fisher-Yates: Jede Position und jede Kombination ist gleich wahrscheinlich.
  const shuffle = items => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const AVATAR_COUNT = 30;
  const avatarPath = avatarNumber => `assets/Bild${avatarNumber}.png`;
  const avatarMarkup = (player, className = '') => `<span class="player-avatar ${className}"><img src="${avatarPath(player.avatar)}" alt="" draggable="false"><span class="player-avatar__fallback">${escapeHtml(player.name.charAt(0).toUpperCase())}</span></span>`;

  function ensureAvatarAssignments(count = state.players) {
    const valid = [];
    const used = new Set();
    for (const value of state.avatars.slice(0, count)) {
      const number = Number(value);
      if (Number.isInteger(number) && number >= 1 && number <= AVATAR_COUNT && !used.has(number)) {
        valid.push(number);
        used.add(number);
      } else {
        valid.push(null);
      }
    }
    while (valid.length < count) valid.push(null);
    const available = shuffle(Array.from({ length: AVATAR_COUNT }, (_, index) => index + 1).filter(number => !used.has(number)));
    state.avatars = valid.map(number => number ?? available.pop()).slice(0, count);
  }

  function bindAvatarFallbacks(root = document) {
    root.querySelectorAll('.player-avatar img').forEach(img => {
      img.addEventListener('load', () => img.closest('.player-avatar')?.classList.add('is-loaded'), { once: true });
      img.addEventListener('error', () => img.closest('.player-avatar')?.classList.add('is-missing'), { once: true });
      if (img.complete && img.naturalWidth) img.closest('.player-avatar')?.classList.add('is-loaded');
    });
  }

  const activePlayers = () => state.gamePlayers.filter(player => !player.eliminated);
  const maxTraitors = () => Math.max(1, Math.min(4, Math.floor((state.players - 1) / 2)));

  function showScreen(name) {
    const target = screens[name];
    if (!target) return;
    Object.values(screens).forEach(screen => {
      const active = screen === target;
      screen.classList.toggle('is-active', active);
      screen.setAttribute('aria-hidden', String(!active));
    });
    target.scrollTop = 0;
    state.currentScreen = name;
    state.gameActive = !['start', 'setup', 'players', 'result'].includes(name);
    window.requestAnimationFrame(() => {
      updateModernScrollIndicator(target);
      window.requestAnimationFrame(() => refitAdaptiveWords(target));
    });
    updateWakeLock();
    if (name === 'result') clearSavedGame();
    else persistGame();
  }



  function ensureModernScrollUi() {
    const shell = document.querySelector('.app-shell');
    if (!shell || $('modernScrollIndicator')) return;
    shell.insertAdjacentHTML('beforeend', `
      <div id="modernScrollFade" class="modern-scroll-fade" aria-hidden="true"></div>
      <div id="modernScrollIndicator" class="modern-scroll-indicator" aria-hidden="true">
        <span class="modern-scroll-indicator__thumb"></span>
      </div>`);
  }

  function updateModernScrollIndicator(scroller = screens[state.currentScreen]) {
    ensureModernScrollUi();
    const indicator = $('modernScrollIndicator');
    const fade = $('modernScrollFade');
    if (!indicator || !fade) return;

    const isScrollableScreen = scroller?.classList.contains('screen--scroll') || scroller?.classList.contains('screen--setup');
    const maxScroll = isScrollableScreen ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0;
    const hasMore = maxScroll > 4;
    const atBottom = !hasMore || scroller.scrollTop >= maxScroll - 3;

    indicator.classList.toggle('has-scroll', hasMore);
    fade.classList.toggle('is-visible', hasMore && !atBottom && scroller.classList.contains('is-active'));

    if (!hasMore) return;
    const trackHeight = indicator.clientHeight;
    const thumb = indicator.querySelector('.modern-scroll-indicator__thumb');
    const thumbHeight = Math.max(34, trackHeight * (scroller.clientHeight / scroller.scrollHeight));
    const travel = Math.max(0, trackHeight - thumbHeight);
    const progress = maxScroll ? scroller.scrollTop / maxScroll : 0;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${travel * progress}px)`;
  }

  function handleModernScroll(event) {
    const scroller = event.currentTarget;
    updateModernScrollIndicator(scroller);
    const indicator = $('modernScrollIndicator');
    if (!indicator) return;
    indicator.classList.add('is-scrolling');
    window.clearTimeout(scrollIndicatorTimer);
    scrollIndicatorTimer = window.setTimeout(() => indicator.classList.remove('is-scrolling'), 800);
  }

  function initModernScrollUi() {
    ensureModernScrollUi();
    document.querySelectorAll('.screen--scroll, .screen--setup').forEach(scroller => {
      scroller.addEventListener('scroll', handleModernScroll, { passive: true });
    });
    window.addEventListener('resize', () => updateModernScrollIndicator(), { passive: true });
  }

  function persistGame() {
    const resumableScreens = ['reveal', 'complete', 'discussion', 'vote-handoff', 'vote', 'elimination'];
    if (!state.gamePlayers.length || !resumableScreens.includes(state.currentScreen)) return;
    try {
      const snapshot = { ...state, savedAt: Date.now() };
      localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(snapshot));
      updateResumeButton();
    } catch {}
  }

  function clearSavedGame() {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    updateResumeButton();
  }

  function getSavedGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_GAME_KEY));
      if (!saved?.gamePlayers?.length || !saved.currentScreen) return null;
      return saved;
    } catch {
      return null;
    }
  }

  function updateResumeButton() {
    const button = $('resumeGameButton');
    if (!button) return;
    button.hidden = !getSavedGame();
  }

  function restoreSavedGame() {
    const saved = getSavedGame();
    if (!saved) {
      clearSavedGame();
      showToast('Kein unterbrochenes Spiel gefunden.');
      return;
    }
    Object.assign(state, saved);
    updateControls();
    renderRestoredScreen();
  }

  function renderRestoredScreen() {
    switch (state.currentScreen) {
      case 'reveal':
        renderReveal();
        break;
      case 'complete':
        $('summaryPlayers').textContent = state.players;
        $('summaryTraitors').textContent = state.traitors;
        $('summaryCategory').textContent = state.selectedWordCategory ? categoryLabels[state.selectedWordCategory] : selectedCategorySummary();
        break;
      case 'discussion': {
        const alive = activePlayers();
        const starter = state.gamePlayers.find(player => player.id === state.starterId);
        $('roundLabel').textContent = `Runde ${state.round}`;
        $('starterText').textContent = state.round === 1 && starter && !starter.eliminated
          ? `${starter.name} beginnt mit dem ersten Hinweis.`
          : 'Gebt reihum Hinweise und beobachtet euch genau.';
        $('aliveStrip').innerHTML = alive.map(player => `<span class="alive-chip">${avatarMarkup(player, 'player-avatar--chip')}<span>${escapeHtml(player.name)}</span></span>`).join('');
        bindAvatarFallbacks($('aliveStrip'));
        break;
      }
      case 'vote-handoff':
        renderVoteHandoff();
        break;
      case 'vote': {
        const voter = state.secretVote ? activePlayers()[state.voterIndex] : null;
        renderVoteScreen(voter);
        break;
      }
      case 'elimination': {
        const player = state.gamePlayers.find(item => item.id === state.eliminatedId);
        if (player) {
          $('eliminationRound').textContent = `Runde ${state.round}`;
          $('eliminatedName').textContent = player.name;
          $('eliminatedAvatar').innerHTML = avatarMarkup(player, 'player-avatar--eliminated');
          bindAvatarFallbacks($('eliminatedAvatar'));
          $('eliminatedRole').textContent = player.role === 'traitor' ? 'VERRÄTER' : 'TEAM';
          $('eliminatedRole').className = `elimination-role ${player.role === 'traitor' ? 'is-traitor' : 'is-team'}`;
          $('eliminationText').textContent = player.role === 'traitor' ? 'Ein Verräter wurde entlarvt.' : 'Die Gruppe hat eine Person aus dem Team ausgeschlossen.';
          $('continueRoundButton').querySelector('span:first-child').textContent = state.winner ? 'Ergebnis anzeigen' : 'Nächste Runde';
        }
        break;
      }
      default:
        clearSavedGame();
        showScreen('start');
        return;
    }
    showScreen(state.currentScreen);
    showToast('Unterbrochenes Spiel fortgesetzt.');
  }


  function haptic(pattern = 12) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  async function updateWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      if (state.gameActive && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!state.gameActive && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      wakeLock = null;
    }
  }

  function resetRoundState() {
    Object.assign(state, {
      gamePlayers: [], civilianWord: '', fakeWordValue: '', selectedWordCategory: '', revealIndex: 0, revealedOnce: false,
      round: 1, starterId: null, voterIndex: 0, votes: {}, selectedCandidateId: null,
      voteCandidates: null, eliminatedId: null, winner: null, gameActive: false
    });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('is-visible');
    $('toast').setAttribute('aria-hidden', 'false');
    toastTimer = setTimeout(() => {
      $('toast').classList.remove('is-visible');
      $('toast').setAttribute('aria-hidden', 'true');
    }, 1900);
  }

  function updateControls() {
    state.players = clamp(state.players, 3, 12);
    state.traitors = clamp(state.traitors, 1, maxTraitors());
    $('playersValue').textContent = state.players;
    $('traitorsValue').textContent = state.traitors;
    document.querySelector('[data-step="players"][data-direction="-1"]').disabled = state.players <= 3;
    document.querySelector('[data-step="players"][data-direction="1"]').disabled = state.players >= 12;
    document.querySelector('[data-step="traitors"][data-direction="-1"]').disabled = state.traitors <= 1;
    document.querySelector('[data-step="traitors"][data-direction="1"]').disabled = state.traitors >= maxTraitors();
    $('knowEachOtherRow').hidden = state.traitors <= 1;
    if (state.traitors <= 1) state.traitorsKnowEachOther = false;
    $('traitorsKnowEachOther').checked = state.traitorsKnowEachOther;
    $('fakeWord').checked = state.fakeWord;
    $('secretVote').checked = state.secretVote;
    $('familyFriendlyOnly').checked = state.familyFriendlyOnly;
    document.querySelectorAll('input[name="category"]').forEach(input => {
      input.checked = state.categories.includes(input.value);
    });
    const difficultyInput = document.querySelector(`input[name="difficulty"][value="${state.difficulty}"]`);
    if (difficultyInput) difficultyInput.checked = true;
  }

  function selectedCategorySummary() {
    if (state.categories.length === Object.keys(categoryLabels).length) return 'Alle Kategorien';
    if (state.categories.length === 1) return categoryLabels[state.categories[0]] || 'Kategorie';
    return `${state.categories.length} Kategorien`;
  }

  function readSettings() {
    state.categories = [...document.querySelectorAll('input[name="category"]:checked')].map(input => input.value);
    state.difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'mixed';
    state.familyFriendlyOnly = $('familyFriendlyOnly').checked;
    state.fakeWord = $('fakeWord').checked;
    state.secretVote = $('secretVote').checked;
    state.traitorsKnowEachOther = state.traitors > 1 && $('traitorsKnowEachOther').checked;
  }

  function getAvailableWords() {
    return wordDatabase.filter(entry => {
      const categoryMatches = state.categories.includes(entry.category);
      const difficultyMatches = entry.category === 'kinder' || state.difficulty === 'mixed' || entry.difficulty === state.difficulty;
      const familyMatches = !state.familyFriendlyOnly || entry.familyFriendly === true;
      return categoryMatches && difficultyMatches && familyMatches;
    });
  }

  const wordKey = entry => `${entry.category}::${entry.difficulty}::${entry.word}::${entry.fakeWord}`;

  function currentWordFilterKey() {
    return JSON.stringify({
      categories: [...state.categories].sort(),
      difficulty: state.difficulty,
      familyFriendlyOnly: state.familyFriendlyOnly
    });
  }

  function loadWordBag() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORD_BAG_KEY));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveWordBag(bag) {
    try {
      localStorage.setItem(WORD_BAG_KEY, JSON.stringify(bag));
    } catch {
      // Das Spiel funktioniert auch ohne persistente Speicherung weiter.
    }
  }

  function getNextWord(pool) {
    const filterKey = currentWordFilterKey();
    const byKey = new Map(pool.map(entry => [wordKey(entry), entry]));
    const saved = loadWordBag();
    let remaining = [];
    let lastKey = saved?.lastKey || '';

    if (saved?.filterKey === filterKey && Array.isArray(saved.remaining)) {
      remaining = saved.remaining.filter(key => byKey.has(key));
    }

    // Sobald alle passenden Begriffe aufgebraucht sind, wird ein neuer,
    // vollständig zufällig gemischter Stapel erzeugt. Ein Begriff kommt
    // dadurch erst wieder vor, nachdem alle anderen einmal gespielt wurden.
    if (!remaining.length) {
      remaining = shuffle([...byKey.keys()]);
      if (remaining.length > 1 && remaining[0] === lastKey) {
        const swapIndex = 1 + randomInt(remaining.length - 1);
        [remaining[0], remaining[swapIndex]] = [remaining[swapIndex], remaining[0]];
      }
    }

    const nextKey = remaining.shift();
    const selected = byKey.get(nextKey) || pool[randomInt(pool.length)];
    saveWordBag({ filterKey, remaining, lastKey: wordKey(selected) });
    return selected;
  }

  function saveSettings() {
    readSettings();
    state.names = state.names.slice(0, state.players);
    ensureAvatarAssignments(state.players);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      players: state.players, traitors: state.traitors, categories: state.categories, difficulty: state.difficulty,
      familyFriendlyOnly: state.familyFriendlyOnly, fakeWord: state.fakeWord, secretVote: state.secretVote,
      traitorsKnowEachOther: state.traitorsKnowEachOther, names: state.names, avatars: state.avatars
    }));
    $('continueButton').disabled = false;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
      const saved = JSON.parse(raw);
      if (!saved) return false;
      Object.assign(state, saved);
      if (!Array.isArray(state.categories) || !state.categories.length) {
        const legacyMap = { alltag: ['alltag'], essen: ['essen'], geografie: ['reisen', 'tiere_natur', 'schweiz'], gemischt: Object.keys(categoryLabels) };
        state.categories = legacyMap[saved.category] || ['alltag', 'essen'];
      }

      // Migration 4.1.0: Die früheren Kategorien Tiere und Natur wurden zusammengeführt.
      if (Array.isArray(state.categories)) {
        const merged = state.categories.includes('tiere') || state.categories.includes('natur');
        state.categories = state.categories.filter(category => category !== 'tiere' && category !== 'natur');
        if (merged && !state.categories.includes('tiere_natur')) state.categories.push('tiere_natur');
        state.categories = state.categories.filter(category => Object.prototype.hasOwnProperty.call(categoryLabels, category));
        if (!state.categories.length) state.categories = ['alltag', 'essen'];
      }

      if (!['easy', 'normal', 'hard', 'mixed'].includes(state.difficulty)) state.difficulty = 'mixed';
      if (typeof state.familyFriendlyOnly !== 'boolean') state.familyFriendlyOnly = true;
      if (!Array.isArray(state.avatars)) state.avatars = [];
      ensureAvatarAssignments(state.players);
      updateControls();
      return true;
    } catch {
      return false;
    }
  }

  function renderNameFields() {
    ensureAvatarAssignments(state.players);
    while (state.names.length < state.players) state.names.push('');
    state.names = state.names.slice(0, state.players);
    $('nameList').innerHTML = '';
    state.names.forEach((name, index) => {
      const label = document.createElement('label');
      label.className = 'name-field';
      label.innerHTML = `<span class="player-avatar player-avatar--field"><img src="${avatarPath(state.avatars[index])}" alt="Avatar von Spieler ${index + 1}" draggable="false"><span class="player-avatar__fallback">${index + 1}</span></span><input type="text" maxlength="20" autocomplete="off" placeholder="Spieler ${index + 1}" aria-label="Name von Spieler ${index + 1}"><button class="name-field__clear" type="button" aria-label="Name löschen">×</button>`;
      const input = label.querySelector('input');
      const clear = label.querySelector('button');
      input.value = name;
      clear.disabled = !name;
      input.addEventListener('input', () => {
        state.names[index] = input.value;
        clear.disabled = !input.value;
        label.classList.remove('name-error');
      });
      clear.addEventListener('click', () => {
        input.value = '';
        state.names[index] = '';
        clear.disabled = true;
        input.focus();
      });
      $('nameList').appendChild(label);
    });
    bindAvatarFallbacks($('nameList'));
  }

  function validateNames() {
    const fields = [...document.querySelectorAll('.name-field')];
    const normalized = state.names.map(name => name.trim());
    const emptyIndexes = normalized.map((name, index) => !name ? index : -1).filter(index => index >= 0);
    const lowered = normalized.map(name => name.toLocaleLowerCase('de-CH'));
    const duplicateIndexes = lowered.map((name, index) => name && lowered.indexOf(name) !== index ? index : -1).filter(index => index >= 0);
    fields.forEach((field, index) => field.classList.toggle('name-error', emptyIndexes.includes(index) || duplicateIndexes.includes(index)));
    if (emptyIndexes.length) {
      showToast('Bitte erfasse alle Spielernamen.');
      fields[emptyIndexes[0]].querySelector('input').focus();
      return null;
    }
    if (duplicateIndexes.length) {
      showToast('Bitte verwende eindeutige Namen.');
      fields[duplicateIndexes[0]].querySelector('input').focus();
      return null;
    }
    return normalized;
  }

  function createGame(names) {
    haptic(18);
    state.names = [...names];
    saveSettings();
    const pool = getAvailableWords();
    if (!pool.length) {
      showToast('Für diese Auswahl sind keine Begriffe verfügbar.');
      showScreen('setup');
      return;
    }
    const selected = getNextWord(pool);
    state.civilianWord = selected.word;
    state.fakeWordValue = selected.fakeWord;
    state.selectedWordCategory = selected.category;
    const traitorIndexes = new Set(shuffle([...Array(state.players).keys()]).slice(0, state.traitors));
    ensureAvatarAssignments(names.length);
    state.gamePlayers = names.map((name, index) => ({ id: index + 1, name, avatar: state.avatars[index], role: traitorIndexes.has(index) ? 'traitor' : 'team', eliminated: false }));
    state.revealIndex = 0;
    state.round = 1;
    state.starterId = null;
    state.winner = null;
    state.eliminatedId = null;
    renderReveal();
    showScreen('reveal');
  }

  function currentPlayer() {
    return state.gamePlayers[state.revealIndex];
  }



  function fitAdaptiveWord(element) {
    if (!element || !element.isConnected) return;

    const context = element.dataset.wordContext || 'card';
    const maxSize = context === 'result' ? 43 : 67;
    const minSize = context === 'result' ? 17 : 18;
    const availableWidth = element.clientWidth;

    // Hidden screens have no measurable width. They are fitted again as soon
    // as showScreen() makes them visible.
    if (availableWidth < 20) return;

    element.style.whiteSpace = 'nowrap';
    element.style.overflow = 'hidden';
    element.style.setProperty('--word-spacing', '0em');

    let low = minSize;
    let high = maxSize;
    let best = minSize;

    // Binary search finds the largest whole-pixel font size that fits.
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      element.style.setProperty('--word-size', `${middle}px`);

      if (element.scrollWidth <= availableWidth) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    element.style.setProperty('--word-size', `${best}px`);

    // A small negative tracking is used only when the minimum size is still
    // too wide. This preserves a single line without clipping normal words.
    if (element.scrollWidth > availableWidth) {
      element.style.setProperty('--word-spacing', '-.04em');
    }
  }

  function refitAdaptiveWords(scope = document) {
    scope.querySelectorAll?.('[data-adaptive-word="true"]').forEach(fitAdaptiveWord);
  }

  function applyAdaptiveWordSize(element, value, context = 'card') {
    if (!element) return;
    const text = String(value || '').trim();
    element.dataset.adaptiveWord = 'true';
    element.dataset.wordContext = context;
    element.setAttribute('title', text);

    // Two frames ensure fonts and the newly activated screen are laid out.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => fitAdaptiveWord(element));
    });
  }

  function renderReveal() {
    const player = currentPlayer();
    state.revealedOnce = false;
    $('revealCounterCard').textContent = `${state.revealIndex + 1} von ${state.gamePlayers.length}`;
    $('reveal-title').textContent = 'Rolle ansehen';
    $('revealPlayerName').textContent = player.name;
    const revealIdentity = document.querySelector('.reveal-identity');
    revealIdentity?.classList.remove('is-revealed', 'is-team', 'is-traitor', 'is-exiting');
    // Restart the entrance animation for every player.
    if (revealIdentity) {
      void revealIdentity.offsetWidth;
    }
    $('revealPlayerAvatar').innerHTML = avatarMarkup(player, 'player-avatar--reveal');
    bindAvatarFallbacks($('revealPlayerAvatar'));
    const visualRole = state.fakeWord ? 'team' : player.role;
    $('revealCard').className = `reveal-card ${visualRole === 'traitor' ? 'is-traitor' : 'is-team'}`;
    $('nextRevealButton').classList.add('is-hidden');
    $('rolePill').textContent = player.role === 'traitor' ? 'VERRÄTER' : 'TEAM';
    if (player.role === 'traitor') {
      $('secretCaption').textContent = state.fakeWord ? 'Dein geheimes Wort' : 'Deine geheime Rolle';
      $('secretWord').textContent = state.fakeWord ? state.fakeWordValue : 'VERRÄTER';
      applyAdaptiveWordSize($('secretWord'), $('secretWord').textContent, 'card');
      const others = state.gamePlayers.filter(item => item.role === 'traitor' && item.id !== player.id).map(item => item.name);
      $('secretNote').textContent = state.traitorsKnowEachOther && others.length ? `Weitere Verräter: ${others.join(', ')}` : 'Finde das geheime Wort heraus, ohne aufzufallen.';
    } else {
      $('secretCaption').textContent = 'Dein geheimes Wort';
      $('secretWord').textContent = state.civilianWord;
      applyAdaptiveWordSize($('secretWord'), state.civilianWord, 'card');
      $('secretNote').textContent = 'Merke dir das Wort gut und verrate es nicht direkt.';
    }
  }

  function clearAvatarRoleFlash() {
    // The avatar remains neutral at all times. Role information is shown only
    // inside the role card, so the phone can be passed on without visual clues.
    window.clearTimeout(avatarRoleTimer);
    avatarRoleTimer = null;
    document.querySelector('.reveal-identity')?.classList.remove('is-revealed', 'is-team', 'is-traitor');
  }

  function revealRole() {
    if ($('revealCard').classList.contains('is-revealed')) return;
    haptic(10);
    state.revealedOnce = true;
    clearAvatarRoleFlash();
    $('revealCard').classList.add('is-revealed');
  }

  function hideRole() {
    $('revealCard').classList.remove('is-revealed');
    clearAvatarRoleFlash();
    if (state.revealedOnce) {
      $('nextRevealButton').querySelector('span:first-child').textContent = state.revealIndex === state.gamePlayers.length - 1 ? 'Rollenverteilung abschliessen' : 'Weiter';
      $('nextRevealButton').classList.remove('is-hidden');
    }
  }

  function nextReveal() {
    const revealIdentity = document.querySelector('.reveal-identity');
    revealIdentity?.classList.add('is-exiting');

    const continueFlow = () => {
      if (state.revealIndex < state.gamePlayers.length - 1) {
        state.revealIndex += 1;
        renderReveal();
        showScreen('reveal');
        return;
      }
      $('summaryPlayers').textContent = state.players;
      $('summaryTraitors').textContent = state.traitors;
      $('summaryCategory').textContent = state.selectedWordCategory ? categoryLabels[state.selectedWordCategory] : selectedCategorySummary();
      showScreen('complete');
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      continueFlow();
    } else {
      window.setTimeout(continueFlow, 220);
    }
  }

  function beginDiscussion() {
    const alive = activePlayers();
    if (!state.starterId) state.starterId = alive[randomInt(alive.length)].id;
    const starter = state.gamePlayers.find(player => player.id === state.starterId);
    $('roundLabel').textContent = `Runde ${state.round}`;
    $('starterText').textContent = state.round === 1 && starter && !starter.eliminated
      ? `${starter.name} beginnt mit dem ersten Hinweis.`
      : 'Gebt reihum Hinweise und beobachtet euch genau.';
    $('aliveStrip').innerHTML = alive.map(player => `<span class="alive-chip">${avatarMarkup(player, 'player-avatar--chip')}<span>${escapeHtml(player.name)}</span></span>`).join('');
    bindAvatarFallbacks($('aliveStrip'));
    showScreen('discussion');
  }

  function startVoting() {
    state.votes = {};
    state.voterIndex = 0;
    state.selectedCandidateId = null;
    state.voteCandidates = null;
    if (state.secretVote) {
      renderVoteHandoff();
      showScreen('vote-handoff');
    } else {
      renderVoteScreen(null);
      showScreen('vote');
    }
  }

  function renderVoteHandoff() {
    const voters = activePlayers();
    const voter = voters[state.voterIndex];
    $('voterName').textContent = voter.name;
    $('voterAvatar').innerHTML = avatarMarkup(voter, 'player-avatar--handoff');
    bindAvatarFallbacks($('voterAvatar'));
    $('voteCounter').textContent = `${state.voterIndex + 1} von ${voters.length}`;
  }

  function renderVoteScreen(voter) {
    state.selectedCandidateId = null;
    $('submitVoteButton').disabled = true;
    $('voteEyebrow').textContent = state.secretVote ? `Stimme von ${voter.name}` : 'Gemeinsame Abstimmung';
    $('voteInstruction').textContent = state.secretVote ? 'Wähle die Person, die du für den Verräter hältst.' : 'Einigt euch auf eine Person, die ausscheiden soll.';
    const allowedIds = state.voteCandidates ? new Set(state.voteCandidates) : null;
    const candidates = activePlayers().filter(player => (!voter || player.id !== voter.id) && (!allowedIds || allowedIds.has(player.id)));
    $('candidateList').innerHTML = candidates.map((player, index) => `
      <label class="candidate-option">
        <input type="radio" name="candidate" value="${player.id}">
        ${avatarMarkup(player, 'player-avatar--candidate')}
        <strong>${escapeHtml(player.name)}</strong>
        <span class="candidate-check"></span>
      </label>`).join('');
    bindAvatarFallbacks($('candidateList'));
    document.querySelectorAll('input[name="candidate"]').forEach(input => input.addEventListener('change', () => {
      state.selectedCandidateId = Number(input.value);
      $('submitVoteButton').disabled = false;
    }));
  }

  function submitVote() {
    if (!state.selectedCandidateId) return;
    haptic(12);
    if (!state.secretVote) {
      eliminatePlayer(state.selectedCandidateId);
      return;
    }
    const voters = activePlayers();
    const voter = voters[state.voterIndex];
    state.votes[voter.id] = state.selectedCandidateId;
    state.voterIndex += 1;
    if (state.voterIndex < voters.length) {
      renderVoteHandoff();
      showScreen('vote-handoff');
    } else {
      resolveVotes();
    }
  }

  function resolveVotes() {
    const counts = {};
    Object.values(state.votes).forEach(candidateId => { counts[candidateId] = (counts[candidateId] || 0) + 1; });
    const highest = Math.max(...Object.values(counts));
    const leaders = Object.keys(counts).map(Number).filter(id => counts[id] === highest);
    if (leaders.length > 1) {
      state.voteCandidates = leaders;
      state.votes = {};
      state.voterIndex = 0;
      showToast('Stimmengleichheit – Stichwahl.');
      renderVoteHandoff();
      showScreen('vote-handoff');
      return;
    }
    state.voteCandidates = null;
    eliminatePlayer(leaders[0]);
  }

  function eliminatePlayer(playerId) {
    const player = state.gamePlayers.find(item => item.id === playerId);
    if (!player) return;
    player.eliminated = true;
    haptic([20, 70, 20]);
    state.eliminatedId = playerId;
    $('eliminationRound').textContent = `Runde ${state.round}`;
    $('eliminatedName').textContent = player.name;
    $('eliminatedRole').textContent = player.role === 'traitor' ? 'VERRÄTER' : 'TEAM';
    $('eliminatedRole').className = `elimination-role ${player.role === 'traitor' ? 'is-traitor' : 'is-team'}`;
    $('eliminationText').textContent = player.role === 'traitor' ? 'Ein Verräter wurde entlarvt.' : 'Die Gruppe hat eine Person aus dem Team ausgeschlossen.';
    state.winner = determineWinner();
    $('continueRoundButton').querySelector('span:first-child').textContent = state.winner ? 'Ergebnis anzeigen' : 'Nächste Runde';
    showScreen('elimination');
  }

  function determineWinner() {
    const alive = activePlayers();
    const traitorsAlive = alive.filter(player => player.role === 'traitor').length;
    const teamAlive = alive.length - traitorsAlive;
    if (traitorsAlive === 0) return 'team';
    if (traitorsAlive >= teamAlive) return 'traitor';
    return null;
  }

  function continueAfterElimination() {
    if (state.winner) {
      renderResult();
      showScreen('result');
    } else {
      state.round += 1;
      beginDiscussion();
    }
  }

  function renderResult() {
    const teamWon = state.winner === 'team';
    const resultScreen = screens.result;
    resultScreen.classList.toggle('result--team', teamWon);
    resultScreen.classList.toggle('result--traitor', !teamWon);
    $('result-title').textContent = teamWon ? 'Das Team gewinnt' : 'Die Verräter gewinnen';
    $('resultText').textContent = teamWon ? 'Alle Verräter wurden entlarvt.' : 'Die Verräter sind nicht mehr in der Minderheit.';
    $('resultWord').textContent = state.civilianWord;
    applyAdaptiveWordSize($('resultWord'), state.civilianWord, 'result');
    const showFakeWord = state.fakeWord === true && Boolean(state.fakeWordValue);
    $('resultFakeWordRow').hidden = !showFakeWord;
    $('resultFakeWord').textContent = showFakeWord ? state.fakeWordValue : '';
    if (showFakeWord) applyAdaptiveWordSize($('resultFakeWord'), state.fakeWordValue, 'result');
    $('resultRoles').innerHTML = state.gamePlayers.map(player => `
      <div class="result-role-row ${player.eliminated ? 'is-eliminated' : ''}">
        <span>${avatarMarkup(player, 'player-avatar--result')}<span class="result-player-name">${escapeHtml(player.name)}</span></span>
        <strong class="${player.role === 'traitor' ? 'is-traitor' : 'is-team'}">${player.role === 'traitor' ? 'Verräter' : 'Team'}</strong>
      </div>`).join('');
    bindAvatarFallbacks($('resultRoles'));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function openCancelDialog() {
    $('cancelDialog').showModal();
  }

  $('startButton').addEventListener('click', () => {
    clearSavedGame();
    resetRoundState();
    loadSettings();
    updateControls();
    while (state.names.length < state.players) state.names.push('');
    state.names = state.names.slice(0, state.players);
    const names = state.names.map(name => name.trim());
    const lowered = names.map(name => name.toLocaleLowerCase('de-CH'));
    if (names.some(name => !name) || new Set(lowered).size !== lowered.length) {
      showToast('Bitte erfasse zuerst alle Spielernamen.');
      renderNameFields();
      showScreen('players');
      return;
    }
    createGame(names);
  });
  $('resumeGameButton').addEventListener('click', restoreSavedGame);
  $('managePlayersButton').addEventListener('click', () => {
    loadSettings();
    renderNameFields();
    showScreen('players');
  });
  $('continueButton').addEventListener('click', () => {
    loadSettings();
    updateControls();
    showScreen('setup');
  });
  document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.back)));
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
    state[button.dataset.step] += Number(button.dataset.direction);
    updateControls();
  }));
  $('setupForm').addEventListener('submit', event => {
    event.preventDefault();
    readSettings();
    if (!state.categories.length) {
      showToast('Bitte wähle mindestens eine Kategorie.');
      return;
    }
    if (!getAvailableWords().length) {
      showToast('Für diese Filterauswahl sind keine Begriffe verfügbar.');
      return;
    }
    saveSettings();
    showToast('Einstellungen gespeichert.');
    showScreen('start');
  });
  $('playersForm').addEventListener('submit', event => {
    event.preventDefault();
    const names = validateNames();
    if (!names) return;
    state.names = names;
    saveSettings();
    showToast('Spieler gespeichert.');
    showScreen('start');
  });
  $('revealBackButton').addEventListener('click', openCancelDialog);

  const revealCard = $('revealCard');
  revealCard.addEventListener('pointerdown', event => { event.preventDefault(); revealCard.setPointerCapture?.(event.pointerId); revealRole(); });
  ['pointerup','pointercancel','pointerleave'].forEach(type => revealCard.addEventListener(type, event => { event.preventDefault(); hideRole(); }));
  revealCard.addEventListener('keydown', event => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); revealRole(); }
  });
  revealCard.addEventListener('keyup', event => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); hideRole(); }
  });
  window.addEventListener('blur', hideRole);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideRole();
    else updateWakeLock();
  });
  $('nextRevealButton').addEventListener('click', nextReveal);

  $('discussionCancelButton').addEventListener('click', openCancelDialog);
  $('voteCancelButton').addEventListener('click', openCancelDialog);
  $('eliminationCancelButton').addEventListener('click', openCancelDialog);
  $('keepPlayingButton').addEventListener('click', () => $('cancelDialog').close());
  $('confirmCancelButton').addEventListener('click', () => {
    $('cancelDialog').close();
    clearSavedGame();
    resetRoundState();
    renderNameFields();
    showScreen('players');
  });
  $('finishButton').addEventListener('click', beginDiscussion);
  $('newRolesButton').addEventListener('click', () => createGame(state.gamePlayers.map(player => player.name)));

  $('startVoteButton').addEventListener('click', startVoting);
  $('voteReadyButton').addEventListener('click', () => {
    const voter = activePlayers()[state.voterIndex];
    renderVoteScreen(voter);
    showScreen('vote');
  });
  $('voteBackButton').addEventListener('click', () => {
    if (state.secretVote) showScreen('vote-handoff');
    else showScreen('discussion');
  });
  $('submitVoteButton').addEventListener('click', submitVote);
  $('continueRoundButton').addEventListener('click', continueAfterElimination);
  $('samePlayersButton').addEventListener('click', () => createGame(state.gamePlayers.map(player => player.name)));
  $('changeSettingsButton').addEventListener('click', () => {
    state.names = state.gamePlayers.map(player => player.name);
    updateControls();
    showScreen('setup');
  });
  $('homeButton').addEventListener('click', () => { clearSavedGame(); showScreen('start'); });

  document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', () => $(`${button.dataset.dialog}Dialog`)?.showModal()));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));

  let adaptiveResizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(adaptiveResizeTimer);
    adaptiveResizeTimer = window.setTimeout(() => refitAdaptiveWords(screens[state.currentScreen]), 80);
  });

  window.addEventListener('beforeunload', event => {
    if (!state.gameActive) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('click', event => {
    if (event.target.closest('button:not(:disabled), .category-card, .switch')) haptic(5);
  });
document.addEventListener('selectstart', event => {
  const interactiveElement = event.target.closest(
    'button, .category-card, .toggle-row, .difficulty-control label, .candidate-option, .reveal-card, .player-avatar'
  );

  if (interactiveElement) {
    event.preventDefault();
  }
});
  
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }

  initModernScrollUi();
  $('continueButton').disabled = false;
  updateResumeButton();
  updateControls();
})();
