// The archive on screen: floor, puddles, shelves, cover crates, the evidence and the exit,
// then each guard's occluded vision cone, the guards, and the player. Colours are semantic
// and consistent: mint is the player, orange is a guard, yellow is a calm cone, red is danger,
// green is the exit. Nothing here is decorative at the cost of readability at thumbnail size.
import { ARENA_H, ARENA_W, ARENA_X, ARENA_Y, CANVAS, COLS, PALETTE, ROWS, T, TILE } from './config.js';
import { computeOccludedVisionCone } from './visibility.js';
import { tileCenter } from './level.js';

const CONE_FILL = {
  patrol: 'rgba(255, 209, 102, 0.16)',
  suspicious: 'rgba(255, 180, 91, 0.28)',
  investigate: 'rgba(255, 180, 91, 0.28)',
  chase: 'rgba(255, 93, 102, 0.30)',
  search: 'rgba(255, 180, 91, 0.22)',
  return: 'rgba(255, 209, 102, 0.16)',
};
const CONE_EDGE = {
  patrol: 'rgba(255, 209, 102, 0.55)',
  suspicious: 'rgba(255, 180, 91, 0.8)',
  investigate: 'rgba(255, 180, 91, 0.8)',
  chase: 'rgba(255, 93, 102, 0.9)',
  search: 'rgba(255, 180, 91, 0.7)',
  return: 'rgba(255, 209, 102, 0.55)',
};

function drawTile(ctx, tx, ty, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(ARENA_X + tx * TILE, ARENA_Y + ty * TILE, TILE, TILE);
}

function drawLabel(ctx, text, x, y, color, size = 11) {
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function createRenderer(canvas) {
  canvas.width = CANVAS.width;
  canvas.height = CANVAS.height;
  const ctx = canvas.getContext('2d');

  function drawFloor(state) {
    ctx.fillStyle = PALETTE.outside;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(ARENA_X, ARENA_Y, ARENA_W, ARENA_H);
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        const code = state.level.grid[ty * COLS + tx];
        if (code === T.FLOOR && (tx + ty) % 2 === 0) drawTile(ctx, tx, ty, PALETTE.floorAlt);
        if (code === T.WATER) {
          drawTile(ctx, tx, ty, PALETTE.water);
          // Shimmer: a slow diagonal sheen so water reads as water, not floor.
          const shimmer = 0.5 + 0.5 * Math.sin(state.time * 1.4 + (tx + ty) * 0.9);
          ctx.fillStyle = `rgba(58, 156, 176, ${0.12 + shimmer * 0.14})`;
          ctx.fillRect(ARENA_X + tx * TILE + 4, ARENA_Y + ty * TILE + 4, TILE - 8, TILE - 8);
        }
      }
    }
    // Thin grid so the tile layout reads at a glance.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let tx = 0; tx <= COLS; tx += 1) {
      ctx.moveTo(ARENA_X + tx * TILE, ARENA_Y);
      ctx.lineTo(ARENA_X + tx * TILE, ARENA_Y + ARENA_H);
    }
    for (let ty = 0; ty <= ROWS; ty += 1) {
      ctx.moveTo(ARENA_X, ARENA_Y + ty * TILE);
      ctx.lineTo(ARENA_X + ARENA_W, ARENA_Y + ty * TILE);
    }
    ctx.stroke();
  }

  function drawStructures(state) {
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        const code = state.level.grid[ty * COLS + tx];
        const px = ARENA_X + tx * TILE;
        const py = ARENA_Y + ty * TILE;
        if (code === T.WALL) {
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(px, py, TILE, 4);
        } else if (code === T.SHELF) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(px + 3, py + 4, TILE - 2, TILE - 2);
          ctx.fillStyle = PALETTE.shelf;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = PALETTE.shelfTop;
          ctx.fillRect(px + 2, py + 2, TILE - 4, 7);
          // Document spines: a few pale ticks so a shelf reads as archive racks.
          ctx.fillStyle = 'rgba(232, 242, 240, 0.35)';
          for (let i = 0; i < 3; i += 1) ctx.fillRect(px + 6 + i * 9, py + 14, 4, 12);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (code === T.COVER) {
          ctx.fillStyle = PALETTE.cover;
          ctx.fillRect(px, py + 8, TILE, TILE - 8);
          ctx.fillStyle = PALETTE.coverTop;
          ctx.fillRect(px + 2, py + 8, TILE - 4, 6);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.strokeRect(px + 0.5, py + 8.5, TILE - 1, TILE - 9);
        }
      }
    }
    // Low-cover hint: a crouch mark on each crate so the rule is visible, not guessed.
    for (const [cx, cy] of [[10, 8], [17, 8], [25, 12]]) {
      const centre = tileCenter(cx, cy);
      drawLabel(ctx, '▼', centre.x + 16, centre.y - 2, PALETTE.coverTop, 12);
    }
  }

  function drawObjectives(state) {
    const exit = tileCenter(state.exit.tx, state.exit.ty);
    ctx.fillStyle = state.exit.active ? PALETTE.exit : 'rgba(114, 245, 175, 0.25)';
    ctx.fillRect(exit.x - 15, exit.y - 15, 30, 30);
    ctx.strokeStyle = state.exit.active ? PALETTE.exit : 'rgba(114, 245, 175, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(exit.x - 15.5, exit.y - 15.5, 31, 31);
    drawLabel(ctx, 'EXIT', exit.x, exit.y - 24, state.exit.active ? PALETTE.exit : PALETTE.muted, 12);
    // The door in the east wall behind the exit tile.
    ctx.fillStyle = state.exit.active ? PALETTE.exit : 'rgba(114, 245, 175, 0.3)';
    ctx.fillRect(ARENA_X + ARENA_W - 4, exit.y - 14, 4, 28);
    if (!state.evidence.taken) {
      const doc = tileCenter(state.evidence.tx, state.evidence.ty);
      ctx.fillStyle = PALETTE.evidence;
      ctx.fillRect(doc.x - 8, doc.y - 11, 16, 22);
      ctx.fillStyle = '#24343B';
      ctx.fillRect(doc.x - 5, doc.y - 7, 10, 2);
      ctx.fillRect(doc.x - 5, doc.y - 2, 10, 2);
      ctx.fillRect(doc.x - 5, doc.y + 3, 7, 2);
      drawLabel(ctx, 'BUKTI', doc.x, doc.y - 22, PALETTE.evidence, 11);
    }
    for (const loot of state.loot) {
      if (loot.taken) continue;
      const spot = tileCenter(loot.tx, loot.ty);
      ctx.fillStyle = PALETTE.loot;
      ctx.beginPath();
      ctx.moveTo(spot.x, spot.y - 9);
      ctx.lineTo(spot.x + 8, spot.y);
      ctx.lineTo(spot.x, spot.y + 9);
      ctx.lineTo(spot.x - 8, spot.y);
      ctx.closePath();
      ctx.fill();
      drawLabel(ctx, 'ARSIP', spot.x, spot.y - 19, PALETTE.loot, 10);
    }
  }

  function drawCones(state) {
    for (const guard of state.guards) {
      const polygon = computeOccludedVisionCone(state.level, guard);
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i].x, polygon[i].y);
      ctx.closePath();
      ctx.fillStyle = CONE_FILL[guard.state] || CONE_FILL.patrol;
      ctx.fill();
      ctx.strokeStyle = CONE_EDGE[guard.state] || CONE_EDGE.patrol;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawRings(state) {
    for (const ring of state.rings) {
      const alpha = Math.max(0, ring.ttl / 0.9) * 0.7;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, Math.max(2, ring.radius), 0, Math.PI * 2);
      ctx.strokeStyle = ring.kind === 'guard' ? `rgba(255, 180, 91, ${alpha * 0.5})` : `rgba(143, 255, 224, ${alpha})`;
      ctx.lineWidth = ring.kind === 'guard' ? 1 : 2;
      ctx.stroke();
    }
    for (const pebble of state.pebbles) {
      ctx.fillStyle = '#E8F2F0';
      ctx.beginPath();
      ctx.arc(pebble.x, pebble.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      // Lamp: a short bright wedge showing where the guard faces.
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.arc(guard.x, guard.y, 20, guard.angle - 0.35, guard.angle + 0.35);
      ctx.closePath();
      ctx.fillStyle = guard.state === 'chase' ? 'rgba(255, 93, 102, 0.35)' : 'rgba(255, 209, 102, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = guard.state === 'chase' ? PALETTE.danger : PALETTE.guard;
      ctx.fill();
      ctx.strokeStyle = PALETTE.guardDark;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Visor facing the look direction.
      ctx.beginPath();
      ctx.arc(guard.x + Math.cos(guard.angle) * 5, guard.y + Math.sin(guard.angle) * 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#1A2B32';
      ctx.fill();
      const mark = guard.state === 'chase' ? '!' : guard.state === 'suspicious' || guard.state === 'investigate' ? '?' : guard.state === 'search' ? '…' : '';
      if (mark) {
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = guard.state === 'chase' ? PALETTE.danger : PALETTE.evidence;
        ctx.fillText(mark, guard.x, guard.y - 22);
      }
      // Exposure arc over a guard that has started noticing the player.
      if (guard.exposure > 2) {
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, 17, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * guard.exposure) / 100);
        ctx.strokeStyle = guard.exposure >= 60 ? PALETTE.danger : PALETTE.cone;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  function drawPlayer(state, mouse) {
    const player = state.player;
    if (player.crouch) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, 16, 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(143, 255, 224, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Aim line toward the mouse while the player has pebbles to throw.
    if (mouse && mouse.inside && player.pebbles > 0 && state.status === 'playing') {
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(232, 242, 240, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.crouch ? 9 : 11, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.player;
    ctx.fill();
    ctx.strokeStyle = PALETTE.playerDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Satchel + facing tick: the diver reads as a person, not a dot.
    ctx.fillStyle = PALETTE.playerDark;
    ctx.fillRect(player.x - 3, player.y + 4, 6, 5);
    ctx.beginPath();
    ctx.moveTo(player.x + Math.cos(player.angle) * 11, player.y + Math.sin(player.angle) * 11);
    ctx.lineTo(player.x + Math.cos(player.angle + 2.6) * 6, player.y + Math.sin(player.angle + 2.6) * 6);
    ctx.lineTo(player.x + Math.cos(player.angle - 2.6) * 6, player.y + Math.sin(player.angle - 2.6) * 6);
    ctx.closePath();
    ctx.fillStyle = PALETTE.player;
    ctx.fill();
    if (player.crouch) drawLabel(ctx, 'JONGKOK', player.x, player.y - 24, PALETTE.player, 10);
  }

  return {
    draw(state, mouse) {
      drawFloor(state);
      drawObjectives(state);
      drawCones(state);
      drawRings(state);
      drawStructures(state);
      drawGuards(state);
      drawPlayer(state, mouse);
    },
  };
}
