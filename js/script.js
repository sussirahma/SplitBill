(() => {
      'use strict';

      // --- 1. LOCAL STORAGE KEYS ---
      const STORAGE_KEY_MEMBERS = 'splitbill_members_v1';
      const STORAGE_KEY_TRANSACTIONS = 'splitbill_transactions_v1';

      // --- 2. COLOR PALETTES FOR MEMBER CHIPS ---
      const CHIP_COLORS = [
        { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500' },
        { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', dot: 'bg-teal-500' },
        { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', dot: 'bg-indigo-500' },
        { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', dot: 'bg-sky-500' },
        { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500' },
        { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-500' },
        { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', dot: 'bg-rose-500' },
        { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-500' },
      ];

      function getMemberColor(name, index) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
          hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const idx = Math.abs(hash + index) % CHIP_COLORS.length;
        return CHIP_COLORS[idx];
      }

      // --- 3. STATE MANAGEMENT ---
      let state = {
        members: [],
        transactions: []
      };

      // Load State from LocalStorage
      function loadState() {
        try {
          const savedMembers = localStorage.getItem(STORAGE_KEY_MEMBERS);
          const savedTransactions = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
          state.members = savedMembers ? JSON.parse(savedMembers) : [];
          state.transactions = savedTransactions ? JSON.parse(savedTransactions) : [];
        } catch (e) {
          console.error('Error loading state from LocalStorage:', e);
          state.members = [];
          state.transactions = [];
        }
      }

      function saveState() {
        try {
          localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(state.members));
          localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(state.transactions));
        } catch (e) {
          console.error('Error saving state to LocalStorage:', e);
        }
      }

      // --- 4. FORMATTERS & UTILITIES ---
      function formatRupiah(amount) {
        const num = Math.round(Number(amount) || 0);
        return 'Rp ' + num.toLocaleString('id-ID');
      }

      function cleanNumberInput(val) {
        if (!val) return 0;
        const cleaned = String(val).replace(/[^0-9]/g, '');
        return parseInt(cleaned, 10) || 0;
      }

      function showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-msg');
        const toastIcon = document.getElementById('toast-icon');

        toastMsg.textContent = message;
        if (isError) {
          toastIcon.textContent = 'error';
          toastIcon.className = 'material-symbols-outlined text-rose-400 text-lg';
        } else {
          toastIcon.textContent = 'check_circle';
          toastIcon.className = 'material-symbols-outlined text-emerald-400 text-lg';
        }

        toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
        toast.classList.add('translate-y-0', 'opacity-100');

        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
          toast.classList.remove('translate-y-0', 'opacity-100');
          toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        }, 3000);
      }

      // --- 5. CORE GREEDY MIN-CASH FLOW ALGORITHM ---
      function computeSettlementAndBalances() {
        const balances = {};
        const totalPaidByMember = {};
        const totalShareByMember = {};

        // Initialize all members with 0
        state.members.forEach(m => {
          balances[m] = 0;
          totalPaidByMember[m] = 0;
          totalShareByMember[m] = 0;
        });

        // Sum across all transactions
        state.transactions.forEach(tx => {
          if (tx.isSettlement) {
            // Direct settlement between debtor and creditor
            if (balances[tx.from] !== undefined) {
              balances[tx.from] += tx.amount; // Debtor's debt reduces
            }
            if (balances[tx.to] !== undefined) {
              balances[tx.to] -= tx.amount;   // Creditor's credit reduces
            }
          } else {
            // Standard shared expense
            // Payers
            if (tx.payers) {
              Object.entries(tx.payers).forEach(([payer, amt]) => {
                const numericAmt = Number(amt) || 0;
                if (balances[payer] !== undefined) {
                  balances[payer] += numericAmt;
                  totalPaidByMember[payer] = (totalPaidByMember[payer] || 0) + numericAmt;
                }
              });
            }
            // Splitters
            if (tx.splitBetween && tx.splitBetween.length > 0) {
              const perPersonShare = tx.total / tx.splitBetween.length;
              tx.splitBetween.forEach(person => {
                if (balances[person] !== undefined) {
                  balances[person] -= perPersonShare;
                  totalShareByMember[person] = (totalShareByMember[person] || 0) + perPersonShare;
                }
              });
            }
          }
        });

        // Greedy Min-Cash Flow algorithm to find minimum routes
        const debtors = [];
        const creditors = [];
        const EPSILON = 0.5;

        Object.entries(balances).forEach(([person, net]) => {
          const rounded = Math.round(net);
          if (rounded < -EPSILON) {
            debtors.push({ person, amount: -rounded });
          } else if (rounded > EPSILON) {
            creditors.push({ person, amount: rounded });
          }
        });

        const routes = [];
        // Clone lists for processing
        const dList = debtors.map(d => ({ ...d }));
        const cList = creditors.map(c => ({ ...c }));

        while (dList.length > 0 && cList.length > 0) {
          // Sort descending
          dList.sort((a, b) => b.amount - a.amount);
          cList.sort((a, b) => b.amount - a.amount);

          const debtor = dList[0];
          const creditor = cList[0];

          const transferAmount = Math.min(debtor.amount, creditor.amount);
          if (transferAmount > 0) {
            routes.push({
              from: debtor.person,
              to: creditor.person,
              amount: transferAmount
            });
          }

          debtor.amount -= transferAmount;
          creditor.amount -= transferAmount;

          if (debtor.amount <= EPSILON) dList.shift();
          if (creditor.amount <= EPSILON) cList.shift();
        }

        return {
          balances,
          totalPaidByMember,
          totalShareByMember,
          routes
        };
      }

      // --- 6. DOM RENDERERS ---

      // A. Render Header & Stats
      function renderStats(routes) {
        // Total Expense = Sum of all non-settlement transactions
        const totalExpense = state.transactions
          .filter(t => !t.isSettlement)
          .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

        document.getElementById('stat-total-expense').textContent = formatRupiah(totalExpense);
        document.getElementById('stat-member-count').textContent = `${state.members.length} Orang`;

        const statSettlement = document.getElementById('stat-settlement-status');
        if (routes.length === 0) {
          if (state.members.length >= 2 && state.transactions.length > 0) {
            statSettlement.textContent = 'Semua Lunas';
            statSettlement.className = 'text-2xl font-extrabold text-emerald-600 mt-1';
          } else {
            statSettlement.textContent = '0 Transfer';
            statSettlement.className = 'text-2xl font-extrabold text-slate-900 mt-1';
          }
        } else {
          statSettlement.textContent = `${routes.length} Transfer`;
          statSettlement.className = 'text-2xl font-extrabold text-amber-600 mt-1';
        }
      }

      // B. Render Member Chips
      function renderMemberChips() {
        const container = document.getElementById('member-chips-container');
        if (state.members.length === 0) {
          container.innerHTML = `<p class="text-xs text-slate-400 italic py-2">Belum ada anggota. Tambahkan minimal 2 orang untuk mulai mencatat pengeluaran.</p>`;
          return;
        }

        container.innerHTML = '';
        state.members.forEach((member, index) => {
          const color = getMemberColor(member, index);
          const chip = document.createElement('div');
          chip.className = `inline-flex items-center gap-1.5 ${color.bg} ${color.border} border px-3 py-1.5 rounded-full text-xs font-medium ${color.text} shadow-2xs transition-transform hover:scale-102`;
          
          chip.innerHTML = `
            <span class="w-2 h-2 rounded-full ${color.dot}"></span>
            <span class="font-semibold">${escapeHtml(member)}</span>
            <button type="button" data-name="${escapeHtml(member)}" class="btn-remove-member ml-1 text-slate-400 hover:text-rose-600 rounded-full p-0.5 transition cursor-pointer flex items-center justify-center" title="Hapus ${escapeHtml(member)}">
              <span class="material-symbols-outlined text-sm">close</span>
            </button>
          `;
          container.appendChild(chip);
        });

        // Attach event listeners for delete buttons
        container.querySelectorAll('.btn-remove-member').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = btn.getAttribute('data-name');
            removeMember(name);
          });
        });
      }

      // C. Render Expense Form Dynamic Inputs
      function renderExpenseForm() {
        const payerContainer = document.getElementById('payer-inputs-container');
        const splitContainer = document.getElementById('split-members-container');

        if (state.members.length === 0) {
          payerContainer.innerHTML = `
            <div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
              <p class="text-xs text-slate-400">Tambahkan anggota terlebih dahulu pada form di atas.</p>
            </div>
          `;
          splitContainer.innerHTML = `<p class="text-xs text-slate-400 italic py-2">Tambahkan anggota terlebih dahulu.</p>`;
          updateExpenseCalculations();
          return;
        }

        // 1. Payer Inputs
        payerContainer.innerHTML = '';
        state.members.forEach((member, index) => {
          const color = getMemberColor(member, index);
          const initial = member.charAt(0).toUpperCase();

          const row = document.createElement('div');
          row.className = 'flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/70 hover:bg-slate-50 transition';
          row.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-8 h-8 rounded-full ${color.bg} ${color.text} ${color.border} border flex items-center justify-center font-bold text-xs shrink-0">
                ${escapeHtml(initial)}
              </div>
              <span class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(member)}">${escapeHtml(member)}</span>
            </div>
            <div class="relative w-40 sm:w-48 shrink-0">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
              <input 
                type="text" 
                inputmode="numeric"
                data-member="${escapeHtml(member)}" 
                class="payer-amount-input w-full bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-right text-slate-900 transition outline-none min-h-[38px]" 
                placeholder="0"
              />
            </div>
          `;
          payerContainer.appendChild(row);
        });

        // 2. Split Checkboxes
        splitContainer.innerHTML = '';
        state.members.forEach((member, index) => {
          const color = getMemberColor(member, index);
          const label = document.createElement('label');
          label.className = 'split-checkbox-label inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer select-none min-h-[44px]';
          label.innerHTML = `
            <input 
              type="checkbox" 
              data-member="${escapeHtml(member)}" 
              checked 
              class="split-checkbox w-4 h-4 text-emerald-600 rounded-md border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
            />
            <span class="text-xs font-semibold text-slate-700">${escapeHtml(member)}</span>
          `;
          splitContainer.appendChild(label);
        });

        // Bind input and change events for real-time recalculation
        payerContainer.querySelectorAll('.payer-amount-input').forEach(input => {
          input.addEventListener('input', (e) => {
            const raw = cleanNumberInput(e.target.value);
            e.target.value = raw > 0 ? raw.toLocaleString('id-ID') : '';
            updateExpenseCalculations();
          });
        });

        splitContainer.querySelectorAll('.split-checkbox').forEach(cb => {
          cb.addEventListener('change', () => {
            updateExpenseCalculations();
          });
        });

        updateExpenseCalculations();
      }

      // Real-time calculation of Total Paid & Beban per orang
      function updateExpenseCalculations() {
        let totalPaid = 0;
        const payerInputs = document.querySelectorAll('.payer-amount-input');
        payerInputs.forEach(input => {
          totalPaid += cleanNumberInput(input.value);
        });

        document.getElementById('total-paid-display').textContent = `Total: ${formatRupiah(totalPaid)}`;

        const checkedBoxes = document.querySelectorAll('.split-checkbox:checked');
        const splitCount = checkedBoxes.length;

        document.getElementById('split-count-text').textContent = `${splitCount} orang terpilih`;

        const perPersonDisplay = document.getElementById('per-person-share-display');
        if (splitCount > 0 && totalPaid > 0) {
          const perPerson = Math.round(totalPaid / splitCount);
          perPersonDisplay.textContent = `${formatRupiah(perPerson)} / orang`;
        } else {
          perPersonDisplay.textContent = `Rp 0 / orang`;
        }
      }

      // D. Render Settlement Routes (Bayar ke Siapa?)
      function renderSettlementRoutes(routes) {
        const container = document.getElementById('settlement-routes-container');

        if (state.members.length < 2) {
          container.innerHTML = `
            <div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
              <span class="material-symbols-outlined text-3xl text-slate-300 mb-1">group</span>
              <p class="text-xs text-slate-500 font-medium">Minimal 2 anggota dibutuhkan.</p>
              <p class="text-[11px] text-slate-400 mt-0.5">Tambahkan anggota terlebih dahulu untuk melihat skema pembagian.</p>
            </div>
          `;
          return;
        }

        if (routes.length === 0) {
          const hasTransactions = state.transactions.length > 0;
          container.innerHTML = `
            <div class="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-6 text-center">
              <span class="material-symbols-outlined text-3xl text-emerald-600 mb-1">task_alt</span>
              <p class="text-xs font-bold text-emerald-900">${hasTransactions ? 'Semua Urusan Utang Telah Lunas!' : 'Belum Ada Kewajiban Transfer'}</p>
              <p class="text-[11px] text-emerald-700 mt-0.5">${hasTransactions ? 'Semua saldo anggota sudah seimbang (Rp 0).' : 'Catat pengeluaran baru untuk melihat alur transfer paling efisien.'}</p>
            </div>
          `;
          return;
        }

        container.innerHTML = '';
        routes.forEach((route, idx) => {
          const card = document.createElement('div');
          card.className = 'bg-slate-50 border border-slate-200/90 hover:border-emerald-300 rounded-2xl p-4 transition shadow-2xs space-y-3';
          
          card.innerHTML = `
            <div class="flex items-center justify-between gap-2">
              <!-- Route Direction -->
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg truncate" title="${escapeHtml(route.from)}">
                  ${escapeHtml(route.from)}
                </span>
                <span class="material-symbols-outlined text-emerald-600 text-base shrink-0">arrow_forward</span>
                <span class="text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg truncate" title="${escapeHtml(route.to)}">
                  ${escapeHtml(route.to)}
                </span>
              </div>

              <!-- Amount -->
              <div class="text-right shrink-0">
                <span class="text-sm font-extrabold text-[#059669]">${formatRupiah(route.amount)}</span>
              </div>
            </div>

            <!-- Action: Tandai Selesai -->
            <div class="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span class="text-[11px] text-slate-400">Transfer langsung via bank / e-wallet</span>
              <button 
                type="button" 
                data-from="${escapeHtml(route.from)}" 
                data-to="${escapeHtml(route.to)}" 
                data-amount="${route.amount}" 
                class="btn-mark-settled inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-100/80 hover:bg-emerald-200/90 px-3 py-1.5 rounded-lg transition cursor-pointer min-h-[32px]"
                title="Catat pelunasan transfer ini"
              >
                <span class="material-symbols-outlined text-sm">check</span>
                <span>Tandai Selesai</span>
              </button>
            </div>
          `;
          container.appendChild(card);
        });

        // Attach listeners for "Tandai Selesai"
        container.querySelectorAll('.btn-mark-settled').forEach(btn => {
          btn.addEventListener('click', () => {
            const from = btn.getAttribute('data-from');
            const to = btn.getAttribute('data-to');
            const amount = Number(btn.getAttribute('data-amount')) || 0;
            settleDebt(from, to, amount);
          });
        });
      }

      // E. Render Saldo Bersih Anggota
      function renderMemberBalances(calcData) {
        const container = document.getElementById('member-balances-container');

        if (state.members.length === 0) {
          container.innerHTML = `
            <div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center">
              <p class="text-xs text-slate-400 italic">Belum ada anggota terdaftar.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = '';
        state.members.forEach((member, index) => {
          const color = getMemberColor(member, index);
          const net = Math.round(calcData.balances[member] || 0);
          const totalPaid = calcData.totalPaidByMember[member] || 0;
          const totalShare = calcData.totalShareByMember[member] || 0;

          let badgeHtml = '';
          if (net > 0) {
            badgeHtml = `
              <div class="text-right">
                <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  + ${formatRupiah(net)}
                </span>
                <p class="text-[10px] text-emerald-600 font-medium mt-0.5">Berhak menerima</p>
              </div>
            `;
          } else if (net < 0) {
            badgeHtml = `
              <div class="text-right">
                <span class="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full">
                  - ${formatRupiah(Math.abs(net))}
                </span>
                <p class="text-[10px] text-rose-600 font-medium mt-0.5">Harus membayar</p>
              </div>
            `;
          } else {
            badgeHtml = `
              <div class="text-right">
                <span class="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                  Rp 0
                </span>
                <p class="text-[10px] text-slate-400 font-medium mt-0.5">Impas</p>
              </div>
            `;
          }

          const card = document.createElement('div');
          card.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 hover:bg-slate-50 transition';
          card.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-full ${color.bg} ${color.text} ${color.border} border flex items-center justify-center font-bold text-xs shrink-0">
                ${escapeHtml(member.charAt(0).toUpperCase())}
              </div>
              <div class="min-w-0">
                <p class="text-xs font-bold text-slate-800 truncate" title="${escapeHtml(member)}">${escapeHtml(member)}</p>
                <p class="text-[11px] text-slate-400 truncate">Bayar: ${formatRupiah(totalPaid)} • Beban: ${formatRupiah(totalShare)}</p>
              </div>
            </div>
            ${badgeHtml}
          `;
          container.appendChild(card);
        });
      }

      // F. Render Riwayat Pengeluaran
      function renderHistory() {
        const container = document.getElementById('transactions-history-container');
        const badge = document.getElementById('history-count-badge');

        badge.textContent = `${state.transactions.length} Transaksi`;

        if (state.transactions.length === 0) {
          container.innerHTML = `
            <div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
              <span class="material-symbols-outlined text-3xl text-slate-300 mb-1">history</span>
              <p class="text-xs text-slate-500 font-medium">Belum ada riwayat transaksi tersimpan.</p>
              <p class="text-[11px] text-slate-400 mt-0.5">Semua transaksi yang dicatat akan tersimpan di browser Anda (LocalStorage).</p>
            </div>
          `;
          return;
        }

        container.innerHTML = '';
        // Order newest first
        const sorted = [...state.transactions].reverse();

        sorted.forEach(tx => {
          const card = document.createElement('div');
          card.className = 'bg-slate-50 hover:bg-slate-100/70 border border-slate-200/90 rounded-2xl p-4 transition space-y-3';

          if (tx.isSettlement) {
            // Pelunasan card style
            card.innerHTML = `
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5 min-w-0">
                  <div class="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-lg">payments</span>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-extrabold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-md">Pelunasan</span>
                      <h4 class="text-sm font-bold text-slate-900">${escapeHtml(tx.description)}</h4>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(tx.date)}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-extrabold text-teal-700">${formatRupiah(tx.amount)}</span>
                  <button type="button" data-id="${tx.id}" class="btn-delete-tx text-slate-400 hover:text-rose-600 p-1 rounded-lg transition cursor-pointer" title="Hapus catatan pelunasan">
                    <span class="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </div>
              <div class="text-xs text-slate-600 bg-white border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between">
                <span><strong>${escapeHtml(tx.from)}</strong> telah melunasi transfer kepada <strong>${escapeHtml(tx.to)}</strong></span>
                <span class="material-symbols-outlined text-teal-600 text-base">check_circle</span>
              </div>
            `;
          } else {
            // Standard expense card
            const payersList = Object.entries(tx.payers || {})
              .map(([p, amt]) => `<span class="inline-flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-medium text-slate-700 text-[11px]">${escapeHtml(p)}: ${formatRupiah(amt)}</span>`)
              .join(' ');

            const splittersList = (tx.splitBetween || []).join(', ');
            const perPersonCost = tx.splitBetween && tx.splitBetween.length > 0 
              ? Math.round(tx.total / tx.splitBetween.length) 
              : 0;

            card.innerHTML = `
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5 min-w-0">
                  <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-lg">receipt_long</span>
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-slate-900 leading-snug">${escapeHtml(tx.description)}</h4>
                    <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(tx.date)}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-sm font-extrabold text-[#059669]">${formatRupiah(tx.total)}</span>
                  <button type="button" data-id="${tx.id}" class="btn-delete-tx text-slate-400 hover:text-rose-600 p-1 rounded-lg transition cursor-pointer" title="Hapus transaksi ini">
                    <span class="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </div>

              <!-- Breakdown Payers & Splitters -->
              <div class="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2 text-xs">
                <div>
                  <span class="text-slate-400 text-[11px] block mb-1">Dibayar oleh:</span>
                  <div class="flex flex-wrap gap-1.5">${payersList}</div>
                </div>
                <div class="border-t border-slate-100 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                  <span class="text-slate-500">Ditanggung ${tx.splitBetween.length} orang: <strong class="text-slate-700">${escapeHtml(splittersList)}</strong></span>
                  <span class="text-emerald-700 font-bold">${formatRupiah(perPersonCost)} / org</span>
                </div>
              </div>
            `;
          }

          container.appendChild(card);
        });

        // Attach listeners for deleting single transaction
        container.querySelectorAll('.btn-delete-tx').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            deleteTransaction(id);
          });
        });
      }

      // Master Refresh Function
      function renderAll() {
        const calcData = computeSettlementAndBalances();
        renderStats(calcData.routes);
        renderMemberChips();
        renderSettlementRoutes(calcData.routes);
        renderMemberBalances(calcData);
        renderHistory();
      }

      // --- 7. ACTIONS & USER INTERACTIONS ---

      // Helper: Escape HTML
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      // A. Add Member
      function handleAddMember(e) {
        if (e) e.preventDefault();
        const input = document.getElementById('input-member-name');
        const errorMsg = document.getElementById('member-error-msg');
        const errorText = document.getElementById('member-error-text');

        const name = input.value.trim();

        // Validation
        if (!name) {
          errorText.textContent = 'Nama anggota tidak boleh kosong!';
          errorMsg.classList.remove('hidden');
          errorMsg.classList.add('flex');
          input.focus();
          return;
        }

        // Case-insensitive duplicate check
        const isDuplicate = state.members.some(m => m.toLowerCase() === name.toLowerCase());
        if (isDuplicate) {
          errorText.textContent = `Anggota bernama "${name}" sudah terdaftar!`;
          errorMsg.classList.remove('hidden');
          errorMsg.classList.add('flex');
          input.focus();
          return;
        }

        errorMsg.classList.add('hidden');
        errorMsg.classList.remove('flex');

        state.members.push(name);
        saveState();

        input.value = '';
        renderMemberChips();
        renderExpenseForm();
        renderAll();
        showToast(`"${name}" berhasil ditambahkan!`);
      }

      // B. Remove Member
      function removeMember(name) {
        // Check if member is involved in transactions
        const isInvolved = state.transactions.some(tx => {
          if (tx.isSettlement) return tx.from === name || tx.to === name;
          const paid = tx.payers && tx.payers[name];
          const split = tx.splitBetween && tx.splitBetween.includes(name);
          return paid || split;
        });

        if (isInvolved) {
          if (!confirm(`Anggota "${name}" memiliki riwayat pengeluaran atau pelunasan. Menghapusnya akan memengaruhi perhitungan. Lanjutkan?`)) {
            return;
          }
        }

        state.members = state.members.filter(m => m !== name);
        saveState();

        renderMemberChips();
        renderExpenseForm();
        renderAll();
        showToast(`"${name}" dihapus.`);
      }

      // C. Save Expense Transaction
      function handleSaveExpense(e) {
        if (e) e.preventDefault();
        const descInput = document.getElementById('input-expense-desc');
        const errorMsg = document.getElementById('expense-error-msg');
        const errorText = document.getElementById('expense-error-text');

        const description = descInput.value.trim() || 'Pengeluaran Bersama';

        if (state.members.length < 2) {
          errorText.textContent = 'Minimal 2 anggota dibutuhkan untuk mencatat pengeluaran.';
          errorMsg.classList.remove('hidden');
          errorMsg.classList.add('flex');
          return;
        }

        // Gather Payers
        const payers = {};
        let totalPaid = 0;
        document.querySelectorAll('.payer-amount-input').forEach(input => {
          const amt = cleanNumberInput(input.value);
          if (amt > 0) {
            const member = input.getAttribute('data-member');
            payers[member] = amt;
            totalPaid += amt;
          }
        });

        if (totalPaid <= 0) {
          errorText.textContent = 'Harap masukkan nominal yang dibayar oleh minimal 1 anggota.';
          errorMsg.classList.remove('hidden');
          errorMsg.classList.add('flex');
          return;
        }

        // Gather Splitters
        const splitBetween = [];
        document.querySelectorAll('.split-checkbox:checked').forEach(cb => {
          splitBetween.push(cb.getAttribute('data-member'));
        });

        if (splitBetween.length === 0) {
          errorText.textContent = 'Pilih minimal 1 orang yang menanggung beban biaya.';
          errorMsg.classList.remove('hidden');
          errorMsg.classList.add('flex');
          return;
        }

        errorMsg.classList.add('hidden');
        errorMsg.classList.remove('flex');

        // Format Date
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const newTx = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          description,
          total: totalPaid,
          payers,
          splitBetween,
          date: dateStr,
          isSettlement: false
        };

        state.transactions.push(newTx);
        saveState();

        // Reset Expense Form
        descInput.value = '';
        document.querySelectorAll('.payer-amount-input').forEach(input => input.value = '');
        document.querySelectorAll('.split-checkbox').forEach(cb => cb.checked = true);
        updateExpenseCalculations();

        renderAll();
        showToast('Pengeluaran berhasil dicatat!');
      }

      // D. Settle Debt (Tandai Selesai)
      function settleDebt(from, to, amount) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const settlementTx = {
          id: 'settle_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          description: `Pelunasan: ${from} ke ${to}`,
          total: amount,
          amount: amount,
          from: from,
          to: to,
          date: dateStr,
          isSettlement: true
        };

        state.transactions.push(settlementTx);
        saveState();

        renderAll();
        showToast(`Pelunasan transfer ${from} ke ${to} berhasil dicatat!`);
      }

      // E. Delete Single Transaction
      function deleteTransaction(id) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveState();
        renderAll();
        showToast('Transaksi dihapus.');
      }

      // F. Clear All Transactions
      function clearAllHistory() {
        state.transactions = [];
        saveState();
        renderAll();
        showToast('Seluruh riwayat transaksi telah dihapus.');
      }

      // G. Factory Reset (Clear All Data)
      function factoryReset() {
        state.members = [];
        state.transactions = [];
        localStorage.removeItem(STORAGE_KEY_MEMBERS);
        localStorage.removeItem(STORAGE_KEY_TRANSACTIONS);

        renderMemberChips();
        renderExpenseForm();
        renderAll();
        showToast('Semua data berhasil di-reset.');
      }

      // H. WhatsApp Message Generator
      function copyWhatsAppSummary() {
        const calcData = computeSettlementAndBalances();

        if (state.members.length === 0) {
          showToast('Belum ada anggota atau data untuk disalin.', true);
          return;
        }

        const totalExpense = state.transactions
          .filter(t => !t.isSettlement)
          .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

        let text = `🧾 *RINGKASAN TAGIHAN (SPLITBILL)*\n`;
        text += `───────────────────────\n`;
        text += `👥 *Anggota:* ${state.members.join(', ')}\n`;
        text += `💰 *Total Pengeluaran:* ${formatRupiah(totalExpense)}\n\n`;

        // Saldo Bersih
        text += `📊 *STATUS SALDO ANGGOTA:*\n`;
        state.members.forEach(m => {
          const net = Math.round(calcData.balances[m] || 0);
          if (net > 0) {
            text += `• ${m}: +${formatRupiah(net)} (Berhak menerima)\n`;
          } else if (net < 0) {
            text += `• ${m}: -${formatRupiah(Math.abs(net))} (Harus bayar)\n`;
          } else {
            text += `• ${m}: Rp 0 (Lunas/Impas)\n`;
          }
        });
        text += `\n`;

        // Rekomendasi Transfer
        text += `🔄 *REKOMENDASI TRANSFER RINGKAS:*\n`;
        if (calcData.routes.length === 0) {
          text += `✅ *Semua utang telah lunas / tidak ada transfer yang diperlukan.*\n`;
        } else {
          calcData.routes.forEach((r, i) => {
            text += `${i + 1}. *${r.from}* bayar ke *${r.to}* sebesar *${formatRupiah(r.amount)}*\n`;
          });
        }

        text += `\n───────────────────────\n`;
        text += `_Mohon segera lakukan transfer dan konfirmasi jika sudah selesai. Terima kasih! 🙏_\n`;
        text += `_Dibuat dengan SplitBill_`;

        // Clipboard Copy with Fallback
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Pesan WhatsApp berhasil disalin ke clipboard!');
          }).catch(() => {
            fallbackCopy(text);
          });
        } else {
          fallbackCopy(text);
        }
      }

      function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          showToast('Pesan WhatsApp berhasil disalin!');
        } catch (err) {
          showToast('Gagal menyalin otomatis. Periksa izin browser.', true);
        }
        document.body.removeChild(textArea);
      }

      // I. Load Demo Data
      function loadDemoData() {
        state.members = ['Andi', 'Budi', 'Citra', 'Doni'];
        state.transactions = [
          {
            id: 'demo_1',
            description: 'Makan Malam Seafood',
            total: 360000,
            payers: { 'Andi': 360000 },
            splitBetween: ['Andi', 'Budi', 'Citra', 'Doni'],
            date: '3 Sep 2026, 19:30',
            isSettlement: false
          },
          {
            id: 'demo_2',
            description: 'Bensin Mobil & Tol',
            total: 120000,
            payers: { 'Budi': 120000 },
            splitBetween: ['Andi', 'Budi', 'Citra', 'Doni'],
            date: '3 Sep 2026, 21:00',
            isSettlement: false
          },
          {
            id: 'demo_3',
            description: 'Kopi & Cemilan',
            total: 80000,
            payers: { 'Citra': 50000, 'Doni': 30000 },
            splitBetween: ['Andi', 'Budi', 'Citra', 'Doni'],
            date: '3 Sep 2026, 22:15',
            isSettlement: false
          }
        ];
        saveState();
        renderMemberChips();
        renderExpenseForm();
        renderAll();
        showToast('Data contoh berhasil dimuat!');
      }

      // --- 8. EVENT LISTENERS INITIALIZATION ---
      function initEventListeners() {
        // Form Add Member
        const formAddMember = document.getElementById('form-add-member');
        formAddMember.addEventListener('submit', handleAddMember);

        const memberInput = document.getElementById('input-member-name');
        memberInput.addEventListener('input', () => {
          document.getElementById('member-error-msg').classList.add('hidden');
        });

        // Form Expense
        const formExpense = document.getElementById('form-expense');
        formExpense.addEventListener('submit', handleSaveExpense);

        // Select / Unselect All Split
        document.getElementById('btn-select-all-split').addEventListener('click', () => {
          document.querySelectorAll('.split-checkbox').forEach(cb => cb.checked = true);
          updateExpenseCalculations();
        });

        document.getElementById('btn-unselect-all-split').addEventListener('click', () => {
          document.querySelectorAll('.split-checkbox').forEach(cb => cb.checked = false);
          updateExpenseCalculations();
        });

        // Reset Expense Form
        document.getElementById('btn-reset-expense-form').addEventListener('click', () => {
          document.getElementById('input-expense-desc').value = '';
          document.querySelectorAll('.payer-amount-input').forEach(input => input.value = '');
          document.querySelectorAll('.split-checkbox').forEach(cb => cb.checked = true);
          document.getElementById('expense-error-msg').classList.add('hidden');
          updateExpenseCalculations();
        });

        // Copy WA
        document.getElementById('btn-copy-wa').addEventListener('click', copyWhatsAppSummary);

        // Demo Data
        document.getElementById('btn-load-demo').addEventListener('click', loadDemoData);

        // Factory Reset Modal Handlers
        const modalReset = document.getElementById('modal-reset');
        document.getElementById('btn-factory-reset').addEventListener('click', () => {
          modalReset.classList.remove('hidden');
        });
        document.getElementById('btn-cancel-reset').addEventListener('click', () => {
          modalReset.classList.add('hidden');
        });
        document.getElementById('btn-confirm-reset').addEventListener('click', () => {
          modalReset.classList.add('hidden');
          factoryReset();
        });

        // Clear History Modal Handlers
        const modalClearHistory = document.getElementById('modal-clear-history');
        document.getElementById('btn-clear-history').addEventListener('click', () => {
          if (state.transactions.length === 0) {
            showToast('Riwayat transaksi sudah kosong.');
            return;
          }
          modalClearHistory.classList.remove('hidden');
        });
        document.getElementById('btn-cancel-clear-history').addEventListener('click', () => {
          modalClearHistory.classList.add('hidden');
        });
        document.getElementById('btn-confirm-clear-history').addEventListener('click', () => {
          modalClearHistory.classList.add('hidden');
          clearAllHistory();
        });

        // Dismiss modals on outside click
        modalReset.addEventListener('click', (e) => {
          if (e.target === modalReset) modalReset.classList.add('hidden');
        });
        modalClearHistory.addEventListener('click', (e) => {
          if (e.target === modalClearHistory) modalClearHistory.classList.add('hidden');
        });
      }

      // --- 9. BOOTSTRAP APPLICATION ---
      function init() {
        loadState();
        renderMemberChips();
        renderExpenseForm();
        renderAll();
        initEventListeners();
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }

    })();
