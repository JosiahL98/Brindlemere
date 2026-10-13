// How each villager and animal is baked from its Tripo model: height in game units, any pole it
// holds, and its actions. Shared by tools/bake-mesh.js and tools/viewer/.
//
// An action is id=clip:frames[:cycle|:once][:speed]. The clip is one of the model's Tripo
// animations (assets/tripo/<name>/anim-<clip>.glb), or a move posed by script in
// tools/bake/bake.mjs: @hammer, @thrust, @fork for villagers (over their idle pose), !rest, !lunge,
// !flinch, !die for animals (over the rig's standing pose). cycle finds the loop in a longer clip;
// once plays through once (a strike); speed quickens playback.
// Animals: wide is the frame's half-width in heights, foot the bone whose sweep gives the walk's
// stride, flip that it dies on its back; they have no dialogue portrait.
const TALKER = 'idle=idle:4,walk=walk:8:cycle,talk=agree:4';
const BEAST = 'idle=!rest:4,walk=walk:8:cycle,attack=!lunge:6:once,pain=!flinch:3:once,death=!die:7:once';
export const BAKES = {
  elsa: { height: 58, actions: TALKER },
  tobin: { height: 62, actions: `${TALKER},work=@hammer:6:cycle,attack=@hammer:5:once` },
  pip: { height: 46, actions: TALKER },
  bram: { height: 60, actions: 'idle=idle:4,talk=agree:4' },
  marta: { height: 59, actions: 'idle=idle:4,talk=agree:4' },
  cedric: { height: 62, actions: 'idle=idle:4' },
  hilda: { height: 59, actions: 'idle=idle:4' },
  wren: { height: 58, actions: 'idle=idle:4' },
  alden: { height: 61, actions: 'idle=idle:4' },
  godwin: { height: 59, actions: TALKER },
  agnes: { height: 55, actions: TALKER },
  nell: { height: 58, actions: `${TALKER},attack=slash:5:once` },
  rolf: { height: 62, prop: 'spear', actions: 'idle=idle:4,walk=walk:8:cycle,attack=@thrust:6:once' },
  odo: { height: 61, prop: 'pitchfork', actions: `${TALKER},attack=@thrust:6:once,work=@fork:6:cycle` },
  wolf: { height: 36, wide: 1.1, foot: 'tripo0_Left_Limb_3', beast: true, actions: BEAST },
  rat: { height: 25, wide: 1.1, foot: 'tripo0_Left_Limb_3', beast: true, actions: BEAST },
  mudcrab: { height: 24, wide: 1.0, foot: 'tripo0_Left_Limb_5', flip: true, beast: true, actions: BEAST },
  cat: { height: 14, wide: 1.0, foot: 'tripo0_Left_Limb_3', beast: true, actions: 'idle=!rest:4,walk=walk:8:cycle' },
};

export function parseActions(spec) {
  return spec.split(',').map((s) => {
    const [id, rest] = s.split('='), [clip, frames, flag, speed] = rest.split(':');
    return { id, clip, frames: +frames, cycle: flag === 'cycle', once: flag === 'once', speed: +speed || 1 };
  });
}

// Everything the baker needs for one of them (over: values given on the command line).
export function bakeConfig(name, over = {}) {
  const b = Object.assign({ height: 58, res: 2.5, wide: 0.45, foot: 'L_Foot', actions: TALKER }, BAKES[name] || {}, over);
  return {
    name, height: b.height, res: b.res, prop: b.prop || null, wide: b.wide, foot: b.foot, flip: !!b.flip,
    actions: parseActions(b.actions), beast: !!b.beast,
    // Head and shoulders for the dialogue panel, framed like renderPortrait() (not for animals).
    portrait: b.beast || b.noPortrait ? null : { res: 3, yaw: 0.22, pitchDeg: 2, halfWidth: 13, below: 12.5, above: 9 },
  };
}
