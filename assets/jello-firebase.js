let jelloFirebaseLoading;
function loadJelloFirebase() {
  if (!jelloFirebaseLoading) {
    jelloFirebaseLoading = Promise.all([
      import("https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js")
    ]).then(([appSDK, sdk]) => {
      const { initializeApp, getApps } = appSDK;
      const { getDatabase, ref, push, onValue, onDisconnect, serverTimestamp, set, remove } = sdk;
      const config = {
        apiKey: 'AIzaSyAIZJ7mReibw8J48F6yRut7GQAqWMalN-E',
        authDomain: 'sigma-jello.firebaseapp.com',
        databaseURL: 'https://sigma-jello-default-rtdb.firebaseio.com',
        projectId: 'sigma-jello',
        storageBucket: 'sigma-jello.firebasestorage.app',
        messagingSenderId: '643520880930',
        appId: '1:643520880930:web:2d06c3244f500be039c57b'
      };

      function getJelloDatabase() {
        const app = getApps().find(app => app.name === '[DEFAULT]') || initializeApp(config);
        return getDatabase(app);
      }

      let identity;
      function getJelloIdentity() {
        identity = localStorage.getItem('jelloPresenceID');
        if (!identity) {
          identity = globalThis.crypto?.randomUUID?.() || 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2);
          localStorage.setItem('jelloPresenceID', identity);
        }
        return identity;
      }

      function connectJelloPresence(database, reportError = console.warn) {
        const userId = getJelloIdentity();
        const connectionId = push(ref(database, 'jelloPresence')).key;
        const connection = ref(database, 'jelloPresence/' + userId + '~' + connectionId);
        const disconnect = onDisconnect(connection);
        let active = true;
        let generation = 0;
        const unsubscribe = onValue(ref(database, '.info/connected'), async snapshot => {
          const current = ++generation;
          if (snapshot.val() !== true) return;
          try {
            await disconnect.remove();
            if (!active || current !== generation) return;
            await set(connection, {
              username: localStorage.getItem('sigmaJelloUsername') || 'Guest',
              connectedAt: serverTimestamp()
            });
            if (!active) await remove(connection);
          } catch (error) {
            if (active) reportError(error);
          }
        }, reportError);

        return () => {
          active = false;
          generation++;
          unsubscribe();
          // Keep server-side cleanup armed until the removal has been acknowledged.
          remove(connection).then(() => disconnect.cancel()).catch(console.warn);
        };
      }

      return { getJelloDatabase, getJelloIdentity, connectJelloPresence, sdk };
    }).catch(error => { jelloFirebaseLoading = undefined; throw error; });
  }
  return jelloFirebaseLoading;
}
