(function () {
  "use strict";

  const APP_VERSION = "14/08/2026 02:30";

  /* ---------------- Storage helpers ---------------- */
  const STORE_KEY = "perseguini_trips_v1";
  const NAME_KEY = "perseguini_name_v1";
  const THEME_KEY = "perseguini_theme_v1";
  const USER_KEY = "perseguini_user_v1";
  const SKIP_LOGIN_KEY = "perseguini_skip_login_v1";
  const FROTA_KEY = "perseguini_frota_v1";
  // Lista de e-mails autorizados, cada um com uma permissão (gestor | motorista)
  // e, opcionalmente, um caminhão da Frota vinculado. Um e-mail que ainda não
  // está nesta lista é tratado como "motorista" (acesso restrito) — exceto no
  // primeiro uso do app, quando a lista está totalmente vazia, para permitir
  // que alguém consiga se cadastrar como gestor e configurar o resto.
  const USUARIOS_KEY = "perseguini_usuarios_v1";

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

  function loadFrota() {
    try {
      const raw = localStorage.getItem(FROTA_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveFrota(list) {
    localStorage.setItem(FROTA_KEY, JSON.stringify(list));
    syncUsuariosFrotaToCloud();
  }

  function loadUsuarios() {
    try {
      const raw = localStorage.getItem(USUARIOS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveUsuarios(list) {
    localStorage.setItem(USUARIOS_KEY, JSON.stringify(list));
    syncUsuariosFrotaToCloud();
  }

  // ---- Permissões por e-mail ----
  // getUserRole() olha o e-mail da conta logada (Google) na lista de usuários
  // cadastrados na Frota → "Gerenciar e-mails" e devolve a permissão dele:
  //   - "gestor": pode cadastrar/editar/excluir caminhões e gerenciar e-mails;
  //   - "motorista": só visualiza a frota e, em Nova viagem, fica travado no
  //     caminhão vinculado ao próprio e-mail.
  // Sem login (convidado) ou sem nenhum e-mail cadastrado ainda (primeiro uso,
  // para não travar o próprio cadastro inicial), o acesso é liberado como gestor.
  function currentUserEmail() {
    const user = getUser();
    return user && user.email ? normalizeEmail(user.email) : "";
  }

  function findUsuarioByEmail(email) {
    const key = normalizeEmail(email);
    if (!key) return null;
    return usuarios.find((u) => normalizeEmail(u.email) === key) || null;
  }

  function getUserRole() {
    const email = currentUserEmail();
    if (!email) return "gestor";
    if (!usuarios.length) return "gestor";
    const u = findUsuarioByEmail(email);
    return u ? u.permissao : "motorista";
  }
  function canManageFrota() {
    return getUserRole() === "gestor";
  }
  function canManageUsuarios() {
    return getUserRole() === "gestor";
  }

  // Caminhão vinculado ao e-mail logado (usado para travar a seleção em
  // Nova viagem quando o usuário é motorista).
  function getUsuarioCaminhaoAtual() {
    const u = findUsuarioByEmail(currentUserEmail());
    return u ? u.caminhaoId || "" : "";
  }

  let trips = loadTrips();
  let frota = loadFrota();
  let usuarios = loadUsuarios();
  let editingFrotaId = null;
  let editingUsuarioId = null;

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
    frota: document.getElementById("screen-frota"),
    stats: document.getElementById("screen-stats"),
  };
  const navBtns = document.querySelectorAll(".nav-btn");
  const topbarSubtitle = document.getElementById("topbarSubtitle");

  const subtitles = {
    inicio: "Controle de viagens e fretes",
    nova: "Preencha os dados da viagem",
    historico: "Suas viagens por período",
    frota: "Caminhões e motoristas",
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
    if (tab === "nova") renderNovaCaminhaoSelect();
    if (tab === "frota") renderFrota();
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
          <div class="date">${fmtDate(t.data)}${t.caminhaoPlaca ? " • 🚛 " + escapeHtml(t.caminhaoPlaca) : ""}</div>
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

  /* ---------------- Frota (caminhões e motoristas) ---------------- */
  function frotaUid() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const frotaPlacaInput = document.getElementById("fFrotaPlaca");
  const frotaMotoristaInput = document.getElementById("fFrotaMotorista");
  const frotaModeloInput = document.getElementById("fFrotaModelo");
  const frotaFormTitle = document.getElementById("frotaFormTitle");
  const btnFrotaSalvar = document.getElementById("btnFrotaSalvar");
  const btnFrotaCancelEdit = document.getElementById("btnFrotaCancelEdit");

  if (frotaPlacaInput) {
    frotaPlacaInput.addEventListener("input", () => {
      frotaPlacaInput.value = frotaPlacaInput.value.toUpperCase();
    });
  }

  function renderFrota() {
    // A visualização é liberada pra qualquer papel; só ações de gestão
    // (cadastrar/editar/excluir) ficam atrás de canManageFrota().
    const podeGerenciar = canManageFrota();
    const formCard = document.getElementById("frotaFormCard");
    if (formCard) formCard.style.display = podeGerenciar ? "" : "none";

    const usuariosHead = document.getElementById("usuariosSectionHead");
    if (usuariosHead) usuariosHead.style.display = podeGerenciar ? "flex" : "none";

    const wrap = document.getElementById("frotaListWrap");
    wrap.innerHTML = "";

    if (!frota.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="emoji">🚚</div>
          <div class="title">Nenhum caminhão cadastrado</div>
          <div class="desc">${podeGerenciar ? "Cadastre acima os caminhões da frota e o motorista de cada um." : "Ainda não há caminhões cadastrados na frota."}</div>
        </div>`;
      return;
    }

    const sorted = [...frota].sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
    sorted.forEach((c) => wrap.appendChild(buildFrotaItem(c, podeGerenciar)));
  }

  // E-mails (cadastrados em Usuários) vinculados a um determinado caminhão.
  function emailsVinculadosA(caminhaoId) {
    return usuarios.filter((u) => u.caminhaoId === caminhaoId).map((u) => u.email);
  }

  function buildFrotaItem(c, podeGerenciar) {
    const div = document.createElement("div");
    div.className = "frota-item";
    const vinculados = podeGerenciar ? emailsVinculadosA(c.id) : [];
    div.innerHTML = `
      <div class="left">
        <div class="truck-icon">🚛</div>
        <div class="info">
          <div class="placa">${escapeHtml(c.placa || "Sem placa")}</div>
          <div class="motorista">${escapeHtml(c.motorista || "Sem motorista definido")}</div>
          ${c.modelo ? `<div class="modelo">${escapeHtml(c.modelo)}</div>` : ""}
          ${vinculados.length ? `<div class="caminhao-vinc">✉️ ${escapeHtml(vinculados.join(", "))}</div>` : ""}
        </div>
      </div>
      ${podeGerenciar ? `
      <div class="right">
        <button class="icon-btn" data-action="edit" aria-label="Editar">✏️</button>
        <button class="icon-btn" data-action="delete" aria-label="Excluir">🗑️</button>
      </div>` : ""}`;
    if (podeGerenciar) {
      div.querySelector('[data-action="edit"]').addEventListener("click", () => startEditFrota(c.id));
      div.querySelector('[data-action="delete"]').addEventListener("click", () => openFrotaDeleteModal(c.id));
    }
    return div;
  }

  function clearFrotaForm() {
    frotaPlacaInput.value = "";
    frotaMotoristaInput.value = "";
    frotaModeloInput.value = "";
    editingFrotaId = null;
    frotaFormTitle.textContent = "Adicionar caminhão";
    btnFrotaSalvar.textContent = "💾 Salvar caminhão";
    btnFrotaCancelEdit.style.display = "none";
  }

  function startEditFrota(id) {
    const c = frota.find((x) => x.id === id);
    if (!c) return;
    editingFrotaId = id;
    frotaPlacaInput.value = c.placa || "";
    frotaMotoristaInput.value = c.motorista || "";
    frotaModeloInput.value = c.modelo || "";
    frotaFormTitle.textContent = "Editar caminhão";
    btnFrotaSalvar.textContent = "💾 Atualizar caminhão";
    btnFrotaCancelEdit.style.display = "";
    frotaPlacaInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  btnFrotaCancelEdit.addEventListener("click", clearFrotaForm);

  btnFrotaSalvar.addEventListener("click", () => {
    const placa = frotaPlacaInput.value.trim().toUpperCase();
    const motorista = frotaMotoristaInput.value.trim();
    const modelo = frotaModeloInput.value.trim();

    if (!placa) {
      toast("Informe a placa do caminhão.");
      frotaPlacaInput.focus();
      return;
    }
    if (!motorista) {
      toast("Informe o nome do motorista.");
      frotaMotoristaInput.focus();
      return;
    }

    if (editingFrotaId) {
      const c = frota.find((x) => x.id === editingFrotaId);
      if (c) {
        c.placa = placa;
        c.motorista = motorista;
        c.modelo = modelo;
      }
      toast("Caminhão atualizado! 🚛");
    } else {
      frota.push({ id: frotaUid(), placa, motorista, modelo, ativo: true });
      toast("Caminhão cadastrado! 🚛");
    }
    saveFrota(frota);
    clearFrotaForm();
    renderFrota();
  });

  /* ---- Frota: modal de confirmação de exclusão ---- */
  const frotaDeleteModal = document.getElementById("frotaDeleteModal");
  let frotaPendingDeleteId = null;

  function openFrotaDeleteModal(id) {
    const c = frota.find((x) => x.id === id);
    if (!c) return;
    frotaPendingDeleteId = id;
    document.getElementById("frotaDeleteText").textContent =
      `Tem certeza que deseja excluir o caminhão ${c.placa || ""}${c.motorista ? " (" + c.motorista + ")" : ""} da frota?`;
    frotaDeleteModal.classList.add("open");
  }
  function closeFrotaDeleteModal() {
    frotaDeleteModal.classList.remove("open");
    frotaPendingDeleteId = null;
  }
  document.getElementById("closeFrotaDeleteModalBtn").addEventListener("click", closeFrotaDeleteModal);
  document.getElementById("cancelFrotaDeleteBtn").addEventListener("click", closeFrotaDeleteModal);
  frotaDeleteModal.addEventListener("click", (e) => {
    if (e.target === frotaDeleteModal) closeFrotaDeleteModal();
  });
  document.getElementById("confirmFrotaDeleteBtn").addEventListener("click", () => {
    if (!frotaPendingDeleteId) return;
    frota = frota.filter((x) => x.id !== frotaPendingDeleteId);
    saveFrota(frota);
    // Desvincula esse caminhão de qualquer e-mail que apontava pra ele, pra
    // não deixar referência órfã na lista de usuários.
    let usuariosMudaram = false;
    usuarios.forEach((u) => {
      if (u.caminhaoId === frotaPendingDeleteId) {
        u.caminhaoId = "";
        usuariosMudaram = true;
      }
    });
    if (usuariosMudaram) saveUsuarios(usuarios);
    if (editingFrotaId === frotaPendingDeleteId) clearFrotaForm();
    closeFrotaDeleteModal();
    renderFrota();
    toast("Caminhão excluído.");
  });

  /* ---------------- Usuários / permissões (e-mail → gestor/motorista) ---------------- */
  function usuarioUid() {
    return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const usuariosModal = document.getElementById("usuariosModal");
  const usuarioEmailInput = document.getElementById("fUsuarioEmail");
  const usuarioTelefoneInput = document.getElementById("fUsuarioTelefone");
  const usuarioPermissaoSelect = document.getElementById("fUsuarioPermissao");
  const usuarioCaminhaoSelect = document.getElementById("fUsuarioCaminhao");
  const usuarioFormTitle = document.getElementById("usuarioFormTitle");
  const btnUsuarioSalvar = document.getElementById("btnUsuarioSalvar");
  const btnUsuarioCancelEdit = document.getElementById("btnUsuarioCancelEdit");

  function fillUsuarioCaminhaoOptions() {
    const sorted = [...frota].sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
    usuarioCaminhaoSelect.innerHTML =
      `<option value="">Nenhum</option>` +
      sorted.map((c) => `<option value="${c.id}">${escapeHtml(c.placa || "Sem placa")} — ${escapeHtml(c.motorista || "")}</option>`).join("");
  }

  function openUsuariosModal() {
    if (!canManageUsuarios()) return;
    fillUsuarioCaminhaoOptions();
    clearUsuarioForm();
    renderUsuarios();
    usuariosModal.classList.add("open");
  }
  function closeUsuariosModal() { usuariosModal.classList.remove("open"); }

  const btnOpenUsuarios = document.getElementById("btnOpenUsuarios");
  if (btnOpenUsuarios) btnOpenUsuarios.addEventListener("click", openUsuariosModal);
  document.getElementById("closeUsuariosModalBtn").addEventListener("click", closeUsuariosModal);
  usuariosModal.addEventListener("click", (e) => { if (e.target === usuariosModal) closeUsuariosModal(); });

  function renderUsuarios() {
    const wrap = document.getElementById("usuariosListWrap");
    wrap.innerHTML = "";
    if (!usuarios.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="emoji">👤</div>
          <div class="title">Nenhum e-mail cadastrado</div>
          <div class="desc">Enquanto a lista estiver vazia, qualquer e-mail logado tem acesso de gestor.</div>
        </div>`;
      return;
    }
    const sorted = [...usuarios].sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    sorted.forEach((u) => wrap.appendChild(buildUsuarioItem(u)));
  }

  function buildUsuarioItem(u) {
    const div = document.createElement("div");
    div.className = "frota-item usuario-item";
    const caminhao = u.caminhaoId ? frota.find((c) => c.id === u.caminhaoId) : null;
    div.innerHTML = `
      <div class="left">
        <div class="truck-icon">👤</div>
        <div class="info">
          <div class="email">${escapeHtml(u.email)}</div>
          <div class="meta">
            <span class="perm-badge ${u.permissao === "gestor" ? "gestor" : "motorista"}">${u.permissao === "gestor" ? "Gestor" : "Motorista"}</span>
            ${caminhao ? `<span class="caminhao-vinc">🚛 ${escapeHtml(caminhao.placa || "")}</span>` : ""}
            ${u.telefone ? `<span class="caminhao-vinc">📱 ${escapeHtml(u.telefone)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="right">
        <button class="icon-btn" data-action="edit" aria-label="Editar">✏️</button>
        <button class="icon-btn" data-action="delete" aria-label="Excluir">🗑️</button>
      </div>`;
    div.querySelector('[data-action="edit"]').addEventListener("click", () => startEditUsuario(u.id));
    div.querySelector('[data-action="delete"]').addEventListener("click", () => openUsuarioDeleteModal(u.id));
    return div;
  }

  function clearUsuarioForm() {
    usuarioEmailInput.value = "";
    if (usuarioTelefoneInput) usuarioTelefoneInput.value = "";
    usuarioPermissaoSelect.value = "motorista";
    usuarioCaminhaoSelect.value = "";
    editingUsuarioId = null;
    usuarioFormTitle.textContent = "Adicionar e-mail";
    btnUsuarioSalvar.textContent = "💾 Salvar e-mail";
    btnUsuarioCancelEdit.style.display = "none";
  }

  function startEditUsuario(id) {
    const u = usuarios.find((x) => x.id === id);
    if (!u) return;
    editingUsuarioId = id;
    usuarioEmailInput.value = u.email || "";
    if (usuarioTelefoneInput) usuarioTelefoneInput.value = u.telefone || "";
    usuarioPermissaoSelect.value = u.permissao === "gestor" ? "gestor" : "motorista";
    usuarioCaminhaoSelect.value = u.caminhaoId || "";
    usuarioFormTitle.textContent = "Editar e-mail";
    btnUsuarioSalvar.textContent = "💾 Atualizar e-mail";
    btnUsuarioCancelEdit.style.display = "";
    usuarioEmailInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  btnUsuarioCancelEdit.addEventListener("click", clearUsuarioForm);

  btnUsuarioSalvar.addEventListener("click", () => {
    const email = normalizeEmail(usuarioEmailInput.value);
    const telefone = usuarioTelefoneInput ? normalizePhone(usuarioTelefoneInput.value) : "";
    const permissao = usuarioPermissaoSelect.value === "gestor" ? "gestor" : "motorista";
    const caminhaoId = usuarioCaminhaoSelect.value || "";

    if (!email || !email.includes("@")) {
      toast("Informe um e-mail válido.");
      usuarioEmailInput.focus();
      return;
    }
    const duplicado = usuarios.find((u) => normalizeEmail(u.email) === email && u.id !== editingUsuarioId);
    if (duplicado) {
      toast("Esse e-mail já está cadastrado.");
      return;
    }
    if (telefone) {
      const telefoneDuplicado = usuarios.find((u) => normalizePhone(u.telefone) === telefone && u.id !== editingUsuarioId);
      if (telefoneDuplicado) {
        toast("Esse telefone já está vinculado a outro e-mail.");
        return;
      }
    }

    if (editingUsuarioId) {
      const u = usuarios.find((x) => x.id === editingUsuarioId);
      if (u) {
        u.email = email;
        u.telefone = telefone;
        u.permissao = permissao;
        u.caminhaoId = caminhaoId;
      }
      toast("E-mail atualizado!");
    } else {
      usuarios.push({ id: usuarioUid(), email, telefone, permissao, caminhaoId });
      toast("E-mail cadastrado!");
    }
    saveUsuarios(usuarios);
    clearUsuarioForm();
    renderUsuarios();
    renderFrota();
  });

  /* ---- Usuários: modal de confirmação de exclusão ---- */
  const usuarioDeleteModal = document.getElementById("usuarioDeleteModal");
  let usuarioPendingDeleteId = null;

  function openUsuarioDeleteModal(id) {
    const u = usuarios.find((x) => x.id === id);
    if (!u) return;
    usuarioPendingDeleteId = id;
    document.getElementById("usuarioDeleteText").textContent =
      `Tem certeza que deseja excluir o e-mail ${u.email} da lista de permissões?`;
    usuarioDeleteModal.classList.add("open");
  }
  function closeUsuarioDeleteModal() {
    usuarioDeleteModal.classList.remove("open");
    usuarioPendingDeleteId = null;
  }
  document.getElementById("closeUsuarioDeleteModalBtn").addEventListener("click", closeUsuarioDeleteModal);
  document.getElementById("cancelUsuarioDeleteBtn").addEventListener("click", closeUsuarioDeleteModal);
  usuarioDeleteModal.addEventListener("click", (e) => {
    if (e.target === usuarioDeleteModal) closeUsuarioDeleteModal();
  });
  document.getElementById("confirmUsuarioDeleteBtn").addEventListener("click", () => {
    if (!usuarioPendingDeleteId) return;
    usuarios = usuarios.filter((x) => x.id !== usuarioPendingDeleteId);
    saveUsuarios(usuarios);
    if (editingUsuarioId === usuarioPendingDeleteId) clearUsuarioForm();
    closeUsuarioDeleteModal();
    renderUsuarios();
    renderFrota();
    toast("E-mail excluído.");
  });

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

  /* ---------------- Cloud sync (Firestore, por e-mail) ---------------- */
  // Cada usuário logado tem seus dados guardados em um documento próprio na
  // coleção "usuarios_dados", identificado pelo e-mail da conta Google. Assim
  // os dados de cada e-mail ficam separados dos demais na nuvem.
  const LAST_SYNC_KEY = "perseguini_last_sync_v1";
  let firestoreDb = null;

  function initFirestore() {
    if (!window.firebase || firestoreDb) return firestoreDb;
    try {
      initFirebase();
      if (firebase.firestore) firestoreDb = firebase.firestore();
    } catch (e) {
      console.error("Falha ao iniciar Firestore:", e);
    }
    return firestoreDb;
  }

  // Normaliza o e-mail (minúsculas, sem espaços nas pontas) antes de usá-lo
  // como chave, para "Joao@Gmail.com" e "joao@gmail.com" caírem sempre no
  // mesmo documento/registro em vez de gerarem dados duplicados.
  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  // Deixa só dígitos, no mesmo padrão que a WhatsApp Cloud API manda o
  // número de quem enviou a mensagem (com DDI, sem +, espaços ou traços).
  // Ex.: "+55 (11) 99999-8888" -> "5511999998888"
  function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function cloudDocRef(email) {
    const db = initFirestore();
    const key = normalizeEmail(email);
    if (!db || !key) return null;
    return db.collection("usuarios_dados").doc(key);
  }

  // Documento único e global (não por e-mail) com a lista de permissões
  // (usuarios, já com telefone) e a frota. É lido pela Cloud Function do
  // WhatsApp no servidor, que não tem acesso ao localStorage de nenhum
  // aparelho. Sincroniza sozinho toda vez que o gestor salva um e-mail ou
  // um caminhão — não depende do botão manual "Salvar na nuvem".
  function globalConfigDocRef() {
    const db = initFirestore();
    if (!db) return null;
    return db.collection("config_frota").doc("global");
  }

  let syncUsuariosFrotaTimer = null;
  function syncUsuariosFrotaToCloud() {
    // Debounce simples: evita mandar uma escrita pra cada tecla/alteração
    // rápida em sequência.
    clearTimeout(syncUsuariosFrotaTimer);
    syncUsuariosFrotaTimer = setTimeout(async () => {
      const ref = globalConfigDocRef();
      if (!ref) return; // sem Firebase/offline: fica só local, tenta de novo na próxima alteração
      try {
        await ref.set({
          usuarios: usuarios,
          frota: frota,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Erro ao sincronizar usuários/frota na nuvem:", e);
      }
    }, 800);
  }

  function getLastSync(email) {
    try {
      const map = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) || "{}");
      return map[normalizeEmail(email)] || "";
    } catch (e) {
      return "";
    }
  }

  function setLastSync(email) {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) || "{}"); } catch (e) {}
    map[normalizeEmail(email)] = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(map));
  }

  async function saveToCloud() {
    const user = getUser();
    if (!user || !user.email) {
      toast("Entre com sua conta Google para salvar na nuvem.");
      return;
    }
    const ref = cloudDocRef(user.email);
    if (!ref) {
      toast("Não foi possível conectar à nuvem. Verifique sua conexão.");
      return;
    }
    setCloudButtonsLoading(true, "save");
    try {
      await ref.set({
        email: normalizeEmail(user.email),
        name: getName(),
        trips: trips,
        frota: frota,
        usuarios: usuarios,
        updatedAt: new Date().toISOString(),
      });
      setLastSync(user.email);
      updateCloudModalStatus();
      toast("Dados salvos na nuvem! ☁️");
    } catch (e) {
      console.error("Erro ao salvar na nuvem:", e);
      toast("Não foi possível salvar na nuvem. Tente novamente.");
    } finally {
      setCloudButtonsLoading(false, "save");
    }
  }

  async function restoreFromCloud() {
    const user = getUser();
    if (!user || !user.email) {
      toast("Entre com sua conta Google para restaurar da nuvem.");
      return;
    }
    const ref = cloudDocRef(user.email);
    if (!ref) {
      toast("Não foi possível conectar à nuvem. Verifique sua conexão.");
      return;
    }
    if (!confirm("Isso vai substituir os dados salvos neste aparelho pelos dados da nuvem. Continuar?")) return;
    setCloudButtonsLoading(true, "restore");
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        toast("Nenhum dado salvo na nuvem para este e-mail ainda.");
        return;
      }
      const data = snap.data();
      trips = Array.isArray(data.trips) ? data.trips : [];
      saveTrips(trips);
      if (data.name) setName(data.name);
      if (Array.isArray(data.frota)) {
        frota = data.frota;
        saveFrota(frota);
      }
      if (Array.isArray(data.usuarios)) {
        usuarios = data.usuarios;
        saveUsuarios(usuarios);
      }
      setLastSync(user.email);
      updateCloudModalStatus();
      renderInicio();
      renderHistorico();
      renderFrota();
      renderUsuarios();
      toast("Dados restaurados da nuvem! 🔄");
    } catch (e) {
      console.error("Erro ao restaurar da nuvem:", e);
      toast("Não foi possível restaurar da nuvem. Tente novamente.");
    } finally {
      setCloudButtonsLoading(false, "restore");
    }
  }

  function setCloudButtonsLoading(loading, which) {
    const saveBtn = document.getElementById("btnCloudSave");
    const restoreBtn = document.getElementById("btnCloudRestore");
    if (saveBtn) saveBtn.disabled = loading;
    if (restoreBtn) restoreBtn.disabled = loading;
    if (which === "save" && saveBtn) saveBtn.textContent = loading ? "☁️ Salvando..." : "☁️ Salvar na nuvem";
    if (which === "restore" && restoreBtn) restoreBtn.textContent = loading ? "🔄 Restaurando..." : "🔄 Restaurar da nuvem";
  }

  function updateCloudModalStatus() {
    const user = getUser();
    const statusEl = document.getElementById("cloudSyncStatus");
    if (!statusEl) return;
    if (!user || !user.email) {
      statusEl.textContent = "";
      return;
    }
    const last = getLastSync(user.email);
    statusEl.textContent = last ? `Última sincronização: ${fmtDate(last)}` : "Ainda não sincronizado nesta conta.";
  }

  const cloudModal = document.getElementById("cloudModal");
  function openCloudModal() {
    const user = getUser();
    if (!user || !user.email) {
      toast("Entre com sua conta Google para usar a nuvem.");
      return;
    }
    document.getElementById("cloudModalEmail").textContent = user.email;
    updateCloudModalStatus();
    cloudModal.classList.add("open");
  }
  function closeCloudModal() { cloudModal.classList.remove("open"); }

  const userChipCloudBtn = document.getElementById("userChipCloudBtn");
  if (userChipCloudBtn) userChipCloudBtn.addEventListener("click", openCloudModal);
  document.getElementById("closeCloudModalBtn").addEventListener("click", closeCloudModal);
  cloudModal.addEventListener("click", (e) => { if (e.target === cloudModal) closeCloudModal(); });
  document.getElementById("btnCloudSave").addEventListener("click", saveToCloud);
  document.getElementById("btnCloudRestore").addEventListener("click", restoreFromCloud);

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
    renderFrota();
    renderNovaCaminhaoSelect();
    toast(`Bem-vindo, ${(fbUser.displayName || "").split(" ")[0] || "de volta"}!`);
    startAutoMergeTrips();
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
      if (autoMergeInterval) { clearInterval(autoMergeInterval); autoMergeInterval = null; }
      applyUserToUI();
      renderFrota();
      renderNovaCaminhaoSelect();
      showLogin();
    };
    if (auth) auth.signOut().then(finishLogout).catch(finishLogout);
    else finishLogout();
  });

  // Mescla no aparelho as viagens que estão na nuvem (por exemplo, lançadas
  // pelo motorista via WhatsApp) e que ainda não existem localmente — sem
  // apagar nada que já esteja no aparelho e sem precisar apertar botão.
  // Roda sozinho ao abrir o app, ao logar e periodicamente enquanto o app
  // fica aberto.
  async function mergeTripsFromCloud(silent) {
    const user = getUser();
    if (!user || !user.email) return;
    const ref = cloudDocRef(user.email);
    if (!ref) return;
    try {
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = snap.data();
      const cloudTrips = Array.isArray(data.trips) ? data.trips : [];
      if (!cloudTrips.length) return;

      const idsLocais = new Set(trips.map((t) => t.id));
      const novas = cloudTrips.filter((t) => t && t.id && !idsLocais.has(t.id));
      if (!novas.length) return;

      trips = trips.concat(novas);
      saveTrips(trips);
      setLastSync(user.email);
      renderInicio();
      renderHistorico();
      if (!silent) updateCloudModalStatus();
      toast(
        novas.length === 1
          ? "1 viagem nova chegou pelo WhatsApp! 📲"
          : `${novas.length} viagens novas chegaram pelo WhatsApp! 📲`
      );
    } catch (e) {
      console.error("Erro ao buscar viagens novas da nuvem:", e);
    }
  }

  let autoMergeInterval = null;
  function startAutoMergeTrips() {
    mergeTripsFromCloud(true);
    if (autoMergeInterval) clearInterval(autoMergeInterval);
    // A cada 60s enquanto o app estiver aberto e em primeiro plano.
    autoMergeInterval = setInterval(() => {
      if (document.visibilityState === "visible") mergeTripsFromCloud(true);
    }, 60000);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") mergeTripsFromCloud(true);
  });

  function initLogin() {
    initFirebase();
    checkRedirectResult();
    const user = getUser();
    const skipped = localStorage.getItem(SKIP_LOGIN_KEY);
    applyUserToUI();
    if (user || skipped) {
      hideLogin();
      if (user) startAutoMergeTrips();
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
  const formIds = ["fDestino", "fCliente", "fProduto", "fData", "fCaminhao", "fFrete", "fDiesel", "fPedagio", "fBorracharia", "fCaixinha", "fOutros", "fComissao"];
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

  // Preenche o select de caminhão em Nova viagem. Motorista fica travado no
  // caminhão vinculado ao próprio e-mail (cadastrado em Frota → Gerenciar
  // e-mails); gestor (ou convidado) pode escolher livremente entre todos.
  function renderNovaCaminhaoSelect() {
    const sel = els.fCaminhao;
    const hint = document.getElementById("fCaminhaoHint");
    if (!sel) return;

    if (getUserRole() === "motorista") {
      const caminhaoId = getUsuarioCaminhaoAtual();
      const c = caminhaoId ? frota.find((x) => x.id === caminhaoId) : null;
      sel.disabled = true;
      if (c) {
        sel.innerHTML = `<option value="${c.id}">${escapeHtml(c.placa || "Sem placa")} — ${escapeHtml(c.motorista || "")}</option>`;
        sel.value = c.id;
        if (hint) hint.style.display = "none";
      } else {
        sel.innerHTML = `<option value="">Nenhum caminhão vinculado</option>`;
        sel.value = "";
        if (hint) {
          hint.textContent = "Seu e-mail ainda não tem caminhão vinculado. Peça ao gestor para vincular em Frota → Gerenciar e-mails.";
          hint.style.display = "block";
        }
      }
      return;
    }

    // Gestor / convidado: seleção livre entre todos os caminhões da frota.
    sel.disabled = false;
    if (hint) hint.style.display = "none";
    const prev = sel.value;
    const sorted = [...frota].sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
    sel.innerHTML =
      `<option value="">Selecione (opcional)</option>` +
      sorted.map((c) => `<option value="${c.id}">${escapeHtml(c.placa || "Sem placa")} — ${escapeHtml(c.motorista || "")}</option>`).join("");
    if (sorted.some((c) => c.id === prev)) sel.value = prev;
  }

  function resetForm() {
    els.fDestino.value = "";
    els.fCliente.value = "";
    els.fProduto.value = "";
    els.fData.value = nowLocalInputValue();
    renderNovaCaminhaoSelect();
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
    const caminhaoSelecionado = els.fCaminhao && els.fCaminhao.value ? frota.find((c) => c.id === els.fCaminhao.value) : null;
    const t = {
      id: uid(),
      destino: els.fDestino.value.trim(),
      cliente: els.fCliente.value.trim(),
      produto: els.fProduto.value.trim(),
      data: els.fData.value ? new Date(els.fData.value).toISOString() : new Date().toISOString(),
      caminhaoId: caminhaoSelecionado ? caminhaoSelecionado.id : "",
      caminhaoPlaca: caminhaoSelecionado ? caminhaoSelecionado.placa || "" : "",
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
  const selPlaca = document.getElementById("selPlaca");

  function availableYears() {
    const years = new Set(trips.map((t) => new Date(t.data).getFullYear()));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }

  // Preenche o select de placa (Histórico/Estatísticas) com "Todos os
  // caminhões" + os caminhões da frota, mantendo a seleção atual se ainda
  // for válida.
  function fillPlacaFilterOptions(sel) {
    const prev = sel.value;
    const sorted = [...frota].sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
    sel.innerHTML =
      `<option value="">Todos os caminhões</option>` +
      sorted.map((c) => `<option value="${c.id}">🚛 ${escapeHtml(c.placa || "Sem placa")}</option>`).join("");
    if (sorted.some((c) => c.id === prev)) sel.value = prev;
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

    fillPlacaFilterOptions(selPlaca);

    renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10));
  }

  selYear.addEventListener("change", () => renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10)));
  selMonth.addEventListener("change", () => renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10)));
  selPlaca.addEventListener("change", () => renderMonths(parseInt(selYear.value, 10), parseInt(selMonth.value, 10)));

  document.getElementById("filterBtn").addEventListener("click", () => {
    document.querySelector(".period-box").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function tripsForMonth(year, month) {
    const placaFiltro = selPlaca.value;
    return trips
      .filter((t) => {
        const d = new Date(t.data);
        if (d.getFullYear() !== year || d.getMonth() !== month) return false;
        if (placaFiltro && t.caminhaoId !== placaFiltro) return false;
        return true;
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
                <div class="date">${fmtDate(t.data)}${t.cliente ? " • " + escapeHtml(t.cliente) : ""}${t.caminhaoPlaca ? " • 🚛 " + escapeHtml(t.caminhaoPlaca) : ""}</div>
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
      t.caminhaoPlaca ? `<div class="resumo-row" style="margin-top:8px;"><span class="rl">Caminhão</span></div><div class="resumo-row" style="padding-top:0;"><span class="rv" style="font-size:15px;">${escapeHtml(t.caminhaoPlaca)}</span></div>` : "",
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
  const statsPlacaSel = document.getElementById("statsPlaca");

  function buildStatsSelectsIfNeeded() {
    if (!statsMonthSel.dataset.built) {
      statsMonthSel.innerHTML = MONTH_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join("");
      statsMonthSel.dataset.built = "1";
      statsMonthSel.value = String(new Date().getMonth());
    }
    fillPlacaFilterOptions(statsPlacaSel);
  }

  statsModeSel.addEventListener("change", () => {
    statsMonthRow.style.display = statsModeSel.value === "year" ? "none" : "flex";
    renderStats();
  });
  statsYearSel.addEventListener("change", renderStats);
  statsMonthSel.addEventListener("change", renderStats);
  statsPlacaSel.addEventListener("change", renderStats);

  function tripsForPeriod(year, month) {
    const placaFiltro = statsPlacaSel.value;
    return trips.filter((t) => {
      const d = new Date(t.data);
      if (d.getFullYear() !== year || (month !== null && d.getMonth() !== month)) return false;
      if (placaFiltro && t.caminhaoId !== placaFiltro) return false;
      return true;
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
    const placaFiltro = statsPlacaSel.value;
    trips.forEach((t) => {
      if (placaFiltro && t.caminhaoId !== placaFiltro) return;
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
      const placaFiltro = statsPlacaSel.value;
      const caminhaoFiltrado = placaFiltro ? frota.find((c) => c.id === placaFiltro) : null;
      const periodLabel = (isYearMode ? `Ano ${year}` : `${MONTH_NAMES[month]} de ${year}`) + (caminhaoFiltrado ? ` · 🚛 ${caminhaoFiltrado.placa || ""}` : "");

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
