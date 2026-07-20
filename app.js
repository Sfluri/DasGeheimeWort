const ASSETS = window.APP_ASSETS;

const FALLBACK_IMAGE = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#11243d"/><stop offset="1" stop-color="#070b12"/></linearGradient></defs>
  <rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="430" r="95" fill="none" stroke="#27bfff" stroke-width="16" opacity=".75"/><text x="400" y="470" text-anchor="middle" fill="#fff" font-family="Arial" font-size="110" font-weight="700">?</text>
  <text x="400" y="620" text-anchor="middle" fill="#a9bbcf" font-family="Arial" font-size="34">Bild wird noch ersetzt</text>
</svg>`);

function setAssetImage(elementOrId, source, alt = "") {
  const image = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  if (!image) return;
  image.alt = alt;
  image.onerror = () => {
    image.onerror = null;
    image.src = FALLBACK_IMAGE;
    image.classList.add("asset-fallback");
  };
  image.src = source || FALLBACK_IMAGE;
}

function renderCategoryGrid() {
  const labels = { alltag: "Alltag", essen: "Essen", geografie: "Geografie", gemischt: "Gemischt" };
  const grid = document.getElementById("category-grid");
  grid.innerHTML = "";
  Object.entries(labels).forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-card";
    button.dataset.category = key;

    const image = document.createElement("img");
    image.className = "category-image";
    setAssetImage(image, ASSETS.categories[key], label);

    const shade = document.createElement("span");
    shade.className = "category-shade";
    shade.setAttribute("aria-hidden", "true");

    const text = document.createElement("strong");
    text.textContent = label;
    button.append(image, shade, text);
    grid.appendChild(button);
  });
}

function initializeStaticAssets() {
  setAssetImage("hero-image", ASSETS.hero, "Jugendliche spielen gemeinsam Das geheime Wort");
  setAssetImage("discussion-image", ASSETS.discussion, "Jugendliche diskutieren gemeinsam");
  setAssetImage("handoff-image", ASSETS.passPhone, "Handy wird weitergegeben");
  setAssetImage("role-image", ASSETS.roles.team, "Rollenkarte Team");
  setAssetImage("reveal-cover-image", ASSETS.revealCover, "Geheime Rollenkarte – zum Aufdecken gedrückt halten");
  setAssetImage("result-image", ASSETS.winners.team, "Das Team gewinnt");
  renderCategoryGrid();
}

const wordSets = {
  alltag: [
    ["Strand", "Pool"], ["Dusche", "Badewanne"], ["Bus", "Zug"], ["Kino", "Theater"],
    ["Schlüssel", "Passwort"], ["Schule", "Universität"], ["Ferien", "Wochenende"], ["Sofa", "Bett"]
  ],
  essen: [
    ["Pizza", "Flammkuchen"], ["Apfel", "Birne"], ["Kaffee", "Tee"], ["Burger", "Sandwich"],
    ["Spaghetti", "Lasagne"], ["Schokolade", "Karamell"], ["Pommes", "Chips"], ["Joghurt", "Pudding"]
  ],
  geografie: [
    ["Schweiz", "Österreich"], ["Paris", "London"], ["Meer", "See"], ["Berg", "Vulkan"],
    ["Afrika", "Südamerika"], ["Bern", "Zürich"], ["Insel", "Halbinsel"], ["Wüste", "Steppe"]
  ]
};

const savedSettings = loadSettings();
const state = {
  playerCount: savedSettings.playerCount ?? 6,
  imposterCount: savedSettings.imposterCount ?? 1,
  category: savedSettings.category ?? "alltag",
  imposterMode: savedSettings.imposterMode ?? "no-word",
  usePlayerNames: savedSettings.usePlayerNames ?? false,
  useSecretVoting: savedSettings.useSecretVoting ?? false,
  playerNames: Array.isArray(savedSettings.playerNames) ? savedSettings.playerNames : [],
  players: [],
  currentRevealIndex: 0,
  viewedCurrentSecret: false,
  civilianWord: "",
  fakeWord: "",
  starterId: null,
  selectedPlayerId: null,
  round: 1,
  voters: [],
  voterIndex: 0,
  currentVoteTargetId: null,
  votes: [],
  runoffCandidateIds: null,
  voteWinnerId: null
};

const screens = [...document.querySelectorAll(".screen")];
const playerCountOutput = document.getElementById("player-count");
const imposterCountOutput = document.getElementById("imposter-count");
const namesToggle = document.getElementById("use-player-names");
const votingToggle = document.getElementById("use-secret-voting");
const fakeWordSwitch = document.getElementById("fake-word-switch");
const namesPanel = document.getElementById("player-names-panel");
const namesList = document.getElementById("player-name-inputs");
const nextPlayerButton = document.getElementById("next-player");
const revealCard = document.getElementById("reveal-card");
const lockedState = document.getElementById("reveal-card-locked");
const secretState = document.getElementById("reveal-card-secret");
const roleImage = document.getElementById("role-image");
const revealCoverImage = document.getElementById("reveal-cover-image");
const modal = document.getElementById("confirm-modal");

function showScreen(id) {
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function maxImposters() {
  return Math.max(1, Math.floor((state.playerCount - 1) / 2));
}

function updateSetupOutputs() {
  state.imposterCount = Math.min(state.imposterCount, maxImposters());
  playerCountOutput.textContent = state.playerCount;
  imposterCountOutput.textContent = state.imposterCount;
  renderNameInputs();
  saveSettings();
}

function renderNameInputs() {
  while (state.playerNames.length < state.playerCount) state.playerNames.push("");
  namesList.innerHTML = "";
  for (let index = 0; index < state.playerCount; index += 1) {
    const row = document.createElement("div");
    row.className = "name-input-row";
    const label = document.createElement("label");
    label.htmlFor = `player-name-${index + 1}`;
    label.textContent = `Spieler ${index + 1}`;
    const input = document.createElement("input");
    input.id = `player-name-${index + 1}`;
    input.className = "name-input";
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 20;
    input.placeholder = `Name ${index + 1}`;
    input.value = state.playerNames[index] || "";
    input.addEventListener("input", () => {
      state.playerNames[index] = input.value;
      saveSettings();
    });
    row.append(label, input);
    namesList.appendChild(row);
  }
}

function getConfiguredName(index) {
  const enteredName = (state.playerNames[index] || "").trim();
  return state.usePlayerNames && enteredName ? enteredName : `Spieler ${index + 1}`;
}

function getPlayerById(id) {
  return state.players.find(player => player.id === id);
}

function activePlayers() {
  return state.players.filter(player => !player.eliminated);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getCategoryPool() {
  return state.category === "gemischt"
    ? [...wordSets.alltag, ...wordSets.essen, ...wordSets.geografie]
    : wordSets[state.category];
}

function createGame() {
  saveSettings();
  const pool = getCategoryPool();
  const pair = pool[Math.floor(Math.random() * pool.length)];
  state.civilianWord = pair[0];
  state.fakeWord = pair[1];
  state.currentRevealIndex = 0;
  state.viewedCurrentSecret = false;
  state.starterId = null;
  state.selectedPlayerId = null;
  state.round = 1;
  resetVotingState();

  const imposterIds = new Set(
    shuffle(Array.from({ length: state.playerCount }, (_, index) => index + 1)).slice(0, state.imposterCount)
  );

  state.players = Array.from({ length: state.playerCount }, (_, index) => ({
    id: index + 1,
    name: getConfiguredName(index),
    role: imposterIds.has(index + 1) ? "imposter" : "civilian",
    eliminated: false
  }));

  renderRevealScreen();
  showScreen("screen-reveal");
}

function currentPlayer() {
  return state.players[state.currentRevealIndex];
}

function renderRevealScreen() {
  const player = currentPlayer();
  document.getElementById("reveal-progress").textContent = `${state.currentRevealIndex + 1} von ${state.playerCount}`;
  document.getElementById("reveal-title").textContent = `${player.name}, du bist dran`;
  nextPlayerButton.classList.add("hidden");
  state.viewedCurrentSecret = false;
  hideSecret();
}

function showSecret() {
  const player = currentPlayer();
  state.viewedCurrentSecret = true;
  lockedState.hidden = true;
  secretState.hidden = false;
  revealCoverImage.hidden = true;
  roleImage.hidden = false;
  const isImposter = player.role === "imposter";
  revealCard.classList.toggle("imposter", isImposter);
  setAssetImage("role-image", isImposter ? ASSETS.roles.traitor : ASSETS.roles.team, isImposter ? "Rollenkarte Verräter" : "Rollenkarte Team");
  document.getElementById("role-badge").textContent = isImposter ? "Verräter" : "Team";
  document.getElementById("secret-title").textContent = isImposter ? "Deine Rolle" : "Dein Wort";

  if (isImposter && state.imposterMode === "no-word") {
    document.getElementById("secret-word").textContent = "VERRÄTER";
    document.getElementById("secret-note").textContent = "Finde das geheime Wort heraus, ohne aufzufallen.";
  } else if (isImposter) {
    document.getElementById("secret-word").textContent = state.fakeWord;
    document.getElementById("secret-note").textContent = "Das ist dein ähnliches Fake-Wort.";
  } else {
    document.getElementById("secret-word").textContent = state.civilianWord;
    document.getElementById("secret-note").textContent = "Merke dir das Wort gut.";
  }
}

function hideSecret() {
  revealCard.classList.remove("imposter");
  roleImage.hidden = true;
  revealCoverImage.hidden = false;
  secretState.hidden = true;
  lockedState.hidden = false;
  ["role-badge", "secret-title", "secret-word", "secret-note"].forEach(id => {
    document.getElementById(id).textContent = "";
  });
  if (state.viewedCurrentSecret) {
    nextPlayerButton.textContent = state.currentRevealIndex === state.playerCount - 1
      ? "Kartenverteilung abschliessen"
      : "Handy weitergeben";
    nextPlayerButton.classList.remove("hidden");
  }
}

function finishRevealStep() {
  if (!state.viewedCurrentSecret) return;
  if (state.currentRevealIndex < state.playerCount - 1) {
    state.currentRevealIndex += 1;
    renderRevealScreen();
  } else {
    resetStarterScreen();
    showScreen("screen-starter");
  }
}

function resetStarterScreen() {
  const spinner = document.getElementById("starter-spinner");
  spinner.textContent = "?";
  spinner.classList.remove("spinning", "name-result");
  document.getElementById("starter-message").textContent = "Tippe auf den Button, um auszulosen.";
  document.getElementById("draw-starter").classList.remove("hidden");
  document.getElementById("begin-round").classList.add("hidden");
}

function drawStarter() {
  const active = activePlayers();
  const spinner = document.getElementById("starter-spinner");
  const drawButton = document.getElementById("draw-starter");
  drawButton.disabled = true;
  spinner.classList.add("spinning", "name-result");
  let ticks = 0;
  const interval = setInterval(() => {
    spinner.textContent = active[Math.floor(Math.random() * active.length)].name;
    ticks += 1;
    if (ticks >= 14) {
      clearInterval(interval);
      const starter = active[Math.floor(Math.random() * active.length)];
      state.starterId = starter.id;
      spinner.classList.remove("spinning");
      spinner.textContent = starter.name;
      document.getElementById("starter-message").textContent = `${starter.name} beginnt im Uhrzeigersinn.`;
      drawButton.classList.add("hidden");
      drawButton.disabled = false;
      document.getElementById("begin-round").classList.remove("hidden");
      if (navigator.vibrate) navigator.vibrate([70, 40, 100]);
    }
  }, 85);
}

function renderDashboard() {
  const starter = getPlayerById(state.starterId);
  document.getElementById("round-label").textContent = `Runde ${state.round}`;
  document.getElementById("starter-hint").textContent = `${starter?.name || "Ein Spieler"} beginnt.`;
  document.getElementById("remaining-count").textContent = `${activePlayers().length} aktiv`;

  const grid = document.getElementById("players-grid");
  grid.innerHTML = "";
  state.players.forEach(player => {
    const button = document.createElement("button");
    button.className = "player-card";
    const avatarColors = ["#1677ef", "#72bd45", "#ff9f24", "#9a45ff", "#ef4136", "#e44d9b", "#25b9bc", "#ffb927"];
    button.dataset.initial = player.name.trim().charAt(0).toUpperCase() || player.id;
    button.style.setProperty("--avatar-color", avatarColors[(player.id - 1) % avatarColors.length]);
    const avatar = document.createElement("img");
    avatar.className = "player-avatar";
    setAssetImage(avatar, ASSETS.avatars[(player.id - 1) % ASSETS.avatars.length], `Avatar von ${player.name}`);
    if (player.eliminated) button.classList.add("eliminated");
    if (!state.useSecretVoting && player.id === state.selectedPlayerId) button.classList.add("selected");
    button.disabled = player.eliminated || state.useSecretVoting;
    const name = document.createElement("strong");
    name.textContent = player.name;
    const status = document.createElement("small");
    status.textContent = player.eliminated ? "eliminiert" : "im Spiel";
    button.append(avatar, name, status);
    if (!state.useSecretVoting) button.addEventListener("click", () => selectPlayer(player.id));
    grid.appendChild(button);
  });

  const actionButton = document.getElementById("eliminate-player");
  if (state.useSecretVoting) {
    actionButton.disabled = false;
    actionButton.textContent = "Geheime Abstimmung starten";
  } else {
    const selected = getPlayerById(state.selectedPlayerId);
    actionButton.disabled = !selected;
    actionButton.textContent = selected ? `${selected.name} eliminieren` : "Spieler auswählen";
  }
}

function selectPlayer(id) {
  state.selectedPlayerId = state.selectedPlayerId === id ? null : id;
  renderDashboard();
}

function openEliminationModal() {
  if (state.useSecretVoting) {
    startSecretVote();
    return;
  }
  const selected = getPlayerById(state.selectedPlayerId);
  if (!selected) return;
  document.getElementById("modal-text").textContent = `${selected.name} wird aus der Runde entfernt.`;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

function getNextActivePlayerId(afterPlayerId) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const nextIndex = (afterPlayerId - 1 + offset) % state.players.length;
    const candidate = state.players[nextIndex];
    if (!candidate.eliminated) return candidate.id;
  }
  return null;
}

function eliminatePlayer(playerId) {
  const player = getPlayerById(playerId);
  if (!player || player.eliminated) return;
  player.eliminated = true;
  state.selectedPlayerId = null;
  closeModal();

  const winner = getWinner();
  if (winner) {
    showResult(winner);
    return;
  }

  state.round += 1;
  if (player.id === state.starterId) state.starterId = getNextActivePlayerId(player.id);
  const nextStarter = getPlayerById(state.starterId);
  document.getElementById("round-transition-player").textContent = player.name;
  document.getElementById("next-round-starter").textContent = nextStarter
    ? `${nextStarter.name} beginnt die nächste Runde.`
    : "Die nächste Runde kann beginnen.";
  showScreen("screen-round-transition");
}

function confirmElimination() {
  const selected = getPlayerById(state.selectedPlayerId);
  if (selected) eliminatePlayer(selected.id);
}

function getWinner() {
  const active = activePlayers();
  const activeImposters = active.filter(player => player.role === "imposter").length;
  const activeTeam = active.filter(player => player.role === "civilian").length;
  if (activeImposters === 0) return "team";
  if (activeImposters >= activeTeam) return "imposters";
  return null;
}

function resetVotingState() {
  state.voters = [];
  state.voterIndex = 0;
  state.currentVoteTargetId = null;
  state.votes = [];
  state.runoffCandidateIds = null;
  state.voteWinnerId = null;
}

function startSecretVote(candidateIds = null) {
  state.voters = activePlayers().map(player => player.id);
  state.voterIndex = 0;
  state.currentVoteTargetId = null;
  state.votes = [];
  state.runoffCandidateIds = candidateIds;
  state.voteWinnerId = null;
  renderVoteHandoff();
  showScreen("screen-vote-handoff");
}

function currentVoter() {
  return getPlayerById(state.voters[state.voterIndex]);
}

function renderVoteHandoff() {
  const voter = currentVoter();
  const isRunoff = Array.isArray(state.runoffCandidateIds);
  document.getElementById("vote-round-label").textContent = isRunoff ? "Geheime Stichwahl" : "Geheime Abstimmung";
  document.getElementById("vote-handoff-title").textContent = `${voter.name} ist dran`;
  document.getElementById("vote-handoff-text").textContent = `Stimme ${state.voterIndex + 1} von ${state.voters.length}. Gib das Handy nur dieser Person.`;
}

function renderBallot() {
  const voter = currentVoter();
  const allowedIds = state.runoffCandidateIds || activePlayers().map(player => player.id);
  const candidates = activePlayers().filter(player => allowedIds.includes(player.id) && player.id !== voter.id);
  state.currentVoteTargetId = null;
  document.getElementById("ballot-voter").textContent = `Stimme von ${voter.name}`;
  document.getElementById("confirm-vote").disabled = true;

  const grid = document.getElementById("ballot-grid");
  grid.innerHTML = "";
  candidates.forEach(candidate => {
    const button = document.createElement("button");
    button.className = "player-card";
    const avatarColors = ["#1677ef", "#72bd45", "#ff9f24", "#9a45ff", "#ef4136", "#e44d9b", "#25b9bc", "#ffb927"];
    button.dataset.initial = candidate.name.trim().charAt(0).toUpperCase() || candidate.id;
    button.style.setProperty("--avatar-color", avatarColors[(candidate.id - 1) % avatarColors.length]);
    const avatar = document.createElement("img");
    avatar.className = "player-avatar";
    setAssetImage(avatar, ASSETS.avatars[(candidate.id - 1) % ASSETS.avatars.length], `Avatar von ${candidate.name}`);
    const name = document.createElement("strong");
    name.textContent = candidate.name;
    const note = document.createElement("small");
    note.textContent = "auswählen";
    button.append(avatar, name, note);
    button.addEventListener("click", () => {
      state.currentVoteTargetId = candidate.id;
      [...grid.children].forEach(card => card.classList.remove("selected"));
      button.classList.add("selected");
      document.getElementById("confirm-vote").disabled = false;
    });
    grid.appendChild(button);
  });
}

function confirmVote() {
  if (!state.currentVoteTargetId) return;
  state.votes.push({ voterId: currentVoter().id, targetId: state.currentVoteTargetId });
  state.voterIndex += 1;
  state.currentVoteTargetId = null;
  if (state.voterIndex < state.voters.length) {
    renderVoteHandoff();
    showScreen("screen-vote-handoff");
  } else {
    evaluateVotes();
  }
}

function evaluateVotes() {
  const counts = new Map();
  state.votes.forEach(vote => counts.set(vote.targetId, (counts.get(vote.targetId) || 0) + 1));
  const maximum = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, count]) => count === maximum).map(([id]) => id);

  if (leaders.length > 1) {
    const names = leaders.map(id => getPlayerById(id).name).join(", ");
    document.getElementById("vote-result-icon").textContent = "=";
    document.getElementById("vote-result-eyebrow").textContent = "Gleichstand";
    document.getElementById("vote-result-title").textContent = "Eine Stichwahl ist nötig";
    document.getElementById("vote-result-player").textContent = names;
    document.getElementById("vote-result-message").textContent = `Je ${maximum} Stimmen.`;
    document.getElementById("vote-result-detail").textContent = "Alle aktiven Personen stimmen nochmals nur über diese Kandidaten ab.";
    const button = document.getElementById("finish-vote");
    button.textContent = "Stichwahl starten";
    button.dataset.mode = "runoff";
    button.dataset.candidates = leaders.join(",");
    showScreen("screen-vote-result");
    return;
  }

  state.voteWinnerId = leaders[0];
  const winner = getPlayerById(state.voteWinnerId);
  document.getElementById("vote-result-icon").textContent = "✓";
  document.getElementById("vote-result-eyebrow").textContent = "Abstimmung beendet";
  document.getElementById("vote-result-title").textContent = "Die Entscheidung steht fest";
  document.getElementById("vote-result-player").textContent = winner.name;
  document.getElementById("vote-result-message").textContent = `${maximum} ${maximum === 1 ? "Stimme" : "Stimmen"}`;
  document.getElementById("vote-result-detail").textContent = "Diese Person scheidet aus.";
  const button = document.getElementById("finish-vote");
  button.textContent = `${winner.name} eliminieren`;
  button.dataset.mode = "eliminate";
  delete button.dataset.candidates;
  showScreen("screen-vote-result");
}

function finishVoteResult() {
  const button = document.getElementById("finish-vote");
  if (button.dataset.mode === "runoff") {
    const candidates = button.dataset.candidates.split(",").map(Number);
    startSecretVote(candidates);
  } else if (state.voteWinnerId) {
    eliminatePlayer(state.voteWinnerId);
  }
}

function showResult(winner) {
  const teamWon = winner === "team";
  document.getElementById("screen-result").classList.toggle("traitor-win", !teamWon);
  setAssetImage("result-image", teamWon ? ASSETS.winners.team : ASSETS.winners.traitor, teamWon ? "Das Team gewinnt" : "Die Verräter gewinnen");
  document.getElementById("result-title").textContent = teamWon ? "Das Team gewinnt" : "Die Verräter gewinnen";
  document.getElementById("result-summary").textContent = teamWon
    ? "Alle Verräter wurden erfolgreich entlarvt."
    : "Die Verräter können nicht mehr überstimmt werden.";
  document.getElementById("result-eyebrow").textContent = teamWon ? "Mission erfüllt" : "Täuschung gelungen";
  document.getElementById("result-icon").textContent = teamWon ? "✦" : "◈";
  document.getElementById("result-imposters").textContent = state.players.filter(player => player.role === "imposter").map(player => player.name).join(", ");
  document.getElementById("result-word").textContent = state.civilianWord;
  document.getElementById("result-fake-word").textContent = state.fakeWord;
  document.getElementById("result-fake-row").hidden = state.imposterMode !== "fake-word";
  showScreen("screen-result");
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("das-geheime-wort-settings"))
      || JSON.parse(localStorage.getItem("splash-imposter-settings"))
      || {};
  } catch {
    return {};
  }
}

function saveSettings() {
  localStorage.setItem("das-geheime-wort-settings", JSON.stringify({
    playerCount: state.playerCount,
    imposterCount: state.imposterCount,
    category: state.category,
    imposterMode: state.imposterMode,
    usePlayerNames: state.usePlayerNames,
    useSecretVoting: state.useSecretVoting,
    playerNames: state.playerNames
  }));
}

function restoreSetupControls() {
  namesToggle.checked = state.usePlayerNames;
  votingToggle.checked = state.useSecretVoting;
  fakeWordSwitch.checked = state.imposterMode === "fake-word";
  namesPanel.hidden = !state.usePlayerNames;
  document.querySelectorAll("[data-category]").forEach(button => {
    button.classList.toggle("selected", button.dataset.category === state.category);
  });
  document.querySelectorAll('input[name="imposter-mode"]').forEach(input => {
    input.checked = input.value === state.imposterMode;
    input.closest(".mode-card").classList.toggle("selected", input.checked);
  });
}

function bindEvents() {
  document.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "decrease-players") state.playerCount = Math.max(3, state.playerCount - 1);
    if (action === "increase-players") state.playerCount = Math.min(12, state.playerCount + 1);
    if (action === "decrease-imposters") state.imposterCount = Math.max(1, state.imposterCount - 1);
    if (action === "increase-imposters") state.imposterCount = Math.min(maxImposters(), state.imposterCount + 1);
    if (action) updateSetupOutputs();
  });

  namesToggle.addEventListener("change", () => {
    state.usePlayerNames = namesToggle.checked;
    namesPanel.hidden = !state.usePlayerNames;
    saveSettings();
  });
  votingToggle.addEventListener("change", () => {
    state.useSecretVoting = votingToggle.checked;
    saveSettings();
  });
  fakeWordSwitch.addEventListener("change", () => {
    state.imposterMode = fakeWordSwitch.checked ? "fake-word" : "no-word";
    saveSettings();
  });

  document.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-category]").forEach(item => item.classList.remove("selected"));
      button.classList.add("selected");
      state.category = button.dataset.category;
      saveSettings();
    });
  });

  document.querySelectorAll('input[name="imposter-mode"]').forEach(input => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".mode-card").forEach(card => card.classList.remove("selected"));
      input.closest(".mode-card").classList.add("selected");
      state.imposterMode = input.value;
      saveSettings();
    });
  });

  document.getElementById("start-game").addEventListener("click", createGame);
  revealCard.addEventListener("pointerdown", event => {
    event.preventDefault();
    revealCard.setPointerCapture?.(event.pointerId);
    showSecret();
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
    revealCard.addEventListener(type, event => {
      event.preventDefault();
      hideSecret();
    });
  });
  window.addEventListener("blur", hideSecret);
  document.addEventListener("visibilitychange", () => { if (document.hidden) hideSecret(); });
  nextPlayerButton.addEventListener("click", finishRevealStep);
  document.getElementById("draw-starter").addEventListener("click", drawStarter);
  document.getElementById("begin-round").addEventListener("click", () => { renderDashboard(); showScreen("screen-dashboard"); });
  document.getElementById("continue-next-round").addEventListener("click", () => { renderDashboard(); showScreen("screen-dashboard"); });
  document.getElementById("eliminate-player").addEventListener("click", openEliminationModal);
  document.getElementById("confirm-elimination").addEventListener("click", confirmElimination);
  document.querySelectorAll("[data-close-modal]").forEach(element => element.addEventListener("click", closeModal));
  document.getElementById("open-ballot").addEventListener("click", () => { renderBallot(); showScreen("screen-ballot"); });
  document.getElementById("confirm-vote").addEventListener("click", confirmVote);
  document.getElementById("finish-vote").addEventListener("click", finishVoteResult);
  document.getElementById("rematch").addEventListener("click", createGame);
  document.getElementById("back-to-menu").addEventListener("click", () => showScreen("screen-setup"));
}

initializeStaticAssets();
restoreSetupControls();
updateSetupOutputs();
bindEvents();
