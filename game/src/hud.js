// The HUD and the screens around the game: objective and timer up top, detection status and
// controls in the side panel, and the title, pause, win and lose overlays. Everything the
// player needs to judge risk is visible without covering the level.
import { ARENA_Y, CANVAS, PANEL_W, PANEL_X, PALETTE } from './config.js';
import { alarmLevel, maxExposure, statusLabel } from './world.js';

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function drawBar(ctx, x, y, w, h, fraction, fill, empty) {
  ctx.fillStyle = empty;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, fraction)) * w, h);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawPanel(ctx, state, screen, bestSeconds) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(PANEL_X, ARENA_Y, PANEL_W, 576);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.strokeRect(PANEL_X + 0.5, ARENA_Y + 0.5, PANEL_W - 1, 575);
  let y = ARENA_Y + 22;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('STATUS', PANEL_X + 14, y);
  y += 26;
  const label = statusLabel(state);
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = label === 'TERLIHAT' ? PALETTE.danger : label === 'DICARI' ? PALETTE.cone : PALETTE.exit;
  ctx.fillText(label, PANEL_X + 14, y);
  y += 34;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('TERLIHAT SEBERAPA', PANEL_X + 14, y);
  y += 20;
  const exposure = maxExposure(state);
  drawBar(ctx, PANEL_X + 14, y, PANEL_W - 28, 14, exposure / 100, exposure >= 60 ? PALETTE.danger : PALETTE.cone, '#1B2E35');
  y += 26;
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${Math.round(exposure)} / 100 — 100 berarti kejar`, PANEL_X + 14, y);
  y += 34;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('ALARM', PANEL_X + 14, y);
  y += 22;
  const alarm = alarmLevel(state);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(PANEL_X + 24 + i * 26, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = i < alarm ? PALETTE.danger : '#1B2E35';
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudLine;
    ctx.stroke();
  }
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(alarm === 0 ? 'tenang' : `${alarm} penjaga mengejar`, PANEL_X + 100, y);
  y += 40;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('PENJAGA', PANEL_X + 14, y);
  y += 20;
  ctx.font = '400 12px system-ui, sans-serif';
  const stateNames = { patrol: 'patroli', suspicious: 'curiga', investigate: 'memeriksa', chase: 'MENGEJAR', search: 'mencari', return: 'kembali' };
  for (const guard of state.guards) {
    ctx.fillStyle = guard.state === 'chase' ? PALETTE.danger : PALETTE.text;
    ctx.fillText(`${guard.name}: ${stateNames[guard.state] || guard.state}`, PANEL_X + 14, y);
    y += 18;
  }
  y += 14;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('KONTROL', PANEL_X + 14, y);
  y += 20;
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  const controls = [
    'WASD / panah — bergerak',
    'Shift tahan — jongkok (pelan, senyap)',
    'Klik — lempar kerikil',
    'E — ambil / pakai exit',
    'R — mulai ulang   Esc — jeda   M — bisu',
  ];
  for (const line of controls) {
    ctx.fillText(line, PANEL_X + 14, y);
    y += 18;
  }
  y += 12;
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('AIR MEMBAWA SUARA: langkah di', PANEL_X + 14, y);
  y += 18;
  ctx.fillText('genangan terdengar 2x lebih jauh.', PANEL_X + 14, y);
  y += 18;
  ctx.fillText('Kerikil ke air mengalihkan penjaga.', PANEL_X + 14, y);
  if (bestSeconds > 0) {
    y += 30;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Waktu menang tercepat: ${formatTime(bestSeconds)}`, PANEL_X + 14, y);
  }
}

function drawTopBar(ctx, state) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.fillRect(0, 0, CANVAS.width, 56);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.beginPath();
  ctx.moveTo(0, 56.5);
  ctx.lineTo(CANVAS.width, 56.5);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('ARSIP PASANG', 16, 20);
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('The Last Dry Record — arsip kota yang separuh terendam', 16, 40);
  // Objective, centre.
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = state.player.hasEvidence ? PALETTE.exit : PALETTE.evidence;
  const objective = state.player.hasEvidence ? '✓ BUKTI didapat — kabur ke EXIT timur' : 'Ambil BUKTI di arsip timur (24,3), lalu kabur ke EXIT';
  ctx.fillText(objective, 400, 20);
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  const lootText = `Arsip tambahan: ${state.player.loot}/2    Kerikil: ${'●'.repeat(state.player.pebbles)}${'○'.repeat(Math.max(0, 3 - state.player.pebbles))}`;
  ctx.fillText(lootText, 400, 40);
  // Timer, right.
  ctx.textAlign = 'right';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(formatTime(state.stats.elapsed), CANVAS.width - 16, 20);
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`pengejaran: ${state.stats.chases}   nyaris: ${state.stats.nearMisses}`, CANVAS.width - 16, 40);
  ctx.textAlign = 'left';
}

function drawBottomHint(ctx, state, screen) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.fillRect(0, 648, CANVAS.width, 72);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.beginPath();
  ctx.moveTo(0, 648.5);
  ctx.lineTo(CANVAS.width, 648.5);
  ctx.stroke();
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let hint = 'Rak tinggi menghalangi pandangan. Jongkok di balik peti rendah agar tak terlihat. Air membuat langkahmu terdengar jauh.';
  if (state.status === 'won') hint = 'Kamu lolos membawa bukti. Tekan R untuk mencoba rute yang lebih cepat.';
  else if (state.status === 'lost') hint = 'Tertangkap. Tekan R untuk mencoba lagi — pelajari rute patroli, lalu bergerak saat penjaga menjauh.';
  else if (screen === 'paused') hint = 'Jeda. Tekan Esc untuk lanjut, R untuk mulai ulang.';
  ctx.fillText(hint, 16, 684);
  if (state.nearMissFlash > 0) {
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.cone;
    ctx.textAlign = 'right';
    ctx.fillText('NYARIS!', CANVAS.width - 16, 684);
    ctx.textAlign = 'left';
  }
}

function overlay(ctx, title, lines, accent) {
  ctx.fillStyle = 'rgba(8, 19, 25, 0.82)';
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = PALETTE.hudLine;
  const w = 560;
  const h = 120 + lines.length * 26;
  const x = (CANVAS.width - w) / 2;
  const y = (CANVAS.height - h) / 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(title, CANVAS.width / 2, y + 48);
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  lines.forEach((line, i) => ctx.fillText(line, CANVAS.width / 2, y + 92 + i * 26));
  ctx.textAlign = 'left';
}

export function drawObjectiveAndDetectionHUD(ctx, state, screen, bestSeconds) {
  drawTopBar(ctx, state);
  drawPanel(ctx, state, screen, bestSeconds);
  drawBottomHint(ctx, state, screen);
  if (screen === 'title') {
    overlay(ctx, 'ARSIP PASANG', [
      'The Last Dry Record — pencurian sunyi di arsip kota yang terendam.',
      'Ambil BUKTI di timur, jangan terlihat, kabur lewat EXIT.',
      'WASD bergerak · Shift jongkok · Klik lempar kerikil · E ambil',
      'Air membawa suara — jalan kering lebih aman, jalan air lebih cepat.',
      'Tekan Enter atau klik untuk mulai.',
    ], PALETTE.player);
  } else if (screen === 'paused') {
    overlay(ctx, 'JEDA', ['Tekan Esc untuk lanjut.', 'R — mulai ulang dari awal.'], PALETTE.text);
  } else if (screen === 'over' && state.status === 'won') {
    overlay(ctx, 'LOLOS!', [
      `Waktu: ${formatTime(state.stats.elapsed)}   Arsip tambahan: ${state.player.loot}/2`,
      `Pengejaran: ${state.stats.chases}   Nyaris tertangkap: ${state.stats.nearMisses}`,
      'Bukti penggusuran selamat. Tekan R untuk main lagi.',
    ], PALETTE.exit);
  } else if (screen === 'over' && state.status === 'lost') {
    overlay(ctx, 'TERTANGKAP', [
      'Seorang penjaga melihatmu dari dekat.',
      'Pelajari rute patroli — bergeraklah saat penjaga menjauh,',
      'jongkok di balik peti, dan alihkan dengan kerikil.',
      'Tekan R untuk mencoba lagi.',
    ], PALETTE.danger);
  }
}
