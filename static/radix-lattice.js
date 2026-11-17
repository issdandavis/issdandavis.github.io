(() => {
  "use strict";

  const canvas = document.getElementById("radix-field");
  const form = document.getElementById("radix-controls");
  if (!canvas || !form) return;

  const ctx = canvas.getContext("2d");
  const byteInput = document.getElementById("byte-value");
  const betaInput = document.getElementById("beta-value");
  const fieldInput = document.getElementById("field-value");
  const seedInput = document.getElementById("seed-value");
  const outputs = {
    byte: document.getElementById("byte-output"),
    beta: document.getElementById("beta-output"),
    field: document.getElementById("field-output"),
    receipt: document.getElementById("bit-receipt"),
    view: document.getElementById("beta-view"),
    accepted: document.getElementById("accepted-routes"),
    rejected: document.getElementById("rejected-proposals"),
    roundtrip: document.getElementById("roundtrip-status"),
  };

  const COLS = 24;
  const ROWS = 14;
  const PROPOSALS = 8;
  let latest = null;

  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function bitArray(byteValue) {
    return Array.from({ length: 8 }, (_, i) => (byteValue >> i) & 1);
  }

  function radialView(bits, beta) {
    return bits.reduce((sum, bit, i) => sum + bit * beta ** i, 0);
  }

  function makeProposal(record, proposalIndex, fieldTurn, rng) {
    const direction = record.direction;
    const startX = direction === 1 ? 0 : COLS - 1;
    const endX = direction === 1 ? COLS - 1 : 0;
    const rootY = 2 + record.bitIndex + (direction === -1 ? 2 : 0);
    const phase = record.bitIndex * 0.77 + proposalIndex * 0.61 + fieldTurn * 1.9 + (rng() - 0.5) * 0.18;
    const amplitude = 0.7 + Math.abs(fieldTurn) * 1.8 + proposalIndex * 0.07;
    const microShift = (rng() - 0.5) * (1.2 + Math.abs(fieldTurn));
    const path = [];

    for (let t = 0; t < COLS; t += 1) {
      const progress = t / (COLS - 1);
      const x = Math.round(startX + (endX - startX) * progress);
      const spin = Math.sin(progress * Math.PI * 2 + phase) * amplitude;
      const drift = fieldTurn * (progress - 0.5) * 3.2;
      const bitLift = record.bitValue ? Math.sin(progress * Math.PI) * 0.8 : 0;
      const y = clamp(Math.round(rootY + spin + drift + microShift + bitLift), 0, ROWS - 1);
      path.push({ x, y, t });
    }
    return { path, phase, microShift };
  }

  function simulate(byteValue, beta, fieldTurn, seed) {
    const rng = mulberry32(seed);
    const bits = bitArray(byteValue);
    const records = [];
    bits.forEach((bitValue, bitIndex) => {
      records.push({ bitIndex, bitValue, direction: 1, id: `f-${bitIndex}` });
      records.push({ bitIndex, bitValue, direction: -1, id: `r-${bitIndex}` });
    });

    for (let i = records.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [records[i], records[j]] = [records[j], records[i]];
    }

    const occupied = new Set();
    const accepted = [];
    let rejectedProposals = 0;

    records.forEach((record) => {
      let selected = null;
      for (let p = 0; p < PROPOSALS; p += 1) {
        const proposal = makeProposal(record, p, fieldTurn, rng);
        const collisions = proposal.path.filter((cell) => occupied.has(`${cell.x}:${cell.y}:${cell.t}`)).length;
        if (collisions === 0) {
          selected = { ...record, ...proposal, proposalIndex: p };
          break;
        }
        rejectedProposals += 1;
      }
      if (selected) {
        selected.path.forEach((cell) => occupied.add(`${cell.x}:${cell.y}:${cell.t}`));
        accepted.push(selected);
      }
    });

    const replayed = bits.reduce((sum, bit, i) => sum + bit * 2 ** i, 0);
    return {
      byteValue,
      bits,
      beta,
      betaView: radialView(bits, beta),
      fieldTurn,
      accepted,
      rejectedProposals,
      replayed,
      exact: replayed === byteValue,
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(latest);
  }

  function draw(result) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 20, width * 0.5, height * 0.5, width * 0.7);
    gradient.addColorStop(0, "rgba(22, 58, 66, .28)");
    gradient.addColorStop(1, "rgba(4, 9, 12, .96)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const padX = 34;
    const padY = 30;
    const cellW = (width - padX * 2) / (COLS - 1);
    const cellH = (height - padY * 2) / (ROWS - 1);

    ctx.strokeStyle = "rgba(139, 203, 211, .09)";
    ctx.lineWidth = 1;
    for (let x = 0; x < COLS; x += 1) {
      const px = padX + x * cellW;
      ctx.beginPath();
      ctx.moveTo(px, padY);
      ctx.lineTo(px, height - padY);
      ctx.stroke();
    }
    for (let y = 0; y < ROWS; y += 1) {
      const py = padY + y * cellH;
      ctx.beginPath();
      ctx.moveTo(padX, py);
      ctx.lineTo(width - padX, py);
      ctx.stroke();
    }

    if (!result) return;
    result.accepted.forEach((route) => {
      const color = route.direction === 1 ? "rgba(131, 230, 226, .72)" : "rgba(242, 201, 118, .68)";
      ctx.strokeStyle = color;
      ctx.lineWidth = route.bitValue ? 2.2 : 1.1;
      ctx.beginPath();
      route.path.forEach((cell, index) => {
        const px = padX + cell.x * cellW;
        const py = padY + cell.y * cellH;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      const root = route.path[0];
      ctx.fillStyle = route.bitValue ? "#c2a5ff" : "#5f6d78";
      ctx.beginPath();
      ctx.arc(padX + root.x * cellW, padY + root.y * cellH, route.bitValue ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "rgba(230, 244, 246, .68)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`seed ${seedInput.value} · β ${result.beta.toFixed(2)} · field ${result.fieldTurn.toFixed(2)}`, 18, 18);
  }

  function updateOutputs(result) {
    outputs.byte.textContent = String(result.byteValue);
    outputs.beta.textContent = result.beta.toFixed(2);
    outputs.field.textContent = result.fieldTurn.toFixed(2);
    outputs.receipt.textContent = result.byteValue.toString(2).padStart(8, "0");
    outputs.view.textContent = result.betaView.toFixed(4);
    outputs.accepted.textContent = `${result.accepted.length} / 16`;
    outputs.rejected.textContent = String(result.rejectedProposals);
    outputs.roundtrip.textContent = result.exact ? `${result.replayed} · exact` : "failed";
    outputs.roundtrip.style.color = result.exact ? "#79e6a5" : "#ff8e8e";
  }

  function run() {
    const byteValue = Number(byteInput.value);
    const beta = Number(betaInput.value);
    const fieldTurn = Number(fieldInput.value);
    const seed = Number(seedInput.value) || 1;
    latest = simulate(byteValue, beta, fieldTurn, seed);
    updateOutputs(latest);
    draw(latest);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run();
  });
  [byteInput, betaInput, fieldInput].forEach((input) => input.addEventListener("input", run));
  window.addEventListener("resize", resizeCanvas);
  run();
  resizeCanvas();
})();
