function installHollowPortraits(project) {
  const stage = project.targets.find(target => target.isStage);
  const drawing = project.targets.find(target => target.name === 'Drawing');
  const definitions = new Map();
  for (const [id, block] of Object.entries(drawing.blocks)) {
    if (block.opcode === 'procedures_definition') {
      definitions.set(drawing.blocks[block.inputs.custom_block[1]].mutation.proccode, id);
    }
  }
  const reachable = new Set();
  function visit(id) {
    if (!id || reachable.has(id)) return;
    const block = drawing.blocks[id];
    if (!block) return;
    reachable.add(id);
    visit(block.next);
    for (const input of Object.values(block.inputs || {})) {
      for (const value of input) if (typeof value === 'string' && drawing.blocks[value]) visit(value);
    }
    if (block.opcode === 'procedures_call') visit(definitions.get(block.mutation.proccode));
  }
  visit(definitions.get('DrawPlayer at %s %s'));
  const sprite = JSON.parse(JSON.stringify(drawing));
  sprite.name = 'Character Portrait';
  sprite.visible = false;
  sprite.blocks = Object.fromEntries([...reachable].map(id => [id, sprite.blocks[id]]));
  sprite.comments = {};
  const privateIds = new Map();
  const mutableLists = new Set();
  for (const kind of ['variables', 'lists']) {
    for (const [id, [name, value]] of Object.entries(stage[kind])) {
      const privateId = 'portrait-' + id;
      privateIds.set(id, privateId);
      sprite[kind][privateId] = [name, kind === 'lists' ? [] : value];
    }
  }
  for (const block of Object.values(sprite.blocks)) {
    if (block.fields?.LIST && /^(data_addtolist|data_deleteoflist|data_deletealloflist|data_insertatlist|data_replaceitemoflist)$/.test(block.opcode)) {
      mutableLists.add(block.fields.LIST[1]);
    }
    for (const field of Object.values(block.fields || {})) {
      if (privateIds.has(field[1])) field[1] = privateIds.get(field[1]);
    }
    for (const input of Object.values(block.inputs || {})) {
      for (const value of input) {
        if (Array.isArray(value) && [12, 13].includes(value[0]) && privateIds.has(value[2])) {
          value[2] = privateIds.get(value[2]);
        }
      }
    }
    if (block.opcode === 'pen_stamp') block.opcode = 'jello_portraitstamp';
  }
  const broadcast = 'Render Character Portrait';
  const hat = 'jello-portrait-hat';
  stage.broadcasts[hat] = broadcast;
  sprite.blocks[hat] = { opcode: 'event_whenbroadcastreceived', parent: null, next: hat + '-draw',
    inputs: {}, fields: { BROADCAST_OPTION: [broadcast, hat] }, topLevel: true };
  sprite.blocks[hat + '-draw'] = { opcode: 'procedures_call', parent: hat, next: hat + '-done',
    inputs: { pr: [1, [10, '0']], Ku: [1, [10, '0']] }, fields: {},
    mutation: { tagName: 'mutation', children: [], proccode: 'DrawPlayer at %s %s',
      argumentids: '["pr","Ku"]', warp: 'true' } };
  sprite.blocks[hat + '-done'] = { opcode: 'jello_portraitdone', parent: hat + '-draw',
    next: null, inputs: {}, fields: {} };
  project.targets.push(sprite);

  let runtime;
  let target;
  let original;
  let penSkin;
  let penDrawable;
  let active;
  let queue = Promise.resolve();
  const cache = new Map();
  const listIds = Object.fromEntries(Object.entries(stage.lists).map(([id, [name]]) => [name, id]));
  const variableIds = Object.fromEntries(Object.entries(stage.variables).map(([id, [name]]) => [name, id]));
  function set(name, value) {
    const id = listIds[name] || variableIds[name];
    if (id) target.variables[privateIds.get(id)].value = value;
  }

  function render(character) {
    return new Promise((resolve, reject) => {
      const live = runtime.getTargetForStage().variables;
      for (const [id, privateId] of privateIds) {
        const value = live[id].value;
        target.variables[privateId].value = Array.isArray(value) && mutableLists.has(id) ? value.slice() : value;
      }
      for (const id of [...Object.keys(drawing.variables), ...Object.keys(drawing.lists)]) {
        const value = original.variables[id].value;
        target.variables[id].value = Array.isArray(value) ? value.slice() : value;
      }
      for (const [name, value] of Object.entries(character.lists)) set(name, value.slice());
      for (const [name, value] of Object.entries(character.variables)) set(name, value);
      const inventory = character.lists['PLAYER Inventory'];
      set('PLAYER CurrentWornList', Array.from({ length: 8 }, (_, index) => inventory[88 + index * 2] || 0));
      set('PLAYER Buffs', []);
      for (const [name, value] of Object.entries({
        PlyBodyState: 2, PlyLegState: 0, PlyDir: 0, PlyWingState: 0,
        HeldTime: 0, HeldID: 0, invHoldID: 0, InvHoldAmount: 0, LightLevelFound: 0
      })) set(name, value);
      target.variables.ic.value = 1;
      runtime.renderer.penClear(penSkin);
      active = { resolve, reject };
      const threads = runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: broadcast }, target);
      if (!threads.length) {
        active = undefined;
        reject(new Error('Character portrait could not start.'));
      }
    });
  }

  return {
    start(engine) {
      runtime = engine;
      target = runtime.targets.find(target => target.isOriginal && target.getName() === sprite.name);
      original = runtime.targets.find(target => target.isOriginal && target.getName() === 'Drawing');
      penSkin = runtime.renderer.createPenSkin();
      penDrawable = runtime.renderer.createDrawable('pen');
      runtime.renderer.updateDrawableSkinId(penDrawable, penSkin);
      runtime.renderer.updateDrawableVisible(penDrawable, false);
    },
    stamp(args, util) {
      runtime.renderer.penStamp(penSkin, util.target.drawableID);
    },
    done() {
      if (!active) return;
      const job = active;
      active = undefined;
      try {
        runtime.renderer.updateDrawableVisible(penDrawable, true);
        const { imageData } = runtime.renderer.extractDrawableScreenSpace(penDrawable);
        const source = document.createElement('canvas');
        source.width = imageData.width;
        source.height = imageData.height;
        source.getContext('2d').putImageData(imageData, 0, 0);
        let left = source.width;
        let right = -1;
        let top = source.height;
        let bottom = -1;
        for (let y = 0; y < source.height; y++) {
          for (let x = 0; x < source.width; x++) {
            if (imageData.data[(y * source.width + x) * 4 + 3]) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
        }
        if (right < left) throw new Error('Character portrait was empty.');
        const portrait = document.createElement('canvas');
        portrait.width = 60;
        portrait.height = 72;
        const context = portrait.getContext('2d');
        context.imageSmoothingEnabled = false;
        const width = right - left + 1;
        const height = bottom - top + 1;
        const scale = Math.min(52 / width, 64 / height);
        context.drawImage(source, left, top, width, height,
          (60 - width * scale) / 2, (72 - height * scale) / 2, width * scale, height * scale);
        job.resolve(portrait.toDataURL());
      } catch (error) { job.reject(error); }
      finally { runtime.renderer.updateDrawableVisible(penDrawable, false); }
    },
    draw(character, canvas) {
      const signature = JSON.stringify([character.lists['PLAYER ColourData'],
        character.lists['PLAYER Inventory'].slice(88), character.lists['PLAYER Vanity'], character.variables.Gender]);
      if (!cache.has(signature)) {
        const pending = queue.then(() => render(character));
        queue = pending.catch(() => {});
        cache.set(signature, pending);
        pending.catch(() => cache.delete(signature));
      }
      cache.get(signature).then(url => {
        const image = new Image();
        image.onload = () => {
          const context = canvas.getContext('2d');
          canvas.width = 60;
          canvas.height = 72;
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0);
        };
        image.src = url;
      }).catch(error => console.warn('Could not draw character portrait', error));
    }
  };
}
