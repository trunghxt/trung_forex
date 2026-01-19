const DATA_URL = 'https://script.google.com/macros/s/AKfycbyF6MC_xfBFSuEQ0LF6H8c2HOZhNXLy60MVhV7oWGvgEE_dftCDhbLsUUa9FY_x0NCZ/exec';

let allTrades = [];
let currentMonthKey = '';
let charts = {};

// DOM Elements
const els = {
    monthSelect: document.getElementById('monthSelect'),
    fromDate: document.getElementById('fromDate'),
    toDate: document.getElementById('toDate'),
    refreshBtn: document.getElementById('refreshBtn'),
    searchInput: document.getElementById('searchInput'),
    tableBody: document.querySelector('#tradesTable tbody'),
    kpis: {
        netPnl: document.getElementById('kpi-net-pnl'),
        totalTrades: document.getElementById('kpi-total-trades'),
        winRate: document.getElementById('kpi-win-rate'),
        profitFactor: document.getElementById('kpi-profit-factor'),
        grossProfit: document.getElementById('kpi-gross-profit'),
        grossLoss: document.getElementById('kpi-gross-loss')
    },
    charts: {
        cumulative: document.getElementById('chart-cumulative'),
        symbol: document.getElementById('chart-symbol'),
        reason: document.getElementById('chart-reason')
    }
};

// Initialize
async function init() {
    setupEventListeners();
    await loadMonths();
}

function setupEventListeners() {
    els.monthSelect.addEventListener('change', (e) => loadData(e.target.value));
    els.fromDate.addEventListener('change', () => filterByDateRange());
    els.toDate.addEventListener('change', () => filterByDateRange());
    els.refreshBtn.addEventListener('click', () => loadData(currentMonthKey));
    els.searchInput.addEventListener('input', (e) => renderTable(getFilteredTrades(), e.target.value));

    // Sort headers
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            const order = th.dataset.order === 'asc' ? 'desc' : 'asc';
            th.dataset.order = order;
            sortTable(field, order);
        });
    });
}

async function loadMonths() {
    try {
        const res = await fetch(`${DATA_URL}?path=months`);
        const data = await res.json();

        els.monthSelect.innerHTML = '';
        data.months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = month;
            els.monthSelect.appendChild(option);
        });

        if (data.months.length > 0) {
            currentMonthKey = data.months[0];
            els.monthSelect.value = currentMonthKey;
            loadData(currentMonthKey);
        }
    } catch (err) {
        console.error('Error loading months:', err);
        alert('Failed to load months.');
    }
}

async function loadData(month) {
    currentMonthKey = month;
    els.refreshBtn.classList.add('loading');
    els.refreshBtn.disabled = true;

    try {
        // Fetch specific month if supported, or filter client-side if needed.
        // Based on analysis, we might fetch all and filter client side, or api supports it.
        // We will fetch ?path=trades and filter by month_key just to be safe.
        const res = await fetch(`${DATA_URL}?path=trades`);
        const data = await res.json();

        // Filter valid rows and by month
        allTrades = data.rows.filter(r => r.ticket && r.month_key === month);

        // Sort by closing time asc for chart calculation
        allTrades.sort((a, b) => new Date(a.closing_time_utc) - new Date(b.closing_time_utc));

        // Set date range to month boundaries
        updateDateRangeForMonth(month);

        renderKPIs(getFilteredTrades());
        renderCharts(getFilteredTrades());
        renderTable(getFilteredTrades());

    } catch (err) {
        console.error('Error loading trades:', err);
        alert('Failed to load trade data.');
    } finally {
        els.refreshBtn.classList.remove('loading');
        els.refreshBtn.disabled = false;
    }
}

function updateDateRangeForMonth(monthKey) {
    // monthKey format: "2026-01"
    const [year, month] = monthKey.split('-');
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Format as YYYY-MM-DD for input[type="date"]
    els.fromDate.value = formatDateForInput(firstDay);
    els.toDate.value = formatDateForInput(lastDay);
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getFilteredTrades() {
    if (!els.fromDate.value && !els.toDate.value) {
        return allTrades;
    }

    const fromDate = els.fromDate.value ? new Date(els.fromDate.value) : null;
    const toDate = els.toDate.value ? new Date(els.toDate.value) : null;

    // Set toDate to end of day
    if (toDate) {
        toDate.setHours(23, 59, 59, 999);
    }

    return allTrades.filter(trade => {
        const tradeDate = new Date(trade.closing_time_utc);

        if (fromDate && tradeDate < fromDate) {
            return false;
        }

        if (toDate && tradeDate > toDate) {
            return false;
        }

        return true;
    });
}

function filterByDateRange() {
    const filteredTrades = getFilteredTrades();
    renderKPIs(filteredTrades);
    renderCharts(filteredTrades);
    renderTable(filteredTrades, els.searchInput.value);
}

function renderKPIs(trades) {
    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;

    trades.forEach(t => {
        const pnl = t.profit_usd + t.commission_usd + t.swap_usd;
        if (pnl > 0) {
            grossProfit += pnl;
            wins++;
        } else {
            grossLoss += Math.abs(pnl);
        }
    });

    const netPnl = grossProfit - grossLoss;
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? "∞" : 0) : (grossProfit / grossLoss).toFixed(2);

    els.kpis.netPnl.textContent = `$${netPnl.toFixed(2)}`;
    els.kpis.netPnl.style.color = netPnl >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    els.kpis.totalTrades.textContent = totalTrades;
    els.kpis.winRate.textContent = `${winRate.toFixed(1)}%`;
    els.kpis.profitFactor.textContent = profitFactor;

    els.kpis.grossProfit.textContent = `$${grossProfit.toFixed(2)}`;
    els.kpis.grossLoss.textContent = `$${grossLoss.toFixed(2)}`;
}

function renderCharts(trades) {
    destroyCharts();

    // 1. Cumulative PnL Line Chart
    let cumPnl = 0;
    const labels = trades.map(t => new Date(t.closing_time_utc).toLocaleDateString());
    const dataCum = trades.map(t => {
        const pnl = t.profit_usd + t.commission_usd + t.swap_usd;
        cumPnl += pnl;
        return cumPnl;
    });

    charts.cumulative = new Chart(els.charts.cumulative, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative PnL',
                data: dataCum,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { grid: { color: '#2e3440' } }
            }
        }
    });

    // 2. Bar Chart PnL by Symbol
    const symbolMap = {};
    trades.forEach(t => {
        const pnl = t.profit_usd + t.commission_usd + t.swap_usd;
        symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + pnl;
    });

    charts.symbol = new Chart(els.charts.symbol, {
        type: 'bar',
        data: {
            labels: Object.keys(symbolMap),
            datasets: [{
                label: 'PnL by Symbol',
                data: Object.values(symbolMap),
                backgroundColor: Object.values(symbolMap).map(v => v >= 0 ? '#10b981' : '#ef4444')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: '#2e3440' } } }
        }
    });

    // 3. Doughnut Close Reason
    const reasonMap = {};
    trades.forEach(t => {
        reasonMap[t.close_reason] = (reasonMap[t.close_reason] || 0) + 1;
    });

    charts.reason = new Chart(els.charts.reason, {
        type: 'doughnut',
        data: {
            labels: Object.keys(reasonMap),
            datasets: [{
                data: Object.values(reasonMap),
                backgroundColor: ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

function destroyCharts() {
    Object.values(charts).forEach(c => {
        if (c) c.destroy();
    });
}

function renderTable(trades, filterText = '') {
    const term = filterText.toLowerCase();
    const filtered = trades.filter(t =>
        t.symbol.toLowerCase().includes(term) ||
        String(t.ticket).includes(term) ||
        t.close_reason.toLowerCase().includes(term)
    );

    els.tableBody.innerHTML = filtered.map(t => {
        const profit = t.profit_usd;
        let pnlClass = 'text-neutral';
        if (profit > 0) pnlClass = 'text-profit';
        if (profit < 0) pnlClass = 'text-loss';

        return `
            <tr>
                <td>${new Date(t.closing_time_utc).toLocaleString()}</td>
                <td>${t.symbol}</td>
                <td><span style="color:${t.type === 'buy' ? '#10b981' : '#ef4444'}">${t.type.toUpperCase()}</span></td>
                <td>${t.lots}</td>
                <td><span class="${pnlClass}">$${profit.toFixed(2)}</span></td>
                <td>${t.commission_usd}</td>
                <td>${t.swap_usd}</td>
                <td>${t.close_reason}</td>
                <td>${t.ticket}</td>
            </tr>
        `;
    }).join('');
}

function sortTable(field, order) {
    const filteredTrades = getFilteredTrades();
    filteredTrades.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        if (field === 'type' || field === 'symbol' || field === 'close_reason') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    // Maintain filter state if any
    renderTable(filteredTrades, els.searchInput.value);
}

// Start
init();
