const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Sudoku">
  <meta name="theme-color" content="#0f172a">
  <meta name="format-detection" content="telephone=no">
  <title>Sudoku Cloudflare Worker</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #111827;
      --panel-soft: #1f2937;
      --line: #334155;
      --line-strong: #64748b;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --primary: #16a34a;
      --warn: #991b1b;
      --cell-size: clamp(40px, 8.8vmin, 64px);
    }

    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    html,
    body {
      width: 100%;
      min-height: 100%;
      margin: 0;
    }

    body {
      min-height: 100dvh;
      background:
        radial-gradient(circle at 12% 10%, #1e293b 0%, transparent 32%),
        radial-gradient(circle at 85% 86%, #1e1b4b 0%, transparent 28%),
        var(--bg);
      color: var(--text);
      font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: max(12px, env(safe-area-inset-top));
      padding-right: max(12px, env(safe-area-inset-right));
      padding-bottom: max(16px, env(safe-area-inset-bottom));
      padding-left: max(12px, env(safe-area-inset-left));
      -webkit-text-size-adjust: 100%;
      overscroll-behavior: none;
      touch-action: manipulation;
    }

    .app {
      width: min(920px, 100%);
      background: #0b1220;
      border: 1px solid #223047;
      border-radius: 18px;
      padding: 16px;
      box-shadow:
        0 16px 44px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.03);
      display: grid;
      gap: 14px;
    }

    .title-wrap h1 {
      margin: 0;
      font-size: clamp(26px, 3.6vw, 36px);
      line-height: 1.1;
      letter-spacing: 0.2px;
    }

    .title-wrap p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.35;
    }

    .controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
      align-items: end;
    }

    .difficulty-wrap {
      display: grid;
      gap: 6px;
    }

    .difficulty-wrap label {
      color: var(--muted);
      font-size: 13px;
      line-height: 1;
    }

    button,
    select {
      min-height: 46px;
      border-radius: 12px;
      border: 1px solid #334155;
      background: var(--panel-soft);
      color: var(--text);
      font-size: 16px;
      padding: 10px 12px;
      touch-action: manipulation;
      cursor: pointer;
    }

    button:active,
    select:active {
      transform: scale(0.985);
    }

    .primary {
      background: #14532d;
      border-color: #166534;
    }

    .warn {
      background: #3f1d1d;
      border-color: #7f1d1d;
    }

    .status {
      background: #091121;
      border: 1px solid #1f2b41;
      border-radius: 12px;
      padding: 10px 12px;
      display: grid;
      gap: 6px;
    }

    .status-top {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      color: var(--muted);
      font-size: 14px;
    }

    #message {
      min-height: 21px;
      margin: 0;
      font-size: 14px;
      line-height: 1.35;
      color: #cbd5e1;
    }

    #message[data-tone="success"] {
      color: #86efac;
    }

    #message[data-tone="error"] {
      color: #fca5a5;
    }

    #message[data-tone="info"] {
      color: #7dd3fc;
    }

    .board-wrap {
      display: grid;
      place-content: center;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }

    .board {
      display: grid;
      grid-template-columns: repeat(9, var(--cell-size));
      grid-template-rows: repeat(9, var(--cell-size));
      border: 2px solid var(--line-strong);
      border-radius: 10px;
      overflow: hidden;
      background: #0a1323;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }

    .cell {
      width: var(--cell-size);
      height: var(--cell-size);
      padding: 0;
      border-radius: 0;
      border: 1px solid var(--line);
      background: #111827;
      color: #dbeafe;
      font-size: clamp(20px, 3.6vmin, 30px);
      font-weight: 700;
      display: grid;
      place-items: center;
      line-height: 1;
    }

    .cell.fixed {
      color: #ffffff;
      background: #1f2937;
    }

    .cell.empty {
      color: transparent;
    }

    .cell.selected {
      background: #1d4ed8;
      color: #ffffff;
      box-shadow: inset 0 0 0 1px #93c5fd;
    }

    .cell.related {
      background: #1e293b;
    }

    .cell.same-value {
      background: #10243a;
      color: #93c5fd;
    }

    .cell.hinted {
      color: #7dd3fc;
    }

    .cell.error {
      background: #7f1d1d;
      color: #fee2e2;
    }

    .box-top {
      border-top-width: 2px;
      border-top-color: var(--line-strong);
    }

    .box-left {
      border-left-width: 2px;
      border-left-color: var(--line-strong);
    }

    .box-right {
      border-right-width: 2px;
      border-right-color: var(--line-strong);
    }

    .box-bottom {
      border-bottom-width: 2px;
      border-bottom-color: var(--line-strong);
    }

    .number-pad {
      display: grid;
      grid-template-columns: repeat(5, minmax(52px, 1fr));
      gap: 8px;
    }

    .number-pad button {
      min-height: 52px;
      font-size: clamp(18px, 3.2vmin, 24px);
      font-weight: 700;
      padding: 8px 0;
    }

    .number-pad button[data-value="0"] {
      grid-column: span 2;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    .hint {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }

    @media (min-width: 820px) {
      .app {
        padding: 18px;
      }
    }

    @media (max-width: 560px) {
      .controls {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }

      .difficulty-wrap {
        grid-column: span 2;
      }

      .number-pad {
        grid-template-columns: repeat(5, minmax(44px, 1fr));
      }
    }
  </style>
</head>
<body>
  <main class="app" aria-label="Sudoku game">
    <header class="title-wrap">
      <h1>Sudoku</h1>
      <p>Cloudflare Worker edition with iPad-friendly touch controls.</p>
    </header>

    <section class="controls">
      <div class="difficulty-wrap">
        <label for="difficulty">Difficulty</label>
        <select id="difficulty">
          <option value="easy">Easy</option>
          <option value="medium" selected>Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <button id="newGame" class="primary" type="button">New Game</button>
      <button id="resetBoard" type="button">Reset</button>
      <button id="checkBoard" type="button">Check</button>
      <button id="hintCell" type="button">Hint</button>
      <button id="solveBoard" class="warn" type="button">Solve</button>
    </section>

    <section class="status" aria-live="polite">
      <div class="status-top">
        <span>Time: <strong id="timer">00:00</strong></span>
        <span>Mistakes: <strong id="mistakes">0/3</strong></span>
      </div>
      <p id="message" data-tone="info">Generating puzzle...</p>
    </section>

    <section class="board-wrap">
      <div id="board" class="board" role="grid" aria-label="9 by 9 Sudoku board"></div>
    </section>

    <section class="number-pad" id="numberPad" aria-label="Number pad">
      <button type="button" data-value="1">1</button>
      <button type="button" data-value="2">2</button>
      <button type="button" data-value="3">3</button>
      <button type="button" data-value="4">4</button>
      <button type="button" data-value="5">5</button>
      <button type="button" data-value="6">6</button>
      <button type="button" data-value="7">7</button>
      <button type="button" data-value="8">8</button>
      <button type="button" data-value="9">9</button>
      <button type="button" data-value="0">Clear Cell</button>
    </section>

    <p class="hint">
      Controls: tap a cell then enter 1-9. Backspace/Delete clears. Arrow keys move selection.
      Three mistakes ends the round.
    </p>
  </main>

  <script>
    (function () {
      "use strict";

      var BOARD_SIZE = 9;
      var SUBGRID_SIZE = 3;
      var CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
      var MAX_MISTAKES = 3;
      var TAP_EVENT = window.PointerEvent ? "pointerup" : "click";

      var DIFFICULTIES = {
        easy: { label: "Easy", removals: 40 },
        medium: { label: "Medium", removals: 48 },
        hard: { label: "Hard", removals: 54 }
      };

      var boardElement = document.getElementById("board");
      var difficultySelect = document.getElementById("difficulty");
      var timerElement = document.getElementById("timer");
      var mistakesElement = document.getElementById("mistakes");
      var messageElement = document.getElementById("message");
      var numberPad = document.getElementById("numberPad");
      var cellElements = [];

      var state = {
        initialPuzzle: [],
        board: [],
        solution: [],
        fixedCells: new Set(),
        hintedCells: new Set(),
        errorCells: new Set(),
        selectedIndex: null,
        mistakes: 0,
        elapsedSeconds: 0,
        timerId: 0,
        status: "idle"
      };

      function toIndex(row, col) {
        return row * BOARD_SIZE + col;
      }

      function indexToRow(index) {
        return Math.floor(index / BOARD_SIZE);
      }

      function indexToCol(index) {
        return index % BOARD_SIZE;
      }

      function shuffle(array) {
        var i;
        for (i = array.length - 1; i > 0; i -= 1) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = array[i];
          array[i] = array[j];
          array[j] = tmp;
        }
        return array;
      }

      function getCandidates(board, index) {
        if (board[index] !== 0) return [];

        var row = indexToRow(index);
        var col = indexToCol(index);
        var used = new Set();
        var i;

        for (i = 0; i < BOARD_SIZE; i += 1) {
          var rowValue = board[toIndex(row, i)];
          if (rowValue !== 0) used.add(rowValue);
        }

        for (i = 0; i < BOARD_SIZE; i += 1) {
          var colValue = board[toIndex(i, col)];
          if (colValue !== 0) used.add(colValue);
        }

        var boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE;
        var boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE;
        var r;
        var c;
        for (r = boxRow; r < boxRow + SUBGRID_SIZE; r += 1) {
          for (c = boxCol; c < boxCol + SUBGRID_SIZE; c += 1) {
            var boxValue = board[toIndex(r, c)];
            if (boxValue !== 0) used.add(boxValue);
          }
        }

        var candidates = [];
        for (i = 1; i <= 9; i += 1) {
          if (!used.has(i)) candidates.push(i);
        }
        return candidates;
      }

      function findBestCell(board) {
        var bestIndex = -1;
        var bestCandidates = null;
        var index;

        for (index = 0; index < CELL_COUNT; index += 1) {
          if (board[index] !== 0) continue;
          var candidates = getCandidates(board, index);
          if (candidates.length === 0) return { index: index, candidates: candidates };
          if (bestIndex === -1 || candidates.length < bestCandidates.length) {
            bestIndex = index;
            bestCandidates = candidates;
            if (candidates.length === 1) break;
          }
        }

        if (bestIndex === -1) return { index: -1, candidates: [] };
        return { index: bestIndex, candidates: bestCandidates };
      }

      function solveSudoku(board, randomize) {
        var node = findBestCell(board);
        if (node.index === -1) return true;
        if (node.candidates.length === 0) return false;

        var choices = randomize ? shuffle(node.candidates.slice()) : node.candidates;
        var i;
        for (i = 0; i < choices.length; i += 1) {
          board[node.index] = choices[i];
          if (solveSudoku(board, randomize)) return true;
        }
        board[node.index] = 0;
        return false;
      }

      function countSolutions(board, limit) {
        var found = 0;

        function search() {
          if (found >= limit) return;
          var node = findBestCell(board);
          if (node.index === -1) {
            found += 1;
            return;
          }
          if (node.candidates.length === 0) return;

          var i;
          for (i = 0; i < node.candidates.length; i += 1) {
            board[node.index] = node.candidates[i];
            search();
            if (found >= limit) break;
          }
          board[node.index] = 0;
        }

        search();
        return found;
      }

      function generateSolvedBoard() {
        var solved = new Array(CELL_COUNT).fill(0);
        solveSudoku(solved, true);
        return solved;
      }

      function generatePuzzle(difficultyKey) {
        var targetRemovals = DIFFICULTIES[difficultyKey].removals;
        var bestResult = null;
        var attempt;

        for (attempt = 0; attempt < 6; attempt += 1) {
          var solution = generateSolvedBoard();
          var puzzle = solution.slice();
          var positions = [];
          var i;
          for (i = 0; i < CELL_COUNT; i += 1) positions.push(i);
          shuffle(positions);

          var removed = 0;
          for (i = 0; i < positions.length; i += 1) {
            if (removed >= targetRemovals) break;
            var index = positions[i];
            var backup = puzzle[index];
            puzzle[index] = 0;

            var testBoard = puzzle.slice();
            if (countSolutions(testBoard, 2) !== 1) {
              puzzle[index] = backup;
              continue;
            }
            removed += 1;
          }

          if (!bestResult || removed > bestResult.removed) {
            bestResult = {
              puzzle: puzzle.slice(),
              solution: solution.slice(),
              removed: removed
            };
          }

          if (removed >= targetRemovals) break;
        }

        return bestResult;
      }

      function formatTime(totalSeconds) {
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
      }

      function setMessage(text, tone) {
        messageElement.textContent = text;
        messageElement.dataset.tone = tone || "info";
      }

      function updateStatusBar() {
        timerElement.textContent = formatTime(state.elapsedSeconds);
        mistakesElement.textContent = String(state.mistakes) + "/" + String(MAX_MISTAKES);
      }

      function stopTimer() {
        if (state.timerId) {
          window.clearInterval(state.timerId);
          state.timerId = 0;
        }
      }

      function startTimer() {
        stopTimer();
        state.timerId = window.setInterval(function () {
          if (state.status !== "playing") return;
          state.elapsedSeconds += 1;
          updateStatusBar();
        }, 1000);
      }

      function firstEditableIndex() {
        var index;
        for (index = 0; index < CELL_COUNT; index += 1) {
          if (!state.fixedCells.has(index)) return index;
        }
        return null;
      }

      function isRelated(index, selectedIndex) {
        if (selectedIndex === null || index === selectedIndex) return false;
        var row = indexToRow(index);
        var col = indexToCol(index);
        var selectedRow = indexToRow(selectedIndex);
        var selectedCol = indexToCol(selectedIndex);

        var sameRow = row === selectedRow;
        var sameCol = col === selectedCol;
        var sameBox =
          Math.floor(row / 3) === Math.floor(selectedRow / 3) &&
          Math.floor(col / 3) === Math.floor(selectedCol / 3);

        return sameRow || sameCol || sameBox;
      }

      function createBoardUI() {
        boardElement.innerHTML = "";
        cellElements.length = 0;

        var index;
        for (index = 0; index < CELL_COUNT; index += 1) {
          var row = indexToRow(index);
          var col = indexToCol(index);
          var cell = document.createElement("button");
          cell.type = "button";
          cell.className = "cell";
          cell.setAttribute("role", "gridcell");
          cell.setAttribute("aria-label", "Row " + String(row + 1) + " Column " + String(col + 1));
          cell.dataset.index = String(index);

          if (row % 3 === 0) cell.classList.add("box-top");
          if ((row + 1) % 3 === 0) cell.classList.add("box-bottom");
          if (col % 3 === 0) cell.classList.add("box-left");
          if ((col + 1) % 3 === 0) cell.classList.add("box-right");

          cell.addEventListener(TAP_EVENT, function (event) {
            event.preventDefault();
            state.selectedIndex = Number(this.dataset.index);
            renderBoard();
          }, { passive: false });

          cellElements.push(cell);
          boardElement.appendChild(cell);
        }
      }

      function renderBoard() {
        var selectedIndex = state.selectedIndex;
        var selectedValue = selectedIndex === null ? 0 : state.board[selectedIndex];
        var index;

        for (index = 0; index < CELL_COUNT; index += 1) {
          var cell = cellElements[index];
          var value = state.board[index];
          var fixed = state.fixedCells.has(index);

          cell.textContent = value === 0 ? "" : String(value);
          cell.classList.toggle("empty", value === 0);
          cell.classList.toggle("fixed", fixed);
          cell.classList.toggle("selected", index === selectedIndex);
          cell.classList.toggle("related", isRelated(index, selectedIndex));
          cell.classList.toggle("same-value", selectedValue !== 0 && value === selectedValue && index !== selectedIndex);
          cell.classList.toggle("hinted", state.hintedCells.has(index));
          cell.classList.toggle("error", state.errorCells.has(index));
        }

        updateStatusBar();
      }

      function isSolved() {
        var i;
        for (i = 0; i < CELL_COUNT; i += 1) {
          if (state.board[i] !== state.solution[i]) return false;
        }
        return true;
      }

      function loseGame() {
        state.status = "lost";
        stopTimer();
        setMessage("Game over: no attempts left. Start a new game or reveal solution.", "error");
        renderBoard();
      }

      function winGame() {
        state.status = "won";
        stopTimer();
        setMessage("Solved in " + formatTime(state.elapsedSeconds) + ". Great job!", "success");
        renderBoard();
      }

      function clearCell(index) {
        if (index === null || state.status !== "playing" || state.fixedCells.has(index)) return;
        state.board[index] = 0;
        state.hintedCells.delete(index);
        state.errorCells.delete(index);
        renderBoard();
      }

      function placeValue(index, value) {
        if (index === null || state.status !== "playing" || state.fixedCells.has(index)) return;
        if (value < 1 || value > 9) return;

        state.board[index] = value;
        state.hintedCells.delete(index);

        if (value !== state.solution[index]) {
          state.mistakes += 1;
          state.errorCells.add(index);
          renderBoard();

          var snapshot = value;
          window.setTimeout(function () {
            if (state.board[index] === snapshot) state.board[index] = 0;
            state.errorCells.delete(index);
            renderBoard();
          }, 420);

          if (state.mistakes >= MAX_MISTAKES) {
            loseGame();
          } else {
            setMessage("Incorrect value. Remaining attempts: " + String(MAX_MISTAKES - state.mistakes) + ".", "error");
          }
          renderBoard();
          return;
        }

        state.errorCells.delete(index);
        if (isSolved()) {
          winGame();
        } else {
          setMessage("Good move.", "success");
          renderBoard();
        }
      }

      function moveSelection(rowOffset, colOffset) {
        if (state.selectedIndex === null) return;
        var currentRow = indexToRow(state.selectedIndex);
        var currentCol = indexToCol(state.selectedIndex);
        var nextRow = (currentRow + rowOffset + BOARD_SIZE) % BOARD_SIZE;
        var nextCol = (currentCol + colOffset + BOARD_SIZE) % BOARD_SIZE;
        state.selectedIndex = toIndex(nextRow, nextCol);
        renderBoard();
      }

      function highlightWrongCells(indices) {
        var i;
        for (i = 0; i < indices.length; i += 1) state.errorCells.add(indices[i]);
        renderBoard();

        window.setTimeout(function () {
          for (i = 0; i < indices.length; i += 1) state.errorCells.delete(indices[i]);
          renderBoard();
        }, 700);
      }

      function checkCurrentBoard() {
        if (state.status !== "playing") return;

        var wrongIndices = [];
        var index;
        for (index = 0; index < CELL_COUNT; index += 1) {
          var value = state.board[index];
          if (value !== 0 && value !== state.solution[index]) wrongIndices.push(index);
        }

        if (wrongIndices.length > 0) {
          highlightWrongCells(wrongIndices);
          setMessage(String(wrongIndices.length) + " incorrect cell(s) highlighted.", "error");
          return;
        }

        if (state.board.indexOf(0) !== -1) {
          setMessage("No incorrect values found so far.", "info");
          return;
        }

        winGame();
      }

      function hintOneCell() {
        if (state.status !== "playing") return;

        var target = null;
        if (
          state.selectedIndex !== null &&
          !state.fixedCells.has(state.selectedIndex) &&
          state.board[state.selectedIndex] === 0
        ) {
          target = state.selectedIndex;
        } else {
          var empties = [];
          var i;
          for (i = 0; i < CELL_COUNT; i += 1) {
            if (!state.fixedCells.has(i) && state.board[i] === 0) empties.push(i);
          }
          if (empties.length === 0) {
            setMessage("No empty cells left for a hint.", "info");
            return;
          }
          target = empties[Math.floor(Math.random() * empties.length)];
        }

        state.board[target] = state.solution[target];
        state.hintedCells.add(target);
        state.errorCells.delete(target);
        state.selectedIndex = target;

        if (isSolved()) {
          winGame();
        } else {
          setMessage("Hint applied to one cell.", "info");
          renderBoard();
        }
      }

      function solveCurrentPuzzle() {
        if (state.solution.length === 0) return;
        state.board = state.solution.slice();
        state.status = "solved";
        state.selectedIndex = null;
        state.errorCells.clear();
        stopTimer();
        setMessage("Solution revealed. Start a new game for another puzzle.", "info");
        renderBoard();
      }

      function resetCurrentPuzzle() {
        if (state.initialPuzzle.length === 0) return;
        state.board = state.initialPuzzle.slice();
        state.hintedCells.clear();
        state.errorCells.clear();
        state.mistakes = 0;
        state.elapsedSeconds = 0;
        state.status = "playing";
        state.selectedIndex = firstEditableIndex();
        startTimer();
        setMessage("Board reset.", "info");
        renderBoard();
      }

      function startNewGame() {
        stopTimer();
        setMessage("Generating puzzle...", "info");

        window.setTimeout(function () {
          var difficultyKey = difficultySelect.value;
          var generated = generatePuzzle(difficultyKey);

          state.initialPuzzle = generated.puzzle.slice();
          state.board = generated.puzzle.slice();
          state.solution = generated.solution.slice();
          state.fixedCells = new Set();
          state.hintedCells.clear();
          state.errorCells.clear();
          state.mistakes = 0;
          state.elapsedSeconds = 0;
          state.status = "playing";

          var index;
          for (index = 0; index < CELL_COUNT; index += 1) {
            if (state.initialPuzzle[index] !== 0) state.fixedCells.add(index);
          }

          state.selectedIndex = firstEditableIndex();
          startTimer();
          setMessage(DIFFICULTIES[difficultyKey].label + " puzzle ready. Fill all cells without exceeding 3 mistakes.", "info");
          renderBoard();
        }, 24);
      }

      function onKeyDown(event) {
        var activeTag = document.activeElement ? document.activeElement.tagName : "";
        if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;

        if (state.selectedIndex === null) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (event.key >= "1" && event.key <= "9") {
          event.preventDefault();
          placeValue(state.selectedIndex, Number(event.key));
          return;
        }

        switch (event.key) {
          case "Backspace":
          case "Delete":
          case "0":
            event.preventDefault();
            clearCell(state.selectedIndex);
            break;
          case "ArrowUp":
            event.preventDefault();
            moveSelection(-1, 0);
            break;
          case "ArrowDown":
            event.preventDefault();
            moveSelection(1, 0);
            break;
          case "ArrowLeft":
            event.preventDefault();
            moveSelection(0, -1);
            break;
          case "ArrowRight":
            event.preventDefault();
            moveSelection(0, 1);
            break;
          default:
            break;
        }
      }

      function onPadInput(event) {
        var target = event.target.closest("button[data-value]");
        if (!target) return;
        event.preventDefault();
        if (state.selectedIndex === null) return;

        var value = Number(target.dataset.value);
        if (value === 0) {
          clearCell(state.selectedIndex);
        } else {
          placeValue(state.selectedIndex, value);
        }
      }

      document.getElementById("newGame").addEventListener(TAP_EVENT, function (event) {
        event.preventDefault();
        startNewGame();
      }, { passive: false });
      document.getElementById("resetBoard").addEventListener(TAP_EVENT, function (event) {
        event.preventDefault();
        resetCurrentPuzzle();
      }, { passive: false });
      document.getElementById("checkBoard").addEventListener(TAP_EVENT, function (event) {
        event.preventDefault();
        checkCurrentBoard();
      }, { passive: false });
      document.getElementById("hintCell").addEventListener(TAP_EVENT, function (event) {
        event.preventDefault();
        hintOneCell();
      }, { passive: false });
      document.getElementById("solveBoard").addEventListener(TAP_EVENT, function (event) {
        event.preventDefault();
        solveCurrentPuzzle();
      }, { passive: false });

      numberPad.addEventListener(TAP_EVENT, onPadInput, { passive: false });
      document.addEventListener("keydown", onKeyDown, { passive: false });

      var lastTouchEnd = 0;
      document.addEventListener("touchend", function (event) {
        var now = Date.now();
        if (now - lastTouchEnd <= 320) event.preventDefault();
        lastTouchEnd = now;
      }, { passive: false });

      createBoardUI();
      startNewGame();
    })();
  </script>
</body>
</html>
`;

const HTML_HEADERS = {
  "content-type": "text/html; charset=UTF-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/health") {
      return new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain; charset=UTF-8" }
      });
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }

    return new Response(HTML, {
      status: 200,
      headers: HTML_HEADERS
    });
  }
};
