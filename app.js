(function () {
  "use strict";

  const APP_VERSION = "20/08/2026 12:00";

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
    frota: document.getElementById("screen-frota"),
  };
  const navBtns = document.querySelectorAll(".nav-btn");
  const topbarSubtitle = document.getElementById("topbarSubtitle");

  const subtitles = {
    inicio: "Controle de viagens e fretes",
    nova: "Preencha os dados da viagem",
    historico: "Suas viagens por período",
    stats: "Relatórios e desempenho",
    frota: "Frota e motoristas",
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
    if (tab === "frota") renderFrota();
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
    renderAssignedVehicleHome();

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

  /* ---------------- Conta por telefone + sincronização + perfis ---------------- */
  const ROLE_KEY = "perseguini_role_v1";
  const MANAGER_SETUP_CODE = "PERSEGUINI-GESTOR";
  const PROFILE_KEY = "perseguini_profile_v2";
  const DRAFT_KEY = "perseguini_trip_draft_v1";
  const LAST_SYNC_KEY = "perseguini_last_sync_v2";
  let firestoreDb = null;
  let firebaseAuth = null;
  let currentProfile = null;
  let confirmationResult = null;
  let loginMode = "existing";
  let selectedRole = "motorista";
  let recaptchaVerifier = null;
  let fleetVehicles = [];
  let editingVehicleId = null;

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (e) { return null; }
  }
  function saveProfile(profile) {
    currentProfile = profile || null;
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
    if (profile && profile.name) setName(profile.name);
    if (profile && profile.role) localStorage.setItem(ROLE_KEY, profile.role);
  }
  function getRole() { return currentProfile?.role || localStorage.getItem(ROLE_KEY) || "motorista"; }
  function isManager() { return getRole() === "gestor"; }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; }
  }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function clearUser() { localStorage.removeItem(USER_KEY); }

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

  function initFirestore() {
    if (!window.firebase || firestoreDb) return firestoreDb;
    try {
      initFirebase();
      if (firebase.firestore) firestoreDb = firebase.firestore();
      if (firestoreDb && firestoreDb.enablePersistence) {
        firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      }
    } catch (e) {
      console.error("Falha ao iniciar Firestore:", e);
    }
    return firestoreDb;
  }

  function normalizePhone(phone) { return String(phone || "").replace(/\D/g, ""); }
  function toE164BR(phone) {
    const digits = normalizePhone(phone);
    if (digits.startsWith("55") && digits.length >= 12) return "+" + digits;
    return "+55" + digits;
  }
  function formatPhone(phone) {
    const d = normalizePhone(phone).replace(/^55/, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  }

  function mergeTrips(localTrips, cloudTrips) {
    const map = new Map();
    [...(cloudTrips || []), ...(localTrips || [])].forEach((t) => {
      if (!t || !t.id) return;
      const old = map.get(t.id);
      if (!old) { map.set(t.id, t); return; }
      const oldTime = new Date(old.updatedAt || old.data || 0).getTime();
      const newTime = new Date(t.updatedAt || t.data || 0).getTime();
      if (newTime >= oldTime) map.set(t.id, t);
    });
    return [...map.values()].sort((a,b) => new Date(b.data || 0) - new Date(a.data || 0));
  }

  function getDataDocRef() {
    const db = initFirestore();
    const u = getUser();
    if (!db || !u?.uid) return null;
    return db.collection("usuarios_dados_v2").doc(u.uid);
  }

  function getProfileDocRef(uid) {
    const db = initFirestore();
    if (!db || !uid) return null;
    return db.collection("usuarios").doc(uid);
  }

  async function syncUserData(force = false) {
    const user = getUser();
    if (!user?.uid) return;
    const ref = getDataDocRef();
    if (!ref) return;
    try {
      const snap = await ref.get();
      const cloud = snap.exists ? (snap.data() || {}) : {};
      const merged = mergeTrips(trips, Array.isArray(cloud.trips) ? cloud.trips : []);
      const localChanged = merged.length !== trips.length || merged.some((t, i) => t.id !== trips[i]?.id || JSON.stringify(t) !== JSON.stringify(trips[i]));
      if (localChanged) {
        trips = merged;
        saveTrips(trips);
      }
      const draft = loadDraft();
      if (!draft && cloud.draft) saveDraft(cloud.draft, false);
      const payload = {
        uid: user.uid,
        phone: user.phoneNumber || currentProfile?.phone || "",
        name: getName(),
        role: getRole(),
        trips,
        draft: loadDraft(),
        updatedAt: new Date().toISOString()
      };
      if (force || !snap.exists || JSON.stringify(cloud.trips || []) !== JSON.stringify(trips) || cloud.name !== payload.name || cloud.role !== payload.role) {
        await ref.set(payload, { merge: true });
      }
      setLastSync(user.uid);
      renderInicio();
      renderHistorico();
    } catch (e) {
      console.error("Erro ao sincronizar dados:", e);
    }
  }

  function getLastSync(key) {
    try { return JSON.parse(localStorage.getItem(LAST_SYNC_KEY) || "{}")[key] || ""; } catch (e) { return ""; }
  }
  function setLastSync(key) {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) || "{}"); } catch (e) {}
    map[key] = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(map));
  }

  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return null; }
  }
  function saveDraft(draft, sync = true) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft || null)); } catch (e) {}
    if (sync && getUser()?.uid) scheduleCloudDraftSync();
  }
  function clearDraft() { localStorage.removeItem(DRAFT_KEY); }
  let draftSyncTimer = null;
  function scheduleCloudDraftSync() {
    clearTimeout(draftSyncTimer);
    draftSyncTimer = setTimeout(async () => {
      const ref = getDataDocRef();
      if (!ref) return;
      try { await ref.set({ draft: loadDraft(), updatedAt: new Date().toISOString() }, { merge: true }); } catch (e) {}
    }, 1800);
  }

  function buildCurrentDraft() {
    return {
      destino: els.fDestino.value,
      cliente: els.fCliente.value,
      produto: els.fProduto.value,
      data: els.fData.value,
      frete: els.fFrete.value,
      diesel: els.fDiesel.value,
      pedagio: els.fPedagio.value,
      borracharia: els.fBorracharia.value,
      caixinha: els.fCaixinha.value,
      outros: els.fOutros.value,
      comissao: els.fComissao.value,
      despesasExtras: currentExpenses
    };
  }
  function restoreDraft() {
    const d = loadDraft();
    if (!d) return;
    els.fDestino.value = d.destino || "";
    els.fCliente.value = d.cliente || "";
    els.fProduto.value = d.produto || "";
    els.fData.value = d.data || nowLocalInputValue();
    ["fFrete","fDiesel","fPedagio","fBorracharia","fCaixinha","fOutros"].forEach((id) => els[id].value = d[id] || "");
    els.fComissao.value = d.comissao || "";
    currentExpenses = Array.isArray(d.despesasExtras) ? d.despesasExtras : [];
    renderExpenseList();
    updateSummary();
  }

  function applyUserToUI() {
    const user = getUser();
    const chip = document.getElementById("userChip");
    if (user) {
      chip.style.display = "flex";
      document.getElementById("userChipPhone").textContent = formatPhone(user.phoneNumber || currentProfile?.phone || "");
      document.getElementById("userChipRole").textContent = isManager() ? "GESTOR" : "MOTORISTA";
      const pic = document.getElementById("userChipPic");
      pic.style.display = "none";
    } else chip.style.display = "none";
  }

  function setLoginStep(step) {
    ["loginChoiceStep","phoneStep","codeStep","profileStep"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === step ? "block" : "none";
    });
    const title = document.getElementById("loginTitle");
    const sub = document.getElementById("loginSubtitle");
    if (step === "phoneStep") { title.textContent = "Insira o número do seu telefone"; sub.textContent = "Seu número será usado para acessar e recuperar seus dados."; }
    else if (step === "codeStep") { title.textContent = "Código de confirmação"; sub.textContent = "Digite o código recebido por SMS."; }
    else if (step === "profileStep") { title.textContent = "Complete seu cadastro"; sub.textContent = "Escolha como você usará o Sistema Perseguini."; }
    else { title.textContent = "Sistema Perseguini"; sub.textContent = "Uma nova experiência de controlar suas viagens"; }
  }

  function openLogin() { document.getElementById("loginOverlay").classList.add("open"); }
  function closeLogin() { document.getElementById("loginOverlay").classList.remove("open"); }
  function showLogin() { openLogin(); }
  function hideLogin() { closeLogin(); }

  function ensureRecaptcha() {
    if (recaptchaVerifier) return recaptchaVerifier;
    const auth = initFirebase();
    if (!auth || !window.firebase) return null;
    try {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", { size: "invisible" });
      recaptchaVerifier.render().catch(() => {});
    } catch (e) {
      console.error("reCAPTCHA:", e);
      recaptchaVerifier = null;
    }
    return recaptchaVerifier;
  }

  async function loadProfileForUser(fbUser, creating = false) {
    const ref = getProfileDocRef(fbUser.uid);
    let profile = null;
    try {
      const snap = await ref.get();
      if (snap.exists) profile = snap.data();
    } catch (e) { console.error("Erro ao carregar perfil:", e); }
    if (profile) {
      saveProfile(profile);
      setUser({ uid: fbUser.uid, phoneNumber: fbUser.phoneNumber || profile.phone || "", provider: "phone" });
      await syncUserData(true);
      closeLogin();
      applyUserToUI();
      applyRoleUI();
      restoreDraft();
      renderInicio();
      renderFrota();
      toast(`Bem-vindo, ${(profile.name || "").split(" ")[0] || "de volta"}!`);
      return true;
    }
    if (creating) {
      let invitedName = "";
      try {
        if (fbUser.phoneNumber) {
          const inv = await initFirestore().collection("motoristas_convites").doc(normalizePhone(fbUser.phoneNumber)).get();
          if (inv.exists) invitedName = inv.data().name || "";
        }
      } catch (e) {}
      document.getElementById("profileNameInput").value = invitedName;
      selectedRole = "motorista";
      document.querySelectorAll(".role-choice").forEach(b => b.classList.toggle("active", b.dataset.role === selectedRole));
      setLoginStep("profileStep");
      return false;
    }
    toast("Essa conta ainda não possui cadastro. Escolha 'Criar uma nova conta'.");
    return false;
  }

  async function sendPhoneCode() {
    const raw = normalizePhone(document.getElementById("phoneInput").value);
    if (raw.length < 10 || raw.length > 11) { toast("Digite um celular brasileiro válido."); return; }
    const auth = initFirebase();
    const verifier = ensureRecaptcha();
    if (!auth || !verifier) { toast("Não foi possível iniciar a confirmação do telefone."); return; }
    const btn = document.getElementById("sendCodeBtn");
    btn.disabled = true; btn.textContent = "ENVIANDO...";
    try {
      confirmationResult = await auth.signInWithPhoneNumber(toE164BR(raw), verifier);
      document.getElementById("sentPhoneLabel").textContent = formatPhone(raw);
      setLoginStep("codeStep");
      document.getElementById("codeInput").focus();
    } catch (e) {
      console.error(e);
      try { if (recaptchaVerifier) recaptchaVerifier.clear(); } catch (_) {}
      recaptchaVerifier = null;
      toast(e.code === "auth/invalid-phone-number" ? "Número de telefone inválido." : "Não foi possível enviar o SMS. Verifique o Firebase e tente novamente.");
    } finally { btn.disabled = false; btn.textContent = "CONFIRMAR NÚMERO DE TELEFONE"; }
  }

  async function verifyPhoneCode() {
    if (!confirmationResult) { toast("Solicite um novo código."); return; }
    const code = normalizePhone(document.getElementById("codeInput").value);
    if (code.length !== 6) { toast("Digite o código de 6 números."); return; }
    const btn = document.getElementById("verifyCodeBtn"); btn.disabled = true; btn.textContent = "CONFIRMANDO...";
    try {
      const result = await confirmationResult.confirm(code);
      const creating = loginMode === "create";
      await loadProfileForUser(result.user, creating);
    } catch (e) {
      console.error(e);
      toast(e.code === "auth/invalid-verification-code" ? "Código incorreto." : "Não foi possível confirmar o código.");
    } finally { btn.disabled = false; btn.textContent = "CONFIRMAR CÓDIGO"; }
  }

  async function finishProfile() {
    const user = firebaseAuth?.currentUser || getUser();
    if (!user?.uid) { toast("Sessão expirada. Confirme o telefone novamente."); return; }
    const name = document.getElementById("profileNameInput").value.trim();
    if (!name) { toast("Informe o nome."); return; }
    if (selectedRole === "gestor" && document.getElementById("managerCodeInput").value.trim() !== MANAGER_SETUP_CODE) {
      toast("Código de gestor inválido."); return;
    }
    const profile = { uid: user.uid, phone: user.phoneNumber || "", name, role: selectedRole, assignedVehicleId: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try {
      await getProfileDocRef(user.uid).set(profile, { merge: true });
      saveProfile(profile);
      setUser({ uid: user.uid, phoneNumber: user.phoneNumber || profile.phone, provider: "phone" });
      localStorage.removeItem(SKIP_LOGIN_KEY);
      await syncUserData(true);
      closeLogin(); applyUserToUI(); applyRoleUI(); renderInicio(); renderFrota(); restoreDraft();
      toast("Cadastro concluído!");
    } catch (e) { console.error(e); toast("Não foi possível salvar seu cadastro."); }
  }

  document.getElementById("createAccountBtn").addEventListener("click", () => {
    if (!document.getElementById("termsCheck").checked) { toast("Marque a opção dos termos para continuar."); return; }
    loginMode = "create"; setLoginStep("phoneStep");
  });
  document.getElementById("existingAccountBtn").addEventListener("click", () => {
    if (!document.getElementById("termsCheck").checked) { toast("Marque a opção dos termos para continuar."); return; }
    loginMode = "existing"; setLoginStep("phoneStep");
  });
  document.getElementById("backToChoiceBtn").addEventListener("click", () => setLoginStep("loginChoiceStep"));
  document.getElementById("backToPhoneBtn").addEventListener("click", () => setLoginStep("phoneStep"));
  document.getElementById("phoneInput").addEventListener("input", (e) => { e.target.value = formatPhone(e.target.value); });
  document.getElementById("sendCodeBtn").addEventListener("click", sendPhoneCode);
  document.getElementById("verifyCodeBtn").addEventListener("click", verifyPhoneCode);
  document.getElementById("codeInput").addEventListener("keydown", e => { if (e.key === "Enter") verifyPhoneCode(); });
  document.querySelectorAll(".role-choice").forEach(btn => btn.addEventListener("click", () => {
    selectedRole = btn.dataset.role;
    document.querySelectorAll(".role-choice").forEach(b => b.classList.toggle("active", b === btn));
    document.getElementById("managerCodeField").style.display = selectedRole === "gestor" ? "block" : "none";
  }));
  document.getElementById("finishProfileBtn").addEventListener("click", finishProfile);

  async function saveToCloud() {
    if (!getUser()?.uid) { toast("Entre com seu número para sincronizar."); return; }
    await syncUserData(true); toast("Dados sincronizados! ☁️"); updateCloudModalStatus();
  }
  async function restoreFromCloud() {
    const ref = getDataDocRef();
    if (!ref) { toast("Entre com seu número para restaurar os dados."); return; }
    try {
      const snap = await ref.get();
      if (!snap.exists) { toast("Ainda não há dados salvos para este número."); return; }
      const data = snap.data();
      trips = mergeTrips(trips, Array.isArray(data.trips) ? data.trips : []);
      saveTrips(trips);
      if (data.draft) saveDraft(data.draft, false);
      renderInicio(); renderHistorico(); restoreDraft(); updateCloudModalStatus(); toast("Progresso restaurado! 🔄");
    } catch (e) { console.error(e); toast("Não foi possível restaurar os dados."); }
  }
  function updateCloudModalStatus() {
    const el = document.getElementById("cloudSyncStatus"); const u = getUser();
    if (!el || !u?.uid) return; const last = getLastSync(u.uid); el.textContent = last ? `Última sincronização: ${fmtDate(last)}` : "Ainda não sincronizado.";
  }
  function openCloudModal() { if (!getUser()?.uid) { toast("Entre primeiro com seu número."); return; } document.getElementById("cloudModalPhone").textContent = formatPhone(getUser().phoneNumber || currentProfile?.phone); updateCloudModalStatus(); document.getElementById("cloudModal").classList.add("open"); }
  function closeCloudModal() { document.getElementById("cloudModal").classList.remove("open"); }
  document.getElementById("userChipCloudBtn").addEventListener("click", openCloudModal);
  document.getElementById("closeCloudModalBtn").addEventListener("click", closeCloudModal);
  document.getElementById("cloudModal").addEventListener("click", e => { if (e.target.id === "cloudModal") closeCloudModal(); });
  document.getElementById("btnCloudSave").addEventListener("click", saveToCloud);
  document.getElementById("btnCloudRestore").addEventListener("click", restoreFromCloud);

  document.getElementById("logoutMainBtn").addEventListener("click", async () => {
    if (!confirm("Sair e voltar para a tela de login?")) return;
    try { if (firebaseAuth) await firebaseAuth.signOut(); } catch (e) {}
    clearUser(); saveProfile(null); currentProfile = null; fleetVehicles = []; applyUserToUI(); showLogin(); setLoginStep("loginChoiceStep");
  });

  function initLogin() {
    initFirebase(); initFirestore();
    const fbUser = firebaseAuth?.currentUser;
    const saved = getUser();
    if (fbUser && saved?.uid === fbUser.uid && getProfile()) {
      closeLogin(); applyUserToUI(); applyRoleUI(); restoreDraft(); loadFleet(); return;
    }
    if (saved?.uid && getProfile()) {
      closeLogin(); applyUserToUI(); applyRoleUI(); restoreDraft(); loadFleet();
      const auth = initFirebase();
      if (auth) auth.onAuthStateChanged(async (u) => { if (u && u.uid === saved.uid) await syncUserData(true); });
      return;
    }
    openLogin(); setLoginStep("loginChoiceStep");
  }

  /* ---------------- Frota / Gestor / Motorista ---------------- */
  function applyRoleUI() {
    const role = getRole();
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const tab = btn.dataset.tab;
      let show = true;
      if (role === 'gestor' && ['nova','historico','stats'].includes(tab)) show = false;
      if (role !== 'gestor' && tab === 'stats') show = true;
      btn.style.display = show ? 'flex' : 'none';
    });
    const add = document.getElementById('btnAddVehicle');
    const addDriver = document.getElementById('btnAddDriver');
    if (add) add.style.display = role === 'gestor' ? 'inline-flex' : 'none';
    if (addDriver) addDriver.style.display = role === 'gestor' ? 'inline-flex' : 'none';
    const sub = document.getElementById('fleetSubtitle');
    if (sub) sub.textContent = role === 'gestor' ? 'Cadastre caminhões, motoristas e faça as designações.' : 'Veja somente o caminhão que está designado para você.';
    const fleetTab = document.querySelector('.nav-btn[data-tab="frota"]');
    if (fleetTab) fleetTab.style.display = 'flex';
  }

  function currentAssignedVehicle() {
    const id = currentProfile?.assignedVehicleId;
    return fleetVehicles.find(v => v.id === id) || (fleetVehicles.length === 1 && !isManager() ? fleetVehicles[0] : null);
  }

  function renderAssignedVehicleHome() {
    const el = document.getElementById('assignedTruckHome');
    if (!el) return;
    if (isManager()) { el.style.display = 'none'; return; }
    const v = currentAssignedVehicle();
    if (!v) {
      el.style.display = 'block';
      el.innerHTML = `<div class="assigned-truck-empty"><span>🚛</span><div><b>Nenhum caminhão designado</b><small>Aguarde o gestor designar uma placa para você.</small></div></div>`;
      return;
    }
    el.style.display = 'block';
    const photo = v.photos?.[0] || '';
    el.innerHTML = `<div class="assigned-truck-media">${photo ? `<img src="${photo}" alt="Caminhão">` : '<span>🚛</span>'}</div><div class="assigned-truck-info"><small>SEU CAMINHÃO</small><b>${escapeHtml(v.name || 'Caminhão')}</b><strong>${escapeHtml(v.plate || '')}</strong></div>`;
  }

  function renderTripVehicleCard() {
    const el = document.getElementById('tripVehicleCard');
    if (!el) return;
    if (isManager()) { el.style.display = 'none'; return; }
    const v = currentAssignedVehicle();
    el.style.display = 'block';
    if (!v) {
      el.innerHTML = `<div class="assigned-trip-warning">⚠️ Você ainda não possui um caminhão designado pelo gestor. Não será possível salvar uma nova viagem.</div>`;
      document.getElementById('btnSalvar').disabled = true;
      return;
    }
    el.innerHTML = `<div class="assigned-trip-icon">🚛</div><div><small>PLACA DESIGNADA</small><b>${escapeHtml(v.plate)}</b><span>${escapeHtml(v.name || 'Caminhão')}</span></div><span class="assigned-check">✓</span>`;
    document.getElementById('btnSalvar').disabled = false;
  }

  function renderFrota() {
    const wrap = document.getElementById('fleetWrap');
    if (!wrap) return;
    applyRoleUI();
    if (!fleetVehicles.length) {
      wrap.innerHTML = `<div class="empty-state fleet-empty"><div class="emoji">🚛</div><div class="title">${isManager() ? 'Nenhum veículo cadastrado' : 'Nenhum caminhão designado'}</div><div class="desc">${isManager() ? 'Cadastre o primeiro caminhão e depois escolha o motorista.' : 'O gestor ainda não designou um caminhão para você.'}</div></div>`;
      renderAssignedVehicleHome(); renderTripVehicleCard(); return;
    }
    wrap.innerHTML = fleetVehicles.map(v => {
      const photo = v.photos?.[0] || '';
      const driver = v.driverName ? `👤 ${escapeHtml(v.driverName)}` : 'Sem motorista designado';
      return `<div class="fleet-card" data-id="${escapeHtml(v.id)}"><div class="fleet-photo">${photo ? `<img src="${photo}" alt="${escapeHtml(v.name || 'Caminhão')}">` : '<span>🚛</span>'}</div><div class="fleet-info"><div class="fleet-plate">${escapeHtml(v.plate || '')}</div><div class="fleet-name">${escapeHtml(v.name || 'Caminhão')}</div><div class="fleet-driver">${driver}</div></div>${isManager() ? `<div class="fleet-actions"><button type="button" data-action="edit" data-id="${escapeHtml(v.id)}">✏️</button><button type="button" data-action="delete" data-id="${escapeHtml(v.id)}">🗑️</button></div>` : ''}</div>`;
    }).join('');
    wrap.querySelectorAll('.fleet-card').forEach(card => card.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn || !isManager()) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') openVehicleModal(id);
      if (btn.dataset.action === 'delete') deleteVehicle(id);
    }));
    renderAssignedVehicleHome(); renderTripVehicleCard();
  }

  async function loadDrivers() {
    const db = initFirestore();
    if (!db) return [];
    try {
      const snap = await db.collection('usuarios').where('role', '==', 'motorista').get();
      return snap.docs.map(d => d.data()).filter(p => p.uid);
    } catch (e) { console.error('Erro ao carregar motoristas:', e); return []; }
  }

  async function loadFleet() {
    const db = initFirestore(); const user = getUser();
    if (!db || !user?.uid) { fleetVehicles = []; renderFrota(); return; }
    try {
      let snap;
      if (isManager()) snap = await db.collection('frota').get();
      else if (currentProfile?.assignedVehicleId) snap = await db.collection('frota').where(firebase.firestore.FieldPath.documentId(), '==', currentProfile.assignedVehicleId).get();
      else snap = { docs: [] };
      fleetVehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderFrota();
    } catch (e) { console.error('Erro ao carregar frota:', e); toast('Não foi possível carregar a frota.'); }
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1000; const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.76));
        };
        img.onerror = reject; img.src = reader.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  async function saveDriverInvite() {
    if (!isManager()) return;
    const db = initFirestore();
    const name = document.getElementById('driverNameInput').value.trim();
    const phone = normalizePhone(document.getElementById('driverPhoneInput').value);
    if (!name) { toast('Informe o nome do motorista.'); return; }
    if (phone.length < 10 || phone.length > 11) { toast('Informe um celular válido.'); return; }
    try {
      await db.collection('motoristas_convites').doc(phone).set({ name, phone: '+55' + phone, createdBy: getUser().uid, createdAt: new Date().toISOString() }, { merge: true });
      closeDriverModal(); await loadFleet(); toast('Motorista cadastrado. Agora ele pode entrar com este número.');
    } catch (e) { console.error(e); toast('Não foi possível cadastrar o motorista.'); }
  }
  function closeDriverModal() { document.getElementById('driverModal').classList.remove('open'); }
  document.getElementById('btnAddDriver').addEventListener('click', () => document.getElementById('driverModal').classList.add('open'));
  document.getElementById('closeDriverModalBtn').addEventListener('click', closeDriverModal);
  document.getElementById('cancelDriverBtn').addEventListener('click', closeDriverModal);
  document.getElementById('saveDriverBtn').addEventListener('click', saveDriverInvite);
  document.getElementById('driverModal').addEventListener('click', e => { if (e.target.id === 'driverModal') closeDriverModal(); });
  document.getElementById('driverPhoneInput').addEventListener('input', e => { e.target.value = formatPhone(e.target.value); });

  async function openVehicleModal(id = null) {
    if (!isManager()) return;
    editingVehicleId = id;
    const v = id ? fleetVehicles.find(x => x.id === id) : null;
    document.getElementById('vehicleModalTitle').textContent = v ? 'Editar veículo' : 'Novo veículo';
    document.getElementById('vehiclePlateInput').value = v?.plate || '';
    document.getElementById('vehicleNameInput').value = v?.name || '';
    document.getElementById('vehiclePhotosInput').value = '';
    const preview = document.getElementById('vehiclePhotoPreview');
    preview.innerHTML = (v?.photos || []).map(p => `<img src="${p}" alt="Foto do veículo">`).join('');
    const select = document.getElementById('vehicleDriverSelect');
    select.innerHTML = '<option value="">Sem motorista designado</option>';
    const drivers = await loadDrivers();
    drivers.forEach(d => { const opt = document.createElement('option'); opt.value = d.uid; opt.textContent = `${d.name || 'Motorista'} — ${formatPhone(d.phone || '')}`; opt.dataset.name = d.name || 'Motorista'; select.appendChild(opt); });
    if (v?.driverId) select.value = v.driverId;
    document.getElementById('vehicleModal').classList.add('open');
  }
  function closeVehicleModal() { document.getElementById('vehicleModal').classList.remove('open'); editingVehicleId = null; }

  document.getElementById('vehiclePhotosInput').addEventListener('change', async e => {
    const preview = document.getElementById('vehiclePhotoPreview'); preview.innerHTML = '';
    const files = [...e.target.files].slice(0, 3);
    for (const file of files) { try { const src = await compressImage(file); const img = document.createElement('img'); img.src = src; preview.appendChild(img); } catch (_) {} }
  });

  async function saveVehicle() {
    if (!isManager()) return;
    const db = initFirestore(); if (!db) { toast('Nuvem indisponível.'); return; }
    const plate = document.getElementById('vehiclePlateInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const name = document.getElementById('vehicleNameInput').value.trim();
    const select = document.getElementById('vehicleDriverSelect'); const driverId = select.value; const driverName = select.selectedOptions[0]?.dataset.name || '';
    if (plate.length < 7) { toast('Informe uma placa válida.'); return; }
    if (!name) { toast('Informe o nome/modelo do caminhão.'); return; }
    const existing = editingVehicleId ? fleetVehicles.find(v => v.id === editingVehicleId) : null;
    let photos = existing?.photos || [];
    const files = [...document.getElementById('vehiclePhotosInput').files].slice(0, 3);
    if (files.length) photos = await Promise.all(files.map(compressImage));
    const vehicle = { plate, name, photos, driverId: driverId || '', driverName: driverName || '', updatedAt: new Date().toISOString(), createdBy: getUser().uid };
    try {
      const ref = editingVehicleId ? db.collection('frota').doc(editingVehicleId) : db.collection('frota').doc();
      const old = existing;
      await ref.set(vehicle, { merge: true });
      if (old?.driverId && old.driverId !== driverId) await getProfileDocRef(old.driverId).set({ assignedVehicleId: '', updatedAt: new Date().toISOString() }, { merge: true });
      if (driverId) await getProfileDocRef(driverId).set({ assignedVehicleId: ref.id, updatedAt: new Date().toISOString() }, { merge: true });
      closeVehicleModal(); await loadFleet(); toast('Veículo salvo e designação atualizada!');
    } catch (e) { console.error(e); toast('Não foi possível salvar o veículo. Verifique as regras do Firestore.'); }
  }

  async function deleteVehicle(id) {
    if (!isManager() || !confirm('Excluir este veículo? O histórico das viagens não será apagado.')) return;
    const db = initFirestore(); const v = fleetVehicles.find(x => x.id === id);
    try {
      await db.collection('frota').doc(id).delete();
      if (v?.driverId) await getProfileDocRef(v.driverId).set({ assignedVehicleId: '', updatedAt: new Date().toISOString() }, { merge: true });
      await loadFleet(); toast('Veículo excluído.');
    } catch (e) { console.error(e); toast('Não foi possível excluir o veículo.'); }
  }

  document.getElementById('btnAddVehicle').addEventListener('click', () => openVehicleModal());
  document.getElementById('closeVehicleModalBtn').addEventListener('click', closeVehicleModal);
  document.getElementById('cancelVehicleBtn').addEventListener('click', closeVehicleModal);
  document.getElementById('saveVehicleBtn').addEventListener('click', saveVehicle);
  document.getElementById('vehicleModal').addEventListener('click', e => { if (e.target.id === 'vehicleModal') closeVehicleModal(); });

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
        saveDraft(buildCurrentDraft());
      });
    });
    wrap.querySelectorAll('input[data-field="valor"]').forEach((inp) => {
      attachMoneyMask(inp, () => {
        const exp = currentExpenses.find((x) => x.id === inp.dataset.id);
        if (exp) exp.valor = inp.value;
        updateSummary();
        saveDraft(buildCurrentDraft());
      });
    });
    wrap.querySelectorAll(".remove-expense").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentExpenses = currentExpenses.filter((x) => x.id !== btn.dataset.id);
        renderExpenseList();
        saveDraft(buildCurrentDraft());
        updateSummary();
      });
    });
  }

  document.getElementById("btnAddExpense").addEventListener("click", () => {
    currentExpenses.push({ id: uid(), desc: "", valor: "" });
    renderExpenseList();
    saveDraft(buildCurrentDraft());
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
    renderTripVehicleCard();
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

  const draftInputs = formIds.map(id => els[id]).filter(Boolean);
  draftInputs.forEach(input => input.addEventListener("input", () => saveDraft(buildCurrentDraft())));

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
      comissaoPaga: false,
      updatedAt: new Date().toISOString(),
    };
    if (!isManager()) {
      const assigned = currentAssignedVehicle();
      if (!assigned) { toast("Você precisa ter um caminhão designado pelo gestor."); return; }
      t.vehicleId = assigned.id;
      t.plate = assigned.plate;
      t.vehicleName = assigned.name;
      t.driverId = getUser()?.uid || "";
      t.driverName = currentProfile?.name || getName();
    }
    trips.push(t);
    saveTrips(trips);
    clearDraft();
    syncUserData(true).catch(() => {});
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
          </div>
          ${t.comissaoPaga
            ? `<div class="comissao-paga-badge">✅ Comissão paga${t.comissaoPagaEm ? " em " + fmtDateOnly(t.comissaoPagaEm) : ""}</div>`
            : `<button class="comissao-paga-btn" data-id="${t.id}" type="button">💰 Marcar comissão como paga</button>`
          }`;
        const pagaBtn = card.querySelector(".comissao-paga-btn");
        if (pagaBtn) {
          pagaBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            marcarComissaoPaga(t.id);
          });
        }
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

  function marcarComissaoPaga(id) {
    const t = trips.find((x) => x.id === id);
    if (!t || t.comissaoPaga) return;
    if (!confirm("Marcar a comissão desta viagem como paga? Depois de confirmado, não será possível desfazer.")) return;
    t.comissaoPaga = true;
    t.comissaoPagaEm = new Date().toISOString();
    saveTrips(trips);
    toast("Comissão marcada como paga");
    renderHistorico();
    renderInicio();
    if (modal.classList.contains("open") && currentModalTripId === id) {
      openTripModal(id);
    }
  }

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
      <div class="resumo-row" style="padding-top:10px;">
        ${t.comissaoPaga
          ? `<div class="comissao-paga-badge" style="width:100%;">✅ Comissão paga${t.comissaoPagaEm ? " em " + fmtDateOnly(t.comissaoPagaEm) : ""}</div>`
          : `<button class="comissao-paga-btn" id="modalComissaoPagaBtn" type="button" style="width:100%;">💰 Marcar comissão como paga</button>`
        }
      </div>
    `;
    modal.classList.add("open");
    const modalPagaBtn = document.getElementById("modalComissaoPagaBtn");
    if (modalPagaBtn) {
      modalPagaBtn.addEventListener("click", () => marcarComissaoPaga(t.id));
    }
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
    syncUserData(true).catch(() => {});
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

  /* ---------------- Stats image generation + share ---------------- */
  function buildStatsImageBlob() {
    return new Promise((resolve) => {
      const year = parseInt(statsYearSel.value, 10);
      const isYearMode = statsModeSel.value === "year";
      const month = isYearMode ? null : parseInt(statsMonthSel.value, 10);
      const periodLabel = isYearMode ? `Ano ${year}` : `${MONTH_NAMES[month]} de ${year}`;

      const periodTrips = tripsForPeriod(year, month);
      const totals = periodTrips.reduce(
        (acc, t) => {
          const c = computeTrip(t);
          acc.frete += c.frete;
          acc.despesas += c.totalGastos - c.comissaoValor;
          acc.comissao += c.comissaoValor;
          acc.liquido += c.liquido;
          return acc;
        },
        { frete: 0, despesas: 0, comissao: 0, liquido: 0 }
      );
      const qtd = periodTrips.length;
      const ticketMedio = qtd ? totals.liquido / qtd : 0;

      const rows = [
        ["Faturamento (frete)", fmtMoney(totals.frete)],
        ["Despesas totais", fmtMoney(totals.despesas)],
        ["Comissão total", fmtMoney(totals.comissao)],
        ["Viagens no período", String(qtd)],
        ["Ticket médio", fmtMoney(ticketMedio)],
      ];

      const W = 900;
      const scale = 2;
      const headerH = 160;
      const padX = 46;
      const cardPad = 24;
      let bodyH = 60;
      bodyH += rows.length * 46;
      bodyH += 26;
      bodyH += 76;
      bodyH += 30;
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
      ctx.fillText(`Relatório · ${periodLabel}`, padX, 112);

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

      let y = cardY + cardPad + 30;
      const lx = cardX + cardPad;
      const rx = cardX + cardW - cardPad;

      rows.forEach(([label, txt]) => {
        ctx.fillStyle = "#6B7080";
        ctx.font = "600 19px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.fillText(label, lx, y);
        ctx.fillStyle = "#1A1D29";
        ctx.font = "700 19px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        const w = ctx.measureText(txt).width;
        ctx.fillText(txt, rx - w, y);
        y += 46;
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
      ctx.fillText("Lucro líquido", lx, y);

      ctx.fillStyle = totals.liquido >= 0 ? "#1FAB56" : "#E1543A";
      ctx.font = "900 34px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      const liqTxt = fmtMoney(totals.liquido);
      const liqW = ctx.measureText(liqTxt).width;
      ctx.fillText(liqTxt, rx - liqW, y + 4);

      canvas.toBlob((blob) => resolve(blob), "image/png", 1.0);
    });
  }

  const btnShareStats = document.getElementById("btnShareStats");
  if (btnShareStats) {
    btnShareStats.addEventListener("click", async () => {
      const blob = await buildStatsImageBlob();
      const file = new File([blob], "resultado-perseguini.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Sistema Perseguini",
            text: "Resultado do período",
          });
          return;
        } catch (e) {
          /* usuário cancelou ou não suportado, cai para download */
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resultado-perseguini.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Compartilhamento indisponível — imagem baixada");
    });
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
