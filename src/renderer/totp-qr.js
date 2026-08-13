(() => {
  'use strict';

  // A bounded QR Version 10-L byte-mode encoder used only for the temporary
  // on-screen TOTP pairing reveal. It has no network, storage, image import,
  // clipboard, or filesystem behavior. Canvas pixels are cleared by renderer.js
  // when a reveal expires or is cancelled.

  const QR_VERSION = 10;
  const QR_SIZE = QR_VERSION * 4 + 17;
  const QR_MAX_UTF8_BYTES = 271;

  function makeGaloisTables() {
    const exponent = new Uint8Array(512);
    const logarithm = new Uint8Array(256);
    let value = 1;
    for (let index = 0; index < 255; index += 1) {
      exponent[index] = value;
      logarithm[value] = index;
      value <<= 1;
      if (value & 0x100) value ^= 0x11d;
    }
    for (let index = 255; index < exponent.length; index += 1) exponent[index] = exponent[index - 255];
    return { exponent, logarithm };
  }

  const GF = makeGaloisTables();

  function multiply(left, right) {
    if (left === 0 || right === 0) return 0;
    return GF.exponent[GF.logarithm[left] + GF.logarithm[right]];
  }

  function polynomialMultiply(left, right) {
    const result = new Uint8Array(left.length + right.length - 1);
    for (let a = 0; a < left.length; a += 1) {
      for (let b = 0; b < right.length; b += 1) result[a + b] ^= multiply(left[a], right[b]);
    }
    return result;
  }

  function errorCorrection(data, degree) {
    let generator = new Uint8Array([1]);
    for (let index = 0; index < degree; index += 1) generator = polynomialMultiply(generator, new Uint8Array([1, GF.exponent[index]]));
    const remainder = new Uint8Array(degree);
    for (const byte of data) {
      const factor = byte ^ remainder[0];
      remainder.copyWithin(0, 1);
      remainder[degree - 1] = 0;
      for (let index = 0; index < degree; index += 1) remainder[index] ^= multiply(generator[index + 1], factor);
    }
    return remainder;
  }

  function codewords(payload) {
    const bytes = new TextEncoder().encode(payload);
    if (bytes.length > QR_MAX_UTF8_BYTES) throw new Error('This pairing URI is too long for the bundled local QR encoder. Use the manual Base32 reveal instead.');
    const bits = [];
    const append = (value, count) => {
      for (let offset = count - 1; offset >= 0; offset -= 1) bits.push((value >>> offset) & 1);
    };
    append(0b0100, 4);
    // Version 10 byte mode uses a 16-bit character-count field.
    append(bytes.length, 16);
    for (const byte of bytes) append(byte, 8);
    const capacity = 274 * 8;
    for (let index = 0; index < Math.min(4, capacity - bits.length); index += 1) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let offset = 0; offset < bits.length; offset += 8) data.push(bits.slice(offset, offset + 8).reduce((value, bit) => (value << 1) | bit, 0));
    let pad = 0;
    while (data.length < 274) {
      data.push(pad % 2 === 0 ? 0xec : 0x11);
      pad += 1;
    }
    const blocks = [68, 68, 69, 69].map((size, index) => new Uint8Array(data.slice(index < 2 ? index * 68 : 136 + (index - 2) * 69, index < 2 ? (index + 1) * 68 : 136 + (index - 1) * 69)));
    const corrections = blocks.map((block) => errorCorrection(block, 18));
    const output = [];
    const largestData = Math.max(...blocks.map((block) => block.length));
    for (let offset = 0; offset < largestData; offset += 1) for (const block of blocks) if (offset < block.length) output.push(block[offset]);
    for (let offset = 0; offset < 18; offset += 1) for (const correction of corrections) output.push(correction[offset]);
    return output;
  }

  function createMatrix() {
    return Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(null));
  }

  function placeFinder(matrix, row, column) {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const targetRow = row + y;
        const targetColumn = column + x;
        if (targetRow < 0 || targetRow >= QR_SIZE || targetColumn < 0 || targetColumn >= QR_SIZE) continue;
        matrix[targetRow][targetColumn] = y >= 0 && y <= 6 && x >= 0 && x <= 6 && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
      }
    }
  }

  function placeAlignment(matrix) {
    const positions = [6, 28, 50];
    for (const row of positions) {
      for (const column of positions) {
        if (matrix[row][column] !== null) continue;
        for (let y = -2; y <= 2; y += 1) {
          for (let x = -2; x <= 2; x += 1) matrix[row + y][column + x] = Math.abs(x) === 2 || Math.abs(y) === 2 || (x === 0 && y === 0);
        }
      }
    }
  }

  function bchDigit(value) {
    let count = 0;
    while (value !== 0) { count += 1; value >>>= 1; }
    return count;
  }

  function bchTypeInfo(value) {
    let result = value << 10;
    while (bchDigit(result) - bchDigit(0x537) >= 0) result ^= 0x537 << (bchDigit(result) - bchDigit(0x537));
    return ((value << 10) | result) ^ 0x5412;
  }

  function bchTypeNumber(value) {
    let result = value << 12;
    while (bchDigit(result) - bchDigit(0x1f25) >= 0) result ^= 0x1f25 << (bchDigit(result) - bchDigit(0x1f25));
    return (value << 12) | result;
  }

  function placeFormatAndVersion(matrix, mask) {
    const format = bchTypeInfo((1 << 3) | mask);
    for (let index = 0; index < 15; index += 1) {
      const dark = ((format >>> index) & 1) === 1;
      if (index < 6) matrix[index][8] = dark;
      else if (index < 8) matrix[index + 1][8] = dark;
      else matrix[QR_SIZE - 15 + index][8] = dark;
      if (index < 8) matrix[8][QR_SIZE - index - 1] = dark;
      else if (index < 9) matrix[8][15 - index] = dark;
      else matrix[8][15 - index - 1] = dark;
    }
    matrix[QR_SIZE - 8][8] = true;
    const version = bchTypeNumber(QR_VERSION);
    for (let index = 0; index < 18; index += 1) {
      const dark = ((version >>> index) & 1) === 1;
      matrix[Math.floor(index / 3)][(index % 3) + QR_SIZE - 11] = dark;
      matrix[(index % 3) + QR_SIZE - 11][Math.floor(index / 3)] = dark;
    }
  }

  function maskApplies(mask, row, column) {
    if (mask === 0) return (row + column) % 2 === 0;
    if (mask === 1) return row % 2 === 0;
    if (mask === 2) return column % 3 === 0;
    if (mask === 3) return (row + column) % 3 === 0;
    if (mask === 4) return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    if (mask === 5) return ((row * column) % 2) + ((row * column) % 3) === 0;
    if (mask === 6) return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    return (((row * column) % 3) + ((row + column) % 2)) % 2 === 0;
  }

  function placeData(matrix, data, mask) {
    let row = QR_SIZE - 1;
    let direction = -1;
    let byte = 0;
    let bit = 7;
    for (let column = QR_SIZE - 1; column > 0; column -= 2) {
      if (column === 6) column -= 1;
      while (true) {
        for (let offset = 0; offset < 2; offset += 1) {
          const target = column - offset;
          if (matrix[row][target] !== null) continue;
          let dark = byte < data.length && ((data[byte] >>> bit) & 1) === 1;
          if (maskApplies(mask, row, target)) dark = !dark;
          matrix[row][target] = dark;
          bit -= 1;
          if (bit < 0) { byte += 1; bit = 7; }
        }
        row += direction;
        if (row < 0 || row >= QR_SIZE) { row -= direction; direction = -direction; break; }
      }
    }
  }

  function lostPoints(matrix) {
    let score = 0;
    for (let row = 0; row < QR_SIZE; row += 1) {
      let run = 1;
      for (let column = 1; column < QR_SIZE; column += 1) {
        if (matrix[row][column] === matrix[row][column - 1]) run += 1;
        else { if (run >= 5) score += 3 + run - 5; run = 1; }
      }
      if (run >= 5) score += 3 + run - 5;
    }
    for (let column = 0; column < QR_SIZE; column += 1) {
      let run = 1;
      for (let row = 1; row < QR_SIZE; row += 1) {
        if (matrix[row][column] === matrix[row - 1][column]) run += 1;
        else { if (run >= 5) score += 3 + run - 5; run = 1; }
      }
      if (run >= 5) score += 3 + run - 5;
    }
    let dark = 0;
    for (let row = 0; row < QR_SIZE; row += 1) {
      for (let column = 0; column < QR_SIZE; column += 1) {
        if (matrix[row][column]) dark += 1;
        if (row + 1 < QR_SIZE && column + 1 < QR_SIZE && matrix[row][column] === matrix[row + 1][column] && matrix[row][column] === matrix[row][column + 1] && matrix[row][column] === matrix[row + 1][column + 1]) score += 3;
      }
    }
    score += Math.floor(Math.abs((dark * 100 / (QR_SIZE * QR_SIZE)) - 50) / 5) * 10;
    return score;
  }

  function matrix(payload) {
    const data = codewords(payload);
    const base = createMatrix();
    placeFinder(base, 0, 0);
    placeFinder(base, QR_SIZE - 7, 0);
    placeFinder(base, 0, QR_SIZE - 7);
    for (let index = 8; index < QR_SIZE - 8; index += 1) {
      if (base[index][6] === null) base[index][6] = index % 2 === 0;
      if (base[6][index] === null) base[6][index] = index % 2 === 0;
    }
    placeAlignment(base);
    let winner = null;
    let score = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < 8; mask += 1) {
      const candidate = base.map((row) => row.slice());
      placeFormatAndVersion(candidate, mask);
      placeData(candidate, data, mask);
      const candidateScore = lostPoints(candidate);
      if (candidateScore < score) { winner = candidate; score = candidateScore; }
    }
    return winner;
  }

  function draw(canvas, payload) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('A local QR canvas is unavailable.');
    const modules = matrix(payload);
    const moduleSize = 5;
    const quietZone = 4;
    const size = (modules.length + quietZone * 2) * moduleSize;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('A local QR drawing surface is unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#000000';
    modules.forEach((row, rowIndex) => row.forEach((dark, columnIndex) => {
      if (dark) context.fillRect((columnIndex + quietZone) * moduleSize, (rowIndex + quietZone) * moduleSize, moduleSize, moduleSize);
    }));
  }

  window.StudioTotpQr = Object.freeze({ draw, maxUtf8Bytes: QR_MAX_UTF8_BYTES });
})();
