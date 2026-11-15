(() => {
  'use strict';

  // ---------- Config ----------
  // Change these to change the game. Both words must be the same length.
  const CONFIG = {
    password: 'caesar', // must be typed into the first row to unlock the game
    answer: 'spring',   // the word to find
    rows: 6,            // total rows, including the password row
  };

  const PASSWORD = CONFIG.password.toLowerCase();
  const ANSWER = CONFIG.answer.toLowerCase();
  const COLS = ANSWER.length;
  const ROWS = CONFIG.rows;

  if (PASSWORD.length !== COLS) {
    console.warn('Password and answer should be the same length.');
  }

  const FLIP_MS = 500;
  const STAGGER_MS = 300;
  const RANK = { absent: 1, present: 2, correct: 3 };

  // ---------- Elements ----------
  const boardEl = document.getElementById('board');
  const keyboardEl = document.getElementById('keyboard');
  const hintEl = document.getElementById('hint');
  const toastEl = document.getElementById('toast');
  const victoryEl = document.getElementById('victory');
  const victoryWordEl = document.getElementById('victory-word');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  document.documentElement.style.setProperty('--cols', COLS);
  document.documentElement.style.setProperty('--rows', ROWS);

  // ---------- State ----------
  const state = {
    row: 0,
    guess: '',
    unlocked: false,
    busy: false,
    done: false,
    results: [], // results[row] = array of 'correct' | 'present' | 'absent'
  };

  const rowEls = [];
  const tiles = [];
  const keyEls = {};

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------- Build UI ----------
  function buildBoard() {
    for (let r = 0; r < ROWS; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'row' + (r > 0 ? ' locked' : '');
      rowEl.setAttribute('role', 'row');
      tiles[r] = [];
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('role', 'gridcell');
        tile.addEventListener('animationend', () => {
          tile.classList.remove('pop', 'flip', 'bounce');
        });
        rowEl.appendChild(tile);
        tiles[r].push(tile);
      }
      rowEl.addEventListener('animationend', (e) => {
        if (e.target === rowEl) rowEl.classList.remove('shake');
      });
      boardEl.appendChild(rowEl);
      rowEls.push(rowEl);
    }
  }

  const BACKSPACE_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>';

  function buildKeyboard() {
    const layout = [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['_', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '_'],
      ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
    ];
    for (const row of layout) {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      for (const key of row) {
        if (key === '_') {
          const spacer = document.createElement('div');
          spacer.className = 'kb-spacer';
          rowEl.appendChild(spacer);
          continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key';
        btn.dataset.key = key;
        if (key === 'enter') {
          btn.classList.add('wide');
          btn.textContent = 'Enter';
        } else if (key === 'back') {
          btn.classList.add('wide');
          btn.innerHTML = BACKSPACE_SVG;
          btn.setAttribute('aria-label', 'Backspace');
        } else {
          btn.textContent = key;
          keyEls[key] = btn;
        }
        btn.addEventListener('click', () => {
          btn.blur();
          handleKey(key);
        });
        rowEl.appendChild(btn);
      }
      keyboardEl.appendChild(rowEl);
    }
  }

  // ---------- Input ----------
  function handleKey(key) {
    if (state.busy || state.done) return;
    if (key === 'enter') {
      submit();
    } else if (key === 'back') {
      removeLetter();
    } else if (/^[a-z]$/.test(key)) {
      addLetter(key);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Enter') {
      e.preventDefault();
      handleKey('enter');
    } else if (k === 'Backspace') {
      e.preventDefault();
      handleKey('back');
    } else if (/^[a-zA-Z]$/.test(k)) {
      handleKey(k.toLowerCase());
    }
  });

  function addLetter(letter) {
    if (state.guess.length >= COLS) return;
    const tile = tiles[state.row][state.guess.length];
    tile.textContent = letter;
    tile.dataset.state = 'tbd';
    tile.classList.remove('pop');
    void tile.offsetWidth; // restart animation
    tile.classList.add('pop');
    state.guess += letter;
  }

  function removeLetter() {
    if (!state.guess.length) return;
    state.guess = state.guess.slice(0, -1);
    const tile = tiles[state.row][state.guess.length];
    tile.textContent = '';
    delete tile.dataset.state;
  }

  function clearRow(r) {
    for (const tile of tiles[r]) {
      tile.textContent = '';
      delete tile.dataset.state;
    }
  }

  // ---------- Game logic ----------
  function evaluate(guess, answer) {
    const result = new Array(COLS).fill('absent');
    const remaining = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === answer[i]) {
        result[i] = 'correct';
      } else {
        remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
      }
    }
    for (let i = 0; i < COLS; i++) {
      if (result[i] !== 'correct' && remaining[guess[i]] > 0) {
        result[i] = 'present';
        remaining[guess[i]]--;
      }
    }
    return result;
  }

  async function submit() {
    const rowEl = rowEls[state.row];

    if (state.guess.length < COLS) {
      shake(rowEl);
      toast('Not enough letters');
      return;
    }

    // Password gate: the first row only accepts the password.
    if (!state.unlocked && state.guess !== PASSWORD) {
      state.busy = true;
      shake(rowEl);
      toast('Wrong password');
      await wait(600);
      clearRow(state.row);
      state.guess = '';
      state.busy = false;
      return;
    }

    state.busy = true;
    const guess = state.guess;
    const result = evaluate(guess, ANSWER);
    state.results[state.row] = result;
    await reveal(state.row, result);
    updateKeyboard(guess, result);

    if (!state.unlocked) {
      state.unlocked = true;
      hintEl.classList.add('gone');
      for (const el of rowEls.slice(1)) el.classList.remove('locked');
    }

    if (guess === ANSWER) {
      await win(state.row);
      return;
    }

    if (state.row === ROWS - 1) {
      await outOfGuesses();
      return;
    }

    state.row++;
    state.guess = '';
    state.busy = false;
  }

  async function reveal(r, result) {
    tiles[r].forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add('flip');
        setTimeout(() => {
          tile.dataset.state = result[i];
        }, FLIP_MS / 2);
      }, i * STAGGER_MS);
    });
    await wait((COLS - 1) * STAGGER_MS + FLIP_MS);
  }

  function updateKeyboard(guess, result) {
    for (let i = 0; i < COLS; i++) {
      const btn = keyEls[guess[i]];
      if (!btn) continue;
      const current = btn.dataset.state;
      if (!current || RANK[result[i]] > RANK[current]) {
        btn.dataset.state = result[i];
      }
    }
  }

  async function win(r) {
    state.done = true;
    tiles[r].forEach((tile, i) => {
      setTimeout(() => tile.classList.add('bounce'), i * 100);
    });
    await wait((COLS - 1) * 100 + 600 + 700);
    victoryWordEl.textContent = ANSWER + '!';
    victoryEl.classList.add('show');
    victoryEl.setAttribute('aria-hidden', 'false');
    if (themeMeta) themeMeta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--victory').trim());
  }

  // Ran out of rows: keep the password row, clear the rest, and let her try again.
  async function outOfGuesses() {
    toast('So close! Try again', 2000);
    await wait(2200);
    for (let r = 1; r < ROWS; r++) {
      clearRow(r);
      state.results[r] = undefined;
    }
    for (const btn of Object.values(keyEls)) delete btn.dataset.state;
    updateKeyboard(PASSWORD, state.results[0]);
    state.row = 1;
    state.guess = '';
    state.busy = false;
  }

  // ---------- Feedback ----------
  function shake(rowEl) {
    rowEl.classList.remove('shake');
    void rowEl.offsetWidth;
    rowEl.classList.add('shake');
  }

  let toastTimer;
  function toast(message, ms = 1200) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  buildBoard();
  buildKeyboard();
})();
