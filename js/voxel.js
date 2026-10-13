'use strict';
// Voxel models: a sculpted Shape sampled onto a grid once, with every surface voxel lit and
// coloured the way a sprite pixel would be. The game ray-casts these per pixel (render.js), so a
// voxel prop is a solid object in the world that looks right from any side, above included.
//
// A model is { nx, ny, nz, S, ox, oy, oz, data, dist }: S world units per voxel, (ox, oy, oz) the
// grid's corner in the shape's own space, data[(iy * nz + iz) * nx + ix] a palette index
// (| 0x100 if fullbright) or 0xFFFF for empty, and dist the chessboard distance to the nearest
// solid voxel, which lets rays jump across empty space.

const VOX_LIGHT = V.norm([-0.45, 0.8, 0.4]); // mostly from above, a little from the front left
const VOX_HALF = V.norm(V.add(VOX_LIGHT, [0, 0.3, 1]));
const VOX_BRICK = 4;

function voxelize(shape, opt) {
  const job = voxelJob(shape, opt);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

// The same, as a generator that yields every few bricks so callers can spread the work out.
function* voxelJob(shape, opt = {}) {
  const S = opt.size || 1, B = VOX_BRICK;
  const all = shape.prims.slice().sort((a, b) => a.order - b.order);
  const N = all.length;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of all) {
    if (p.sub) continue;
    const r = p.br + p.k;
    minX = Math.min(minX, p.bc[0] - r); maxX = Math.max(maxX, p.bc[0] + r);
    minY = Math.min(minY, p.bc[1] - r); maxY = Math.max(maxY, p.bc[1] + r);
    minZ = Math.min(minZ, p.bc[2] - r); maxZ = Math.max(maxZ, p.bc[2] + r);
  }
  if (!N || minX > maxX) return null;
  // Nothing below the ground: the grid starts at y = 0.
  const ox = (Math.floor(minX / S) - 1) * S, oy = Math.max(0, Math.floor(minY / S) * S), oz = (Math.floor(minZ / S) - 1) * S;
  const nx = Math.ceil((maxX - ox) / S) + 2, ny = Math.max(1, Math.ceil((maxY - oy) / S) + 1), nz = Math.ceil((maxZ - oz) / S) + 2;
  const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B), nbz = Math.ceil(nz / B);
  const NV = nx * ny * nz;
  const solid = new Uint8Array(NV);
  const field = new Float32Array(NV).fill(1e9); // distance at each solid voxel's centre
  const brickList = new Array(nbx * nby * nbz).fill(null);
  const NEAR = 4.6; // normal and ambient-occlusion samples reach this far off the surface
  const hb = B * S * Math.sqrt(3) / 2;
  const cand = new Int32Array(N);
  let work = 0;

  // Coarse pass over bricks, then each voxel of the bricks the surface passes through.
  for (let by = 0; by < nby; by++) for (let bz = 0; bz < nbz; bz++) for (let bx = 0; bx < nbx; bx++) {
    const cx = ox + (bx * B + B / 2) * S, cy = oy + (by * B + B / 2) * S, cz = oz + (bz * B + B / 2) * S;
    let nc = 0;
    for (let k = 0; k < N; k++) {
      const p = all[k], r = p.br + p.k + hb + NEAR;
      const dx = cx - p.bc[0], dy = cy - p.bc[1], dz = cz - p.bc[2];
      if (dx * dx + dy * dy + dz * dz <= r * r) cand[nc++] = k;
    }
    if (!nc) continue;
    const dc = sceneDist(all, cand, nc, cx, cy, cz, false);
    if (dc > hb + 0.5) continue;
    const list = cand.slice(0, nc);
    brickList[(by * nbz + bz) * nbx + bx] = list;
    for (let y = by * B; y < Math.min(ny, by * B + B); y++) for (let z = bz * B; z < Math.min(nz, bz * B + B); z++) for (let x = bx * B; x < Math.min(nx, bx * B + B); x++) {
      const d = sceneDist(all, list, nc, ox + (x + 0.5) * S, oy + (y + 0.5) * S, oz + (z + 0.5) * S, false);
      if (d < 0.15 * S) { const i = (y * nz + z) * nx + x; solid[i] = 1; field[i] = d; }
    }
    if ((work += B * B * B) > 6000) { work = 0; yield; }
  }

  // Shadow-ray culling, as in spriteJob: prim centres along and across the light.
  const L = VOX_LIGHT, LA = V.norm(V.cross(L, [0, 1, 0.01])), LB = V.cross(L, LA);
  const la = new Float64Array(N), lb = new Float64Array(N), ll = new Float64Array(N), wr = new Float64Array(N);
  for (let k = 0; k < N; k++) { const p = all[k]; la[k] = V.dot(p.bc, LA); lb[k] = V.dot(p.bc, LB); ll[k] = V.dot(p.bc, L); wr[k] = p.br + p.k; }
  const shad = new Int32Array(N);
  const data = new Uint16Array(NV).fill(0xFFFF);
  const isSolid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && solid[(y * nz + z) * nx + x] === 1;

  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = (y * nz + z) * nx + x;
      if (!solid[i]) continue;
      // Hidden inside: never the first thing a ray meets.
      if (isSolid(x - 1, y, z) && isSolid(x + 1, y, z) && isSolid(x, y + 1, z) && isSolid(x, y, z - 1) && isSolid(x, y, z + 1) && (y === 0 || isSolid(x, y - 1, z))) { data[i] = 0; continue; }
      const list = brickList[(Math.floor(y / B) * nbz + Math.floor(z / B)) * nbx + Math.floor(x / B)];
      const nn = list.length;
      let px = ox + (x + 0.5) * S, py = oy + (y + 0.5) * S, pz = oz + (z + 0.5) * S;
      // Normal (tetrahedron technique), then the nearest point on the surface.
      const e = 0.25;
      const f1 = sceneDist(all, list, nn, px + e, py - e, pz - e, false);
      const f2 = sceneDist(all, list, nn, px - e, py - e, pz + e, false);
      const f3 = sceneDist(all, list, nn, px - e, py + e, pz - e, false);
      const f4 = sceneDist(all, list, nn, px + e, py + e, pz + e, false);
      let nX = f1 - f2 - f3 + f4, nY = -f1 - f2 + f3 + f4, nZ = -f1 + f2 - f3 + f4;
      const nl = Math.sqrt(nX * nX + nY * nY + nZ * nZ) || 1;
      nX /= nl; nY /= nl; nZ /= nl;
      const d0 = field[i];
      px -= nX * d0; py -= nY * d0; pz -= nZ * d0;
      _hitPrim = -1;
      sceneDist(all, list, nn, px, py, pz, true);
      const prim = all[_hitPrim >= 0 ? _hitPrim : list[0]];
      const m = prim.mat;
      const tdx = px - prim.to[0], tdy = py - prim.to[1], tdz = pz - prim.to[2];
      const lx = tdx * prim.tx[0] + tdy * prim.tx[1] + tdz * prim.tx[2] + prim.toff;
      const ly = tdx * prim.ty[0] + tdy * prim.ty[1] + tdz * prim.ty[2];
      const lz = tdx * prim.tz[0] + tdy * prim.tz[1] + tdz * prim.tz[2];
      let level;
      if (m.emissive) level = m.glow;
      else {
        const ndl = nX * L[0] + nY * L[1] + nZ * L[2];
        let sh = 1;
        if (ndl > 0) {
          let res = 1, tt = 0.9, ns = 0, tEnd = 0;
          const sx = px + nX * 0.4, sy = py + nY * 0.4, sz = pz + nZ * 0.4;
          const sa = sx * LA[0] + sy * LA[1] + sz * LA[2], sb = sx * LB[0] + sy * LB[1] + sz * LB[2], sl = sx * L[0] + sy * L[1] + sz * L[2];
          for (let k = 0; k < N; k++) {
            const r = wr[k] + 0.6, along = ll[k] - sl;
            if (along < -r || along > 46 + r) continue;
            const da = la[k] - sa, db = lb[k] - sb;
            if (da * da + db * db <= r * r) { shad[ns++] = k; if (along + r > tEnd) tEnd = along + r; }
          }
          tEnd = Math.min(tEnd, 46);
          for (let s = 0; s < 28 && tt < tEnd && ns; s++) {
            const d = sceneDist(all, shad, ns, sx + L[0] * tt, sy + L[1] * tt, sz + L[2] * tt, false);
            if (d < 0.05) { res = 0; break; }
            res = Math.min(res, 5 * d / tt);
            tt += clamp(d, 0.35, 6);
          }
          sh = 0.25 + 0.75 * res;
        }
        let occ = 0, sca = 1;
        for (let s = 1; s <= 4; s++) {
          const hh = 0.9 * s;
          occ += (hh - sceneDist(all, list, nn, px + nX * hh, py + nY * hh, pz + nZ * hh, false)) * sca;
          sca *= 0.65;
        }
        const ao = clamp(1 - occ * 0.13, 0, 1);
        // The sprite's fill light comes from the viewer; here it is spread over the sides.
        let I = m.amb + m.dif * Math.max(ndl, 0) * sh + m.fill * (0.45 + 0.4 * Math.abs(nZ) + 0.25 * Math.abs(nX));
        I *= 1 - m.ao * (1 - ao);
        let spec = 0;
        if (m.spec > 0) spec = m.spec * Math.pow(Math.max(0, nX * VOX_HALF[0] + nY * VOX_HALF[1] + nZ * VOX_HALF[2]), m.shin) * sh;
        level = (I * m.gain + spec) * (RAMP_LEN - 1) + m.bias;
        // The underside of a ledge or a canopy reads darker, like the sprites' crease lines.
        if (nY < -0.5) level -= 1;
      }
      if (m.noise) {
        const f = m.nf;
        level += ((vnoise(lx * f, ly * f, lz * f) * 2 - 1) + (vnoise(lx * f * 2.9 + 7, ly * f * 2.9, lz * f * 2.9) * 2 - 1) * 0.6
          + (vnoise(lx * 3.1 + 11, ly * 3.1, lz * 3.1) * 2 - 1) * 0.45) * m.noise;
      }
      if (m.pattern) level += m.pattern(lx, ly, lz);
      let ramp = m.ramp;
      if (m.rampFn) { const rr = m.rampFn(lx, ly, lz, level); ramp = rr[0]; level = rr[1]; }
      level += (BAYER4[((x + z * 3) & 3) + (((y + z) & 3) << 2)] / 16 - 0.47) * m.dither;
      data[i] = ((ramp & 0xFF) + clamp(Math.round(level), 0, RAMP_LEN - 1)) | (m.emissive ? 0x100 : 0);
    }
    if ((work += nx * nz) > 1500) { work = 0; yield; }
  }

  // Chessboard distance to the nearest solid voxel: one forward and one backward sweep over the
  // 26 neighbours, capped at 31.
  const dist = new Uint8Array(NV);
  for (let i = 0; i < NV; i++) dist[i] = solid[i] ? 0 : 31;
  const sweep = (dir) => {
    const y0 = dir > 0 ? 0 : ny - 1, z0 = dir > 0 ? 0 : nz - 1, x0 = dir > 0 ? 0 : nx - 1;
    for (let y = y0; y >= 0 && y < ny; y += dir) for (let z = z0; z >= 0 && z < nz; z += dir) for (let x = x0; x >= 0 && x < nx; x += dir) {
      const i = (y * nz + z) * nx + x;
      let d = dist[i];
      if (!d) continue;
      // Neighbours already visited in this sweep's order.
      for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && (dz > 0 || (dz === 0 && dx >= 0))) continue;
        const X = x + dx * dir, Y = y + dy * dir, Z = z + dz * dir;
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const v = dist[(Y * nz + Z) * nx + X] + 1;
        if (v < d) d = v;
      }
      dist[i] = d;
    }
  };
  sweep(1);
  yield;
  sweep(-1);
  return { nx, ny, nz, S, ox, oy, oz, data, dist };
}
