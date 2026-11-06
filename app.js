(() => {
  const STORAGE_KEY = "listen-practice-filters";

  const el = {
    topicBtn: document.getElementById("topicBtn"),
    topicLabel: document.getElementById("topicLabel"),
    status: document.getElementById("status"),
    practice: document.getElementById("practice"),
    videoWrap: document.getElementById("videoWrap"),
    playOverlay: document.getElementById("playOverlay"),
    videoError: document.getElementById("videoError"),
    openYt: document.getElementById("openYt"),
    skipBtn: document.getElementById("skipBtn"),
    replayBtn: document.getElementById("replayBtn"),
    playback: document.getElementById("playback"),
    playbackToggle: document.getElementById("playbackToggle"),
    playbackTrack: document.getElementById("playbackTrack"),
    playbackBar: document.getElementById("playbackBar"),
    playbackTime: document.getElementById("playbackTime"),
    prompt: document.getElementById("prompt"),
    choices: document.getElementById("choices"),
    reveal: document.getElementById("reveal"),
    revealDe: document.getElementById("revealDe"),
    continueBar: document.getElementById("continueBar"),
    continueBtn: document.getElementById("continueBtn"),
    filterSheet: document.getElementById("filterSheet"),
    sheetBackdrop: document.getElementById("sheetBackdrop"),
    filterDone: document.getElementById("filterDone"),
    modePills: document.getElementById("modePills"),
    sitLegend: document.getElementById("sitLegend"),
    sitPills: document.getElementById("sitPills"),
    typeField: document.getElementById("typeField"),
    typePills: document.getElementById("typePills"),
    regField: document.getElementById("regField"),
    regPills: document.getElementById("regPills"),
    transcriptPills: document.getElementById("transcriptPills"),
  };

  const state = {
    index: null,
    commands: null,
    items: [],
    deck: [],
    cursor: 0,
    lastId: null,
    current: null,
    answered: false,
    selectedId: null,
    filters: { mode: "clips", sit: null, type: "both", reg: "both", transcript: false },
    draft: null,
  };

  let player = null;
  let playerReady = false;
  let pendingPlay = false;
  let endTimer = null;
  const clipAudio = new Audio();

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function isCommands(mode = state.filters.mode) {
    return mode === "commands";
  }

  function isAudioItem(item) {
    return Boolean(item && item.audio);
  }

  function activeCategories(mode = state.filters.mode) {
    if (isCommands(mode)) {
      const categories = (state.commands && state.commands.categories) || [];
      const total = (state.commands && state.commands.items && state.commands.items.length) || 0;
      return [{ id: "random", label: "Random", en: "any category", count: total }, ...categories];
    }
    return (state.index && state.index.situations) || [];
  }

  function situationMeta(id) {
    return activeCategories().find((situation) => situation.id === id) || {
      id,
      label: id,
      en: "",
    };
  }

  function loadSavedFilters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (saved.mode === "clips" || saved.mode === "commands") state.filters.mode = saved.mode;
        if (typeof saved.sit === "string") state.filters.sit = saved.sit;
        if (saved.type === "listen_react" || saved.type === "listen_meaning" || saved.type === "both") {
          state.filters.type = saved.type;
        }
        if (saved.reg === "lesson" || saved.reg === "exam" || saved.reg === "both") {
          state.filters.reg = saved.reg;
        }
        if (typeof saved.transcript === "boolean") state.filters.transcript = saved.transcript;
      }
    } catch {
      /* ignore */
    }
  }

  function saveFilters() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.filters));
    } catch {
      /* ignore */
    }
  }

  function pickRandomSituation() {
    const list = activeCategories();
    return list[Math.floor(Math.random() * list.length)].id;
  }

  function setStatus(text) {
    el.status.hidden = !text;
    el.status.textContent = text || "";
  }

  function setTopicLabel() {
    const meta = situationMeta(state.filters.sit);
    el.topicLabel.replaceChildren();
    const name = document.createElement("span");
    name.textContent = meta.label;
    el.topicLabel.append(name);
    if (meta.en) {
      const en = document.createElement("span");
      en.className = "en";
      en.textContent = `· ${meta.en}`;
      el.topicLabel.append(en);
    }
  }

  function filteredItems() {
    if (isCommands()) {
      if (state.filters.sit === "random") return state.items;
      return state.items.filter((item) => item.sit === state.filters.sit);
    }
    return state.items.filter((item) => {
      if (state.filters.type !== "both" && item.type !== state.filters.type) return false;
      if (state.filters.reg !== "both" && item.reg !== state.filters.reg) return false;
      return true;
    });
  }

  function rebuildDeck() {
    const filtered = filteredItems();
    state.deck = shuffle(filtered);
    if (state.deck.length > 1 && state.deck[0].id === state.lastId) {
      const swap = 1 + Math.floor(Math.random() * (state.deck.length - 1));
      [state.deck[0], state.deck[swap]] = [state.deck[swap], state.deck[0]];
    }
    state.cursor = 0;
  }

  function stopClip() {
    clearEndWatcher();
    clipAudio.pause();
    if (player && playerReady && typeof player.pauseVideo === "function") {
      try {
        player.pauseVideo();
      } catch {
        /* ignore */
      }
    }
  }

  function nextCard() {
    stopClip();
    if (!state.deck.length) {
      showEmpty();
      return;
    }
    if (state.cursor >= state.deck.length) rebuildDeck();
    state.current = state.deck[state.cursor];
    state.cursor += 1;
    state.lastId = state.current.id;
    state.answered = false;
    state.selectedId = null;
    renderCard();
    queueClip(true);
  }

  function showEmpty() {
    el.practice.hidden = true;
    el.continueBar.hidden = true;
    el.playback.hidden = true;
    setStatus("No clips for these filters. Tap the topic to change them.");
  }

  function youtubeUrl(item) {
    const t = Math.max(0, Math.floor(item.start));
    return `https://www.youtube.com/watch?v=${encodeURIComponent(item.yt)}&t=${t}s`;
  }

  function clearEndWatcher() {
    if (endTimer) {
      clearInterval(endTimer);
      endTimer = null;
    }
  }

  function startEndWatcher() {
    clearEndWatcher();
    endTimer = setInterval(() => {
      if (!player || !state.current || typeof player.getCurrentTime !== "function") return;
      const t = player.getCurrentTime();
      if (t >= state.current.end - 0.05) {
        try {
          player.pauseVideo();
        } catch {
          /* ignore */
        }
        clearEndWatcher();
      }
    }, 80);
  }

  function showPlayOverlay(show) {
    el.playOverlay.hidden = !show;
  }

  function showVideoError(show) {
    el.videoError.hidden = !show;
    if (show) {
      showPlayOverlay(false);
      el.openYt.href = youtubeUrl(state.current);
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const remain = String(whole % 60).padStart(2, "0");
    return `${minutes}:${remain}`;
  }

  function updatePlayback() {
    const duration = clipAudio.duration;
    const current = clipAudio.currentTime || 0;
    const ratio = duration ? Math.min(1, current / duration) : 0;
    el.playbackBar.style.width = `${Math.round(ratio * 100)}%`;
    el.playbackTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    const playing = !clipAudio.paused && !clipAudio.ended;
    el.playbackToggle.textContent = playing ? "Pause" : "Play";
    el.playbackToggle.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  function queueAudio(autoplay) {
    const item = state.current;
    showVideoError(false);
    showPlayOverlay(false);
    el.playback.hidden = false;
    clipAudio.src = item.audio;
    clipAudio.currentTime = 0;
    updatePlayback();
    if (!autoplay) return;
    const pending = clipAudio.play();
    if (pending) pending.catch(() => updatePlayback());
  }

  function queueClip(autoplay) {
    pendingPlay = autoplay;
    if (isAudioItem(state.current)) {
      el.practice.classList.add("is-audio");
      queueAudio(autoplay);
      return;
    }
    el.practice.classList.remove("is-audio");
    el.playback.hidden = true;
    showVideoError(false);
    showPlayOverlay(true);
    if (!state.current) return;
    initPlayer();
    if (!playerReady || !player) return;
    playCurrent();
  }

  function playCurrent() {
    const item = state.current;
    if (!item || !player || !playerReady) {
      showPlayOverlay(true);
      return;
    }
    showVideoError(false);
    showPlayOverlay(true);
    try {
      player.loadVideoById({
        videoId: item.yt,
        startSeconds: item.start,
        endSeconds: item.end,
      });
      if (typeof player.unMute === "function") player.unMute();
      if (pendingPlay && typeof player.playVideo === "function") player.playVideo();
    } catch {
      showPlayOverlay(true);
    }
  }

  function replayClip() {
    if (isAudioItem(state.current)) {
      clipAudio.currentTime = 0;
      const pending = clipAudio.play();
      if (pending) pending.catch(() => {});
      return;
    }
    pendingPlay = true;
    showVideoError(false);
    if (!playerReady || !player || !state.current) {
      showPlayOverlay(true);
      return;
    }
    try {
      player.seekTo(state.current.start, true);
      player.playVideo();
      showPlayOverlay(false);
    } catch {
      playCurrent();
    }
  }

  function initPlayer() {
    if (player || el.practice.hidden || !window.YT || !window.YT.Player) return;
    player = new window.YT.Player("player", {
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        origin: window.location.origin,
      },
      events: {
        onReady() {
          playerReady = true;
          if (state.current) playCurrent();
        },
        onError() {
          clearEndWatcher();
          showVideoError(true);
        },
        onStateChange(event) {
          const YT = window.YT;
          if (!YT) return;
          if (event.data === YT.PlayerState.PLAYING) {
            showPlayOverlay(false);
            showVideoError(false);
            if (state.current && typeof player.getCurrentTime === "function") {
              const t = player.getCurrentTime();
              if (t < state.current.start - 0.2) {
                try {
                  player.seekTo(state.current.start, true);
                } catch {
                  /* ignore */
                }
              }
            }
            startEndWatcher();
          } else if (event.data === YT.PlayerState.ENDED) {
            clearEndWatcher();
            // YouTube's native replay restarts the full video at 0s.
            // Cue the clip again so that endscreen never stays up.
            if (state.current) {
              try {
                player.cueVideoById({
                  videoId: state.current.yt,
                  startSeconds: state.current.start,
                  endSeconds: state.current.end,
                });
              } catch {
                /* ignore */
              }
            }
            showPlayOverlay(true);
          } else if (event.data === YT.PlayerState.PAUSED) {
            clearEndWatcher();
          }
        },
      },
    });
  }

  window.onYouTubeIframeAPIReady = () => {
    initPlayer();
    if (playerReady && state.current) playCurrent();
  };
  if (window.YT && window.YT.Player) initPlayer();

  function updateTranscript() {
    const item = state.current;
    if (!item) {
      el.reveal.hidden = true;
      return;
    }
    const showDe = state.filters.transcript || state.answered;
    if (!showDe) {
      el.reveal.hidden = true;
      el.revealDe.textContent = "";
      return;
    }
    el.revealDe.textContent = item.de || "";
    el.reveal.hidden = false;
  }

  function renderCard() {
    const item = state.current;
    el.practice.classList.toggle("is-audio", isAudioItem(item));
    el.practice.hidden = false;
    setStatus("");
    el.continueBar.hidden = false;
    el.continueBtn.textContent = "Next";
    el.prompt.textContent = item.prompt;
    el.choices.replaceChildren();
    item.choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.dataset.id = choice.id;
      btn.textContent = choice.text;
      btn.addEventListener("click", () => onChoose(choice.id));
      el.choices.append(btn);
    });
    updateTranscript();
  }

  function onChoose(choiceId) {
    if (state.answered || !state.current) return;
    state.selectedId = choiceId;
    [...el.choices.children].forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.id === choiceId);
    });
    el.continueBtn.textContent = "Answer";
  }

  function revealAnswer() {
    if (state.answered || !state.current || !state.selectedId) return;
    state.answered = true;
    const { current, selectedId } = state;
    [...el.choices.children].forEach((btn) => {
      btn.disabled = true;
      btn.classList.remove("is-selected");
      if (btn.dataset.id === current.correct) btn.classList.add("is-correct");
      if (btn.dataset.id === selectedId && selectedId !== current.correct) btn.classList.add("is-wrong");
    });
    el.continueBtn.textContent = "Next";
    updateTranscript();
  }

  function onPrimary() {
    if (!state.answered && state.selectedId) {
      revealAnswer();
      return;
    }
    nextCard();
  }

  function pill(label, { count, on, onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pill${on ? " is-on" : ""}`;
    const text = document.createElement("span");
    text.textContent = label;
    btn.append(text);
    if (typeof count === "number") {
      const n = document.createElement("span");
      n.className = "count";
      n.textContent = ` ${count}`;
      btn.append(n);
    }
    btn.addEventListener("click", onClick);
    return btn;
  }

  function useDraftMode(mode) {
    const draft = state.draft;
    if (draft.mode === mode) return;
    if (draft.mode === "clips") draft.clipSit = draft.sit;
    if (draft.mode === "commands") draft.commandSit = draft.sit;
    draft.mode = mode;
    const categories = activeCategories(mode);
    const remembered = mode === "commands" ? draft.commandSit : draft.clipSit;
    draft.sit = categories.some((category) => category.id === remembered)
      ? remembered
      : categories[Math.floor(Math.random() * categories.length)].id;
  }

  function renderFilterSheet() {
    const draft = state.draft;
    const commandsMode = isCommands(draft.mode);
    el.sitLegend.textContent = commandsMode ? "Category" : "Situation";
    el.typeField.hidden = commandsMode;
    el.regField.hidden = commandsMode;

    el.modePills.replaceChildren();
    [
      { id: "clips", label: "Clips" },
      { id: "commands", label: "Commands" },
    ].forEach((mode) => {
      el.modePills.append(
        pill(mode.label, {
          on: draft.mode === mode.id,
          onClick() {
            useDraftMode(mode.id);
            renderFilterSheet();
          },
        })
      );
    });

    el.sitPills.replaceChildren();
    activeCategories(draft.mode).forEach((sit) => {
      el.sitPills.append(
        pill(sit.label, {
          count: sit.count,
          on: draft.sit === sit.id,
          onClick() {
            draft.sit = sit.id;
            renderFilterSheet();
          },
        })
      );
    });

    const types = [
      { id: "listen_react", label: "React" },
      { id: "listen_meaning", label: "Meaning" },
      { id: "both", label: "Both" },
    ];
    el.typePills.replaceChildren();
    types.forEach((t) => {
      el.typePills.append(
        pill(t.label, {
          on: draft.type === t.id,
          onClick() {
            draft.type = t.id;
            renderFilterSheet();
          },
        })
      );
    });

    const regs = [
      { id: "lesson", label: "Lesson" },
      { id: "exam", label: "Exam" },
      { id: "both", label: "Both" },
    ];
    el.regPills.replaceChildren();
    regs.forEach((r) => {
      el.regPills.append(
        pill(r.label, {
          on: draft.reg === r.id,
          onClick() {
            draft.reg = r.id;
            renderFilterSheet();
          },
        })
      );
    });

    el.transcriptPills.replaceChildren();
    [
      { id: false, label: "Off" },
      { id: true, label: "On" },
    ].forEach((opt) => {
      el.transcriptPills.append(
        pill(opt.label, {
          on: draft.transcript === opt.id,
          onClick() {
            draft.transcript = opt.id;
            renderFilterSheet();
          },
        })
      );
    });
  }

  function openFilters() {
    if (!state.index) return;
    state.draft = { ...state.filters };
    renderFilterSheet();
    el.filterSheet.hidden = false;
  }

  function closeFilters() {
    el.filterSheet.hidden = true;
    state.draft = null;
  }

  async function loadSituation(sitId) {
    const res = await fetch(`data/situations/${encodeURIComponent(sitId)}.json`);
    if (!res.ok) throw new Error(`Could not load ${sitId}`);
    const data = await res.json();
    state.items = data.items || [];
    state.filters.sit = sitId;
    setTopicLabel();
    rebuildDeck();
    nextCard();
  }

  function showCommandCategory() {
    state.items = state.commands.items || [];
    setTopicLabel();
    rebuildDeck();
    nextCard();
  }

  async function applyDraft() {
    if (!state.draft) return;
    const draft = state.draft;
    const modeChanged = draft.mode !== state.filters.mode;
    const sitChanged = draft.sit !== state.filters.sit;
    const typeChanged = draft.type !== state.filters.type;
    const regChanged = draft.reg !== state.filters.reg;
    state.filters = {
      mode: draft.mode,
      sit: draft.sit,
      type: draft.type,
      reg: draft.reg,
      transcript: draft.transcript,
    };
    saveFilters();
    closeFilters();
    if (!modeChanged && !sitChanged && !typeChanged && !regChanged) {
      if (state.current && !el.practice.hidden) updateTranscript();
      return;
    }
    stopClip();
    setStatus("Loading…");
    el.practice.hidden = true;
    el.continueBar.hidden = true;
    try {
      if (isCommands()) {
        showCommandCategory();
      } else if (modeChanged || sitChanged || !state.items.length) {
        await loadSituation(state.filters.sit);
      } else {
        setTopicLabel();
        rebuildDeck();
        nextCard();
      }
    } catch (err) {
      setStatus(err.message || "Could not load clips.");
    }
  }

  async function boot() {
    loadSavedFilters();
    try {
      const [indexRes, commandsRes] = await Promise.all([
        fetch("data/index.json"),
        fetch("data/commands.json"),
      ]);
      if (!indexRes.ok) throw new Error("Could not load topics.");
      if (!commandsRes.ok) throw new Error("Could not load commands.");
      state.index = await indexRes.json();
      state.commands = await commandsRes.json();
      if (isCommands()) {
        const known = activeCategories().some((category) => category.id === state.filters.sit);
        if (!known) state.filters.sit = pickRandomSituation();
        showCommandCategory();
      } else {
        state.filters.mode = "clips";
        state.filters.sit = pickRandomSituation();
        await loadSituation(state.filters.sit);
      }
    } catch (err) {
      setStatus(err.message || "Could not load clips. Serve this folder over HTTP.");
    }
  }

  el.topicBtn.addEventListener("click", openFilters);
  el.sheetBackdrop.addEventListener("click", closeFilters);
  el.filterDone.addEventListener("click", () => {
    applyDraft();
  });
  el.playOverlay.addEventListener("click", () => {
    pendingPlay = true;
    playCurrent();
  });
  el.replayBtn.addEventListener("click", replayClip);
  el.playbackToggle.addEventListener("click", () => {
    if (!isAudioItem(state.current)) return;
    if (clipAudio.paused || clipAudio.ended) {
      if (clipAudio.ended || !clipAudio.src) clipAudio.currentTime = 0;
      const pending = clipAudio.play();
      if (pending) pending.catch(() => updatePlayback());
      return;
    }
    clipAudio.pause();
  });
  el.playbackTrack.addEventListener("click", (event) => {
    if (!isAudioItem(state.current) || !clipAudio.duration) return;
    const rect = el.playbackTrack.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    clipAudio.currentTime = Math.min(1, Math.max(0, ratio)) * clipAudio.duration;
    updatePlayback();
  });
  ["timeupdate", "play", "pause", "ended", "loadedmetadata"].forEach((eventName) => {
    clipAudio.addEventListener(eventName, updatePlayback);
  });
  el.skipBtn.addEventListener("click", nextCard);
  el.continueBtn.addEventListener("click", onPrimary);

  boot();
})();
