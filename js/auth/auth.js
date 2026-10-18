import {
  getAuthGoogleChallenge,
  postGoogleAuth,
  postRegisterAccount,
  getCurrentAccount,
  postLogout,
  postRecoveryVerify,
  postRecoveryComplete,
  getAccountVault
} from "../services/api.js";

let currentUser = null;

function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent("emnifun-auth-changed"));
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return currentUser !== null;
}

export async function hydrateAuth() {
  try {
    const result = await getCurrentAccount();
    currentUser = result?.user || null;
  } catch {
    currentUser = null;
  }

  return currentUser;
}

export async function getGoogleChallenge(nonce = null) {
  return getAuthGoogleChallenge(nonce);
}

export async function loginWithGoogle({ challengeId, credential }) {
  const result = await postGoogleAuth({ challengeId, credential });

  if (result?.user) {
    currentUser = result.user;
    notifyAuthChanged();
  }

  return result;
}

export async function registerAccount({ registrationChallenge, gamerTag }) {
  const result = await postRegisterAccount({
    registrationChallenge,
    gamerTag
  });

  if (result?.user) {
    currentUser = result.user;
    notifyAuthChanged();
  }

  return result;
}

export async function startRecovery({ gamerTag, recoveryKey, googleNonce }) {
  return postRecoveryVerify({ gamerTag, recoveryKey, googleNonce });
}

export async function completeRecovery({ recoveryChallenge, credential }) {
  const result = await postRecoveryComplete({
    recoveryChallenge,
    credential
  });

  if (result?.user) {
    currentUser = result.user;
    notifyAuthChanged();
  }

  return result;
}

export async function getVault() {
  return getAccountVault();
}

export async function logout() {
  try {
    await postLogout();
  } finally {
    currentUser = null;
    notifyAuthChanged();
  }
}