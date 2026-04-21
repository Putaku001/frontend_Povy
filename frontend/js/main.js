const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api'
    : 'https://backend-povy.onrender.com/api';

const AUTH_STORAGE_KEY = 'povy_auth';
let currentAccountDetailNumber = null;
let cachedAccounts = [];

function getStoredAuth() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function saveAuth(auth) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function clearAuth() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAuthToken() {
  const auth = getStoredAuth();
  return auth && auth.token ? auth.token : '';
}

function getCurrentUser() {
  const auth = getStoredAuth();
  return auth && auth.user ? auth.user : null;
}

function isProtectedPage() {
  return document.body.dataset.requiresAuth === 'true';
}

function isAuthPage() {
  return document.body.dataset.authPage === 'true';
}

function redirectToLogin() {
  if (!isProtectedPage()) return;
  const next = `${window.location.pathname}${window.location.search}`;
  const encoded = encodeURIComponent(next);
  window.location.href = `${window.location.origin}/pages/login.html?next=${encoded}`;
}

async function fetchJSON(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
      redirectToLogin();
    }
    const message = (data && data.message) || 'Error en la peticion';
    throw new Error(message);
  }
  return data;
}

function formatMoney(value, currency) {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)} ${currency || ''}`.trim();
}

function formatCardNumberPretty(cardNumber) {
  const digits = String(cardNumber || '').replace(/\s+/g, '');
  if (!digits) return '---- ---- ---- ----';
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function cleanCardNumber(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 16);
}

function setYear() {
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

function setResult(contentHtml, type = 'info') {
  const result = document.getElementById('result-content');
  const panel = document.getElementById('result-panel');
  if (!result || !panel) return;

  result.innerHTML = contentHtml;
  panel.classList.remove('border-slate-800', 'border-emerald-500/60', 'border-red-500/60');

  if (type === 'success') panel.classList.add('border-emerald-500/60');
  else if (type === 'error') panel.classList.add('border-red-500/60');
  else panel.classList.add('border-slate-800');
}

function showFormError(message, elementId = 'form-error') {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }

  el.classList.remove('hidden');
  el.textContent = message;
}

function applyAuthUI() {
  const user = getCurrentUser();

  document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
    el.classList.toggle('hidden', !!user);
  });

  document.querySelectorAll('[data-auth="user"]').forEach((el) => {
    el.classList.toggle('hidden', !user);
  });

  document.querySelectorAll('[data-auth-name]').forEach((el) => {
    el.textContent = user ? user.name : '';
  });

  const heroLoggedOut = document.getElementById('hero-logged-out');
  const heroLoggedIn = document.getElementById('hero-logged-in');
  if (heroLoggedOut) heroLoggedOut.classList.toggle('hidden', !!user);
  if (heroLoggedIn) heroLoggedIn.classList.toggle('hidden', !user);
}

async function hydrateSession() {
  const token = getAuthToken();
  if (!token) {
    if (isProtectedPage()) redirectToLogin();
    applyAuthUI();
    return;
  }

  try {
    const data = await fetchJSON(`${API_BASE}/auth/me`);
    saveAuth({ token, user: data.user });
  } catch (err) {
    clearAuth();
    if (isProtectedPage()) {
      redirectToLogin();
      return;
    }
  }

  applyAuthUI();

  if (getCurrentUser() && isAuthPage()) {
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || `${window.location.origin}/pages/accounts.html`;
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('register-name')?.value.trim() || '';
  const email = document.getElementById('register-email')?.value.trim() || '';
  const password = document.getElementById('register-password')?.value || '';

  try {
    const data = await fetchJSON(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    saveAuth(data);
    applyAuthUI();
    showFormError('', 'register-error');
    document.getElementById('register-form')?.reset();
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || `${window.location.origin}/pages/accounts.html`;
  } catch (err) {
    showFormError(err.message || 'No se pudo registrar.', 'register-error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email')?.value.trim() || '';
  const password = document.getElementById('login-password')?.value || '';

  try {
    const data = await fetchJSON(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    saveAuth(data);
    applyAuthUI();
    showFormError('', 'login-error');
    document.getElementById('login-form')?.reset();
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || `${window.location.origin}/pages/accounts.html`;
  } catch (err) {
    showFormError(err.message || 'No se pudo iniciar sesion.', 'login-error');
  }
}

async function handleLogout() {
  try {
    await fetchJSON(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch (err) {
    // Si la sesion ya expiro, igual limpiamos local.
  } finally {
    clearAuth();
    applyAuthUI();
    if (isProtectedPage()) redirectToLogin();
  }
}

function renderHomeSummary(accounts = cachedAccounts) {
  const summary = document.getElementById('home-summary');
  if (!summary) return;

  const user = getCurrentUser();
  if (!user) {
    summary.innerHTML = '';
    return;
  }

  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  summary.innerHTML = `
    <div class="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs space-y-2">
      <p class="text-[11px] uppercase tracking-[0.14em] text-emerald-300">Sesion activa</p>
      <p class="text-sm font-semibold">${user.name}</p>
      <p class="text-[11px] text-slate-400">${user.email}</p>
      <div class="grid grid-cols-2 gap-3 pt-2">
        <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p class="text-[10px] text-slate-500">Tus cuentas</p>
          <p class="text-lg font-semibold">${accounts.length}</p>
        </div>
        <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p class="text-[10px] text-slate-500">Saldo total</p>
          <p class="text-lg font-semibold text-emerald-300">${totalBalance.toFixed(2)}</p>
        </div>
      </div>
    </div>
  `;
}

function getTransactionPresentation(tx) {
  if (tx.source === 'refund') {
    return {
      badge: 'Devolucion',
      amountLabel: `+ ${tx.amount.toFixed(2)} ${tx.currency}`,
      colorClass: 'text-emerald-300',
      badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
      icon: '+',
      line: 'Entrada',
    };
  }

  if (tx.status === 'declined') {
    return {
      badge: 'Rechazado',
      amountLabel: `Rechazado ${tx.amount.toFixed(2)} ${tx.currency}`,
      colorClass: 'text-amber-300',
      badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
      icon: '!',
      line: 'Intento',
    };
  }

  if (tx.status === 'refunded') {
    return {
      badge: 'Devuelto',
      amountLabel: `- ${tx.amount.toFixed(2)} ${tx.currency}`,
      colorClass: 'text-sky-300',
      badgeClass: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
      icon: 'R',
      line: 'Salida',
    };
  }

  const isCredit = tx.type === 'credit';
  return {
    badge: isCredit ? 'Entrada' : 'Salida',
    amountLabel: `${isCredit ? '+' : '-'} ${tx.amount.toFixed(2)} ${tx.currency}`,
    colorClass: isCredit ? 'text-emerald-300' : 'text-red-300',
    badgeClass: isCredit
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
      : 'bg-red-500/10 text-red-300 border-red-500/40',
    icon: isCredit ? '+' : '-',
    line: isCredit ? 'Entrada' : 'Salida',
  };
}

function getTransactionTypeLabel(tx) {
  if (tx.source === 'manual_topup') return 'AJUSTE';
  if (tx.source === 'balance_set') return 'SALDO FIJO';
  if (tx.source === 'account_payment') return 'PAGO CUENTA';
  if (tx.source === 'card_payment') return 'PAGO TARJETA';
  if (tx.source === 'refund') return 'DEVOLUCION';
  return 'MOVIMIENTO';
}

function renderAccountTransactions(transactions) {
  const list = document.getElementById('tx-list');
  const empty = document.getElementById('tx-empty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!transactions || !transactions.length) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  transactions.forEach((tx) => {
    const presentation = getTransactionPresentation(tx);
    const createdAt = tx.createdAt
      ? new Date(tx.createdAt).toLocaleString(undefined, {
          hour12: false,
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    const merchantLabel = tx.merchantName
      ? `Origen: ${tx.merchantName}`
      : tx.failureReason
        ? `Motivo: ${tx.failureReason}`
        : 'Origen: Povy Sandbox';

    const showRefundButton =
      ['account_payment', 'card_payment'].includes(tx.source) &&
      tx.status === 'approved' &&
      !tx.refundTransactionId;

    const wrapper = document.createElement('article');
    wrapper.className =
      'rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between gap-3';
    wrapper.innerHTML = `
      <div class="space-y-0.5 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="flex items-center justify-center h-5 w-5 rounded-full border border-slate-700 text-[11px] ${presentation.badgeClass}">${presentation.icon}</span>
          <span class="text-[10px] uppercase tracking-[0.16em] text-slate-400">${getTransactionTypeLabel(tx)}</span>
          ${tx.transactionId ? `<span class="text-[10px] text-slate-500 truncate max-w-[180px]">${tx.transactionId}</span>` : ''}
        </div>
        <p class="text-[11px] text-slate-300 truncate">${tx.description || 'Movimiento de prueba'}</p>
        <p class="text-[10px] text-slate-500 truncate">${merchantLabel}</p>
        <p class="text-[10px] text-slate-500">Saldo despues: ${typeof tx.balanceAfter === 'number' ? tx.balanceAfter.toFixed(2) : '—'} ${tx.currency || ''}</p>
        ${createdAt ? `<p class="text-[10px] text-slate-500">${createdAt}</p>` : ''}
      </div>
      <div class="text-right space-y-1 shrink-0">
        <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full border text-[10px] ${presentation.badgeClass}">
          ${presentation.badge}
        </span>
        <p class="text-xs font-semibold ${presentation.colorClass}">${presentation.amountLabel}</p>
        ${
          showRefundButton
            ? `<button data-refund-transaction="${tx.transactionId}" class="text-[10px] px-2 py-1 rounded-md border border-slate-700 text-slate-200 hover:border-emerald-400">Devolver</button>`
            : ''
        }
      </div>
    `;

    list.appendChild(wrapper);
  });
}

async function loadAccountTransactions(accountNumber) {
  const list = document.getElementById('tx-list');
  const empty = document.getElementById('tx-empty');
  if (!list || !empty || !accountNumber) return;

  try {
    const txs = await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(accountNumber)}/transactions`);
    renderAccountTransactions(txs);
  } catch (err) {
    empty.classList.remove('hidden');
    empty.textContent = err.message || 'No se pudo cargar el historial.';
  }
}

async function refundTransaction(transactionId) {
  if (!transactionId || !currentAccountDetailNumber) return;

  try {
    await fetchJSON(`${API_BASE}/payments/${encodeURIComponent(transactionId)}/refund`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await Promise.all([loadAccountDetail(), loadAccountTransactions(currentAccountDetailNumber)]);
  } catch (err) {
    const errorEl = document.getElementById('account-error');
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo devolver la transaccion.';
      errorEl.classList.remove('hidden');
    }
  }
}

function renderAccountDetail(account) {
  const numberEl = document.getElementById('acc-number');
  const ownerEl = document.getElementById('acc-owner');
  const balanceEl = document.getElementById('acc-balance');
  const currencySelect = document.getElementById('acc-currency-select');
  const cardNumberEl = document.getElementById('card-number');
  const cardExpEl = document.getElementById('card-exp');
  const cardCvvEl = document.getElementById('card-cvv');
  const cardOwnerEl = document.getElementById('card-owner');

  if (numberEl) numberEl.textContent = account.accountNumber;
  if (ownerEl) ownerEl.textContent = account.ownerName;
  if (balanceEl) balanceEl.textContent = formatMoney(account.balance, account.currency);
  if (currencySelect) currencySelect.value = account.currency || 'USD';
  if (cardNumberEl && account.card) cardNumberEl.textContent = formatCardNumberPretty(account.card.cardNumber);
  if (cardExpEl && account.card) cardExpEl.textContent = `${account.card.expMonth}/${account.card.expYear}`;
  if (cardCvvEl && account.card) cardCvvEl.textContent = account.card.cvv;
  if (cardOwnerEl) cardOwnerEl.textContent = account.ownerName;
}

async function loadAccountDetail() {
  if (!document.getElementById('account-detail')) return;

  const accountParam = new URLSearchParams(window.location.search).get('account');
  const errorEl = document.getElementById('account-error');
  if (!accountParam) {
    if (errorEl) {
      errorEl.textContent = 'Falta el parametro "account" en la URL.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const account = await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(accountParam)}`);
    currentAccountDetailNumber = account.accountNumber;
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    renderAccountDetail(account);
    await loadAccountTransactions(account.accountNumber);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo cargar la cuenta.';
      errorEl.classList.remove('hidden');
    }
  }
}

async function handleAccountCurrencyChange() {
  const select = document.getElementById('acc-currency-select');
  const errorEl = document.getElementById('account-error');
  if (!select || !currentAccountDetailNumber) return;

  try {
    const updated = await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ currency: select.value }),
    });
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    renderAccountDetail(updated);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo actualizar la moneda.';
      errorEl.classList.remove('hidden');
    }
  }
}

async function handleAccountBalanceAdd() {
  const input = document.getElementById('acc-balance-input');
  const errorEl = document.getElementById('account-error');
  if (!input || !currentAccountDetailNumber) return;

  const numeric = Number(input.value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    if (errorEl) {
      errorEl.textContent = 'Escribe un ajuste valido, por ejemplo 100 o -25.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const updated = await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ addBalance: numeric }),
    });
    input.value = '';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    renderAccountDetail(updated);
    await loadAccountTransactions(updated.accountNumber);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo ajustar el saldo.';
      errorEl.classList.remove('hidden');
    }
  }
}

async function handleAccountBalanceSet() {
  const input = document.getElementById('acc-balance-set-input');
  const errorEl = document.getElementById('account-error');
  if (!input || !currentAccountDetailNumber) return;

  const numeric = Number(input.value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    if (errorEl) {
      errorEl.textContent = 'El saldo exacto debe ser un numero mayor o igual a 0.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const updated = await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ balance: numeric }),
    });
    input.value = '';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    renderAccountDetail(updated);
    await loadAccountTransactions(updated.accountNumber);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo establecer el saldo.';
      errorEl.classList.remove('hidden');
    }
  }
}

async function handleAccountDelete() {
  if (!currentAccountDetailNumber) return;
  const confirmed = window.confirm('Esta cuenta se eliminara con todo su historial. Deseas continuar?');
  if (!confirmed) return;

  try {
    await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`, {
      method: 'DELETE',
    });
    window.location.href = 'accounts.html';
  } catch (err) {
    const errorEl = document.getElementById('account-error');
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo eliminar la cuenta.';
      errorEl.classList.remove('hidden');
    }
  }
}

function renderAccounts(accounts) {
  const list = document.getElementById('accounts-list');
  const empty = document.getElementById('accounts-empty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!accounts || !accounts.length) {
    empty.classList.remove('hidden');
    empty.textContent = 'Todavia no tienes cuentas creadas.';
    return;
  }

  empty.classList.add('hidden');

  accounts.forEach((acc) => {
    const cardLast4 = acc.card && acc.card.cardNumber ? acc.card.cardNumber.slice(-4) : '0000';
    const el = document.createElement('article');
    el.className =
      'rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col gap-1 cursor-pointer hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-500/20 transition-all';
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-[11px] text-slate-400">Cuenta</p>
          <p class="text-xs font-semibold">${acc.accountNumber}</p>
        </div>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">${acc.currency}</span>
      </div>
      <p class="text-[11px] text-slate-400 truncate">Titular: ${acc.ownerName}</p>
      <p class="text-xs">Saldo: <span class="font-semibold">${formatMoney(acc.balance, acc.currency)}</span></p>
      <p class="text-[11px] text-slate-500">Tarjeta: •••• •••• •••• ${cardLast4}</p>
    `;
    el.addEventListener('click', () => {
      window.location.href = `account.html?account=${encodeURIComponent(acc.accountNumber)}`;
    });
    list.appendChild(el);
  });
}

function fillPaymentSelectors(accounts) {
  const accountSelect = document.getElementById('saved-account-select');
  const cardSelect = document.getElementById('saved-card-select');

  if (accountSelect) {
    accountSelect.innerHTML = '<option value="">Selecciona una de tus cuentas</option>';
    accounts.forEach((acc) => {
      const option = document.createElement('option');
      option.value = acc.accountNumber;
      option.textContent = `${acc.accountNumber} · ${acc.ownerName} · ${formatMoney(acc.balance, acc.currency)}`;
      accountSelect.appendChild(option);
    });
  }

  if (cardSelect) {
    cardSelect.innerHTML = '<option value="">Selecciona una de tus tarjetas</option>';
    accounts.forEach((acc) => {
      if (!acc.card) return;
      const option = document.createElement('option');
      option.value = acc.accountNumber;
      option.textContent = `•••• ${acc.card.cardNumber.slice(-4)} · ${acc.ownerName} · ${acc.currency}`;
      cardSelect.appendChild(option);
    });
  }
}

async function loadAccounts() {
  try {
    const accounts = await fetchJSON(`${API_BASE}/accounts`);
    cachedAccounts = accounts;
    renderAccounts(accounts);
    fillPaymentSelectors(accounts);
    renderHomeSummary(accounts);
  } catch (err) {
    const empty = document.getElementById('accounts-empty');
    if (empty) {
      empty.classList.remove('hidden');
      empty.textContent = err.message || 'No se pudieron cargar tus cuentas.';
    }
  }
}

async function createAccount() {
  const btn = document.getElementById('btn-create-account');
  const ownerName = document.getElementById('ownerName')?.value.trim() || '';
  const currency = document.getElementById('new-account-currency')?.value || 'USD';
  const initialBalance = Number(document.getElementById('initialBalance')?.value || 10000);
  const accountsMessage = document.getElementById('accounts-empty');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creando...';
  }

  try {
    await fetchJSON(`${API_BASE}/accounts`, {
      method: 'POST',
      body: JSON.stringify({ ownerName, currency, initialBalance }),
    });
    document.getElementById('ownerName')?.blur();
    document.getElementById('ownerName') && (document.getElementById('ownerName').value = '');
    document.getElementById('initialBalance') && (document.getElementById('initialBalance').value = '10000');
    if (accountsMessage) {
      accountsMessage.textContent = '';
      accountsMessage.classList.add('hidden');
    }
    await loadAccounts();
  } catch (err) {
    if (accountsMessage) {
      accountsMessage.classList.remove('hidden');
      accountsMessage.textContent = err.message || 'No se pudo crear la cuenta.';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Crear cuenta';
    }
  }
}

function updateAccountFieldsFromSelection() {
  const accountSelect = document.getElementById('saved-account-select');
  const accountNumberInput = document.getElementById('payAccountNumber');
  if (!accountSelect || !accountNumberInput) return;
  accountNumberInput.value = accountSelect.value || '';
}

function updateCardFieldsFromSelection() {
  const cardSelect = document.getElementById('saved-card-select');
  if (!cardSelect) return;

  const account = cachedAccounts.find((acc) => acc.accountNumber === cardSelect.value);
  if (!account || !account.card) return;

  const numberInput = document.getElementById('cardNumber');
  const monthInput = document.getElementById('cardExpMonth');
  const yearInput = document.getElementById('cardExpYear');
  const cvvInput = document.getElementById('cardCvv');
  const previewNumber = document.getElementById('pay-card-number');
  const previewExp = document.getElementById('pay-card-exp');

  if (numberInput) numberInput.value = formatCardNumberPretty(account.card.cardNumber);
  if (monthInput) monthInput.value = account.card.expMonth;
  if (yearInput) yearInput.value = account.card.expYear;
  if (cvvInput) cvvInput.value = account.card.cvv;
  if (previewNumber) previewNumber.textContent = formatCardNumberPretty(account.card.cardNumber);
  if (previewExp) previewExp.textContent = `${account.card.expMonth}/${account.card.expYear}`;
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  showFormError('');

  const btn = document.getElementById('btn-pay');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Procesando...';
  }

  const accountNumber = document.getElementById('payAccountNumber')?.value.trim() || '';
  const amount = Number(document.getElementById('payAmount')?.value || '');
  const currency = document.getElementById('payCurrency')?.value || 'USD';
  const description = document.getElementById('payDescription')?.value || '';

  if (!accountNumber || !Number.isFinite(amount) || amount <= 0) {
    showFormError('Completa una cuenta valida y un monto mayor a 0.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago de prueba';
    }
    return;
  }

  try {
    const result = await fetchJSON(`${API_BASE}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Povy Test',
        accountNumber,
        amount,
        currency,
        description,
      }),
    });

    setResult(
      `
      <div class="space-y-1">
        <p><span class="font-semibold">Estado:</span> <span class="uppercase">${result.status}</span></p>
        <p><span class="font-semibold">Mensaje:</span> ${result.message}</p>
        <p><span class="font-semibold">Transaccion:</span> ${result.transactionId}</p>
        <p><span class="font-semibold">Cuenta:</span> ${result.accountNumber}</p>
        <p><span class="font-semibold">Monto:</span> ${formatMoney(result.amount, result.currency)}</p>
        <p><span class="font-semibold">Saldo restante:</span> ${formatMoney(result.remainingBalance, result.currency)}</p>
        <p><span class="font-semibold">Descripcion:</span> ${result.description}</p>
      </div>
      `,
      result.status === 'approved' ? 'success' : 'error'
    );
  } catch (err) {
    showFormError(err.message || 'No se pudo procesar el pago.');
    setResult(
      `<div class="space-y-1"><p><span class="font-semibold">Estado:</span> RECHAZADO</p><p>${err.message || 'Error de pago'}</p></div>`,
      'error'
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago de prueba';
    }
  }
}

async function handleCardPaymentSubmit(event) {
  event.preventDefault();
  showFormError('', 'card-form-error');

  const btn = document.getElementById('btn-card-pay');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Procesando...';
  }

  const cardNumber = cleanCardNumber(document.getElementById('cardNumber')?.value || '');
  const expMonth = document.getElementById('cardExpMonth')?.value.trim() || '';
  const expYear = document.getElementById('cardExpYear')?.value.trim() || '';
  const cvv = document.getElementById('cardCvv')?.value.trim() || '';
  const amount = Number(document.getElementById('cardPayAmount')?.value || '');
  const currency = document.getElementById('cardPayCurrency')?.value || 'USD';
  const description = document.getElementById('cardPayDescription')?.value || '';

  if (
    cardNumber.length !== 16 ||
    !expMonth ||
    !expYear ||
    !cvv ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    showFormError('Completa los datos de tarjeta y un monto valido.', 'card-form-error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago con tarjeta';
    }
    return;
  }

  try {
    const result = await fetchJSON(`${API_BASE}/payments/card`, {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Povy Test',
        cardNumber,
        expMonth,
        expYear,
        cvv,
        amount,
        currency,
        description,
      }),
    });

    setResult(
      `
      <div class="space-y-1">
        <p><span class="font-semibold">Estado:</span> <span class="uppercase">${result.status}</span></p>
        <p><span class="font-semibold">Mensaje:</span> ${result.message}</p>
        <p><span class="font-semibold">Transaccion:</span> ${result.transactionId}</p>
        <p><span class="font-semibold">Cuenta:</span> ${result.accountNumber}</p>
        <p><span class="font-semibold">Tarjeta:</span> •••• ${result.cardLast4}</p>
        <p><span class="font-semibold">Monto:</span> ${formatMoney(result.amount, result.currency)}</p>
        <p><span class="font-semibold">Saldo restante:</span> ${formatMoney(result.remainingBalance, result.currency)}</p>
        <p><span class="font-semibold">Descripcion:</span> ${result.description}</p>
      </div>
      `,
      result.status === 'approved' ? 'success' : 'error'
    );
  } catch (err) {
    showFormError(err.message || 'No se pudo procesar el pago con tarjeta.', 'card-form-error');
    setResult(
      `<div class="space-y-1"><p><span class="font-semibold">Estado:</span> RECHAZADO</p><p>${err.message || 'Error de tarjeta'}</p></div>`,
      'error'
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago con tarjeta';
    }
  }
}

function attachCardInputsMasks() {
  const numberInput = document.getElementById('cardNumber');
  const expMonthInput = document.getElementById('cardExpMonth');
  const expYearInput = document.getElementById('cardExpYear');
  const cvvInput = document.getElementById('cardCvv');
  const previewNumber = document.getElementById('pay-card-number');
  const previewExp = document.getElementById('pay-card-exp');

  if (numberInput) {
    numberInput.addEventListener('input', (event) => {
      const clean = cleanCardNumber(event.target.value);
      event.target.value = formatCardNumberPretty(clean);
      if (previewNumber) previewNumber.textContent = formatCardNumberPretty(clean);
    });
  }

  if (expMonthInput) {
    expMonthInput.addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 2);
      if (previewExp) previewExp.textContent = `${event.target.value || '--'}/${expYearInput?.value || '--'}`;
    });
  }

  if (expYearInput) {
    expYearInput.addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 2);
      if (previewExp) previewExp.textContent = `${expMonthInput?.value || '--'}/${event.target.value || '--'}`;
    });
  }

  if (cvvInput) {
    cvvInput.addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 3);
    });
  }
}

function bindCopyButtons() {
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-copy-target]');
    if (!btn) return;

    const targetId = btn.getAttribute('data-copy-target');
    const pre = document.getElementById(targetId);
    if (!pre) return;

    const codeEl = pre.querySelector('code') || pre;
    const text = codeEl.textContent || '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copiado';
      window.setTimeout(() => {
        btn.textContent = original;
      }, 1200);
    } catch (err) {
      console.error('No se pudo copiar', err);
    }
  });
}

function bindNav() {
  const navToggle = document.getElementById('nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      mobileNav.classList.toggle('hidden');
    });
  }
}

function bindAuthForms() {
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', handleLogout);
  });
}

function bindAccountPage() {
  document.getElementById('acc-currency-select')?.addEventListener('change', handleAccountCurrencyChange);
  document.getElementById('btn-update-balance')?.addEventListener('click', handleAccountBalanceAdd);
  document.getElementById('btn-set-balance')?.addEventListener('click', handleAccountBalanceSet);
  document.getElementById('btn-delete-account')?.addEventListener('click', handleAccountDelete);
  document.getElementById('tx-list')?.addEventListener('click', (event) => {
    const refundBtn = event.target.closest('[data-refund-transaction]');
    if (!refundBtn) return;
    refundTransaction(refundBtn.getAttribute('data-refund-transaction'));
  });
}

function bindAccountsPage() {
  document.getElementById('btn-create-account')?.addEventListener('click', createAccount);
}

function bindPaymentsPage() {
  document.getElementById('payment-form')?.addEventListener('submit', handlePaymentSubmit);
  document.getElementById('card-payment-form')?.addEventListener('submit', handleCardPaymentSubmit);
  document.getElementById('saved-account-select')?.addEventListener('change', updateAccountFieldsFromSelection);
  document.getElementById('saved-card-select')?.addEventListener('change', updateCardFieldsFromSelection);
  attachCardInputsMasks();
}

async function init() {
  setYear();
  bindNav();
  bindCopyButtons();
  bindAuthForms();
  await hydrateSession();

  if (getCurrentUser()) {
    await loadAccounts();
    await loadAccountDetail();
  }

  bindAccountsPage();
  bindAccountPage();
  bindPaymentsPage();
  renderHomeSummary();
}

window.addEventListener('DOMContentLoaded', init);
