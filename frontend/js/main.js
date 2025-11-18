const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api'
    : 'https://backend-povy.onrender.com/api';

async function fetchJSON(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && data.message) || 'Error en la petición';
    throw new Error(message);
  }
  return data;
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
  if (type === 'success') {
    panel.classList.add('border-emerald-500/60');
  } else if (type === 'error') {
    panel.classList.add('border-red-500/60');
  } else {
    panel.classList.add('border-slate-800');
  }
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
    const isCredit = tx.type === 'credit';
    const sign = isCredit ? '+' : '-';
    const colorClass = isCredit ? 'text-emerald-300' : 'text-red-300';
    const badgeClass = isCredit
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
      : 'bg-red-500/10 text-red-300 border-red-500/40';

    let typeLabel = 'OTRO';
    if (tx.source === 'manual_topup') typeLabel = 'RECARGA';
    else if (tx.source === 'account_payment') typeLabel = 'PAGO CUENTA';
    else if (tx.source === 'card_payment') typeLabel = 'PAGO TARJETA';

    const icon = isCredit ? '+' : '−';

    const merchantLabel = tx.merchantName
      ? `Comprado en ${tx.merchantName}`
      : 'Comprado en Povy Test';

    const wrapper = document.createElement('article');
    wrapper.className =
      'rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between gap-3';

    const createdAt = tx.createdAt ? new Date(tx.createdAt) : null;
    const timeLabel = createdAt
      ? createdAt.toLocaleString(undefined, {
          hour12: false,
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    wrapper.innerHTML = `
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <span class="flex items-center justify-center h-5 w-5 rounded-full border border-slate-700 text-[11px] ${
            isCredit ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
          }">${icon}</span>
          <span class="text-[10px] uppercase tracking-[0.16em] text-slate-400">${typeLabel}</span>
          ${tx.transactionId ? `<span class="text-[10px] text-slate-500 truncate max-w-[130px]">${tx.transactionId}</span>` : ''}
        </div>
        <p class="text-[11px] text-slate-300 truncate">${tx.description || 'Movimiento de prueba'}</p>
        <p class="text-[10px] text-slate-500 truncate">Origen: ${merchantLabel}</p>
        <p class="text-[10px] text-slate-500">Saldo después: ${
          typeof tx.balanceAfter === 'number' ? tx.balanceAfter.toFixed(2) : '—'
        } ${tx.currency || ''}</p>
        ${timeLabel ? `<p class="text-[10px] text-slate-500">${timeLabel}</p>` : ''}
      </div>
      <div class="text-right space-y-1">
        <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full border text-[10px] ${badgeClass}">
          ${isCredit ? 'Entrada' : 'Salida'}
        </span>
        <p class="text-xs font-semibold ${colorClass}">${sign} ${tx.amount.toFixed(2)} ${
      tx.currency
    }</p>
      </div>
    `;

    list.appendChild(wrapper);
  });
}

async function loadAccountTransactions(accountNumber) {
  const list = document.getElementById('tx-list');
  const empty = document.getElementById('tx-empty');
  if (!list || !empty) return;

  try {
    const txs = await fetchJSON(
      `${API_BASE}/accounts/${encodeURIComponent(accountNumber)}/transactions`
    );
    renderAccountTransactions(txs);
  } catch (err) {
    empty.classList.remove('hidden');
    empty.textContent = 'No se pudo cargar el historial de transacciones.';
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

  const cardNumberInput = document.getElementById('cardNumber');
  const expMonthInput = document.getElementById('cardExpMonth');
  const expYearInput = document.getElementById('cardExpYear');
  const cvvInput = document.getElementById('cardCvv');
  const amountInput = document.getElementById('cardPayAmount');
  const currencySelect = document.getElementById('cardPayCurrency');
  const descriptionInput = document.getElementById('cardPayDescription');
  const cardNumberClean = cleanCardNumber(cardNumberInput ? cardNumberInput.value : '');
  const expMonth = expMonthInput ? expMonthInput.value.trim() : '';
  const expYear = expYearInput ? expYearInput.value.trim() : '';
  const cvv = cvvInput ? cvvInput.value.trim() : '';
  const amount = amountInput ? amountInput.value : '';
  const currency = currencySelect ? currencySelect.value : 'MXN';
  const description = descriptionInput ? descriptionInput.value : '';

  if (
    !cardNumberClean ||
    cardNumberClean.length !== 16 ||
    !expMonth ||
    !expYear ||
    !cvv ||
    !amount
  ) {
    showFormError(
      'Completa todos los datos de la tarjeta y el monto. El número debe tener 16 dígitos.',
      'card-form-error'
    );
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago con tarjeta';
    }
    return;
  }

  try {
    const payload = {
      merchantName: 'Povy Test',
      cardNumber: cardNumberClean,
      expMonth,
      expYear,
      cvv,
      amount: parseFloat(amount),
      currency,
      description,
    };

    const result = await fetchJSON(`${API_BASE}/payments/card`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const type = result.status === 'approved' ? 'success' : 'error';
    const statusLabel = result.status === 'approved' ? 'APROBADO' : 'RECHAZADO';

    setResult(
      `
      <div class="space-y-1">
        <p><span class="font-semibold">Estado:</span> <span class="uppercase">${statusLabel}</span></p>
        <p><span class="font-semibold">Mensaje:</span> ${result.message}</p>
        <p><span class="font-semibold">Transacción:</span> ${result.transactionId}</p>
        <p><span class="font-semibold">Cuenta:</span> ${result.accountNumber}</p>
        <p><span class="font-semibold">Tarjeta:</span> •••• •••• •••• ${result.cardLast4}</p>
        <p><span class="font-semibold">Monto:</span> ${result.amount} ${result.currency}</p>
        <p><span class="font-semibold">Saldo restante:</span> ${result.remainingBalance.toFixed(2)} ${result.currency}</p>
        <p><span class="font-semibold">Descripción:</span> ${result.description}</p>
      </div>
      `,
      type
    );
  } catch (err) {
    const message = err.message || 'Datos inválidos o error al procesar el pago con tarjeta.';
    showFormError(message, 'card-form-error');

    setResult(
      `
      <div class="space-y-1">
        <p><span class="font-semibold">Estado:</span> <span class="uppercase">RECHAZADO</span></p>
        <p><span class="font-semibold">Mensaje:</span> ${message}</p>
      </div>
      `,
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
  const amountInput = document.getElementById('cardPayAmount');
  const previewNumber = document.getElementById('pay-card-number');
  const previewExp = document.getElementById('pay-card-exp');

  if (numberInput) {
    numberInput.addEventListener('input', (e) => {
      const clean = cleanCardNumber(e.target.value);
      const formatted = clean.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
      e.target.value = formatted;
      if (previewNumber) {
        previewNumber.textContent = formatted || '---- ---- ---- ----';
      }
      if (clean.length === 16 && expMonthInput) {
        expMonthInput.focus();
      }
    });
  }

  if (expMonthInput) {
    expMonthInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 2) val = val.slice(0, 2);
      e.target.value = val;
      if (previewExp) {
        const year = expYearInput ? expYearInput.value : '';
        previewExp.textContent = `${val || '--'}/${year || '--'}`;
      }
      if (val.length === 2 && expYearInput) {
        expYearInput.focus();
      }
    });
  }

  if (expYearInput) {
    expYearInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 2) val = val.slice(0, 2);
      e.target.value = val;
      if (previewExp) {
        const month = expMonthInput ? expMonthInput.value : '';
        previewExp.textContent = `${month || '--'}/${val || '--'}`;
      }
      if (val.length === 2 && cvvInput) {
        cvvInput.focus();
      }
    });
  }

  if (cvvInput) {
    cvvInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 3) val = val.slice(0, 3);
      e.target.value = val;
      if (val.length === 3 && amountInput) {
        amountInput.focus();
      }
    });
  }

  // La descripción se deja totalmente opcional, sin autofoco automático desde monto.
}

function getQueryParam(name) {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function renderAccountDetail(account) {
  const container = document.getElementById('account-detail');
  if (!container) return;

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
  if (balanceEl) balanceEl.textContent = `${account.balance.toFixed(2)} ${account.currency}`;
  if (currencySelect) {
    currencySelect.value = account.currency || 'USD';
  }
  if (cardNumberEl && account.card)
    cardNumberEl.textContent = formatCardNumberPretty(account.card.cardNumber);
  if (cardExpEl && account.card) cardExpEl.textContent = `${account.card.expMonth}/${account.card.expYear}`;
  if (cardCvvEl && account.card) cardCvvEl.textContent = account.card.cvv;
  if (cardOwnerEl) cardOwnerEl.textContent = account.ownerName;
}

let currentAccountDetailNumber = null;

async function loadAccountDetail() {
  const container = document.getElementById('account-detail');
  if (!container) return;

  const errorEl = document.getElementById('account-error');
  const accountParam = getQueryParam('account');

  if (!accountParam) {
    if (errorEl) {
      errorEl.textContent = 'Falta el parámetro "account" en la URL.';
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

  const newCurrency = select.value;

  try {
    const updated = await fetchJSON(`${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ currency: newCurrency }),
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

async function handleAccountBalanceUpdate() {
  const input = document.getElementById('acc-balance-input');
  const errorEl = document.getElementById('account-error');
  if (!input || !currentAccountDetailNumber) return;

  const raw = input.value;
  const numeric = Number(raw);

  if (!Number.isFinite(numeric) || numeric < 0) {
    if (errorEl) {
      errorEl.textContent = 'Monto inválido. Usa un número mayor o igual a 0.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const updated = await fetchJSON(
      `${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ addBalance: numeric }),
      }
    );
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    input.value = '';
    renderAccountDetail(updated);
    await loadAccountTransactions(updated.accountNumber);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo actualizar el saldo.';
      errorEl.classList.remove('hidden');
    }
  }
}

async function handleAccountDelete() {
  if (!currentAccountDetailNumber) return;

  const confirmed = window.confirm(
    '¿Seguro que quieres eliminar esta cuenta de prueba de Povy Sandbox? Esta acción no se puede deshacer.'
  );
  if (!confirmed) return;

  const errorEl = document.getElementById('account-error');

  try {
    await fetchJSON(
      `${API_BASE}/accounts/${encodeURIComponent(currentAccountDetailNumber)}`,
      {
        method: 'DELETE',
      }
    );
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    window.location.href = 'accounts.html';
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No se pudo eliminar la cuenta.';
      errorEl.classList.remove('hidden');
    }
  }
}

function showFormError(message, elementId = 'form-error') {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.classList.remove('hidden');
    el.textContent = message;
  }
}

function renderAccounts(accounts) {
  const list = document.getElementById('accounts-list');
  const empty = document.getElementById('accounts-empty');
  if (!list || !empty) return;

  list.innerHTML = '';

  if (!accounts || !accounts.length) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  accounts.forEach((acc) => {
    const cardLast4 = acc.card && acc.card.cardNumber ? acc.card.cardNumber.slice(-4) : '0000';
    const el = document.createElement('article');
    el.className = 'rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col gap-1 cursor-pointer hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-500/20 transition-all';
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-[11px] text-slate-400">Cuenta</p>
          <p class="text-xs font-semibold">${acc.accountNumber}</p>
        </div>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">${acc.currency}</span>
      </div>
      <p class="text-[11px] text-slate-400 truncate">Titular: ${acc.ownerName}</p>
      <p class="text-xs">Saldo: <span class="font-semibold">${acc.balance.toFixed(2)} ${acc.currency}</span></p>
      <p class="text-[11px] text-slate-500">Tarjeta: •••• •••• •••• ${cardLast4}</p>
    `;
    el.addEventListener('click', () => {
      window.location.href = `account.html?account=${encodeURIComponent(acc.accountNumber)}`;
    });
    list.appendChild(el);
  });
}

async function loadAccounts() {
  try {
    const accounts = await fetchJSON(`${API_BASE}/accounts`);
    renderAccounts(accounts);
  } catch (err) {
    const empty = document.getElementById('accounts-empty');
    if (empty) {
      empty.classList.remove('hidden');
      empty.textContent = 'No se pudieron cargar las cuentas. ¿Está levantado el backend de Povy?';
    }
  }
}

async function createAccount() {
  const btn = document.getElementById('btn-create-account');
  const ownerInput = document.getElementById('ownerName');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creando...';
  }

  try {
    const body = {};
    if (ownerInput && ownerInput.value.trim()) {
      body.ownerName = ownerInput.value.trim();
    }

    await fetchJSON(`${API_BASE}/accounts`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await loadAccounts();
  } catch (err) {
    const empty = document.getElementById('accounts-empty');
    if (empty) {
      empty.classList.remove('hidden');
      empty.textContent = 'No se pudo crear la cuenta. ' + (err.message || '');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Crear cuenta';
    }
  }
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  showFormError('');

  const btn = document.getElementById('btn-pay');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Procesando...';
  }

  const accountNumberInput = document.getElementById('payAccountNumber');
  const amountInput = document.getElementById('payAmount');
  const currencySelect = document.getElementById('payCurrency');
  const descriptionInput = document.getElementById('payDescription');

  const accountNumber = accountNumberInput ? accountNumberInput.value.trim() : '';
  const amount = amountInput ? amountInput.value : '';
  const currency = currencySelect ? currencySelect.value : 'MXN';
  const description = descriptionInput ? descriptionInput.value : '';

  if (!accountNumber || !amount) {
    showFormError('Completa número de cuenta y monto.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago de prueba';
    }
    return;
  }

  try {
    const payload = {
      merchantName: 'Povy Test',
      accountNumber,
      amount: parseFloat(amount),
      currency,
      description,
    };

    const result = await fetchJSON(`${API_BASE}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const type = result.status === 'approved' ? 'success' : 'error';
    const statusLabel = result.status === 'approved' ? 'APROBADO' : 'RECHAZADO';

    setResult(
      `
      <div class="space-y-1">
        <p><span class="font-semibold">Estado:</span> <span class="uppercase">${statusLabel}</span></p>
        <p><span class="font-semibold">Mensaje:</span> ${result.message}</p>
        <p><span class="font-semibold">Transacción:</span> ${result.transactionId}</p>
        <p><span class="font-semibold">Cuenta:</span> ${result.accountNumber}</p>
        <p><span class="font-semibold">Monto:</span> ${result.amount} ${result.currency}</p>
        <p><span class="font-semibold">Saldo restante:</span> ${result.remainingBalance.toFixed(2)} ${result.currency}</p>
        <p><span class="font-semibold">Descripción:</span> ${result.description}</p>
      </div>
      `,
      type
    );
  } catch (err) {
    const message = err.message || 'Datos inválidos o error al procesar el pago.';
    showFormError(message);

    setResult(
      `
      <div class="space-y-1">
        <p><span class="font-semibold">Estado:</span> <span class="uppercase">RECHAZADO</span></p>
        <p><span class="font-semibold">Mensaje:</span> ${message}</p>
      </div>
      `,
      'error'
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Procesar pago de prueba';
    }
  }
}

function init() {
  setYear();
  loadAccounts();
  loadAccountDetail();
  // Los handlers específicos se enganchan más abajo solo si existen los formularios/botones.

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-target]');
    if (!btn) return;

    const targetId = btn.getAttribute('data-copy-target');
    if (!targetId) return;

    const pre = document.getElementById(targetId);
    if (!pre) return;

    const codeEl = pre.querySelector('code') || pre;
    const text = codeEl.textContent || '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(() => {
        btn.textContent = original;
      }, 1200);
    } catch (err) {
      console.error('No se pudo copiar al portapapeles', err);
    }
  });

  const form = document.getElementById('payment-form');
  if (form) {
    form.addEventListener('submit', handlePaymentSubmit);
  }

  const cardForm = document.getElementById('card-payment-form');
  if (cardForm) {
    cardForm.addEventListener('submit', handleCardPaymentSubmit);
    attachCardInputsMasks();
  }

  const btnCreate = document.getElementById('btn-create-account');
  if (btnCreate) {
    btnCreate.addEventListener('click', createAccount);
  }

  const currencySelect = document.getElementById('acc-currency-select');
  if (currencySelect) {
    currencySelect.addEventListener('change', handleAccountCurrencyChange);
  }

  const btnUpdateBalance = document.getElementById('btn-update-balance');
  if (btnUpdateBalance) {
    btnUpdateBalance.addEventListener('click', handleAccountBalanceUpdate);
  }

  const btnDeleteAccount = document.getElementById('btn-delete-account');
  if (btnDeleteAccount) {
    btnDeleteAccount.addEventListener('click', handleAccountDelete);
  }
}

window.addEventListener('DOMContentLoaded', init);

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      mobileNav.classList.toggle('hidden');
    });
  }
});
