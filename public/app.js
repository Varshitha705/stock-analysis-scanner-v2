let stocks = [];
let chart = null;

const money = value => value == null ? "—" : "$" + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value == null ? "—" : (value >= 0 ? "+" : "") + Number(value).toFixed(2) + "%";
const gradeClass = grade => grade === "A+" ? "aplus" : grade === "A" ? "a" : grade === "B" ? "b" : "pass";

async function loadData() {
  const status = document.getElementById("status");
  const errorBox = document.getElementById("errorBox");

  errorBox.classList.add("hidden");
  status.textContent = "Fetching market data...";

  try {
    const response = await fetch("/api/analyze");
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "Could not load scanner.");
    }

    stocks = json.data;
    render();

    const firstValid = stocks.findIndex(stock => !stock.error);
    if (firstValid >= 0) {
      selectStock(firstValid);
    }

    status.textContent = `Updated ${new Date(json.updatedAt).toLocaleString()}${json.cached ? " · cached" : ""}. Auto-refreshes every 60 seconds.`;
  } catch (error) {
    status.textContent = "Setup required.";
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
}

function render() {
  const cards = document.getElementById("cards");
  const table = document.getElementById("stockTable");

  cards.innerHTML = "";
  table.innerHTML = "";

  let aplusCount = 0;

  stocks.forEach((stock, index) => {
    if (stock.error) {
      cards.innerHTML += `
        <article class="card">
          <div class="ticker">${stock.ticker}</div>
          <p class="bad">${stock.error}</p>
        </article>
      `;
      return;
    }

    if (stock.grade === "A+") aplusCount++;

    const changeClass = stock.changePercent >= 0 ? "green" : "red";

    cards.innerHTML += `
      <article class="card" onclick="selectStock(${index})">
        <div class="card-top">
          <div>
            <div class="ticker">${stock.ticker}</div>
            <div class="theme">${stock.theme}</div>
          </div>
          <span class="grade ${gradeClass(stock.grade)}">${stock.grade}</span>
        </div>
        <div class="score">${stock.score}/100</div>
        <div class="price">${money(stock.price)} <span class="${changeClass}">${pct(stock.changePercent)}</span></div>
        <div class="checks">
          ${checkLine("Bullish trend", stock.checks.trend)}
          ${checkLine("Above 9 EMA", stock.checks.above9)}
          ${checkLine("Above 21 EMA", stock.checks.above21)}
          ${checkLine("POC above price", stock.checks.pocAbove)}
          ${checkLine("Bullish theme", stock.checks.themeBullish)}
        </div>
      </article>
    `;

    table.innerHTML += `
      <tr>
        <td><b>${stock.ticker}</b></td>
        <td><span class="grade ${gradeClass(stock.grade)}">${stock.grade}</span></td>
        <td><b>${stock.score}</b></td>
        <td>${money(stock.price)}</td>
        <td class="${changeClass}">${pct(stock.changePercent)}</td>
        <td>${money(stock.ema9)}</td>
        <td>${money(stock.ema21)}</td>
        <td>${money(stock.poc)}</td>
        <td class="${stock.checks.trend ? "ok" : "bad"}">${stock.checks.trend ? "Pass" : "Fail"}</td>
        <td class="${stock.checks.themeBullish ? "ok" : "bad"}">${stock.benchmark} ${pct(stock.themeReturn1m)}</td>
      </tr>
    `;
  });

  document.getElementById("aplusCount").textContent = aplusCount;
}

function checkLine(label, passed) {
  return `<div class="check">${label}<b class="${passed ? "ok" : "bad"}">${passed ? "✓" : "×"}</b></div>`;
}

function selectStock(index) {
  const stock = stocks[index];
  if (!stock || stock.error) return;

  document.getElementById("selectedTitle").textContent = `${stock.ticker}: ${stock.grade} setup — ${stock.score}/100`;
  document.getElementById("selectedSummary").textContent =
    `Checks: trend ${stock.checks.trend ? "passed" : "failed"}, 9 EMA ${stock.checks.above9 ? "passed" : "failed"}, 21 EMA ${stock.checks.above21 ? "passed" : "failed"}, POC ${stock.checks.pocAbove ? "passed" : "failed"}, theme ${stock.checks.themeBullish ? "passed" : "failed"}.`;

  const labels = stock.candles.map(c => c.date);
  const closes = stock.candles.map(c => c.close);
  const ema9 = labels.map(() => stock.ema9);
  const ema21 = labels.map(() => stock.ema21);
  const poc = labels.map(() => stock.poc);

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(document.getElementById("priceChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Close", data: closes, borderWidth: 3, tension: 0.25 },
        { label: "9 EMA", data: ema9, borderWidth: 2, pointRadius: 0 },
        { label: "21 EMA", data: ema21, borderWidth: 2, pointRadius: 0 },
        { label: "Volume POC", data: poc, borderWidth: 2, pointRadius: 0, borderDash: [6, 6] }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: "#dce1ea" } } },
      scales: {
        x: { ticks: { color: "#9aa3b4", maxTicksLimit: 8 }, grid: { color: "#172033" } },
        y: { ticks: { color: "#9aa3b4" }, grid: { color: "#172033" } }
      }
    }
  });
}

loadData();
setInterval(loadData, 60000);
