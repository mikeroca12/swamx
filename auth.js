// ---- MOC TOOLBOX: SHARED AUTH (auth.js) ----
// Include Firebase SDK scripts BEFORE this file:
//   firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js

(function() {
  // ---- FIREBASE CONFIG ----
  var firebaseConfig = {
    apiKey: "AIzaSyDCTMWVKxFaQ1yqv3JuMy5XRSVR_74k6Ao",
    authDomain: "moctoolbox.firebaseapp.com",
    projectId: "moctoolbox",
    storageBucket: "moctoolbox.firebasestorage.app",
    messagingSenderId: "736001885411",
    appId: "1:736001885411:web:7f28d24ed86505757071d6"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  var db = firebase.firestore();
  var auth = firebase.auth();

  // Expose globally
  window.MOC_DB = db;
  window.MOC_AUTH = auth;
  window.CURRENT_USER = null;

  var ACCESS_CODE = '8889';
  window.MOC_ACCESS_CODE = ACCESS_CODE;

  // ---- SAFETY TIMEOUT ----
  // Forces a loading/login state visible after 2s if auth hasn't resolved
  var _authResolved = false;
  setTimeout(function() {
    if (!_authResolved) {
      document.body.style.opacity = '1';
      // If this is index.html (has login overlay), show it
      var overlay = document.getElementById('loginOverlay');
      if (overlay) overlay.classList.add('visible');
      // If this is a sub-page, redirect to index
      if (!overlay) window.location.href = 'index.html';
    }
  }, 2000);

  // ---- AUTH STATE LISTENER ----
  auth.onAuthStateChanged(function(user) {
    _authResolved = true;
    if (user) {
      db.collection('controllers').doc(user.uid).get().then(function(doc) {
        if (doc.exists) {
          window.CURRENT_USER = doc.data();
          window.CURRENT_USER.uid = user.uid;
          document.body.style.opacity = '1';
          // Fire custom event so each page can react
          window.dispatchEvent(new CustomEvent('moc-auth-ready'));
        } else {
          // Signed in but UID not in controllers - sign out
          auth.signOut();
          _handleNoAuth('Account not found in roster.');
        }
      }).catch(function() {
        _handleNoAuth('Error loading profile. Try again.');
      });
    } else {
      _handleNoAuth('');
    }
  });

  function _handleNoAuth(errMsg) {
    document.body.style.opacity = '1';
    var overlay = document.getElementById('loginOverlay');
    if (overlay) {
      // We're on index.html - show login
      overlay.classList.add('visible');
      var errEl = document.getElementById('loginError');
      if (errEl && errMsg) errEl.textContent = errMsg;
    } else {
      // We're on a sub-page - redirect to index
      window.location.href = 'index.html';
    }
  }

  // ---- LOGIN FUNCTION ----
  window.mocDoLogin = function(enumInput, codeInput) {
    var enumVal = enumInput.trim().toUpperCase().replace(/^E/, '');
    var code = codeInput.trim();

    if (!enumVal) return { error: 'Enter your employee number.' };
    if (!code) return { error: 'Enter the access code.' };
    if (code !== ACCESS_CODE) return { error: 'Invalid access code.' };

    // Check roster
    db.collection('controllers').where('enumVal', '==', enumVal).get().then(function(snap) {
      if (snap.empty) {
        var errEl = document.getElementById('loginError');
        if (errEl) errEl.textContent = 'E# not recognized. Contact your admin.';
        _resetLoginBtn();
        return;
      }

      var rosterDoc = snap.docs[0];
      var rosterData = rosterDoc.data();
      var email = 'moc' + enumVal + '@moctoolbox.com';
      var password = ACCESS_CODE + enumVal;

      auth.signInWithEmailAndPassword(email, password).then(function(cred) {
        if (rosterDoc.id !== cred.user.uid) {
          db.collection('controllers').doc(cred.user.uid).set(rosterData);
        }
      }).catch(function(err) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          auth.createUserWithEmailAndPassword(email, password).then(function(cred) {
            db.collection('controllers').doc(cred.user.uid).set(rosterData);
          }).catch(function() {
            var errEl = document.getElementById('loginError');
            if (errEl) errEl.textContent = 'Error creating account. Try again.';
            _resetLoginBtn();
          });
        } else {
          var errEl = document.getElementById('loginError');
          if (errEl) errEl.textContent = 'Login error. Try again.';
          _resetLoginBtn();
        }
      });
    }).catch(function() {
      var errEl = document.getElementById('loginError');
      if (errEl) errEl.textContent = 'Network error. Check connection.';
      _resetLoginBtn();
    });

    return { error: null };
  };

  function _resetLoginBtn() {
    var btn = document.getElementById('loginBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'SIGN IN'; }
  }

  // ---- ROLE HELPERS ----
  window.mocCanEdit = function() {
    return window.CURRENT_USER && (window.CURRENT_USER.role === 'admin' || window.CURRENT_USER.role === 'editor');
  };

  window.mocIsAdmin = function() {
    return window.CURRENT_USER && window.CURRENT_USER.role === 'admin';
  };

  window.mocSignOut = function() {
    auth.signOut().then(function() {
      window.location.href = 'index.html';
    });
  };

  // ---- ROSTER SYNC (ADMIN ONLY) ----
  // Call this from an admin button, NOT on every page load
  window.mocSyncRoster = function() {
    if (!window.mocIsAdmin()) {
      console.log('Roster sync: admin only');
      return Promise.reject('Not admin');
    }
    return fetch('moc-roster.json').then(function(r) { return r.json(); }).then(function(roster) {
      var batch = db.batch();
      roster.forEach(function(c) {
        var ref = db.collection('controllers').doc('E' + c.enumVal);
        batch.set(ref, c, { merge: true });
      });
      return batch.commit().then(function() {
        return roster.length;
      });
    });
  };

})();
