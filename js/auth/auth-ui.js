import {
  completeRecovery,
  getGoogleChallenge,
  getCurrentUser,
  getVault,
  loginWithGoogle,
  logout,
  registerAccount,
  startRecovery
} from "./auth.js";
import { AuthApiError } from "../services/api.js";

export const GOOGLE_CLIENT_ID =
  "474720562463-f64vlq15je8q5or8ud1gbr4fvkio8o29.apps.googleusercontent.com";

const GOOGLE_SCRIPT_WAIT_MS = 5000;
const GOOGLE_SCRIPT_POLL_MS = 50;

let googleInitialized = false;
let googleInstance = null;
let googleNonce = null;
let googleInitializationPromise = null;
let pageNoncePromise = null;
let activeCredentialHandler = null;

function waitForGoogleIdentityServices() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        window.clearInterval(timer);
        resolve(window.google);
        return;
      }

      if (Date.now() - startedAt >= GOOGLE_SCRIPT_WAIT_MS) {
        window.clearInterval(timer);
        reject(new Error("Google sign-in could not be loaded."));
      }
    }, GOOGLE_SCRIPT_POLL_MS);
  });
}

async function initializeGoogleIdentityServices(nonce) {
  if (googleInitialized) {
    if (googleNonce !== nonce) {
      throw new Error("Google sign-in state is unavailable. Please reload the page.");
    }
    return googleInstance;
  }

  if (googleInitializationPromise) {
    return googleInitializationPromise;
  }

  googleInitializationPromise = waitForGoogleIdentityServices().then((google) => {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce,
      ux_mode: "popup",
      context: "signin",
      auto_select: false,
      callback: async (response) => {
        if (!response?.credential || !activeCredentialHandler) return;
        await activeCredentialHandler(response.credential);
      }
    });

    googleInitialized = true;
    googleInstance = google;
    googleNonce = nonce;
    return google;
  });

  try {
    return await googleInitializationPromise;
  } finally {
    googleInitializationPromise = null;
  }
}

async function makeGoogleButton(container, { nonce, onCredential, text }) {
  container.replaceChildren();
  const google = await initializeGoogleIdentityServices(nonce);
  activeCredentialHandler = onCredential;

  google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "rectangular",
    text
  });
}

async function ensurePageGoogleNonce() {
  if (googleNonce) return googleNonce;

  if (!pageNoncePromise) {
    pageNoncePromise = getGoogleChallenge().then((challenge) => {
      googleNonce = challenge.nonce;
      return googleNonce;
    }).finally(() => {
      pageNoncePromise = null;
    });
  }

  return pageNoncePromise;
}

function setText(element, text, className = "") {
  element.textContent = text;
  element.className = className;
}

function authErrorMessage(error, fallback) {
  return error instanceof AuthApiError
    ? error.message
    : error?.message || fallback;
}

async function prepareLoginButton(buttonBox, feedbackBox, registrationState) {
  try {
    const nonce = await ensurePageGoogleNonce();
    const challenge = await getGoogleChallenge(nonce);
    await makeGoogleButton(buttonBox, {
      nonce,
      text: "signin_with",
      onCredential: async (credential) => {
        buttonBox.setAttribute("aria-busy", "true");
        setText(feedbackBox, "Checking your Google account…");

        try {
          const result = await loginWithGoogle({
            challengeId: challenge.challengeId,
            credential
          });

          if (result.needsRegistration) {
            registrationState.challenge = result.registrationChallenge;
            buttonBox.classList.add("hidden");
            feedbackBox.textContent = "";
            feedbackBox.className = "auth-feedback";
            registrationState.show();
            return;
          }

          setText(feedbackBox, "Signed in.", "auth-feedback success");
        } catch (error) {
          setText(
            feedbackBox,
            authErrorMessage(error, "Google sign-in could not be completed."),
            "auth-feedback error"
          );
        } finally {
          buttonBox.removeAttribute("aria-busy");
        }
      }
    });
  } catch (error) {
    setText(
      feedbackBox,
      authErrorMessage(error, "Google sign-in could not be loaded."),
      "auth-feedback error"
    );
  }
}

export function renderLoginPage(container) {
  container.innerHTML = `
    <div class="auth-shell">
      <section class="auth-card" aria-labelledby="signin-heading">
        <h2 id="signin-heading">Sign in to EmniFun</h2>
        <p>Use your Google account to access your permanent EmniFun account.</p>
        <div id="google-login-button" class="google-button-box"></div>
        <p id="login-feedback" class="auth-feedback" aria-live="polite"></p>

        <div id="registration-panel" class="auth-subpanel hidden">
          <h3>Choose your Gamer Tag</h3>
          <p>Your Gamer Tag is permanent and is required for future account recovery.</p>
          <form id="registration-form" class="auth-form">
            <label for="gamer-tag">Gamer Tag</label>
            <input id="gamer-tag" name="gamerTag" type="text" maxlength="32" autocomplete="nickname" required>
            <button class="button" type="submit">Create permanent account</button>
          </form>
          <p id="registration-feedback" class="auth-feedback" aria-live="polite"></p>
        </div>
      </section>

      <section class="auth-card" aria-labelledby="recovery-heading">
        <h2 id="recovery-heading">Recover an account</h2>
        <p>Recovery requires both your permanent Gamer Tag and one valid recovery key.</p>
        <form id="recovery-form" class="auth-form">
          <label for="recovery-gamer-tag">Gamer Tag</label>
          <input id="recovery-gamer-tag" name="gamerTag" type="text" maxlength="32" autocomplete="username" required>
          <label for="recovery-key">Recovery Key</label>
          <input id="recovery-key" name="recoveryKey" type="text" maxlength="16" minlength="16" inputmode="text" spellcheck="false" autocomplete="off" required>
          <button class="button secondary" type="submit">Verify recovery details</button>
        </form>
        <p id="recovery-feedback" class="auth-feedback" aria-live="polite"></p>
        <div id="recovery-google-button" class="google-button-box hidden"></div>
      </section>
    </div>
  `;

  const googleButton = container.querySelector("#google-login-button");
  const loginFeedback = container.querySelector("#login-feedback");
  const registrationPanel = container.querySelector("#registration-panel");
  const registrationForm = container.querySelector("#registration-form");
  const registrationFeedback = container.querySelector("#registration-feedback");
  const gamerTagInput = container.querySelector("#gamer-tag");
  const recoveryForm = container.querySelector("#recovery-form");
  const recoveryFeedback = container.querySelector("#recovery-feedback");
  const recoveryGoogleButton = container.querySelector("#recovery-google-button");

  const registrationState = {
    challenge: null,
    show() {
      registrationPanel.classList.remove("hidden");
      gamerTagInput.focus();
    }
  };

  registrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!registrationState.challenge) return;

    const gamerTag = gamerTagInput.value.trim();
    registrationFeedback.textContent = "Creating your permanent account…";
    registrationFeedback.className = "auth-feedback";

    try {
      await registerAccount({
        registrationChallenge: registrationState.challenge,
        gamerTag
      });
      window.location.hash = "account/vault";
    } catch (error) {
      setText(
        registrationFeedback,
        authErrorMessage(error, "Your account could not be created."),
        "auth-feedback error"
      );
    }
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(recoveryForm);
    recoveryFeedback.textContent = "Verifying recovery details…";
    recoveryFeedback.className = "auth-feedback";

    try {
      const result = await startRecovery({
        gamerTag: String(formData.get("gamerTag") || ""),
        recoveryKey: String(formData.get("recoveryKey") || ""),
        googleNonce: await ensurePageGoogleNonce()
      });

      recoveryForm.classList.add("hidden");
      recoveryGoogleButton.classList.remove("hidden");
      setText(
        recoveryFeedback,
        "Recovery verified. Continue with a new Google account to replace the current one.",
        "auth-feedback success"
      );

      try {
        await makeGoogleButton(recoveryGoogleButton, {
          nonce: googleNonce,
          text: "continue_with",
          onCredential: async (credential) => {
          recoveryGoogleButton.setAttribute("aria-busy", "true");
          setText(
            recoveryFeedback,
            "Verifying the new Google account…"
          );

          try {
            await completeRecovery({
              recoveryChallenge: result.recoveryChallenge,
              credential
            });
            window.location.hash = "account/vault";
          } catch (error) {
            setText(
              recoveryFeedback,
              "Recovery details could not be verified.",
              "auth-feedback error"
            );
            recoveryGoogleButton.classList.add("hidden");
            recoveryForm.classList.remove("hidden");
          } finally {
            recoveryGoogleButton.removeAttribute("aria-busy");
          }
          }
        });
      } catch (error) {
        recoveryGoogleButton.classList.add("hidden");
        recoveryForm.classList.remove("hidden");
        setText(
          recoveryFeedback,
          "Google sign-in could not be loaded.",
          "auth-feedback error"
        );
      }
    } catch (error) {
      setText(
        recoveryFeedback,
        "Recovery details could not be verified.",
        "auth-feedback error"
      );
    }
  });

  void prepareLoginButton(googleButton, loginFeedback, registrationState);
}

function renderAccountOverview(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="account-panel">
      <h3>Account</h3>
      <dl class="account-details">
        <div><dt>Gamer Tag</dt><dd id="account-gamer-tag"></dd></div>
        <div><dt>Identity</dt><dd>Permanent EmniFun account</dd></div>
      </dl>
      <p>Your Gamer Tag and permanent account remain the same when the linked Google account is replaced.</p>
      <button class="button secondary" id="account-logout" type="button">Sign out</button>
    </div>
  `;

  container.querySelector("#account-gamer-tag").textContent = user.gamerTag;
  container.querySelector("#account-logout").addEventListener("click", async () => {
    await logout();
  });
}

function renderVaultPanel(container) {
  container.innerHTML = `
    <div class="account-panel">
      <div class="account-panel-heading">
        <div>
          <h3>Recovery Vault</h3>
          <p>Your two current recovery keys are kept in the permanent vault.</p>
        </div>
      </div>
      <div id="vault-content" class="vault-grid"></div>
    </div>
  `;

  const vaultContent = container.querySelector("#vault-content");
  vaultContent.innerHTML = '<p class="auth-feedback">Loading your recovery vault…</p>';

  void loadVault(vaultContent);
}

async function loadVault(vaultContent) {
  try {
    const result = await getVault();
    vaultContent.replaceChildren();

    for (const key of result.keys || []) {
      const card = document.createElement("article");
      card.className = "vault-key-card";

      const heading = document.createElement("h4");
      heading.textContent = `Recovery Key ${key.slot}`;
      card.appendChild(heading);

      const code = document.createElement("code");
      code.className = "vault-key";
      code.textContent = key.viewable ? key.key : key.maskedKey;
      card.appendChild(code);

      const status = document.createElement("p");
      status.className = "vault-key-status";
      status.textContent = key.viewable
        ? "Currently viewable. Save it somewhere private."
        : "This key remains valid for recovery, but its viewing period has expired.";
      card.appendChild(status);

      if (key.viewable) {
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "button secondary";
        copyButton.textContent = "Copy key";
        copyButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(key.key);
            status.textContent = "Copied. Keep the key private.";
          } catch {
            status.textContent = "Copy is unavailable in this browser. Select the key and copy it manually.";
          }
        });
        card.appendChild(copyButton);
      }

      vaultContent.appendChild(card);
    }
  } catch (error) {
    vaultContent.replaceChildren();
    const message = document.createElement("p");
    message.className = "auth-feedback error";
    message.textContent = authErrorMessage(
      error,
      "The recovery vault could not be loaded."
    );
    vaultContent.appendChild(message);
  }
}

export function renderAccountPage(container, route) {
  if (!getCurrentUser()) {
    container.innerHTML = '<div class="placeholder"><h2>Sign in required</h2><p>Please sign in to open your account.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="account-shell">
      <div class="account-tabs" role="tablist" aria-label="Account sections">
        <a class="account-tab${route === "account" ? " active" : ""}" href="#account" role="tab" aria-selected="${route === "account" ? "true" : "false"}">Account</a>
        <a class="account-tab${route === "account/vault" ? " active" : ""}" href="#account/vault" role="tab" aria-selected="${route === "account/vault" ? "true" : "false"}">Vault</a>
      </div>
      <div id="account-panel-host"></div>
    </div>
  `;

  const host = container.querySelector("#account-panel-host");
  if (route === "account/vault") {
    renderVaultPanel(host);
  } else {
    renderAccountOverview(host);
  }
}