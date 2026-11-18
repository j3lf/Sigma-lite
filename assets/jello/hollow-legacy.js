function installHollowLegacyImport(project) {
  const stage = project.targets.find(target => target.isStage);
  const loader = project.targets.find(target => target.name === 'Load');
  const importer = JSON.parse(JSON.stringify(loader));
  importer.name = 'Legacy Save Import';
  importer.visible = false;
  importer.comments = {};
  const privateIds = new Map();
  const mutableLists = new Set();
  for (const kind of ['variables', 'lists']) {
    for (const [id, [name, value]] of Object.entries(stage[kind])) {
      const privateId = 'legacy-import-' + id;
      privateIds.set(id, privateId);
      importer[kind][privateId] = [name, kind === 'lists' ? [] : value];
    }
  }
  for (const [id, block] of Object.entries(importer.blocks)) {
    if (block.opcode === 'event_whenbroadcastreceived') {
      delete importer.blocks[id];
      continue;
    }
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
    if (/^(event_broadcast|event_broadcastandwait|looks_switchbackdropto|looks_switchbackdroptoandwait|data_showvariable|data_hidevariable|data_showlist|data_hidelist|pen_clear|pen_stamp)$/.test(block.opcode)) {
      block.opcode = 'jello_legacynoop';
      block.inputs = {};
      block.fields = {};
    }
    if (['sensing_askandwait', 'control_stop'].includes(block.opcode)) {
      block.opcode = 'jello_legacyerror';
      block.inputs = {};
      block.fields = {};
    }
    if (block.opcode === 'procedures_definition') {
      // Keep large imports interruptible while retaining native decoding speed.
      const comment = 'legacy-timer-' + id;
      block.comment = comment;
      importer.comments[comment] = { blockId: id, x: 0, y: 0, width: 160, height: 60,
        minimized: true, text: 'tw stuck' };
      const prototype = importer.blocks[block.inputs.custom_block[1]];
      if (prototype.mutation.proccode === 'UpdateDisplay %s') block.next = null;
    }
  }
  const inputId = privateIds.get(Object.keys(stage.variables).find(id => stage.variables[id][0] === 'Cmp Input'));
  const outputId = privateIds.get(Object.keys(stage.variables).find(id => stage.variables[id][0] === 'Cmp DecompressedCode'));
  const broadcast = 'Decode Legacy Save';
  const hat = 'jello-legacy-import';
  stage.broadcasts[hat] = broadcast;
  function block(id, opcode, parent, next, inputs = {}, fields = {}) {
    importer.blocks[id] = { opcode, parent, next, inputs, fields };
  }
  block(hat, 'event_whenbroadcastreceived', null, hat + '-branch', {},
    { BROADCAST_OPTION: [broadcast, hat] });
  importer.blocks[hat].topLevel = true;
  block(hat + '-branch', 'control_if_else', hat, hat + '-done', {
    CONDITION: [2, hat + '-compressed'], SUBSTACK: [2, hat + '-decompress'], SUBSTACK2: [2, hat + '-raw']
  });
  block(hat + '-compressed', 'operator_equals', hat + '-branch', null, {
    OPERAND1: [3, hat + '-first', [10, '']], OPERAND2: [1, [10, 'v']]
  });
  block(hat + '-first', 'operator_letter_of', hat + '-compressed', null, {
    LETTER: [1, [6, '1']], STRING: [3, [12, 'Cmp Input', inputId], [10, '']]
  });
  function call(id, parent, next, prototypeId, argumentId, valueId) {
    block(id, 'procedures_call', parent, next, {
      [argumentId]: [3, [12, valueId === inputId ? 'Cmp Input' : 'Cmp DecompressedCode', valueId], [10, '']]
    });
    importer.blocks[id].mutation = { ...importer.blocks[prototypeId].mutation };
  }
  call(hat + '-decompress', hat + '-branch', hat + '-load', 'b+X', 'Bc', inputId);
  call(hat + '-load', hat + '-decompress', null, 'b+b', 'vl', outputId);
  call(hat + '-raw', hat + '-branch', null, 'b+b', 'vl', inputId);
  block(hat + '-done', 'jello_legacydone', hat + '-branch', null);
  project.targets.push(importer);
  let runtime;
  let target;
  let pending;
  function fail(error) {
    if (!pending) return;
    const job = pending;
    pending = undefined;
    clearTimeout(job.timeout);
    runtime.stopForTarget(target);
    job.reject(error);
  }
  return {
    start(engine) {
      runtime = engine;
      target = runtime.targets.find(target => target.isOriginal && target.getName() === importer.name);
    },
    decode(code) {
      if (pending) return Promise.reject(new Error('A legacy import is already running.'));
      if (code.length < 50 || !/^(v\d+ |c\s+\d+|\d)/i.test(code)) {
        return Promise.reject(new Error('Paste a complete original save code.'));
      }
      return new Promise((resolve, reject) => {
        const live = runtime.getTargetForStage().variables;
        for (const [id, privateId] of privateIds) {
          const value = live[id].value;
          target.variables[privateId].value = Array.isArray(value) && mutableLists.has(id) ? [] : value;
        }
        target.variables[inputId].value = code;
        pending = { resolve, reject, timeout: setTimeout(() =>
          fail(new Error('This save code could not be decoded. Check that the entire code was pasted.')), 30000) };
        const threads = runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: broadcast }, target);
        if (!threads.length) fail(new Error('Legacy importer could not start.'));
      });
    },
    cancel() { fail(new Error('Import canceled.')); },
    invalid() { fail(new Error('This code contains invalid or unsupported world data.')); },
    done: finish
  };

  function finish() {
    if (!pending) return;
    const result = {};
    for (const kind of ['variables', 'lists']) {
      for (const [id, [name]] of Object.entries(stage[kind])) {
        if (!privateIds.has(id)) continue;
        result[name] = target.variables[privateIds.get(id)].value;
      }
    }
    const width = Number(result.Width);
    const height = Number(result.Height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        result['WORLD Tiles'].length !== width * height ||
        result['PLAYER Inventory'].length !== 110 || result['PLAYER ColourData'].length < 22) {
      fail(new Error('This code does not contain a supported world and character save.'));
      return;
    }
    const job = pending;
    pending = undefined;
    clearTimeout(job.timeout);
    job.resolve(result);
  }
}
