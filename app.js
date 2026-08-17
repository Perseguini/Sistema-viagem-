(function () {
  "use strict";

  const APP_VERSION = "14/08/2026 02:30";

  /* ---------------- Storage helpers ---------------- */
  const STORE_KEY = "perseguini_trips_v1";
  const NAME_KEY = "perseguini_name_v1";
  const THEME_KEY = "perseguini_theme_v1";
  const USER_KEY = "perseguini_user_v1";
  const SKIP_LOGIN_KEY = "perseguini_skip_login_v1";

  /*
   * Firebase project config (from Firebase Console → Project settings → General → Your apps).
   */
  const firebaseConfig = {
    apiKey: "AIzaSyA_ikQgli6CxiW0f1s7U6l25t5FqWgaoCo",
    authDomain: "guilherme-75ce7.firebaseapp.com",
    projectId: "guilherme-75ce7",
    storageBucket: "guilherme-75ce7.firebasestorage.app",
    messagingSenderId: "557368254834",
    appId: "1:557368254834:web:d9bc006f70d9434d51bdeb"
  };

  function loadTrips() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTrips(trips) {
    localStorage.setItem(STORE_KEY, JSON.stringify(trips));
  }

  function getName() {
    return localStorage.getItem(NAME_KEY) || "Motorista";
  }

  function setName(name) {
    localStorage.setItem(NAME_KEY, name);
  }

  let trips = loadTrips();

  /* ---------------- Formatting helpers ---------------- */
  function toNumber(v) {
    if (typeof v === "number") return v;
    if (!v) return 0;
    const cleaned = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function fmtMoney(n) {
    n = Number(n) || 0;
    return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------------- Money / percent input masks ---------------- */
  // Formats digits typed by the user as "1.234,56" (pt-BR), treating the
  // last two digits as centavos. Caps at a sane max to avoid runaway values.
  const MAX_MONEY_DIGITS = 12; // up to 9.999.999.999,99

  function maskMoneyDigits(digits) {
    digits = digits.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
    digits = digits.replace(/^0+(?=\d)/, "");
    if (!digits) return "";
    while (digits.length < 3) digits = "0" + digits;
    const cents = digits.slice(-2);
    let intPart = digits.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return intPart + "," + cents;
  }

  function attachMoneyMask(input, onChange) {
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");
    input.addEventListener("input", () => {
      const digitsOnly = input.value.replace(/\D/g, "");
      input.value = maskMoneyDigits(digitsOnly);
      if (onChange) onChange();
    });
    input.addEventListener("blur", () => {
      if (input.value && toNumber(input.value) === 0) input.value = "";
    });
    // Prevent pasting non-numeric junk from corrupting the mask
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const digitsOnly = (input.value + text).replace(/\D/g, "");
      input.value = maskMoneyDigits(digitsOnly);
      if (onChange) onChange();
    });
  }

  // Percent field: digits + at most one comma, integer part clamped 0-100,
  // at most 2 decimal digits. Typed naturally (e.g. "15" -> 15, "15,5" -> 15,5).
  function sanitizePercent(raw) {
    let v = raw.replace(/[^\d,]/g, "");
    const firstComma = v.indexOf(",");
    if (firstComma !== -1) {
      v = v.slice(0, firstComma + 1) + v.slice(firstComma + 1).replace(/,/g, "");
    }
    let [intPart, decPart] = v.split(",");
    intPart = (intPart || "").replace(/^0+(?=\d)/, "");
    if (intPart === "") intPart = v.startsWith(",") ? "0" : "";
    if (intPart !== "" && parseInt(intPart, 10) > 100) intPart = "100";
    if (intPart === "100") decPart = undefined;
    let result = intPart;
    if (decPart !== undefined) result += "," + decPart.slice(0, 2);
    return result;
  }

  function attachPercentMask(input, onChange) {
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");
    input.addEventListener("input", () => {
      input.value = sanitizePercent(input.value);
      if (onChange) onChange();
    });
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    let hh = String(d.getHours()).padStart(2, "0");
    let mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function fmtDateOnly(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  function uid() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- Trip math ---------------- */
  function computeTrip(t) {
    const frete = toNumber(t.frete);
    const diesel = toNumber(t.diesel);
    const pedagio = toNumber(t.pedagio);
    const borracharia = toNumber(t.borracharia);
    const caixinha = toNumber(t.caixinha);
    const outros = toNumber(t.outros);
    const comissaoPct = toNumber(t.comissaoPct);
    const despesasExtras = Array.isArray(t.despesasExtras) ? t.despesasExtras : [];
    const despesasExtrasTotal = despesasExtras.reduce((acc, d) => acc + toNumber(d.valor), 0);

    const comissaoValor = frete * (comissaoPct / 100);
    const totalGastos = diesel + pedagio + borracharia + caixinha + outros + despesasExtrasTotal + comissaoValor;
    const liquido = frete - totalGastos;

    return {
      frete, diesel, pedagio, borracharia, caixinha, outros, comissaoPct, comissaoValor,
      despesasExtras, despesasExtrasTotal, totalGastos, liquido,
      cliente: t.cliente || "", produto: t.produto || "",
    };
  }

  /* ---------------- Tab navigation ---------------- */
  const screens = {
    inicio: document.getElementById("screen-inicio"),
    nova: document.getElementById("screen-nova"),
    historico: document.getElementById("screen-historico"),
    stats: document.getElementById("screen-stats"),
  };
  const navBtns = document.querySelectorAll(".nav-btn");
  const topbarSubtitle = document.getElementById("topbarSubtitle");

  const subtitles = {
    inicio: "Controle de viagens e fretes",
    nova: "Preencha os dados da viagem",
    historico: "Suas viagens por período",
    stats: "Relatórios e desempenho",
  };

  function goTo(tab) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle("active", k === tab));
    navBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

    const brandRow = document.getElementById("topbarBrand");
    const titleRow = document.getElementById("topbarTitleRow");
    const filterBtn = document.getElementById("filterBtn");
    if (tab === "historico") {
      brandRow.style.display = "none";
      titleRow.style.display = "flex";
      filterBtn.style.display = "flex";
    } else {
      brandRow.style.display = "flex";
      titleRow.style.display = "none";
      filterBtn.style.display = "none";
      topbarSubtitle.textContent = subtitles[tab] || subtitles.inicio;
    }

    if (tab === "historico") renderHistorico();
    if (tab === "inicio") renderInicio();
    if (tab === "stats") renderStats();
    window.scrollTo(0, 0);
  }

  navBtns.forEach((b) => b.addEventListener("click", () => goTo(b.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((el) =>
    el.addEventListener("click", () => goTo(el.dataset.goto))
  );

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- Início screen ---------------- */
  function renderInicio() {
    document.getElementById("greetingText").textContent = `Olá, ${getName()}! 👋`;

    document.getElementById("statTrips").textContent = trips.length;

    const wrap = document.getElementById("lastTripWrap");
    if (!trips.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="emoji">🧭</div>
          <div class="title">Nenhuma viagem ainda</div>
          <div class="desc">Toque em "Nova viagem" para registrar a primeira.</div>
        </div>`;
      return;
    }
    const sorted = [...trips].sort((a, b) => new Date(b.data) - new Date(a.data));
    const last = sorted[0];
    const c = computeTrip(last);
    wrap.innerHTML = "";
    wrap.appendChild(buildTripItem(last, c));
  }

  function buildTripItem(t, c) {
    const div = document.createElement("div");
    div.className = "trip-item";
    div.innerHTML = `
      <div class="left">
        <div class="pin">📍</div>
        <div class="info">
          <div class="dest">${escapeHtml(t.destino || "Sem destino")}</div>
          <div class="date">${fmtDate(t.data)}</div>
        </div>
      </div>
      <div class="right">
        <div class="liquido commission">${fmtMoney(c.comissaoValor)}</div>
        <div class="liquido-label">comissão</div>
      </div>`;
    div.addEventListener("click", () => openTripModal(t.id));
    return div;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[m]);
  }

  document.getElementById("editNameBtn").addEventListener("click", openNameModal);

  /* ---------------- Custom name-edit modal ---------------- */
  const nameModal = document.getElementById("nameModal");
  const nameModalInput = document.getElementById("nameModalInput");

  function openNameModal() {
    const current = getName();
    nameModalInput.value = current === "Motorista" ? "" : current;
    nameModal.classList.add("open");
    setTimeout(() => nameModalInput.focus(), 150);
  }
  function closeNameModal() {
    nameModal.classList.remove("open");
  }
  document.getElementById("closeNameModalBtn").addEventListener("click", closeNameModal);
  document.getElementById("cancelNameBtn").addEventListener("click", closeNameModal);
  nameModal.addEventListener("click", (e) => {
    if (e.target === nameModal) closeNameModal();
  });
  document.getElementById("saveNameBtn").addEventListener("click", () => {
    const val = nameModalInput.value.trim();
    if (val) {
      setName(val);
      renderInicio();
    }
    closeNameModal();
  });
  nameModalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("saveNameBtn").click();
  });

  /* ---------------- Login / user account ---------------- */
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; }
  }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function clearUser() { localStorage.removeItem(USER_KEY); }

  function parseJwt(token) {
    // Kept for backward compatibility with any previously stored data; not
    // used by the current Firebase-based login flow.
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  const loginOverlay = document.getElementById("loginOverlay");
  function showLogin() { loginOverlay.classList.add("open"); }
  function hideLogin() { loginOverlay.classList.remove("open"); }

  function applyUserToUI() {
    const user = getUser();
    const chip = document.getElementById("userChip");
    if (user) {
      chip.style.display = "flex";
      document.getElementById("userChipEmail").textContent = user.email || "";
      const pic = document.getElementById("userChipPic");
      if (user.picture) {
        pic.src = user.picture;
        pic.style.display = "block";
      } else {
        pic.style.display = "none";
      }
    } else {
      chip.style.display = "none";
    }
  }

  /* ---------------- Firebase Auth (Google) ---------------- */
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  let firebaseAuth = null;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  function isStandalonePWA() {
    return (window.navigator.standalone === true) ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }
  // Popups are unreliable inside an installed iOS PWA (WKWebView blocks/loses
  // them), so use a full-page redirect flow there instead.
  const useRedirectFlow = isIOS() && isStandalonePWA();

  function initFirebase() {
    if (!window.firebase || firebaseAuth) return firebaseAuth;
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();
    } catch (e) {
      console.error("Falha ao iniciar Firebase:", e);
    }
    return firebaseAuth;
  }

  function setGoogleBtnLoading(loading) {
    if (!googleLoginBtn) return;
    googleLoginBtn.disabled = loading;
    googleLoginBtn.querySelector(".g-icon").textContent = loading ? "…" : "G";
  }

  function onGoogleSignInSuccess(fbUser) {
    setUser({
      uid: fbUser.uid,
      name: fbUser.displayName || "Motorista",
      email: fbUser.email || "",
      picture: fbUser.photoURL || "",
      provider: "google",
    });
    setName(fbUser.displayName || "Motorista");
    localStorage.removeItem(SKIP_LOGIN_KEY);
    hideLogin();
    applyUserToUI();
    renderInicio();
    toast(`Bem-vindo, ${(fbUser.displayName || "").split(" ")[0] || "de volta"}!`);
  }

  function onGoogleSignInError(e) {
    if (e && e.code === "auth/popup-closed-by-user") {
      // user cancelled, no need to show an error
    } else if (e && e.code === "auth/unauthorized-domain") {
      toast("Este domínio não está autorizado no Firebase (Authentication → Settings → Authorized domains).");
    } else {
      console.error("Erro no login com Google:", e);
      toast("Não foi possível entrar com Google. Tente novamente.");
    }
  }

  async function signInWithGoogle() {
    const auth = initFirebase();
    if (!auth) {
      toast("Não foi possível iniciar o login com Google. Verifique sua conexão.");
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    setGoogleBtnLoading(true);
    try {
      if (useRedirectFlow) {
        // Page will navigate away and come back; result is picked up by
        // getRedirectResult() below on next load.
        await auth.signInWithRedirect(provider);
        return;
      }
      const result = await auth.signInWithPopup(provider);
      onGoogleSignInSuccess(result.user);
    } catch (e) {
      onGoogleSignInError(e);
    } finally {
      setGoogleBtnLoading(false);
    }
  }

  // Handle the return trip from signInWithRedirect (iOS standalone PWA flow).
  function checkRedirectResult() {
    const auth = initFirebase();
    if (!auth) return;
    auth.getRedirectResult()
      .then((result) => {
        if (result && result.user) onGoogleSignInSuccess(result.user);
      })
      .catch(onGoogleSignInError);
  }

  if (googleLoginBtn) googleLoginBtn.addEventListener("click", signInWithGoogle);

  document.getElementById("guestLoginBtn").addEventListener("click", () => {
    localStorage.setItem(SKIP_LOGIN_KEY, "1");
    hideLogin();
  });

  document.getElementById("logoutMainBtn").addEventListener("click", () => {
    if (!confirm("Sair e voltar para a tela de login?")) return;
    const auth = initFirebase();
    const finishLogout = () => {
      clearUser();
      localStorage.removeItem(SKIP_LOGIN_KEY);
      applyUserToUI();
      showLogin();
    };
    if (auth) auth.signOut().then(finishLogout).catch(finishLogout);
    else finishLogout();
  });

  function initLogin() {
    initFirebase();
    checkRedirectResult();
    const user = getUser();
    const skipped = localStorage.getItem(SKIP_LOGIN_KEY);
    applyUserToUI();
    if (user || skipped) {
      hideLogin();
      return;
    }
    showLogin();
  }

  /* ---------------- Theme toggle ---------------- */
  function getTheme() { return localStorage.getItem(THEME_KEY) || "light"; }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    document.getElementById("themeToggleBtn").textContent = theme === "dark" ? "☀️" : "🌙";
  }
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  applyTheme(getTheme());

  /* ---------------- Install (Add to Home Screen) ---------------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById("installCard").style.display = "flex";
  });
  document.getElementById("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) {
      toast("Use o menu do navegador > 'Adicionar à tela inicial'");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById("installCard").style.display = "none";
  });
  window.addEventListener("appinstalled", () => {
    document.getElementById("installCard").style.display = "none";
  });

  // iOS Safari never fires beforeinstallprompt, so show manual instructions
  // instead whenever the app isn't already installed to the home screen.
  if (isIOS() && !isStandalonePWA()) {
    const card = document.getElementById("installCard");
    card.querySelector(".t2").textContent = "Toque em Compartilhar 􀈂 e depois em \"Adicionar à Tela de Início\"";
    const btn = document.getElementById("installBtn");
    btn.textContent = "Como instalar";
    btn.addEventListener("click", () => {
      toast("Toque no ícone de Compartilhar do Safari e escolha 'Adicionar à Tela de Início'.");
    });
    card.style.display = "flex";
  }

  /* ---------------- Nova viagem screen ---------------- */
  const formIds = ["fDestino", "fCliente", "fProduto", "fData", "fFrete", "fDiesel", "fPedagio", "fBorracharia", "fCaixinha", "fOutros", "fComissao"];
  const els = {};
  formIds.forEach((id) => (els[id] = document.getElementById(id)));

  let currentExpenses = [];

  function renderExpenseList() {
    const wrap = document.getElementById("expenseListWrap");
    if (!currentExpenses.length) {
      wrap.innerHTML = `<p class="expense-empty">Nenhuma despesa extra lançada ainda.</p>`;
      return;
    }
    wrap.innerHTML = "";
    currentExpenses.forEach((exp) => {
      const row = document.createElement("div");
      row.className = "expense-row";
      row.innerHTML = `
        <input type="text" placeholder="Descrição (ex: estacionamento)" value="${escapeHtml(exp.desc || "")}" data-id="${exp.id}" data-field="desc">
        <div class="money-wrap"><span>R$</span><input inputmode="decimal" placeholder="0,00" value="${escapeHtml(exp.valor || "")}" data-id="${exp.id}" data-field="valor"></div>
        <button class="remove-expense" data-id="${exp.id}" type="button" aria-label="Remover">✕</button>`;
      wrap.appendChild(row);
    });
    wrap.querySelectorAll('input[data-field="desc"]').forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const exp = currentExpenses.find((x) => x.id === e.target.dataset.id);
        if (exp) exp.desc = e.target.value;
      });
    });
    wrap.querySelectorAll('input[data-field="valor"]').forEach((inp) => {
      attachMoneyMask(inp, () => {
        const exp = currentExpenses.find((x) => x.id === inp.dataset.id);
        if (exp) exp.valor = inp.value;
        updateSummary();
      });
    });
    wrap.querySelectorAll(".remove-expense").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentExpenses = currentExpenses.filter((x) => x.id !== btn.dataset.id);
        renderExpenseList();
        updateSummary();
      });
    });
  }

  document.getElementById("btnAddExpense").addEventListener("click", () => {
    currentExpenses.push({ id: uid(), desc: "", valor: "" });
    renderExpenseList();
  });

  function nowLocalInputValue() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function resetForm() {
    els.fDestino.value = "";
    els.fCliente.value = "";
    els.fProduto.value = "";
    els.fData.value = nowLocalInputValue();
    ["fFrete","fDiesel","fPedagio","fBorracharia","fCaixinha","fOutros","fComissao"].forEach((id) => (els[id].value = ""));
    currentExpenses = [];
    renderExpenseList();
    updateSummary();
  }

  function updateSummary() {
    const t = {
      frete: els.fFrete.value,
      diesel: els.fDiesel.value,
      pedagio: els.fPedagio.value,
      borracharia: els.fBorracharia.value,
      caixinha: els.fCaixinha.value,
      outros: els.fOutros.value,
      comissaoPct: els.fComissao.value,
      despesasExtras: currentExpenses,
    };
    const c = computeTrip(t);
    document.getElementById("sumGastos").textContent = fmtMoney(c.totalGastos - c.comissaoValor);
    const liqEl = document.getElementById("sumLiquido");
    liqEl.textContent = fmtMoney(c.liquido);
    liqEl.classList.toggle("neg", c.liquido < 0);
    document.getElementById("sumComissaoLabel").textContent = `Comissão (${c.comissaoPct || 0}%)`;
    document.getElementById("sumComissao").textContent = fmtMoney(c.comissaoValor);
  }

  ["fFrete","fDiesel","fPedagio","fBorracharia","fCaixinha","fOutros"].forEach((id) =>
    attachMoneyMask(els[id], updateSummary)
  );
  attachPercentMask(els.fComissao, updateSummary);

  document.getElementById("btnLimpar").addEventListener("click", () => {
    if (confirm("Limpar todos os campos?")) resetForm();
  });

  document.getElementById("btnSalvar").addEventListener("click", () => {
    if (!els.fDestino.value.trim()) {
      toast("Informe o destino da viagem");
      els.fDestino.focus();
      return;
    }
    if (!toNumber(els.fFrete.value)) {
      toast("Informe o valor do frete");
      els.fFrete.focus();
      return;
    }
    const t = {
      id: uid(),
      destino: els.fDestino.value.trim(),
      cliente: els.fCliente.value.trim(),
      produto: els.fProduto.value.trim(),
      data: els.fData.value ? new Date(els.fData.value).toISOString() : new Date().toISOString(),
      frete: toNumber(els.fFrete.value),
      diesel: toNumber(els.fDiesel.value),
      pedagio: toNumber(els.fPedagio.value),
      borracharia: toNumber(els.fBorracharia.value),
      caixinha: toNumber(els.fCaixinha.value),
      outros: toNumber(els.fOutros.value),
      comissaoPct: toNumber(els.fComissao.value),
      despesasExtras: currentExpenses
        .filter((e) => e.desc.trim() || toNumber(e.valor))
        .map((e) => ({ id: e.id, desc: e.desc.trim(), valor: toNumber(e.valor) })),
    };
    trips.push(t);
    saveTrips(trips);
    toast("Viagem salva com sucesso!");
    resetForm();
    goTo("historico");
  });

  /* ---------------- Histórico screen ---------------- */
  const selYear = document.getElementById("selYear");
  const selMonth = document.getElementById("selMonth");

  function availableYears() {
    const years = new Set(trips.map((t) => new Date(t.data).getFullYear()));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }

  function renderHistorico() {
    const years = availableYears();
    const prevYear = selYear.value ? parseInt(selYear.value, 10) : new Date().getFullYear();
    selYear.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    selYear.value = years.includes(prevYear) ? String(prevYear) : String(years[0]);

    if (!selMonth.dataset.built) {
      selMonth.innerHTML = MONTH_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join("");
      selMonth.dataset.built = "1";
      selMonth.value = String(new Date().getMonth());
    }

    renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10));
  }

  selYear.addEventListener("change", () => renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10)));
  selMonth.addEventListener("change", () => renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10)));

  document.getElementById("filterBtn").addEventListener("click", () => {
    document.querySelector(".period-box").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function tripsForMonth(year, month) {
    return trips
      .filter((t) => {
        const d = new Date(t.data);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  function renderMonths(year, month) {
    const wrap = document.getElementById("monthsWrap");
    wrap.innerHTML = "";

    /* ---- Selected month: detailed card ---- */
    const selectedTrips = tripsForMonth(year, month);
    const selectedTotal = selectedTrips.reduce((acc, t) => acc + computeTrip(t).liquido, 0);

    const detailWrap = document.createElement("div");
    detailWrap.className = "month-detail";

    const head = document.createElement("div");
    head.className = "month-detail-head";
    head.innerHTML = `
      <span class="name">${MONTH_NAMES[month]} de ${year}</span>
      <span class="totals">
        <div class="total-val">${fmtMoney(selectedTotal)}</div>
        <div class="total-count">${selectedTrips.length} ${selectedTrips.length === 1 ? "viagem" : "viagens"}</div>
      </span>`;
    detailWrap.appendChild(head);

    if (!selectedTrips.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <div class="emoji">🗓️</div>
        <div class="title">Nenhuma viagem neste mês</div>
        <div class="desc">Escolha outro mês ou registre uma nova viagem.</div>`;
      detailWrap.appendChild(empty);
    } else {
      selectedTrips.forEach((t) => {
        const c = computeTrip(t);
        const card = document.createElement("div");
        card.className = "trip-detail-card";
        card.innerHTML = `
          <div class="trip-detail-top">
            <div class="left">
              <div class="pin">📍</div>
              <div>
                <div class="dest">${escapeHtml(t.destino || "Sem destino")}</div>
                <div class="date">${fmtDate(t.data)}${t.cliente ? " • " + escapeHtml(t.cliente) : ""}</div>
              </div>
            </div>
            <button class="menu-btn" data-id="${t.id}" aria-label="Opções">⋮</button>
          </div>
          <div class="trip-detail-rows">
            <div class="tdr"><span class="l">Frete</span><span class="v">${fmtMoney(c.frete)}</span></div>
            <div class="tdr"><span class="l">Gastos</span><span class="v expense">${fmtMoney(c.totalGastos)}</span></div>
            <div class="tdr"><span class="l">Comissão (${c.comissaoPct}%)</span><span class="v expense">${fmtMoney(c.comissaoValor)}</span></div>
          </div>
          <div class="liquido-pill">
            <span class="l">Líquido</span>
            <span class="v">${fmtMoney(c.liquido)}</span>
          </div>`;
        card.querySelector(".menu-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          openTripModal(t.id);
        });
        card.addEventListener("click", () => openTripModal(t.id));
        detailWrap.appendChild(card);
      });
    }

    wrap.appendChild(detailWrap);

    /* ---- Other months: summary rows ---- */
    const label = document.createElement("div");
    label.className = "other-months-label";
    label.textContent = "Outros meses";
    wrap.appendChild(label);

    for (let m = 11; m >= 0; m--) {
      if (m === month) continue;
      const mTrips = tripsForMonth(year, m);
      const mTotal = mTrips.reduce((acc, t) => acc + computeTrip(t).liquido, 0);

      const row = document.createElement("div");
      row.className = "month-summary-row";
      row.innerHTML = `
        <div>
          <div class="name">${MONTH_NAMES[m]} de ${year}</div>
          <div class="count">${mTrips.length} ${mTrips.length === 1 ? "viagem" : "viagens"}</div>
        </div>
        <div class="val ${mTrips.length ? "has-data" : ""}">${fmtMoney(mTotal)}</div>`;
      row.addEventListener("click", () => {
        selMonth.value = String(m);
        renderMonths(year, m);
        wrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      wrap.appendChild(row);
    }
  }

  /* ---------------- Trip detail / share modal ---------------- */
  const modal = document.getElementById("tripModal");
  let currentModalTripId = null;

  function openTripModal(id) {
    const t = trips.find((x) => x.id === id);
    if (!t) return;
    currentModalTripId = id;
    const c = computeTrip(t);

    const body = document.getElementById("resumoBody");
    const extraInfoRows = [
      t.cliente ? `<div class="resumo-row" style="margin-top:8px;"><span class="rl">Cliente</span></div><div class="resumo-row" style="padding-top:0;"><span class="rv" style="font-size:15px;">${escapeHtml(t.cliente)}</span></div>` : "",
      t.produto ? `<div class="resumo-row" style="margin-top:8px;"><span class="rl">Produto</span></div><div class="resumo-row" style="padding-top:0;"><span class="rv" style="font-size:15px;">${escapeHtml(t.produto)}</span></div>` : "",
    ].join("");

    const expenseRows = c.despesasExtras.length
      ? c.despesasExtras.map((d) => `<div class="resumo-row"><span class="rl">${escapeHtml(d.desc || "Despesa extra")}</span><span class="rv">${fmtMoney(toNumber(d.valor))}</span></div>`).join("")
      : "";

    body.innerHTML = `
      <div class="resumo-row"><span class="rl">Destino</span></div>
      <div class="resumo-row" style="padding-top:0;"><span class="rv" style="font-size:16px;">${escapeHtml(t.destino || "-")}</span></div>
      <div class="resumo-row" style="margin-top:8px;"><span class="rl">Data</span></div>
      <div class="resumo-row" style="padding-top:0;"><span class="rv">${fmtDateOnly(t.data)}</span></div>
      ${extraInfoRows}

      <div class="resumo-row divider"><span class="rl">Frete</span><span class="rv">${fmtMoney(c.frete)}</span></div>
      <div class="resumo-row"><span class="rl">Diesel</span><span class="rv">${fmtMoney(c.diesel)}</span></div>
      <div class="resumo-row"><span class="rl">Pedágio</span><span class="rv">${fmtMoney(c.pedagio)}</span></div>
      <div class="resumo-row"><span class="rl">Borracharia</span><span class="rv">${fmtMoney(c.borracharia)}</span></div>
      <div class="resumo-row"><span class="rl">Caixinha</span><span class="rv">${fmtMoney(c.caixinha)}</span></div>
      <div class="resumo-row"><span class="rl">Outros</span><span class="rv">${fmtMoney(c.outros)}</span></div>
      ${expenseRows}
      <div class="resumo-row"><span class="rl">Total de gastos</span><span class="rv">${fmtMoney(c.totalGastos)}</span></div>
      <div class="resumo-row divider"><span class="rl">Valor líquido</span><span class="rv">${fmtMoney(c.liquido)}</span></div>

      <div class="resumo-row final commission"><span class="rl">Comissão (${c.comissaoPct}%)</span><span class="rv">${fmtMoney(c.comissaoValor)}</span></div>
    `;
    modal.classList.add("open");
  }

  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  function closeModal() {
    modal.classList.remove("open");
    currentModalTripId = null;
  }

  document.getElementById("btnDeleteTrip").addEventListener("click", () => {
    if (!currentModalTripId) return;
    if (!confirm("Excluir esta viagem? Essa ação não pode ser desfeita.")) return;
    trips = trips.filter((t) => t.id !== currentModalTripId);
    saveTrips(trips);
    closeModal();
    renderHistorico();
    renderInicio();
    toast("Viagem excluída");
  });

  document.getElementById("btnDownloadImg").addEventListener("click", async () => {
    if (!currentModalTripId) return;
    const t = trips.find((x) => x.id === currentModalTripId);
    const blob = await buildTripImageBlob(t);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viagem-${(t.destino || "perseguini").replace(/\s+/g, "-").toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Imagem salva!");
  });

  document.getElementById("btnShareImg").addEventListener("click", async () => {
    if (!currentModalTripId) return;
    const t = trips.find((x) => x.id === currentModalTripId);
    const blob = await buildTripImageBlob(t);
    const file = new File([blob], "viagem-perseguini.png", { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Sistema Perseguini",
          text: `Resumo da viagem para ${t.destino}`,
        });
        return;
      } catch (e) {
        /* user cancelled or unsupported, fall through to download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "viagem-perseguini.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Compartilhamento indisponível — imagem baixada");
  });

  /* ---------------- Canvas image generation (matches the app's visual identity) ---------------- */
  function buildTripImageBlob(t) {
    return new Promise((resolve) => {
      const c = computeTrip(t);
      const W = 900;
      const scale = 2; // retina export

      const infoFields = [["Destino", t.destino || "-"]];
      if (t.cliente) infoFields.push(["Cliente", t.cliente]);
      if (t.produto) infoFields.push(["Produto", t.produto]);
      infoFields.push(["Data", fmtDateOnly(t.data)]);

      const rows = [
        ["Frete", c.frete, false],
        ["Diesel", c.diesel, false],
        ["Pedágio", c.pedagio, false],
        ["Borracharia", c.borracharia, false],
        ["Caixinha", c.caixinha, false],
        ["Outros", c.outros, false],
      ];
      c.despesasExtras.forEach((d) => rows.push([d.desc || "Despesa extra", toNumber(d.valor), false]));
      rows.push(["Total de gastos", c.totalGastos, true]);
      rows.push(["Valor líquido", c.liquido, true]);

      const headerH = 160;
      const padX = 46;
      let bodyH = 60; // top padding inside card before first info field
      bodyH += infoFields.length * 74; // each info label+value block
      bodyH += rows.length * 46;
      bodyH += 26; // divider spacing
      bodyH += 76; // final total row
      bodyH += 30; // bottom padding

      const cardPad = 24;
      const H = headerH + bodyH + 40;

      const canvas = document.getElementById("renderCanvas");
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);

      // background
      ctx.fillStyle = "#F4F5F9";
      ctx.fillRect(0, 0, W, H);

      // header
      ctx.fillStyle = "#10142B";
      ctx.fillRect(0, 0, W, headerH);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("Sistema Perseguini", padX, 78);
      ctx.font = "500 20px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("Resumo da viagem", padX, 112);

      // card
      const cardX = 34;
      const cardY = headerH - 34;
      const cardW = W - cardX * 2;
      const cardH = H - cardY - 34;
      roundRect(ctx, cardX, cardY, cardW, cardH, 22);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = "#ECEDF3";
      ctx.lineWidth = 1;
      ctx.stroke();

      let y = cardY + cardPad + 20;
      const lx = cardX + cardPad;
      const rx = cardX + cardW - cardPad;

      infoFields.forEach(([label, value]) => {
        ctx.fillStyle = "#8A8FA3";
        ctx.font = "700 17px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.fillText(label, lx, y);
        y += 34;
        ctx.fillStyle = "#1A1D29";
        ctx.font = "800 24px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.fillText(String(value), lx, y);
        y += 40;
      });

      // divider
      ctx.strokeStyle = "#ECEDF3";
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(rx, y);
      ctx.stroke();
      y += 40;

      rows.forEach(([label, val]) => {
        ctx.fillStyle = "#6B7080";
        ctx.font = "600 19px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.fillText(label, lx, y);
        ctx.fillStyle = "#1A1D29";
        ctx.font = "700 19px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        const txt = fmtMoney(val);
        const w = ctx.measureText(txt).width;
        ctx.fillText(txt, rx - w, y);
        y += 42;
      });

      y += 6;
      ctx.strokeStyle = "#ECEDF3";
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(rx, y);
      ctx.stroke();
      y += 46;

      ctx.fillStyle = "#1A1D29";
      ctx.font = "800 24px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText(`Comissão (${c.comissaoPct}%)`, lx, y);

      ctx.fillStyle = "#5847C4";
      ctx.font = "900 34px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      const comTxt = fmtMoney(c.comissaoValor);
      const comW = ctx.measureText(comTxt).width;
      ctx.fillText(comTxt, rx - comW, y + 4);

      canvas.toBlob((blob) => resolve(blob), "image/png", 1.0);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- Estatísticas screen ---------------- */
  const statsYearSel = document.getElementById("statsYear");
  const statsMonthSel = document.getElementById("statsMonth");
  const statsModeSel = document.getElementById("statsMode");
  const statsMonthRow = document.getElementById("statsMonthRow");

  function buildStatsSelectsIfNeeded() {
    if (!statsMonthSel.dataset.built) {
      statsMonthSel.innerHTML = MONTH_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join("");
      statsMonthSel.dataset.built = "1";
      statsMonthSel.value = String(new Date().getMonth());
    }
  }

  statsModeSel.addEventListener("change", () => {
    statsMonthRow.style.display = statsModeSel.value === "year" ? "none" : "flex";
    renderStats();
  });
  statsYearSel.addEventListener("change", renderStats);
  statsMonthSel.addEventListener("change", renderStats);

  function tripsForPeriod(year, month) {
    return trips.filter((t) => {
      const d = new Date(t.data);
      return d.getFullYear() === year && (month === null || d.getMonth() === month);
    });
  }

  function renderStats() {
    const years = availableYears();
    const prevYear = statsYearSel.value ? parseInt(statsYearSel.value, 10) : new Date().getFullYear();
    statsYearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    statsYearSel.value = years.includes(prevYear) ? String(prevYear) : String(years[0]);
    buildStatsSelectsIfNeeded();

    const year = parseInt(statsYearSel.value, 10);
    const isYearMode = statsModeSel.value === "year";
    const month = isYearMode ? null : parseInt(statsMonthSel.value, 10);

    const periodTrips = tripsForPeriod(year, month);
    const totals = periodTrips.reduce(
      (acc, t) => {
        const c = computeTrip(t);
        acc.frete += c.frete;
        acc.despesas += c.totalGastos - c.comissaoValor;
        acc.comissao += c.comissaoValor;
        acc.liquido += c.liquido;
        acc.diesel += c.diesel;
        acc.pedagio += c.pedagio;
        acc.borracharia += c.borracharia;
        acc.caixinha += c.caixinha;
        acc.outros += c.outros;
        acc.despesasExtras += c.despesasExtrasTotal;
        return acc;
      },
      { frete: 0, despesas: 0, comissao: 0, liquido: 0, diesel: 0, pedagio: 0, borracharia: 0, caixinha: 0, outros: 0, despesasExtras: 0 }
    );

    document.getElementById("statFaturamento").textContent = fmtMoney(totals.frete);
    document.getElementById("statDespesas").textContent = fmtMoney(totals.despesas);
    document.getElementById("statComissaoTotal").textContent = fmtMoney(totals.comissao);
    document.getElementById("statLucro").textContent = fmtMoney(totals.liquido);
    document.getElementById("statQtdViagens").textContent = periodTrips.length;
    document.getElementById("statTicketMedio").textContent = fmtMoney(periodTrips.length ? totals.liquido / periodTrips.length : 0);

    drawStatsChart(year, month);
    renderBreakdown(totals);
  }

  function drawStatsChart(year, highlightMonth) {
    const canvas = document.getElementById("statsChart");
    const card = canvas.closest(".chart-card");
    const cssWidth = card.clientWidth - 20;
    const cssHeight = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const monthlyLiquido = Array.from({ length: 12 }, () => 0);
    trips.forEach((t) => {
      const d = new Date(t.data);
      if (d.getFullYear() === year) monthlyLiquido[d.getMonth()] += computeTrip(t).liquido;
    });

    const maxAbs = Math.max(1, ...monthlyLiquido.map((v) => Math.abs(v)));
    const chartTop = 10;
    const chartBottom = cssHeight - 26;
    const zeroY = chartBottom - (chartBottom - chartTop) * 0.15;
    const barAreaH = chartBottom - chartTop;
    const barW = (cssWidth / 12) * 0.55;
    const gap = cssWidth / 12;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#ABB0CC" : "#8A8FA3";
    const gridColor = isDark ? "#262B4A" : "#ECEDF3";

    // baseline
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(cssWidth, zeroY);
    ctx.stroke();

    monthlyLiquido.forEach((val, i) => {
      const x = gap * i + gap / 2 - barW / 2;
      const h = Math.max(2, (Math.abs(val) / maxAbs) * (barAreaH * 0.82));
      const isHighlight = highlightMonth === i;
      const positive = val >= 0;
      ctx.fillStyle = positive
        ? (isHighlight ? "#1FAB56" : (isDark ? "#1E5A3B" : "#BFEAD1"))
        : (isHighlight ? "#E1543A" : (isDark ? "#5B2A22" : "#F6D2CA"));
      const y = positive ? zeroY - h : zeroY;
      roundRectChart(ctx, x, y, barW, h, 4);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = (isHighlight ? "800 " : "600 ") + "10px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(MONTH_NAMES[i].slice(0, 3), gap * i + gap / 2, cssHeight - 8);
    });
    ctx.textAlign = "left";
  }

  function roundRectChart(ctx, x, y, w, h, r) {
    if (h < r * 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function renderBreakdown(totals) {
    const cats = [
      ["Diesel", totals.diesel],
      ["Pedágio", totals.pedagio],
      ["Borracharia", totals.borracharia],
      ["Caixinha", totals.caixinha],
      ["Outros", totals.outros],
      ["Despesas do trajeto", totals.despesasExtras],
      ["Comissão", totals.comissao],
    ];
    const max = Math.max(1, ...cats.map((c) => c[1]));
    const wrap = document.getElementById("breakdownWrap");
    if (cats.every((c) => c[1] === 0)) {
      wrap.innerHTML = `<div class="expense-empty">Sem dados neste período.</div>`;
      return;
    }
    wrap.innerHTML = cats
      .map(
        ([label, val]) => `
        <div class="bd-row">
          <div class="bd-top"><span>${label}</span><span class="bd-val">${fmtMoney(val)}</span></div>
          <div class="bd-bar-track"><div class="bd-bar-fill" style="width:${Math.max(2, (val / max) * 100)}%"></div></div>
        </div>`
      )
      .join("");
  }

  /* ---------------- Service worker ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ---------------- Manual update check ---------------- */
  const appVersionLabel = document.getElementById("appVersionLabel");
  appVersionLabel.textContent = `Versão: ${APP_VERSION}`;

  // Tries to read the real last-modified date of app.js from the server,
  // so the label reflects the actual last time the app was published —
  // instead of relying on someone remembering to edit APP_VERSION by hand.
  function refreshVersionLabel() {
    fetch("app.js", { method: "HEAD", cache: "no-store" })
      .then((res) => {
        const lm = res.headers.get("Last-Modified");
        if (!lm) return;
        const d = new Date(lm);
        if (isNaN(d.getTime())) return;
        appVersionLabel.textContent = `Versão: ${fmtDate(d.toISOString())}`;
      })
      .catch(() => {
        /* offline or server didn't send the header — keep the fallback label */
      });
  }
  refreshVersionLabel();

  document.getElementById("checkUpdateBtn").addEventListener("click", async () => {
    const btn = document.getElementById("checkUpdateBtn");
    btn.disabled = true;
    btn.textContent = "🔄 Verificando...";
    toast("Buscando a versão mais recente...");

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      /* ignore and reload anyway */
    }

    setTimeout(() => {
      location.reload(true);
    }, 400);
  });

  /* ---------------- Init ---------------- */
  resetForm();
  renderInicio();
  renderHistorico();
  initLogin();
})();
