(function () {
  "use strict";

  const APP_VERSION = "14/08/2026 01:10";

  /* ---------------- Storage helpers ---------------- */
  const STORE_KEY = "perseguini_trips_v1";
  const NAME_KEY = "perseguini_name_v1";

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

    const comissaoValor = frete * (comissaoPct / 100);
    const totalGastos = diesel + pedagio + borracharia + caixinha + outros + comissaoValor;
    const liquido = frete - totalGastos;

    return { frete, diesel, pedagio, borracharia, caixinha, outros, comissaoPct, comissaoValor, totalGastos, liquido };
  }

  /* ---------------- Tab navigation ---------------- */
  const screens = {
    inicio: document.getElementById("screen-inicio"),
    nova: document.getElementById("screen-nova"),
    historico: document.getElementById("screen-historico"),
  };
  const navBtns = document.querySelectorAll(".nav-btn");
  const topbarSubtitle = document.getElementById("topbarSubtitle");

  const subtitles = {
    inicio: "Controle de viagens e fretes",
    nova: "Preencha os dados da viagem",
    historico: "Suas viagens por período",
  };

  function goTo(tab) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle("active", k === tab));
    navBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

    const brandRow = document.getElementById("topbarBrand");
    const titleRow = document.getElementById("topbarTitleRow");
    if (tab === "historico") {
      brandRow.style.display = "none";
      titleRow.style.display = "flex";
    } else {
      brandRow.style.display = "flex";
      titleRow.style.display = "none";
      topbarSubtitle.textContent = subtitles[tab] || subtitles.inicio;
    }

    if (tab === "historico") renderHistorico();
    if (tab === "inicio") renderInicio();
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

  document.getElementById("editNameBtn").addEventListener("click", () => {
    const current = getName();
    const val = prompt("Como podemos te chamar?", current === "Motorista" ? "" : current);
    if (val && val.trim()) {
      setName(val.trim());
      renderInicio();
    }
  });

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

  /* ---------------- Nova viagem screen ---------------- */
  const formIds = ["fDestino", "fData", "fFrete", "fDiesel", "fPedagio", "fBorracharia", "fCaixinha", "fOutros", "fComissao"];
  const els = {};
  formIds.forEach((id) => (els[id] = document.getElementById(id)));

  function nowLocalInputValue() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function resetForm() {
    els.fDestino.value = "";
    els.fData.value = nowLocalInputValue();
    ["fFrete","fDiesel","fPedagio","fBorracharia","fCaixinha","fOutros","fComissao"].forEach((id) => (els[id].value = ""));
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
    };
    const c = computeTrip(t);
    document.getElementById("sumGastos").textContent = fmtMoney(c.totalGastos - c.comissaoValor);
    const liqEl = document.getElementById("sumLiquido");
    liqEl.textContent = fmtMoney(c.liquido);
    liqEl.classList.toggle("neg", c.liquido < 0);
    document.getElementById("sumComissaoLabel").textContent = `Comissão (${c.comissaoPct || 0}%)`;
    document.getElementById("sumComissao").textContent = fmtMoney(c.comissaoValor);
  }

  ["fFrete","fDiesel","fPedagio","fBorracharia","fCaixinha","fOutros","fComissao"].forEach((id) =>
    els[id].addEventListener("input", updateSummary)
  );

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
      data: els.fData.value ? new Date(els.fData.value).toISOString() : new Date().toISOString(),
      frete: toNumber(els.fFrete.value),
      diesel: toNumber(els.fDiesel.value),
      pedagio: toNumber(els.fPedagio.value),
      borracharia: toNumber(els.fBorracharia.value),
      caixinha: toNumber(els.fCaixinha.value),
      outros: toNumber(els.fOutros.value),
      comissaoPct: toNumber(els.fComissao.value),
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
                <div class="date">${fmtDate(t.data)}</div>
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
    body.innerHTML = `
      <div class="resumo-row"><span class="rl">Destino</span></div>
      <div class="resumo-row" style="padding-top:0;"><span class="rv" style="font-size:16px;">${escapeHtml(t.destino || "-")}</span></div>
      <div class="resumo-row" style="margin-top:8px;"><span class="rl">Data</span></div>
      <div class="resumo-row" style="padding-top:0;"><span class="rv">${fmtDateOnly(t.data)}</span></div>

      <div class="resumo-row divider"><span class="rl">Frete</span><span class="rv">${fmtMoney(c.frete)}</span></div>
      <div class="resumo-row"><span class="rl">Diesel</span><span class="rv">${fmtMoney(c.diesel)}</span></div>
      <div class="resumo-row"><span class="rl">Pedágio</span><span class="rv">${fmtMoney(c.pedagio)}</span></div>
      <div class="resumo-row"><span class="rl">Borracharia</span><span class="rv">${fmtMoney(c.borracharia)}</span></div>
      <div class="resumo-row"><span class="rl">Caixinha</span><span class="rv">${fmtMoney(c.caixinha)}</span></div>
      <div class="resumo-row"><span class="rl">Outros</span><span class="rv">${fmtMoney(c.outros)}</span></div>
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
      const rows = [
        ["Frete", c.frete, false],
        ["Diesel", c.diesel, false],
        ["Pedágio", c.pedagio, false],
        ["Borracharia", c.borracharia, false],
        ["Caixinha", c.caixinha, false],
        ["Outros", c.outros, false],
        ["Total de gastos", c.totalGastos, true],
        ["Valor líquido", c.liquido, true],
      ];

      const headerH = 160;
      const padX = 46;
      let bodyH = 60; // top padding inside card before destino
      bodyH += 40 + 12; // destino label + value
      bodyH += 40 + 30; // data label + value + gap
      bodyH += rows.length * 46;
      bodyH += 26; // divider spacing
      bodyH += 76; // final total row
      bodyH += 30; // bottom padding

      const cardTop = 70;
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

      // Destino
      ctx.fillStyle = "#8A8FA3";
      ctx.font = "700 17px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText("Destino", lx, y);
      y += 34;
      ctx.fillStyle = "#1A1D29";
      ctx.font = "800 26px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText(t.destino || "-", lx, y);
      y += 44;

      // Data
      ctx.fillStyle = "#8A8FA3";
      ctx.font = "700 17px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText("Data", lx, y);
      y += 34;
      ctx.fillStyle = "#1A1D29";
      ctx.font = "800 26px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText(fmtDateOnly(t.data), lx, y);
      y += 40;

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

  /* ---------------- Service worker ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ---------------- Manual update check ---------------- */
  document.getElementById("appVersionLabel").textContent = `Versão: ${APP_VERSION}`;

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
})();
