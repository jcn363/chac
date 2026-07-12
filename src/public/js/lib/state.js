let currentSession = null;

export function getCurrentSession() {
  return currentSession;
}

export function setCurrentSession(id) {
  currentSession = id;
}
