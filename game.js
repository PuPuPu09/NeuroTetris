
(function () {
    'use strict';
  
    /* ============================================================
       Константы
       ============================================================ */
    const COLS = 10;
    const ROWS = 20;
    const BLOCK = 30;
  
    const SHAPES = {
      I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
      L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
      O: [[1, 1], [1, 1]],
      S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
      T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
      Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
    };
  
    const COLORS = {
      I: '#22d3ee',
      J: '#3b82f6',
      L: '#f59e0b',
      O: '#facc15',
      S: '#22c55e',
      T: '#a855f7',
      Z: '#ef4444'
    };
  
    const TYPE_KEYS = Object.keys(SHAPES);
  
    const DAS = 150; // задержка авто-повтора, мс
    const ARR = 45;  // скорость авто-повтора, мс
    const LINE_SCORE = [0, 100, 300, 500, 800];
  
    /* ============================================================
       DOM
       ============================================================ */
    const boardCanvas = document.getElementById('board');
    const bctx = boardCanvas.getContext('2d');
    const nextCanvas = document.getElementById('next');
    const nctx = nextCanvas.getContext('2d');
    const holdCanvas = document.getElementById('hold');
    const hctx = holdCanvas.getContext('2d');
  
    const scoreEl = document.getElementById('score');
    const levelEl = document.getElementById('level');
    const linesEl = document.getElementById('lines');
  
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayText = document.getElementById('overlay-text');
    const overlayBtn = document.getElementById('overlay-btn');
  
    /* ============================================================
       Состояние игры
       ============================================================ */
    let state = 'ready'; // ready | playing | paused | over
  
    let board = [];
    let bag = [];
    let current = null;
    let nextType = null;
    let holdType = null;
    let canHold = true;
  
    let score = 0;
    let lines = 0;
    let level = 1;
  
    let dropCounter = 0;
    let lastTime = 0;
  
    let moveDir = 0;
    let dasTimer = 0;
    let leftHeld = false;
    let rightHeld = false;
    let softDropping = false;
  
    /* ============================================================
       Утилиты рисования
       ============================================================ */
    function roundRect(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }
  
    function drawBlock(ctx, px, py, size, color, ghost) {
      if (ghost) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, px + 3, py + 3, size - 6, size - 6, 5);
        ctx.stroke();
        ctx.restore();
        return;
      }
  
      ctx.fillStyle = color;
      roundRect(ctx, px + 1, py + 1, size - 2, size - 2, Math.max(3, size * 0.16));
      ctx.fill();
  
      const grad = ctx.createLinearGradient(px, py, px, py + size);
      grad.addColorStop(0, 'rgba(255,255,255,0.38)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  
      ctx.fillStyle = grad;
      roundRect(ctx, px + 1, py + 1, size - 2, size - 2, Math.max(3, size * 0.16));
      ctx.fill();
    }
  
    function drawPreview(ctx, canvas, type) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!type) return;
  
      const m = SHAPES[type];
      let minR = m.length, maxR = -1, minC = m.length, maxC = -1;
  
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (m[r][c]) {
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
          }
        }
      }
      if (maxR < 0) return;
  
      const size = 22;
      const w = (maxC - minC + 1) * size;
      const h = (maxR - minR + 1) * size;
      const ox = (canvas.width - w) / 2;
      const oy = (canvas.height - h) / 2;
  
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (m[r][c]) {
            drawBlock(ctx, ox + (c - minC) * size, oy + (r - minR) * size, size, COLORS[type]);
          }
        }
      }
    }
  
    /* ============================================================
       Генерация фигур (7-bag)
       ============================================================ */
    function refillBag() {
      bag = TYPE_KEYS.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
    }
  
    function popType() {
      if (bag.length === 0) refillBag();
      return bag.pop();
    }
  
    function spawnPiece(type) {
      const matrix = SHAPES[type].map(function (row) { return row.slice(); });
      let firstRow = 0;
      for (let r = 0; r < matrix.length; r++) {
        if (matrix[r].some(function (v) { return v; })) { firstRow = r; break; }
      }
      return {
        type: type,
        matrix: matrix,
        x: Math.floor((COLS - matrix[0].length) / 2),
        y: -firstRow
      };
    }
  
    /* ============================================================
       Коллизии и движение
       ============================================================ */
    function collide(piece) {
      const m = piece.matrix;
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const bx = piece.x + c;
          const by = piece.y + r;
          if (bx < 0 || bx >= COLS || by >= ROWS) return true;
          if (by >= 0 && board[by][bx]) return true;
        }
      }
      return false;
    }
  
    function move(dx) {
      if (!current) return false;
      current.x += dx;
      if (collide(current)) {
        current.x -= dx;
        return false;
      }
      return true;
    }
  
    function rotateMatrix(m, dir) {
      const n = m.length;
      const res = [];
      for (let r = 0; r < n; r++) {
        res.push([]);
        for (let c = 0; c < n; c++) {
          res[r].push(dir > 0 ? m[n - 1 - c][r] : m[c][n - 1 - r]);
        }
      }
      return res;
    }
  
    function rotate(dir) {
      if (!current) return;
      const rotated = rotateMatrix(current.matrix, dir);
      const kicks = [
        [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0],
        [0, -1], [-1, -1], [1, -1], [0, 1]
      ];
  
      for (let i = 0; i < kicks.length; i++) {
        const test = {
          type: current.type,
          matrix: rotated,
          x: current.x + kicks[i][0],
          y: current.y + kicks[i][1]
        };
        if (!collide(test)) {
          current = test;
          return;
        }
      }
    }
  
    function ghostY() {
      let y = current.y;
      while (!collide({ type: current.type, matrix: current.matrix, x: current.x, y: y + 1 })) {
        y++;
      }
      return y;
    }
  
    /* ============================================================
       Логика падения / фиксации / линий
       ============================================================ */
    function dropSpeed() {
      return Math.max(1000 - (level - 1) * 80, 80);
    }
  
    function stepDown() {
      current.y++;
      if (collide(current)) {
        current.y--;
        lockPiece();
        return;
      }
      if (softDropping) {
        score += 1;
        updateHUD();
      }
    }
  
    function lockPiece() {
      for (let r = 0; r < current.matrix.length; r++) {
        for (let c = 0; c < current.matrix[r].length; c++) {
          if (!current.matrix[r][c]) continue;
          const by = current.y + r;
          const bx = current.x + c;
          if (by >= 0) board[by][bx] = current.type;
        }
      }
  
      clearLines();
      spawnNext();
    }
  
    function clearLines() {
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        let full = true;
        for (let c = 0; c < COLS; c++) {
          if (!board[r][c]) { full = false; break; }
        }
        if (full) {
          board.splice(r, 1);
          board.unshift(new Array(COLS).fill(null));
          cleared++;
          r++;
        }
      }
  
      if (cleared > 0) {
        lines += cleared;
        score += LINE_SCORE[cleared] * level;
        level = Math.floor(lines / 10) + 1;
        updateHUD();
      }
    }
  
    function spawnNext() {
      current = spawnPiece(nextType);
      nextType = popType();
      canHold = true;
      dropCounter = 0;
      drawPreview(nctx, nextCanvas, nextType);
  
      if (collide(current)) {
        endGame();
      }
    }
  
    function hardDrop() {
      if (!current) return;
      while (true) {
        current.y++;
        if (collide(current)) { current.y--; break; }
        score += 2;
      }
      updateHUD();
      dropCounter = 0;
      lockPiece();
    }
  
    function holdPiece() {
      if (!canHold || !current) return;
  
      const currentType = current.type;
  
      if (holdType) {
        current = spawnPiece(holdType);
        if (collide(current)) { endGame(); return; }
      } else {
        current = spawnPiece(nextType);
        nextType = popType();
        drawPreview(nctx, nextCanvas, nextType);
        if (collide(current)) { endGame(); return; }
      }
  
      holdType = currentType;
      canHold = false;
      dropCounter = 0;
      drawPreview(hctx, holdCanvas, holdType);
    }
  
    /* ============================================================
       HUD / оверлей
       ============================================================ */
    function updateHUD() {
      scoreEl.textContent = score.toLocaleString('ru-RU');
      levelEl.textContent = level;
      linesEl.textContent = lines;
    }
  
    function setOverlay(title, text, btn, visible) {
      overlayTitle.textContent = title;
      overlayText.textContent = text;
      if (btn) {
        overlayBtn.textContent = btn;
        overlayBtn.style.display = '';
      } else {
        overlayBtn.style.display = 'none';
      }
      overlay.classList.toggle('hidden', !visible);
    }
  
    /* ============================================================
       Старт / пауза / конец
       ============================================================ */
    function resetGame() {
      board = [];
      for (let r = 0; r < ROWS; r++) {
        board.push(new Array(COLS).fill(null));
      }
  
      bag = [];
      refillBag();
  
      score = 0;
      lines = 0;
      level = 1;
      holdType = null;
      canHold = true;
      dropCounter = 0;
      dasTimer = -DAS;
      moveDir = 0;
      leftHeld = false;
      rightHeld = false;
      softDropping = false;
      current = null;
  
      nextType = popType();
      current = spawnPiece(nextType);
      nextType = popType();
  
      drawPreview(nctx, nextCanvas, nextType);
      drawPreview(hctx, holdCanvas, null);
      updateHUD();
    }
  
    function startGame() {
      resetGame();
      state = 'playing';
      setOverlay('', '', '', false);
      overlayBtn.blur();
    }
  
    function togglePause() {
      if (state === 'playing') {
        state = 'paused';
        setOverlay('Пауза', 'Нажмите P, чтобы продолжить', 'Продолжить', true);
      } else if (state === 'paused') {
        state = 'playing';
        setOverlay('', '', '', false);
        overlayBtn.blur();
      }
    }
  
    function endGame() {
      state = 'over';
      setOverlay('Игра окончена', 'Ваш счёт: ' + score.toLocaleString('ru-RU'), 'Заново', true);
    }
  
    /* ============================================================
       Отрисовка поля
       ============================================================ */
    function drawGrid() {
      bctx.strokeStyle = 'rgba(255,255,255,0.05)';
      bctx.lineWidth = 1;
      for (let x = 1; x < COLS; x++) {
        bctx.beginPath();
        bctx.moveTo(x * BLOCK + 0.5, 0);
        bctx.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
        bctx.stroke();
      }
      for (let y = 1; y < ROWS; y++) {
        bctx.beginPath();
        bctx.moveTo(0, y * BLOCK + 0.5);
        bctx.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
        bctx.stroke();
      }
    }
  
    function draw() {
      const W = COLS * BLOCK;
      const H = ROWS * BLOCK;
  
      const bg = bctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0d1226');
      bg.addColorStop(1, '#070a16');
      bctx.fillStyle = bg;
      bctx.fillRect(0, 0, W, H);
  
      drawGrid();
  
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c]) {
            drawBlock(bctx, c * BLOCK, r * BLOCK, BLOCK, COLORS[board[r][c]]);
          }
        }
      }
  
      if (current && state !== 'over') {
        const gy = ghostY();
  
        for (let r = 0; r < current.matrix.length; r++) {
          for (let c = 0; c < current.matrix[r].length; c++) {
            if (!current.matrix[r][c]) continue;
            const by = gy + r;
            if (by < 0) continue;
            drawBlock(bctx, (current.x + c) * BLOCK, by * BLOCK, BLOCK, COLORS[current.type], true);
          }
        }
  
        for (let r = 0; r < current.matrix.length; r++) {
          for (let c = 0; c < current.matrix[r].length; c++) {
            if (!current.matrix[r][c]) continue;
            const by = current.y + r;
            if (by < 0) continue;
            drawBlock(bctx, (current.x + c) * BLOCK, by * BLOCK, BLOCK, COLORS[current.type]);
          }
        }
      }
    }
  
    /* ============================================================
       Игровой цикл
       ============================================================ */
    function update(dt) {
      // авто-повтор горизонтального движения
      if (moveDir !== 0) {
        dasTimer += dt;
        let guard = 0;
        while (dasTimer >= 0 && guard < 6) {
          move(moveDir);
          dasTimer -= ARR;
          guard++;
        }
      }
  
      const speed = softDropping ? Math.min(50, dropSpeed()) : dropSpeed();
      dropCounter += dt;
  
      if (dropCounter >= speed) {
        dropCounter -= speed;
        stepDown();
      }
    }
  
    function loop(time) {
      const dt = Math.min(time - lastTime, 100) || 0;
      lastTime = time;
  
      if (state === 'playing') update(dt);
  
      draw();
      requestAnimationFrame(loop);
    }
  
    /* ============================================================
       Управление
       ============================================================ */
    const PREVENT = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Spacebar'];
  
    document.addEventListener('keydown', function (e) {
      if (PREVENT.indexOf(e.key) !== -1) e.preventDefault();
  
      if (e.key === 'Enter') {
        if (state === 'ready' || state === 'over') startGame();
        return;
      }
  
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        togglePause();
        return;
      }
  
      if (state !== 'playing') return;
      if (e.repeat) return;
  
      switch (e.key) {
        case 'ArrowLeft':
          leftHeld = true;
          moveDir = -1;
          dasTimer = -DAS;
          move(-1);
          break;
  
        case 'ArrowRight':
          rightHeld = true;
          moveDir = 1;
          dasTimer = -DAS;
          move(1);
          break;
  
        case 'ArrowDown':
          softDropping = true;
          break;
  
        case 'ArrowUp':
        case 'x':
        case 'X':
          rotate(1);
          break;
  
        case 'z':
        case 'Z':
          rotate(-1);
          break;
  
        case ' ':
          hardDrop();
          break;
  
        case 'c':
        case 'C':
          holdPiece();
          break;
      }
    });
  
    document.addEventListener('keyup', function (e) {
      switch (e.key) {
        case 'ArrowLeft':
          leftHeld = false;
          if (rightHeld) { moveDir = 1; dasTimer = -DAS; }
          else moveDir = 0;
          break;
  
        case 'ArrowRight':
          rightHeld = false;
          if (leftHeld) { moveDir = -1; dasTimer = -DAS; }
          else moveDir = 0;
          break;
  
        case 'ArrowDown':
          softDropping = false;
          break;
      }
    });
  
    overlayBtn.addEventListener('click', function () {
      if (state === 'paused') {
        togglePause();
      } else {
        startGame();
      }
    });
  
    /* ============================================================
       Инициализация
       ============================================================ */
    resetGame();
    drawPreview(hctx, holdCanvas, null);
    setOverlay('Тетрис', 'Стрелки — движение, вверх — поворот, пробел — сброс', 'Играть', true);
    requestAnimationFrame(loop);
  })();
