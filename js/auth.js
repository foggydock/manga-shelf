const Auth = (() => {
  let currentSession = null;
  function _c() { return window.DB?.getClient?.() || null; }

  async function refreshSession() {
    const c = _c();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    currentSession = data.session;
    return data.session;
  }

  async function signInWithPassword(email, password) {
    const c = _c();
    if (!c) return { error: { message: "未接続" } };
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (!error) currentSession = data.session;
    return { data, error };
  }

  async function signOut() {
    const c = _c();
    if (!c) return { error: { message: "未接続" } };
    return await c.auth.signOut();
  }

  function onChange(cb) {
    const c = _c();
    if (!c) return null;
    return c.auth.onAuthStateChange((event, session) => {
      currentSession = session;
      cb(event, session);
    });
  }

  function getUserId() { return currentSession?.user?.id || null; }
  function isLoggedIn() { return !!currentSession; }

  return { refreshSession, signInWithPassword, signOut, onChange, getUserId, isLoggedIn };
})();
window.Auth = Auth;
