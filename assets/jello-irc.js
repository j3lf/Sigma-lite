(() => {
  const preference = 'jelloIrcEnabled';
  const page = location.pathname.split('/').pop().toLowerCase() || 'index.html';
  let enabled = localStorage.getItem(preference) === 'true';
  let generation = 0;
  let stop = () => {};
  let toastContainer;
  let parentIRC;
  try {
    if (parent !== window) parentIRC = parent.JelloIRC;
  } catch {}

  function updateControls(error = '') {
    document.querySelectorAll('[data-jello-irc]').forEach(input => {
      input.checked = enabled;
      input.title = error || 'Show online in Jello Portal and receive chat notifications';
      const status = input.closest('[data-jello-irc-row]').querySelector('[data-irc-status]');
      status.textContent = error ? 'IRC unavailable' : '';
      status.hidden = !error;
    });
  }

  function addToggle(container, rowClass, switchClass) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = rowClass;
    row.dataset.jelloIrcRow = '';
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.textContent = 'IRC';
    const label = document.createElement('label');
    label.className = switchClass;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.jelloIrc = '';
    input.setAttribute('aria-label', 'IRC');
    input.checked = enabled;
    const slider = document.createElement('span');
    slider.className = 'slider';
    const status = document.createElement('small');
    status.dataset.ircStatus = '';
    status.hidden = true;
    status.setAttribute('role', 'status');
    label.append(input, slider);
    row.append(name, label, status);
    input.addEventListener('change', () => setEnabled(input.checked));
    container.append(row);
  }

  const quick = document.querySelector('#quickSettings .quick-settings-box');
  if (quick) addToggle(quick, 'quick-setting', 'switch');
  else if (page === 'jelloportal.html') addToggle(document.getElementById('quickSettings'), 'setting-row', 'toggle');
  if (page === 'settings.html') addToggle(document.querySelector('.container'), 'setting', 'switch');
  if (page === 'music.html') addToggle(document.querySelector('.library'), 'jello-irc-music', '');

  const styles = document.createElement('style');
  styles.textContent = `
    #jello-irc-notifications {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
      width: min(350px, calc(100vw - 40px)); display: grid; gap: 10px;
      pointer-events: none; font-family: inherit; text-align: left;
    }
    .jello-irc-toast {
      padding: 14px 16px; border: 1px solid #ffffff35; border-radius: 12px;
      background: #182236f2; color: #fff; box-shadow: 0 8px 30px #0005;
      overflow-wrap: anywhere; animation: jelloIrcIn .18s ease-out;
    }
    .jello-irc-toast strong { display: block; margin-bottom: 5px; font-size: 14px; color: #a9d2ff; }
    .jello-irc-toast p { margin: 0; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .jello-irc-music { display: flex; align-items: center; gap: 12px; margin-top: 18px; font: inherit; }
    [data-irc-status] { font-size: 11px; color: #ffb2b2; }
    @keyframes jelloIrcIn { from { transform: translateY(10px); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .jello-irc-toast { animation: none; } }
  `;
  document.head.append(styles);

  function notify(data) {
    if (!toastContainer?.isConnected) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'jello-irc-notifications';
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-relevant', 'additions');
      document.body.append(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = 'jello-irc-toast';
    const name = document.createElement('strong');
    name.textContent = data.username || 'Guest';
    const text = document.createElement('p');
    text.textContent = data.message;
    toast.append(name, text);
    toastContainer.append(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function isOwnMessage(key) {
    try {
      const sent = JSON.parse(localStorage.getItem('jelloOwnChatIDs') || '[]');
      return Array.isArray(sent) && sent.includes(key);
    } catch { return false; }
  }

  function report(error) {
    console.warn('Jello IRC connection failed', error);
    updateControls(error.message || 'Could not connect to Jello Portal.');
  }

  async function connect() {
    const current = ++generation;
    stop();
    stop = () => {};
    if (!enabled || parentIRC) return;
    let cleanup = () => {};
    try {
      const shared = await loadJelloFirebase();
      const { sdk } = shared;
      if (current !== generation || !enabled) return;
      const database = shared.getJelloDatabase();
      const identity = shared.getJelloIdentity();
      const subscriptions = [];
      let removePresence = () => {};
      cleanup = () => {
        subscriptions.forEach(unsubscribe => unsubscribe());
        removePresence();
      };
      stop = cleanup;
      if (page !== 'jelloportal.html') {
        removePresence = shared.connectJelloPresence(database, error => {
          if (current === generation) report(error);
        });
      }
      const chat = sdk.ref(database, 'jelloChat');
      const latest = await sdk.get(sdk.query(chat, sdk.orderByKey(), sdk.limitToLast(1)));
      if (current !== generation || !enabled) {
        cleanup();
        return;
      }
      let lastKey;
      latest.forEach(child => { lastKey = child.key; });
      const stream = lastKey ? sdk.query(chat, sdk.orderByKey(), sdk.startAfter(lastKey)) :
        sdk.query(chat, sdk.orderByKey());
      subscriptions.push(sdk.onChildAdded(stream, snapshot => {
        if (current !== generation || !enabled) return;
        const data = snapshot.val();
        if (!data || typeof data.message !== 'string' || !data.message.trim() ||
            data.userId === identity || isOwnMessage(snapshot.key)) return;
        notify(data);
      }, error => {
        if (current === generation) report(error);
      }));
    } catch (error) {
      // Chat read failures must not remove an otherwise healthy online presence.
      if (current === generation && enabled) report(error);
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    localStorage.setItem(preference, String(enabled));
    if (parentIRC) parentIRC.setEnabled(enabled);
    updateControls();
    toastContainer?.replaceChildren();
    connect();
  }

  window.JelloIRC = { setEnabled, isEnabled: () => enabled, refresh: connect };
  window.addEventListener('storage', event => {
    if (event.key === preference || event.key === null) {
      enabled = localStorage.getItem(preference) === 'true';
      updateControls();
      toastContainer?.replaceChildren();
      connect();
    } else if (event.key === 'sigmaJelloUsername' || event.key === 'jelloPresenceID') {
      connect();
    }
  });
  window.addEventListener('pagehide', () => {
    generation++;
    stop();
    stop = () => {};
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) connect();
  });
  updateControls();
  connect();

})();
