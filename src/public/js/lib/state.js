let currentSession = null;
let currentToken = null;

export function getCurrentSession() {
  return currentSession;
}

export function setCurrentSession(id) {
  currentSession = id;
}

export function getCurrentToken() {
  return currentToken;
}

export function setCurrentToken(token) {
  currentToken = token;
}
