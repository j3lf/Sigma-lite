function installHollowCharacters(project) {
  const key = 'terrariaAltWorldsV1';
  const stage = project.targets.find(target => target.isStage);
  const portraits = installHollowPortraits(project);
  const legacy = installHollowLegacyImport(project);
  const listNames = ['PLAYER Inventory', 'PLAYER ColourData', 'PLAYER PiggyBank', 'PLAYER Safe', 'PLAYER Vanity'];
  const variableNames = ['PlyHp', 'PlyMaxHp', 'PlyMana', 'PlyMaxMana', 'PlyMaxManaT', 'Gender', 'Hair Style',
    'invHoldID', 'InvHoldAmount'];
  const lists = Object.fromEntries(listNames.map(name =>
    [name, Object.keys(stage.lists).find(id => stage.lists[id][0] === name)]));
  const variables = Object.fromEntries(variableNames.map(name =>
    [name, Object.keys(stage.variables).find(id => stage.variables[id][0] === name)]));
  const listLengths = { 'PLAYER Inventory': 110, 'PLAYER ColourData': 23,
    'PLAYER PiggyBank': 40, 'PLAYER Safe': 40, 'PLAYER Vanity': 6 };
  const scalar = value => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value);
  const initial = {
    lists: Object.fromEntries(listNames.map(name => [name, stage.lists[lists[name]][1].slice()])),
    variables: Object.fromEntries(variableNames.map(name => [name, stage.variables[variables[name]][1]]))
  };
  initial.variables['Hair Style'] = initial.lists['PLAYER ColourData'][21];
  let library = { characters: [], migrated: [] };
  let selected;
  let state;
  let choosing = false;
  let selectingBeforeWorld = false;
  let staged;
  let lastMenu;
  let characterDraft;
  let previousAppearance;
  let finishChoice;
  const select = document.getElementById('saved-character');
  const worldSelect = document.getElementById('saved-world');
  const message = document.getElementById('character-save-message');
  const dialog = document.getElementById('character-picker');
  const picker = document.getElementById('character-picker-list');
  const pickerStatus = document.getElementById('character-picker-status');
  const fileInput = document.getElementById('import-save-file');
  const back = document.getElementById('character-picker-back');
  // Keep the native world screen, and insert player selection before it.
  const menuBlocks = project.targets.find(target => target.name === 'Menu Buttons').blocks;
  for (const [id, destination] of [
    ['b!W', 'jello-characters'], ['b!~', 'jello-finish-character'],
    ['b#j', 'jello-cancel-character'], ['b!@', 'world'], ['b#q', 'newworld']
  ]) menuBlocks[id].inputs[')'] = [1, [10, destination]];
  // Ask the native gender question when finishing the player, before world setup.
  menuBlocks['di`'].inputs.OPERAND2 = [1, [10, 'jello-finish-character']];
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored?.characterLibrary) {
      validateLibrary(stored.characterLibrary);
      library = stored.characterLibrary;
    }
  } catch (error) {
    message.textContent = 'Could not read character saves. Import a backup to recover them.';
    console.warn(error);
  }

  function validateCharacter(character) {
    if (!character || typeof character.id !== 'string' || !character.id ||
        typeof character.name !== 'string' || !character.name.trim() || character.name.length > 80) {
      throw new Error('Invalid character.');
    }
    for (const name of listNames) {
      const items = character.lists?.[name];
      const minimum = name === 'PLAYER ColourData' ? 22 : listLengths[name];
      if (!Array.isArray(items) || items.length < minimum ||
          items.length > listLengths[name] || !items.every(scalar)) throw new Error('Invalid character inventory.');
    }
    if (!variableNames.every(name => scalar(character.variables?.[name]))) {
      throw new Error('Invalid character stats.');
    }
  }

  function validateLibrary(value) {
    if (!Array.isArray(value?.characters) || !Array.isArray(value?.migrated) ||
        !value.migrated.every(item => typeof item === 'string')) throw new Error('Invalid character library.');
    value.characters.forEach(validateCharacter);
    if (new Set(value.characters.map(character => character.id)).size !== value.characters.length) {
      throw new Error('Duplicate character IDs.');
    }
  }

  const copy = value => JSON.parse(JSON.stringify(value));
  function readCharacter() {
    const character = {
      lists: Object.fromEntries(listNames.map(name => [name, state[lists[name]].value.slice(0, listLengths[name])])),
      variables: Object.fromEntries(variableNames.map(name => [name, state[variables[name]].value]))
    };
    character.variables['Hair Style'] = character.lists['PLAYER ColourData'][21];
    return character;
  }

  function applyCharacter(character) {
    for (const name of listNames) state[lists[name]].value = character.lists[name].slice();
    for (const name of variableNames) state[variables[name]].value = character.variables[name];
    // Beds belong to the world, so enter at that world's spawn.
    for (const name of ['PlySpawnX', 'PlySpawnY']) {
      const id = Object.keys(stage.variables).find(id => stage.variables[id][0] === name);
      if (id) state[id].value = 0;
    }
  }

  function writeLibrary(next) {
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    stored.characterLibrary = next;
    localStorage.setItem(key, JSON.stringify(stored));
    library = next;
    render();
  }

  function createCharacter(name, data = initial) {
    const character = { id: crypto.randomUUID(), name: name.trim(), ...copy(data) };
    validateCharacter(character);
    return character;
  }

  function render() {
    const previous = select.value;
    select.replaceChildren();
    for (const character of library.characters) {
      select.add(new Option(character.name, character.id));
    }
    select.value = selected || previous || library.characters[0]?.id || '';
    document.getElementById('export-character').disabled = !select.value;
    if (state) {
      const previousWorld = worldSelect.value;
      worldSelect.replaceChildren();
      state['.worldNames'].value.forEach((name, index) => worldSelect.add(new Option(name, String(index))));
      if (previousWorld) worldSelect.value = previousWorld;
      document.getElementById('export-world').disabled = !worldSelect.value;
    }
  }
  render();
  select.addEventListener('change', () => { selected = select.value || undefined; });

  function fingerprint() {
    const worldIndex = Number(state['7z'].value) - 1;
    const worldName = state['.worldNames'].value[worldIndex - 1] || 'World';
    const code = String(state['.worldCodes'].value[worldIndex] || '');
    return saveFingerprint(worldName, code);
  }

  function saveFingerprint(worldName, code) {
    let hash = 2166136261;
    for (let index = 0; index < code.length; index++) hash = Math.imul(hash ^ code.charCodeAt(index), 16777619);
    return worldName + ':' + code.length + ':' + (hash >>> 0);
  }

  function newCharacter() {
    const name = prompt('Character name');
    if (!name?.trim()) return;
    try {
      const character = createCharacter(name);
      previousAppearance = {
        colours: state[lists['PLAYER ColourData']].value.slice(),
        gender: state[variables.Gender].value,
        hair: state[variables['Hair Style']].value
      };
      characterDraft = character;
      state[lists['PLAYER ColourData']].value = character.lists['PLAYER ColourData'].slice();
      state[variables.Gender].value = character.variables.Gender;
      state[variables['Hair Style']].value = character.variables['Hair Style'];
      dialog.close();
      state.lw.value = 'character';
      vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
      vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'DrawPlayerMainMenu' });
    } catch (error) { report(error); }
  }

  function finishCharacter(save) {
    if (save) {
      characterDraft.lists['PLAYER ColourData'] = state[lists['PLAYER ColourData']].value.slice();
      characterDraft.variables.Gender = state[variables.Gender].value;
      characterDraft.variables['Hair Style'] = characterDraft.lists['PLAYER ColourData'][21];
      const next = copy(library);
      next.characters.push(characterDraft);
      writeLibrary(next);
      selected = characterDraft.id;
      select.value = selected;
    }
    state[lists['PLAYER ColourData']].value = previousAppearance.colours;
    state[variables.Gender].value = previousAppearance.gender;
    state[variables['Hair Style']].value = previousAppearance.hair;
    characterDraft = undefined;
    previousAppearance = undefined;
    state.lw.value = 'jello-characters';
    vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
    renderPicker();
    dialog.showModal();
  }

  function report(error) {
    message.textContent = error.message;
    pickerStatus.textContent = error.message;
  }

  function renderPicker() {
    picker.replaceChildren();
    if (!library.characters.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Create a player with New, or import a character save.';
      picker.append(empty);
    }
    for (const character of library.characters) {
      const card = document.createElement('article');
      card.className = 'player-card';
      const portrait = document.createElement('canvas');
      portrait.className = 'player-avatar';
      portrait.width = 20;
      portrait.height = 24;
      portrait.setAttribute('aria-label', 'Character preview');
      portraits.draw(character, portrait);
      const name = document.createElement('h3');
      name.className = 'player-name';
      name.textContent = character.name;
      const stats = document.createElement('div');
      stats.className = 'player-stats';
      for (const text of ['♥ ' + character.variables.PlyMaxHp + ' HP',
        '★ ' + character.variables.PlyMaxManaT + ' MP']) {
        const stat = document.createElement('span');
        stat.textContent = text;
        stats.append(stat);
      }
      const actions = document.createElement('div');
      actions.className = 'player-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '▶ Play';
      button.setAttribute('aria-label', 'Play as ' + character.name);
      button.addEventListener('click', () => {
        selected = character.id;
        if (selectingBeforeWorld) {
          state.lw.value = 'characters';
          vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
        } else {
          applyCharacter(character);
        }
        select.value = selected;
        dialog.close();
        if (finishChoice) {
          finishChoice();
          finishChoice = undefined;
        }
      });
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.textContent = 'Export';
      exportButton.setAttribute('aria-label', 'Export ' + character.name);
      exportButton.addEventListener('click', () => {
        select.value = character.id;
        document.getElementById('export-character').click();
      });
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.setAttribute('aria-label', 'Delete ' + character.name);
      deleteButton.addEventListener('click', () => {
        if (!confirm('Delete "' + character.name + '" and its saved items?')) return;
        try {
          const next = copy(library);
          next.characters = next.characters.filter(saved => saved.id !== character.id);
          writeLibrary(next);
          if (selected === character.id) selected = undefined;
          if (staged?.id === character.id) staged = undefined;
          render();
          renderPicker();
        } catch (error) { report(error); }
      });
      actions.append(button, exportButton, deleteButton);
      card.append(portrait, name, stats, actions);
      picker.append(card);
    }
  }

  async function chooseCharacter() {
    if (choosing) return;
    choosing = true;
    try {
      const worldName = state['.worldNames'].value[Number(state['7z'].value) - 2] || 'World';
      const worldCode = state['.worldCodes'].value[Number(state['7z'].value) - 1];
      const source = fingerprint();
      // Only migrate a character embedded in a previously saved world.
      // A newly generated world has no save code and uses the selected player.
      if (typeof worldCode === 'string' && worldCode.length > 50 && !library.migrated.includes(source)) {
        const next = copy(library);
        next.characters.push(createCharacter(worldName.slice(0, 65) + ' character', readCharacter()));
        next.migrated.push(source);
        writeLibrary(next);
      }
      const character = library.characters.find(character => character.id === selected);
      if (character) {
        applyCharacter(character);
        return;
      }
      pickerStatus.textContent = 'Choose a character to bring into this world.';
      selectingBeforeWorld = false;
      back.disabled = true;
      renderPicker();
      await new Promise(resolve => {
        finishChoice = resolve;
        dialog.showModal();
      });
    } catch (error) {
      report(error);
      // A storage failure must keep the original world character playable.
      selected = undefined;
    } finally {
      choosing = false;
      back.disabled = false;
    }
  }

  const extension = {
    getInfo() {
      return { id: 'jello', name: 'Hollow Saves', blocks: [
        { opcode: 'choosecharacter', blockType: 'command', text: 'Choose character' },
        { opcode: 'portraitstamp', blockType: 'command', text: 'Draw portrait layer' },
        { opcode: 'portraitdone', blockType: 'command', text: 'Finish portrait' },
        { opcode: 'legacynoop', blockType: 'command', text: 'Skip legacy display' },
        { opcode: 'legacydone', blockType: 'command', text: 'Finish legacy import' },
        { opcode: 'legacyerror', blockType: 'command', text: 'Reject invalid legacy save' }
      ] };
    },
    choosecharacter: chooseCharacter,
    portraitstamp: (args, util) => portraits.stamp(args, util),
    portraitdone: () => portraits.done(),
    legacynoop() {},
    legacydone: () => legacy.done(),
    legacyerror: () => legacy.invalid()
  };
  const service = vm.extensionManager._registerInternalExtension(extension);
  vm.extensionManager._loadedExtensions.set('jello', service);

  // Run after native decoding, before the game starts using the player data.
  {
    const previous = 'eQ';
    const blocks = project.targets.find(target => target.name === 'Main').blocks;
    const id = 'jello-select-world-character';
    const next = blocks[previous].next;
    blocks[previous].next = id;
    blocks[id] = { opcode: 'jello_choosecharacter', next, parent: previous, inputs: {}, fields: {} };
    if (next) blocks[next].parent = id;
  }

  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filename = name => name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 70);
  document.getElementById('picker-new-character').addEventListener('click', newCharacter);
  back.addEventListener('click', () => {
    if (choosing) return;
    selected = undefined;
    state.lw.value = 'main';
    vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
    dialog.close();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!choosing) back.click();
  });
  document.getElementById('export-character').addEventListener('click', () => {
    const character = library.characters.find(character => character.id === select.value);
    if (character) download({ format: 'hollow-updated', version: 1, type: 'character', character },
      filename(character.name) + '.json');
  });
  document.getElementById('export-saves').addEventListener('click', () => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      saved.worlds ||= state['.worldCodes'].value.slice();
      saved.names ||= state['.worldNames'].value.slice();
      saved.icons ||= state['.worldIcons'].value.slice();
      saved.characterLibrary = library;
      download({ format: 'hollow-updated', version: 1, type: 'backup', saves: saved }, 'hollow-updated-saves.json');
      message.textContent = 'Exported the last manually saved worlds and characters.';
    } catch (error) { report(error); }
  });
  document.getElementById('export-world').addEventListener('click', () => {
    const index = Number(worldSelect.value);
    if (!worldSelect.value) return;
    const name = state['.worldNames'].value[index];
    download({ format: 'hollow-updated', version: 1, type: 'backup', saves: {
      worlds: [state['.worldCodes'].value[0], state['.worldCodes'].value[index + 1]],
      names: [name], icons: [state['.worldIcons'].value[index]],
      characterLibrary: { characters: [], migrated: [] }
    } }, filename(name) + '.json');
  });
  document.getElementById('import-saves').addEventListener('click', () => fileInput.click());
  const legacyDialog = document.getElementById('legacy-import-dialog');
  const legacyStatus = document.getElementById('legacy-import-status');
  const legacySubmit = document.getElementById('legacy-import-submit');
  document.getElementById('import-legacy-save').addEventListener('click', () => {
    legacyStatus.textContent = '';
    legacyDialog.showModal();
  });
  const cancelLegacy = () => {
    legacy.cancel();
    legacyDialog.close();
  };
  document.getElementById('legacy-import-cancel').addEventListener('click', cancelLegacy);
  legacyDialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancelLegacy();
  });
  document.getElementById('legacy-import-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (legacySubmit.disabled) return;
    const name = document.getElementById('legacy-world-name').value.trim();
    const characterName = document.getElementById('legacy-character-name').value.trim();
    const code = document.getElementById('legacy-save-code').value.trim();
    if (!name || !characterName) {
      legacyStatus.textContent = 'Enter a world name and a character name.';
      return;
    }
    legacySubmit.disabled = true;
    legacyStatus.textContent = 'Importing world and character…';
    try {
      const decoded = await legacy.decode(code);
      const data = {
        lists: Object.fromEntries(listNames.map(name =>
          [name, (name === 'PLAYER Vanity' ? initial.lists[name] : decoded[name]).slice()])),
        variables: Object.fromEntries(variableNames.map(name => [name, decoded[name]]))
      };
      data.variables['Hair Style'] = data.lists['PLAYER ColourData'][21];
      data.variables.invHoldID = 0;
      data.variables.InvHoldAmount = 0;
      const character = createCharacter(characterName, data);
      const next = copy(library);
      next.characters.push(character);
      const source = saveFingerprint(name, code);
      if (!next.migrated.includes(source)) next.migrated.push(source);
      const stored = {
        worlds: state['.worldCodes'].value.concat(code),
        names: state['.worldNames'].value.concat(name),
        icons: state['.worldIcons'].value.concat(1),
        characterLibrary: next
      };
      localStorage.setItem(key, JSON.stringify(stored));
      state['.worldCodes'].value = stored.worlds;
      state['.worldNames'].value = stored.names;
      state['.worldIcons'].value = stored.icons;
      library = next;
      render();
      if (dialog.open) renderPicker();
      vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
      legacyStatus.textContent = 'World and character imported.';
      legacyDialog.close();
      document.getElementById('legacy-save-code').value = '';
      message.textContent = 'Legacy world and character imported.';
      pickerStatus.textContent = 'Legacy world and character imported.';
    } catch (error) {
      legacyStatus.textContent = error.message;
    } finally {
      legacySubmit.disabled = false;
    }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported.format !== 'hollow-updated' || imported.version !== 1) throw new Error('Unsupported save file.');
      const next = copy(library);
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (imported.type === 'character') {
        validateCharacter(imported.character);
        next.characters.push({ ...copy(imported.character), id: crypto.randomUUID() });
      } else if (imported.type === 'backup') {
        const saves = imported.saves;
        if (!Array.isArray(saves?.worlds) || !Array.isArray(saves.names) || !Array.isArray(saves.icons) ||
            saves.worlds.length !== saves.names.length + 1 || saves.icons.length !== saves.names.length ||
            !saves.worlds.every(code => typeof code === 'string' || code === 0) ||
            !saves.names.every(name => typeof name === 'string') || !saves.icons.every(scalar)) {
          throw new Error('Invalid world backup.');
        }
        validateLibrary(saves.characterLibrary);
        for (const character of saves.characterLibrary.characters) {
          next.characters.push({ ...copy(character), id: crypto.randomUUID() });
        }
        next.migrated = [...new Set([...next.migrated, ...saves.characterLibrary.migrated])];
        stored.worlds = (stored.worlds || state['.worldCodes'].value).concat(saves.worlds.slice(1));
        stored.names = (stored.names || state['.worldNames'].value).concat(saves.names);
        stored.icons = (stored.icons || state['.worldIcons'].value).concat(saves.icons);
      } else {
        throw new Error('Unsupported save type.');
      }
      stored.characterLibrary = next;
      localStorage.setItem(key, JSON.stringify(stored));
      library = next;
      if (imported.type === 'backup') {
        state['.worldCodes'].value = stored.worlds.slice();
        state['.worldNames'].value = stored.names.slice();
        state['.worldIcons'].value = stored.icons.slice();
        vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
      }
      render();
      if (dialog.open) renderPicker();
      message.textContent = 'Save imported. Imported characters are added as new copies.';
    } catch (error) { report(error); }
  });

  return {
    start(runtime) {
      state = runtime.getTargetForStage().variables;
      portraits.start(runtime);
      legacy.start(runtime);
      for (const [alias, name] of [['.worldCodes', 'MENU Worlds'], ['.worldNames', 'MENU WorldNames'],
        ['.worldIcons', 'MENU TreeIcons']]) state[alias] = state[Object.keys(stage.lists).find(id => stage.lists[id][0] === name)];
      render();
    },
    update(current) {
      const menu = current.lw.value;
      if (characterDraft && ['jello-finish-character', 'jello-cancel-character'].includes(menu)) {
        try {
          finishCharacter(menu === 'jello-finish-character');
        } catch (error) {
          current.lw.value = 'character';
          vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: 'Button MenuUpdate' });
          report(error);
        }
      }
      if (menu === 'jello-characters' && !dialog.open && !choosing) {
        selectingBeforeWorld = true;
        pickerStatus.textContent = '';
        back.disabled = false;
        renderPicker();
        dialog.showModal();
      }
      if (menu === 'main' && lastMenu !== 'main') {
        selected = undefined;
        render();
      }
      lastMenu = menu;
    },
    stageSave() {
      if (selected) staged = { id: selected, ...readCharacter() };
    },
    pack() {
      const next = copy(library);
      if (staged) {
        const character = next.characters.find(character => character.id === staged.id);
        if (character) Object.assign(character, staged);
        const source = fingerprint();
        if (!next.migrated.includes(source)) next.migrated.push(source);
      }
      return next;
    },
    committed(next) { library = next; staged = undefined; render(); }
  };
}
