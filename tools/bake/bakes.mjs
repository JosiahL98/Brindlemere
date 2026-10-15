// How each villager and animal is baked from its Tripo model: height in game units, any pole it
// holds, and its actions. Shared by tools/bake-mesh.js and tools/viewer/.
//
// An action is id=clip:frames[:cycle|:once][:speed]. The clip is one of the model's Tripo
// animations (assets/tripo/<name>/anim-<clip>.glb), ~Name for a move captured from a real person
// (assets/adobemokap/<Name>.fbx, a Mixamo-rigged FBX retargeted onto the model; none in use: the
// game's moves are keyframed until the user's own captures are ready), or a move posed by script:
// @hammer, @smite, @thrust, @jab, @fork, @stab for villagers (tools/bake/body.mjs, over their idle
// pose), !rest, !lunge, !flinch, !die for animals (tools/bake/bake.mjs, over the rig's standing
// pose). cycle finds the loop in a longer clip; once plays through once (a strike); speed quickens
// playback.
// wide is the frame's half-width in heights and top its top (for animals, which are long, and for
// a spear or pitchfork, which sticks out). Animals: foot is the bone whose sweep gives the walk's
// stride, flip that it dies on its back; they have no dialogue portrait. upright: a hand bone whose
// held item (Bram's mug) is kept standing up whatever the animation does to the hand. hold: what
// the right hand holds, for scripted moves to point it: which way it points (d) and, for a hammer,
// which way its striking face looks (n), in the hand bone's frame. regrip: see regrip() in body.mjs.
const TALKER = 'idle=idle:4,walk=walk:8:cycle,talk=agree:4';
const BEAST = 'idle=!rest:4,walk=walk:8:cycle,attack=!lunge:6:once,pain=!flinch:3:once,death=!die:7:once';
export const BAKES = {
  elsa: { height: 58, actions: TALKER },
  tobin: { height: 62, actions: `${TALKER},work=@hammer:8:cycle,attack=@smite:8:once`,
    regrip: { hand: 'R_Hand', through: [0, 0.071, -0.004], axis: [1, 0, -0.07], head: 0.09, tail: -0.05, slide: 0.08, end: -0.075, r: 0.0135 },
    hold: { d: [1, 0, -0.07], n: [0, 0.616, -0.788], neutral: 82 } },
  pip: { height: 46, actions: TALKER },
  bram: { height: 60, upright: 'R_Hand', actions: 'idle=idle:4,talk=agree:4' },
  marta: { height: 59, actions: 'idle=idle:4,talk=agree:4' },
  cedric: { height: 62, actions: 'idle=idle:4' },
  hilda: { height: 59, actions: 'idle=idle:4' },
  wren: { height: 58, actions: 'idle=idle:4' },
  alden: { height: 61, actions: 'idle=idle:4' },
  godwin: { height: 59, actions: TALKER },
  agnes: { height: 55, actions: TALKER },
  nell: { height: 58, actions: `${TALKER},attack=@stab:8:once`, hold: { d: [0.42, 0.86, 0.28] } },
  rolf: { height: 62, prop: 'spear', wide: 1.5, top: 1.45, actions: 'idle=idle:4,walk=walk:8:cycle,attack=@thrust:8:once' },
  odo: { height: 61, prop: 'pitchfork', wide: 1.4, top: 1.3, actions: `${TALKER},attack=@jab:8:once,work=@fork:8:cycle` },
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
    name, height: b.height, res: b.res, prop: b.prop || null, wide: b.wide, top: b.top || 1.12, foot: b.foot, flip: !!b.flip, upright: b.upright || null,
    hold: b.hold || null, regrip: b.regrip || null,
    actions: parseActions(b.actions), beast: !!b.beast,
    // Head and shoulders for the dialogue panel, framed like renderPortrait() (not for animals).
    portrait: b.beast || b.noPortrait ? null : { res: 3, yaw: 0.22, pitchDeg: 2, halfWidth: 13, below: 12.5, above: 9 },
  };
}
