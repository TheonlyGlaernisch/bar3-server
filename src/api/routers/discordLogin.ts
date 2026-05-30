import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const discordLoginPageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const trimmed = value.trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return '/';
}

function buildDiscordLoginHtml(errorText: string, returnTo: string): string {
  const discordHref = `/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bar3 Login</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 560px;
      background: #16213e;
      border-radius: 14px;
      box-shadow: 0 10px 34px rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: rgba(255,255,255,0.03);
    }
    .tab {
      border: 0;
      padding: 14px 16px;
      color: #cfd5ff;
      background: transparent;
      font-size: 15px;
      cursor: pointer;
    }
    .tab.active {
      background: rgba(88,101,242,0.2);
      color: #fff;
      font-weight: 600;
    }
    .content {
      padding: 24px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.5rem;
      color: #fff;
    }
    p.sub {
      margin: 0 0 18px;
      color: #b5bcda;
      font-size: 0.95rem;
    }
    .panel { display: none; }
    .panel.active { display: block; }
    label {
      display: block;
      margin: 12px 0 6px;
      font-size: 0.9rem;
      color: #dbe1ff;
    }
    input {
      width: 100%;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.2);
      color: #fff;
      padding: 11px 12px;
      outline: none;
    }
    input:focus {
      border-color: #5865F2;
      box-shadow: 0 0 0 2px rgba(88,101,242,0.25);
    }
    button.primary {
      margin-top: 14px;
      width: 100%;
      border: 0;
      border-radius: 8px;
      padding: 12px;
      background: #5865F2;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
    }
    button.primary:hover { filter: brightness(1.08); }
    .inline {
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr 1fr;
    }
    .msg {
      margin: 12px 0 0;
      font-size: 0.9rem;
      min-height: 20px;
    }
    .msg.error { color: #ff8f8f; }
    .msg.ok { color: #90f0ba; }
    .divider {
      margin: 24px 0 14px;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 14px;
      color: #c9cde0;
      font-size: 0.9rem;
    }
    a.discord-btn {
      display: inline-block;
      text-decoration: none;
      background: #5865F2;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: 600;
    }
    .public-link {
      margin-top: 18px;
      color: #aeb6df;
      font-size: 0.9rem;
    }
    .public-link a {
      color: #d7dcff;
      font-weight: 600;
      text-decoration: none;
    }
    .public-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="tabs">
      <button class="tab active" data-tab="discord">Discord</button>
      <button class="tab" data-tab="nation">Nation Account</button>
    </div>
    <div class="content">
      <div id="globalMsg" class="msg ${errorText ? 'error' : ''}">${escapeHtml(errorText)}</div>

      <section class="panel active" data-panel="discord">
        <h1>Sign in with Discord</h1>
        <p class="sub">Use your Discord account for standard Bar3 authentication.</p>
        <a class="discord-btn" href="${escapeHtml(discordHref)}">Login with Discord</a>
        <div class="public-link">
          Looking for the public charter? <a href="/constitution">Read the TRF Constitution</a>.
        </div>
      </section>

      <section class="panel" data-panel="nation">
        <h1>Nation Account</h1>
        <p class="sub">Register with nation ID + username/password, then confirm your in-game verification code.</p>

        <form id="registerForm" autocomplete="off">
          <div class="inline">
            <div>
              <label for="nationId">Nation ID</label>
              <input id="nationId" name="nationId" inputmode="numeric" required />
            </div>
            <div>
              <label for="registerUsername">Username</label>
              <input id="registerUsername" name="username" minlength="3" maxlength="32" required />
            </div>
          </div>
          <label for="registerPassword">Password</label>
          <input id="registerPassword" name="password" type="password" minlength="8" maxlength="128" required />
          <button class="primary" type="submit">Send Verification Code</button>
          <div id="registerMsg" class="msg"></div>
        </form>

        <form id="verifyForm" autocomplete="off" style="margin-top:14px; display:none;">
          <label for="verifyCode">Verification Code</label>
          <input id="verifyCode" name="code" inputmode="numeric" minlength="10" maxlength="10" required />
          <button class="primary" type="submit">Verify and Sign In</button>
          <div id="verifyMsg" class="msg"></div>
        </form>

        <div class="divider">Already registered?</div>

        <form id="loginForm" autocomplete="off">
          <label for="loginUsername">Username</label>
          <input id="loginUsername" name="username" minlength="3" maxlength="32" required />
          <label for="loginPassword">Password</label>
          <input id="loginPassword" name="password" type="password" minlength="8" maxlength="128" required />
          <button class="primary" type="submit">Login</button>
          <div id="loginMsg" class="msg"></div>
        </form>

        <div class="divider">Need to reset username/password?</div>

        <form id="resetRequestForm" autocomplete="off">
          <div class="inline">
            <div>
              <label for="resetNationId">Nation ID</label>
              <input id="resetNationId" name="nationId" inputmode="numeric" required />
            </div>
            <div>
              <label for="resetUsername">New Username</label>
              <input id="resetUsername" name="username" minlength="3" maxlength="32" required />
            </div>
          </div>
          <label for="resetPassword">New Password</label>
          <input id="resetPassword" name="password" type="password" minlength="8" maxlength="128" required />
          <button class="primary" type="submit">Send Reset Verification Code</button>
          <div id="resetRequestMsg" class="msg"></div>
        </form>

        <form id="resetConfirmForm" autocomplete="off" style="margin-top:14px; display:none;">
          <label for="resetCode">Reset Verification Code</label>
          <input id="resetCode" name="code" inputmode="numeric" minlength="10" maxlength="10" required />
          <button class="primary" type="submit">Apply Reset and Sign In</button>
          <div id="resetConfirmMsg" class="msg"></div>
        </form>
      </section>
    </div>
  </div>

  <script>
    (function () {
      const returnTo = ${JSON.stringify(returnTo)};
      const tabs = Array.from(document.querySelectorAll('.tab'));
      const panels = Array.from(document.querySelectorAll('.panel'));

      function setTab(tabName) {
        tabs.forEach((el) => el.classList.toggle('active', el.dataset.tab === tabName));
        panels.forEach((el) => el.classList.toggle('active', el.dataset.panel === tabName));
      }

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => setTab(tab.dataset.tab));
      });

      const registerForm = document.getElementById('registerForm');
      const verifyForm = document.getElementById('verifyForm');
      const loginForm = document.getElementById('loginForm');
      const resetRequestForm = document.getElementById('resetRequestForm');
      const resetConfirmForm = document.getElementById('resetConfirmForm');
      const registerMsg = document.getElementById('registerMsg');
      const verifyMsg = document.getElementById('verifyMsg');
      const loginMsg = document.getElementById('loginMsg');
      const nationIdInput = document.getElementById('nationId');
      const resetRequestMsg = document.getElementById('resetRequestMsg');
      const resetConfirmMsg = document.getElementById('resetConfirmMsg');
      const resetNationIdInput = document.getElementById('resetNationId');

      function setMsg(el, text, ok) {
        el.textContent = text || '';
        el.className = 'msg ' + (text ? (ok ? 'ok' : 'error') : '');
      }

      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || 'Request failed.');
        }
        return body;
      }

      registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMsg(registerMsg, '', true);
        setMsg(verifyMsg, '', true);
        const nationId = Number(nationIdInput.value);
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        try {
          const data = await postJson('/auth/pnw/register', { nationId, username, password });
          setMsg(registerMsg, data.message || 'Verification code sent.', true);
          verifyForm.style.display = 'block';
          document.getElementById('verifyCode').focus();
        } catch (error) {
          setMsg(registerMsg, error.message || 'Registration failed.', false);
        }
      });

      verifyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMsg(verifyMsg, '', true);
        const nationId = Number(nationIdInput.value);
        const code = document.getElementById('verifyCode').value;
        try {
          await postJson('/auth/pnw/verify', { nationId, code });
          setMsg(verifyMsg, 'Verified. Redirecting...', true);
          window.location.assign(returnTo || '/');
        } catch (error) {
          setMsg(verifyMsg, error.message || 'Verification failed.', false);
        }
      });

      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMsg(loginMsg, '', true);
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        try {
          await postJson('/auth/pnw/login', { username, password });
          setMsg(loginMsg, 'Logged in. Redirecting...', true);
          window.location.assign(returnTo || '/');
        } catch (error) {
          setMsg(loginMsg, error.message || 'Login failed.', false);
        }
      });

      resetRequestForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMsg(resetRequestMsg, '', true);
        setMsg(resetConfirmMsg, '', true);
        const nationId = Number(resetNationIdInput.value);
        const username = document.getElementById('resetUsername').value;
        const password = document.getElementById('resetPassword').value;
        try {
          const data = await postJson('/auth/pnw/reset/request', { nationId, username, password });
          setMsg(resetRequestMsg, data.message || 'Reset verification code sent.', true);
          resetConfirmForm.style.display = 'block';
          document.getElementById('resetCode').focus();
        } catch (error) {
          setMsg(resetRequestMsg, error.message || 'Reset request failed.', false);
        }
      });

      resetConfirmForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMsg(resetConfirmMsg, '', true);
        const nationId = Number(resetNationIdInput.value);
        const code = document.getElementById('resetCode').value;
        try {
          await postJson('/auth/pnw/reset/confirm', { nationId, code });
          setMsg(resetConfirmMsg, 'Credentials updated. Redirecting...', true);
          window.location.assign(returnTo || '/');
        } catch (error) {
          setMsg(resetConfirmMsg, error.message || 'Reset verification failed.', false);
        }
      });
    })();
  </script>
</body>
</html>`;
}

router.get('/', discordLoginPageLimiter, (req: Request, res: Response) => {
  const errorText = typeof req.query.error === 'string' ? req.query.error : '';
  const returnTo = sanitizeReturnTo(req.session?.discordReturnTo);
  res.status(200).send(buildDiscordLoginHtml(errorText, returnTo));
});

export default router;
