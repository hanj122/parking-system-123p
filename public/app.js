document.addEventListener('DOMContentLoaded', () => {
    // ── DOM refs ──────────────────────────────────────────────────────────────
    const floorsContainer   = document.getElementById('floors-container');
    const ticketsList       = document.getElementById('tickets-list');
    const btnEntry          = document.getElementById('btn-entry');
    const simEntryTime      = document.getElementById('sim-entry-time');
    const simExitTime       = document.getElementById('sim-exit-time');
    const entryToast        = document.getElementById('entry-toast');
    const entryToastMsg     = document.getElementById('entry-toast-msg');

    // Modal refs
    const modal             = document.getElementById('exit-modal');
    const coTicketId        = document.getElementById('co-ticket-id');
    const coSlotId          = document.getElementById('co-slot-id');
    const coFloor           = document.getElementById('co-floor');
    const coEntryTime       = document.getElementById('co-entry-time');
    const coStatusPill      = document.getElementById('co-status-pill');
    const coFeeDisplay      = document.getElementById('co-fee-display');
    const cashInput         = document.getElementById('cash-input');
    const paymentError      = document.getElementById('payment-error');
    const paymentSection    = document.getElementById('payment-section');
    const receiptSection    = document.getElementById('receipt-section');
    const coChange          = document.getElementById('co-change');
    const coBreakdown       = document.getElementById('co-breakdown');
    const btnCancel         = document.getElementById('btn-cancel');
    const btnPay            = document.getElementById('btn-pay');
    const btnClose          = document.getElementById('btn-close');

    let currentTicketId = null;

    // ── Live polling ──────────────────────────────────────────────────────────
    fetchStatus();
    setInterval(fetchStatus, 3000);

    async function fetchStatus() {
        try {
            const res  = await fetch('/api/status');
            const data = await res.json();
            renderFloors(data.capacity);
            renderTickets(data.tickets);
        } catch (err) {
            console.error('Error fetching status:', err);
        }
    }

    // ── Render helpers ────────────────────────────────────────────────────────
    function renderFloors(capacity) {
        floorsContainer.innerHTML = '';
        [1, 2, 3].forEach(floor => {
            const cap       = capacity[floor] || { total: 100, taken: 0 };
            const available = cap.total - cap.taken;
            const pct       = Math.round((cap.taken / cap.total) * 100);

            // Colour the ring based on occupancy
            const ringColor = pct >= 90 ? 'border-brand-400' : pct >= 60 ? 'border-brand-200' : 'border-brand-100';

            const card = document.createElement('div');
            card.className = 'bg-white rounded-2xl shadow-card border border-black/[0.02] px-6 py-5 flex items-center justify-between';
            card.innerHTML = `
              <div class="flex flex-col gap-0.5">
                <p class="text-xs font-semibold tracking-[0.1em] uppercase text-ink-400">Floor ${floor}</p>
                <p class="text-4xl font-extrabold tracking-tighter text-ink-900 leading-none my-1">${available}<span class="text-xl font-bold text-ink-400">/100</span></p>
                <p class="text-xs text-ink-400">${cap.taken} slot${cap.taken !== 1 ? 's' : ''} occupied</p>
              </div>
              <div class="w-14 h-14 rounded-full border-4 ${ringColor} flex items-center justify-center">
                <span class="text-xs font-bold text-brand-500">${pct}%</span>
              </div>
            `;
            floorsContainer.appendChild(card);
        });
    }

    function renderTickets(tickets) {
        ticketsList.innerHTML = '';
        if (!tickets || tickets.length === 0) {
            ticketsList.innerHTML = `
              <div class="bg-white rounded-2xl shadow-card border border-black/[0.02] px-6 py-8 text-center">
                <p class="text-ink-400 text-sm font-medium">No active tickets — parking lot is free.</p>
              </div>`;
            return;
        }

        tickets.forEach(t => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-2xl shadow-card border border-black/[0.02] px-5 py-4 flex items-center justify-between';
            card.innerHTML = `
              <div class="flex items-center gap-4">
                <div class="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <span class="text-sm">🎫</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <p class="text-sm font-bold tracking-snug text-ink-900">Ticket #${t.id}</p>
                  <p class="text-xs text-ink-400 font-medium">Slot ${t.slot_id} · Floor ${t.floor}</p>
                  <p class="text-xs text-ink-400">In: ${new Date(t.entry_time).toLocaleString()}</p>
                </div>
              </div>
              <button
                onclick="openCheckout(${t.id}, ${t.slot_id}, ${t.floor}, '${t.entry_time}')"
                class="shrink-0 px-4 py-2 rounded-full border border-ink-100 text-ink-700 text-xs font-semibold hover:bg-ink-100 transition-colors"
              >
                Checkout
              </button>
            `;
            ticketsList.appendChild(card);
        });
    }

    // ── Entry button ──────────────────────────────────────────────────────────
    btnEntry.addEventListener('click', async () => {
        const entryTime = simEntryTime.value ? new Date(simEntryTime.value).toISOString() : null;

        try {
            const res  = await fetch('/api/entry', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(entryTime ? { entryTime } : {}),
            });
            const data = await res.json();

            if (!res.ok) {
                showToast(`⚠️ ${data.error || 'Error during entry'}`, true);
            } else {
                showToast(`Slot <strong>${data.slotId}</strong> assigned on Floor ${data.floor} — Ticket #<strong>${data.ticketId}</strong>`);
                fetchStatus();
            }
        } catch (err) {
            console.error(err);
        }
    });

    function showToast(msg, isError = false) {
        entryToastMsg.innerHTML = msg;
        entryToast.className = `flex items-center gap-3 rounded-2xl px-5 py-4 shadow-card text-sm ${
            isError
                ? 'bg-red-50 border border-red-100 text-red-700'
                : 'bg-white border border-brand-100 text-ink-700'
        }`;
        entryToast.classList.remove('hidden');
        setTimeout(() => entryToast.classList.add('hidden'), 4000);
    }

    // ── Checkout modal ────────────────────────────────────────────────────────
    window.openCheckout = async function(ticketId, slotId, floor, entryTime) {
        currentTicketId = ticketId;
        coTicketId.textContent  = ticketId;
        coSlotId.textContent    = slotId;
        coFloor.textContent     = floor;
        coEntryTime.textContent = new Date(entryTime).toLocaleString();

        // Reset modal state
        setStatusPill('Pending');
        coFeeDisplay.textContent = '₱—';
        cashInput.value          = '';
        paymentError.textContent = '';
        paymentError.classList.add('hidden');
        paymentSection.classList.remove('hidden');
        receiptSection.classList.remove('flex');
        receiptSection.classList.add('hidden');
        btnCancel.classList.remove('hidden');
        btnPay.classList.remove('hidden');
        btnClose.classList.add('hidden');
        btnPay.textContent = 'Pay & Exit';

        modal.classList.remove('hidden');

        // Fetch fee preview
        const exitTimeParam = simExitTime.value
            ? `?exitTime=${new Date(simExitTime.value).toISOString()}`
            : '';

        try {
            const res  = await fetch(`/api/ticket/${ticketId}/fee${exitTimeParam}`);
            const data = await res.json();

            if (res.ok) {
                coFeeDisplay.textContent = `₱${data.fee}`;
                setStatusPill(data.status);

                if (data.status === 'towed') {
                    paymentSection.classList.add('hidden');
                    btnPay.textContent = 'Acknowledge TOWED';
                }
            } else {
                coFeeDisplay.textContent = 'Error';
                showPaymentError(data.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    function setStatusPill(status) {
        const s = String(status).toLowerCase();
        coStatusPill.textContent = status.toUpperCase();
        coStatusPill.className = [
            'px-3 py-0.5 rounded-full text-xs font-bold tracking-wide',
            s === 'towed'     ? 'bg-red-100 text-red-700'       :
            s === 'completed' ? 'bg-green-100 text-green-700'   :
            s === 'active'    ? 'bg-brand-100 text-brand-600'   :
            'bg-ink-100 text-ink-700'
        ].join(' ');
    }

    function showPaymentError(msg) {
        paymentError.textContent = msg;
        paymentError.classList.remove('hidden');
    }

    btnCancel.addEventListener('click', () => {
        modal.classList.add('hidden');
        currentTicketId = null;
    });

    btnClose.addEventListener('click', () => {
        modal.classList.add('hidden');
        currentTicketId = null;
        fetchStatus();
    });

    // ── Payment submission ────────────────────────────────────────────────────
    btnPay.addEventListener('click', async () => {
        const exitTime       = simExitTime.value ? new Date(simExitTime.value).toISOString() : null;
        const amountReceived = cashInput.value ? parseFloat(cashInput.value) : 0;

        paymentError.classList.add('hidden');

        try {
            const res  = await fetch('/api/exit', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ticketId: currentTicketId, amountReceived, exitTime }),
            });
            const data = await res.json();

            if (!res.ok) {
                showPaymentError(data.error);
                return;
            }

            // Success — show receipt
            paymentSection.classList.add('hidden');
            receiptSection.classList.remove('hidden');
            receiptSection.classList.add('flex');
            btnCancel.classList.add('hidden');
            btnPay.classList.add('hidden');
            btnClose.classList.remove('hidden');

            if (data.status === 'towed') {
                coChange.textContent  = '0';
                coBreakdown.innerHTML = '<p class="text-ink-400 text-xs">No fee collected — vehicle was towed.</p>';
            } else {
                coChange.textContent = data.changeGiven;

                if (data.changeGiven === 0) {
                    coBreakdown.innerHTML = '<p class="text-ink-400 text-xs mt-1">Exact amount — no change needed.</p>';
                } else {
                    const entries = Object.entries(data.changeBreakdown)
                        .filter(([, count]) => count > 0)
                        .sort(([a], [b]) => parseInt(b) - parseInt(a));

                    const rows = entries.map(([denom, count]) => `
                      <div class="flex justify-between py-1 border-b border-dashed border-ink-100 last:border-0">
                        <span class="font-semibold">₱${denom}</span>
                        <span class="text-ink-400">× ${count}</span>
                      </div>`).join('');

                    coBreakdown.innerHTML = `
                      <p class="text-xs font-semibold tracking-wide uppercase text-ink-400 mt-2 mb-1">Breakdown</p>
                      ${rows}`;
                }
            }
        } catch (err) {
            console.error(err);
            showPaymentError('Network error — please try again.');
        }
    });
});
