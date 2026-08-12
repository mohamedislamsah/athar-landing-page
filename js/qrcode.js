/* ============================================================
   ATHAR — Lightweight client-side QR Code generator (Model 2)
   Pure Vanilla JS · No dependencies · QR versions 1–7 (level M)
   ============================================================ */
(function (global) {
  "use strict";

  /* ---- Version tables (error correction level M) ----
     [totalCodewords, ecCodewordsPerBlock, [ [numBlocks, dataCodewordsPerBlock] ... ]] */
  var VERSIONS = {
    1: { total: 26, ec: 10, blocks: [[1, 16]] },
    2: { total: 44, ec: 16, blocks: [[1, 28]] },
    3: { total: 70, ec: 26, blocks: [[1, 44]] },
    4: { total: 100, ec: 18, blocks: [[2, 32]] },
    5: { total: 134, ec: 24, blocks: [[2, 43]] },
    6: { total: 172, ec: 16, blocks: [[4, 27]] },
    7: { total: 196, ec: 18, blocks: [[4, 31]] }
  };
  var MAX_VERSION = 7;

  /* ---- GF(256) arithmetic (primitive poly 0x11D) ---- */
  var EXP = new Array(256);
  var LOG = new Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /* Reed–Solomon generator polynomial of degree ecLen.
     Returned leading-first: gen[0] = coefficient of x^ecLen. */
  function generatorPoly(ecLen) {
    var gen = [1];
    for (var i = 0; i < ecLen; i++) {
      var next = new Array(gen.length + 1).fill(0);
      for (var j = 0; j < gen.length; j++) {
        next[j] ^= gen[j];                          /* multiply by x */
        next[j + 1] ^= gfMul(gen[j], EXP[i]);       /* multiply by a^i */
      }
      gen = next;
    }
    return gen;
  }

  function rsEncode(data, ecLen) {
    var gen = generatorPoly(ecLen);
    var rem = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem[0];
      rem.shift();
      rem.push(0);
      if (factor !== 0) {
        for (var j = 0; j < ecLen; j++) {
          rem[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return rem;
  }

  /* ---- Bit buffer ---- */
  function BitBuffer() {
    this.bits = [];
  }
  BitBuffer.prototype.put = function (value, length) {
    for (var i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };
  BitBuffer.prototype.toBytes = function () {
    var out = [];
    for (var i = 0; i < this.bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8 && i + j < this.bits.length; j++) {
        b = (b << 1) | this.bits[i + j];
      }
      out.push(b);
    }
    return out;
  };

  /* ---- Alignment pattern positions ---- */
  function alignmentPositions(version) {
    if (version === 1) return [];
    var numAlign = Math.floor(version / 7) + 2;
    var step = version === 32
      ? 26
      : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
    var pos = new Array(numAlign);
    pos[0] = 6;
    var last = version * 4 + 10;
    for (var i = numAlign - 1; i >= 1; i--) {
      pos[i] = last;
      last -= step;
    }
    return pos;
  }

  /* ---- Format info (ECC level M) ---- */
  function formatInfoBits(mask) {
    var data = mask; /* level M bits = 0b00 */
    var rem = data << 10;
    for (var i = 14; i >= 10; i--) {
      if (((rem >>> i) & 1) !== 0) rem ^= 0x537 << (i - 10);
    }
    return (((data << 10) | rem) & 0x7fff) ^ 0x5412;
  }

  /* ---- Version info (only version >= 7) ---- */
  function versionInfoBits(version) {
    var rem = version << 12;
    for (var i = 17; i >= 12; i--) {
      if (((rem >>> i) & 1) !== 0) rem ^= 0x1f25 << (i - 12);
    }
    return ((version << 12) | rem) & 0x3ffff;
  }

  /* ---- Mask conditions ---- */
  function maskBit(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
    return false;
  }

  /* ---- Module matrix ---- */
  function Matrix(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = [];
    for (var r = 0; r < this.size; r++) {
      this.modules.push(new Array(this.size).fill(null));
    }
    this.isFunction = [];
    for (var i = 0; i < this.size; i++) {
      this.isFunction.push(new Array(this.size).fill(false));
    }
    this.markFunction(0, 0, 9, 9);                 /* top-left finder + separator */
    this.markFunction(0, this.size - 8, 9, 8);     /* top-right */
    this.markFunction(this.size - 8, 0, 8, 9);     /* bottom-left */
    /* timing */
    for (var t = 0; t < this.size; t++) {
      this.markFunction(6, t, 1, 1);
      this.markFunction(t, 6, 1, 1);
    }
    /* alignment patterns */
    var ap = alignmentPositions(version);
    for (var a = 0; a < ap.length; a++) {
      for (var b = 0; b < ap.length; b++) {
        var ar = ap[a], ac = ap[b];
        if ((ar <= 8 && ac <= 8) ||
            (ar >= this.size - 8 && ac <= 8) ||
            (ar <= 8 && ac >= this.size - 8)) continue;
        this.markFunction(ar - 2, ac - 2, 5, 5);
      }
    }
    /* format info areas + dark module */
    this.markFunction(8, 0, 1, 9);
    this.markFunction(0, 8, 9, 1);
    this.markFunction(8, this.size - 8, 1, 8);
    this.markFunction(this.size - 8, 8, 8, 1);
    this.setFunction(this.size - 8, 8, true);      /* dark module */
    /* version info areas (version >= 7) */
    if (version >= 7) {
      this.markFunction(this.size - 11, 0, 3, 6);
      this.markFunction(0, this.size - 11, 6, 3);
    }
    this.drawFunctionPatterns(version, ap);
  }

  Matrix.prototype.markFunction = function (r, c, h, w) {
    for (var i = r; i < r + h; i++) {
      for (var j = c; j < c + w; j++) this.isFunction[i][j] = true;
    }
  };

  Matrix.prototype.setFunction = function (r, c, dark) {
    this.modules[r][c] = dark;
  };

  Matrix.prototype.drawFunctionPatterns = function (version, ap) {
    var size = this.size;
    var drawFinder = function (r, c) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          var dark = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
             (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          this.setFunction(rr, cc, dark);
        }
      }
    }.bind(this);
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    /* timing */
    for (var t = 8; t < size - 8; t++) {
      this.setFunction(6, t, t % 2 === 0);
      this.setFunction(t, 6, t % 2 === 0);
    }
    /* alignment */
    for (var a = 0; a < ap.length; a++) {
      for (var b = 0; b < ap.length; b++) {
        var ar = ap[a], ac = ap[b];
        if ((ar <= 8 && ac <= 8) ||
            (ar >= size - 8 && ac <= 8) ||
            (ar <= 8 && ac >= size - 8)) continue;
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var dark = (dr === -2 || dr === 2 || dc === -2 || dc === 2 ||
                        (dr === 0 && dc === 0));
            this.setFunction(ar + dr, ac + dc, dark);
          }
        }
      }
    }
  };

  Matrix.prototype.placeData = function (codewords) {
    var size = this.size;
    var bits = [];
    for (var i = 0; i < codewords.length; i++) {
      for (var k = 7; k >= 0; k--) bits.push((codewords[i] >>> k) & 1);
    }
    var pos = 0;
    var row = size - 1;
    var col = size - 1;
    var dir = -1;
    while (col > 0) {
      if (col === 6) col--;
      var done = false;
      while (!done) {
        for (var i = 0; i < 2; i++) {
          var c = col - i;
          if (!this.isFunction[row][c] && pos < bits.length) {
            this.modules[row][c] = bits[pos] === 1;
            pos++;
          }
        }
        row += dir;
        if (row < 0 || row >= size) {
          row -= dir;
          dir = -dir;
          done = true;
        }
      }
      col -= 2;
    }
  };

  Matrix.prototype.applyMask = function (mask) {
    var size = this.size;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (this.isFunction[r][c]) continue;
        if (maskBit(mask, r, c)) this.modules[r][c] = !this.modules[r][c];
      }
    }
  };

  Matrix.prototype.drawFormatInfo = function (mask) {
    var bits = formatInfoBits(mask);
    var size = this.size;
    for (var i = 0; i < 15; i++) {
      var dark = ((bits >> i) & 1) === 1;
      var r1 = i < 6 ? i : (i < 8 ? i + 1 : size - 15 + i);
      var c1 = 8;
      this.modules[r1][c1] = dark;
      var r2 = 8;
      var c2 = i < 8 ? size - 1 - i : 14 - i;
      this.modules[r2][c2] = dark;
    }
    this.modules[size - 8][8] = true;
  };

  Matrix.prototype.drawVersionInfo = function () {
    var size = this.size;
    if (this.version < 7) return;
    var bits = versionInfoBits(this.version);
    for (var i = 0; i < 18; i++) {
      var dark = ((bits >> i) & 1) === 1;
      var a = size - 11 + (i % 3);
      var b = Math.floor(i / 3);
      this.modules[a][b] = dark;
      this.modules[b][a] = dark;
    }
  };

  /* ---- Mask penalty rules ---- */
  function penaltyRule1(rows) {
    var p = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var run = 1;
      for (var j = 1; j < row.length; j++) {
        if (row[j] === row[j - 1]) {
          run++;
        } else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
      if (run >= 5) p += run - 2;
    }
    return p;
  }

  function penaltyRule2(rows) {
    var p = 0;
    for (var r = 0; r < rows.length - 1; r++) {
      for (var c = 0; c < rows.length - 1; c++) {
        if (rows[r][c] === rows[r][c + 1] &&
            rows[r][c] === rows[r + 1][c] &&
            rows[r][c] === rows[r + 1][c + 1]) p += 3;
      }
    }
    return p;
  }

  var FINDER = [1, 0, 1, 1, 1, 0, 1];
  function penaltyRule3(rows) {
    var p = 0;
    for (var i = 0; i < rows.length; i++) {
      var arr = rows[i];
      for (var j = 0; j + 10 < arr.length; j++) {
        var ok = true;
        for (var k = 0; k < 7; k++) {
          if (arr[j + k] !== FINDER[k]) { ok = false; break; }
        }
        if (!ok) continue;
        var before = j >= 4 && arr[j - 1] === 0 && arr[j - 2] === 0 &&
                     arr[j - 3] === 0 && arr[j - 4] === 0;
        var after = arr[j + 7] === 0 && arr[j + 8] === 0 &&
                    arr[j + 9] === 0 && arr[j + 10] === 0;
        if (before && after) p += 40;
      }
    }
    return p;
  }

  function penaltyRule4(rows) {
    var total = 0;
    var dark = 0;
    for (var i = 0; i < rows.length; i++) {
      for (var j = 0; j < rows.length; j++) {
        total++;
        if (rows[i][j]) dark++;
      }
    }
    var percent = (dark * 100) / total;
    var k = Math.abs(percent - 50) / 5;
    return Math.floor(k) * 10;
  }

  function penalty(matrix) {
    var rows = matrix.modules.map(function (row) { return row.slice(); });
    var cols = [];
    for (var c = 0; c < rows.length; c++) {
      var col = [];
      for (var r = 0; r < rows.length; r++) col.push(rows[r][c]);
      cols.push(col);
    }
    return penaltyRule1(rows) + penaltyRule1(cols) +
           penaltyRule2(rows) +
           penaltyRule3(rows) + penaltyRule3(cols) +
           penaltyRule4(rows);
  }

  /* ---- Stream building ---- */
  function buildBitStream(bytes, dataCodewords) {
    var buf = new BitBuffer();
    buf.put(0x4, 4);                       /* byte mode */
    buf.put(bytes.length, 8);              /* character count (v1–9) */
    for (var i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);
    var cap = dataCodewords * 8;
    var term = Math.min(4, cap - buf.bits.length);
    if (term > 0) buf.put(0, term);
    while (buf.bits.length % 8 !== 0) buf.put(0, 1);
    var pad = 0xec;
    while (buf.bits.length < cap) {
      buf.put(pad, 8);
      pad = pad === 0xec ? 0x11 : 0xec;
    }
    return buf.toBytes();
  }

  function interleave(dataCodewords, meta) {
    var blockData = [];
    var offset = 0;
    for (var g = 0; g < meta.blocks.length; g++) {
      var nb = meta.blocks[g][0];
      var len = meta.blocks[g][1];
      for (var i = 0; i < nb; i++) {
        blockData.push(dataCodewords.slice(offset, offset + len));
        offset += len;
      }
    }
    var blockEc = blockData.map(function (d) { return rsEncode(d, meta.ec); });
    var out = [];
    var maxLen = 0;
    for (var b = 0; b < blockData.length; b++) maxLen = Math.max(maxLen, blockData[b].length);
    for (var k = 0; k < maxLen; k++) {
      for (var m = 0; m < blockData.length; m++) {
        if (k < blockData[m].length) out.push(blockData[m][k]);
      }
    }
    for (var e = 0; e < meta.ec; e++) {
      for (var n = 0; n < blockEc.length; n++) out.push(blockEc[n][e]);
    }
    return out;
  }

  /* ---- Public API ---- */
  function make(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code > 0xff) throw new Error("QR text must be ASCII");
      bytes.push(code);
    }
    var version = 1;
    for (; version <= MAX_VERSION; version++) {
      var meta = VERSIONS[version];
      var maxData = 0;
      for (var g = 0; g < meta.blocks.length; g++) {
        maxData += meta.blocks[g][0] * meta.blocks[g][1];
      }
      var capBits = maxData * 8;
      var needed = 4 + 8 + bytes.length * 8;
      if (needed <= capBits) break;
    }
    if (version > MAX_VERSION) throw new Error("Content too long");
    var meta2 = VERSIONS[version];
    var codewords = interleave(buildBitStream(bytes, meta2.total - meta2.ec * countBlocks(meta2)), meta2);
    var matrix = new Matrix(version);
    matrix.placeData(codewords);

    var bestMask = 0;
    var bestPenalty = Infinity;
    for (var m = 0; m < 8; m++) {
      var candidate = new Matrix(version);
      for (var r = 0; r < matrix.size; r++) {
        for (var c = 0; c < matrix.size; c++) {
          candidate.modules[r][c] = matrix.modules[r][c];
        }
      }
      candidate.applyMask(m);
      var p = penalty(candidate);
      if (p < bestPenalty) {
        bestPenalty = p;
        bestMask = m;
      }
    }

    var finalMatrix = new Matrix(version);
    for (var rr = 0; rr < matrix.size; rr++) {
      for (var cc = 0; cc < matrix.size; cc++) {
        finalMatrix.modules[rr][cc] = matrix.modules[rr][cc];
      }
    }
    finalMatrix.applyMask(bestMask);
    finalMatrix.drawFormatInfo(bestMask);
    finalMatrix.drawVersionInfo();

    return {
      version: version,
      size: finalMatrix.size,
      mask: bestMask,
      modules: finalMatrix.modules
    };
  }

  function countBlocks(meta) {
    var n = 0;
    for (var g = 0; g < meta.blocks.length; g++) n += meta.blocks[g][0];
    return n;
  }

  function renderToCanvas(canvas, qr) {
    var size = qr.size;
    var quiet = 4;
    var total = size + quiet * 2;
    var target = canvas.width;
    var cell = Math.floor(target / total);
    var offset = Math.floor((target - cell * total) / 2);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, target, target);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target, target);
    ctx.fillStyle = "#070b09";
    var radius = Math.max(0, Math.floor(cell * 0.18));
    var hasRoundRect = typeof ctx.roundRect === "function";
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (!qr.modules[r][c]) continue;
        var x = offset + (c + quiet) * cell;
        var y = offset + (r + quiet) * cell;
        if (hasRoundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, cell, cell, radius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
  }

  global.AtharQR = {
    make: make,
    renderToCanvas: renderToCanvas,
    MAX_VERSION: MAX_VERSION
  };
})(window);
