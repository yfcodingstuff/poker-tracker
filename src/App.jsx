import React, { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import { api } from './storage';
import './index.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [logs, setLogs] = useState([]);


  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Form State
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionComment, setSessionComment] = useState('');
  const [currentPlayers, setCurrentPlayers] = useState([
    { name: '', net: '' },
    { name: '', net: '' }
  ]);

  const selectStyles = {
    control: (base) => ({
      ...base,
      background: 'rgba(15, 23, 42, 0.6)',
      borderColor: 'var(--border-color)',
      color: 'var(--text-main)',
      minHeight: '46px',
      borderRadius: '0.5rem',
      boxShadow: 'none',
      '&:hover': {
        borderColor: 'var(--accent)'
      }
    }),
    singleValue: (base) => ({ ...base, color: 'var(--text-main)' }),
    input: (base) => ({ ...base, color: 'var(--text-main)' }),
    placeholder: (base) => ({ ...base, color: 'var(--text-muted)' }),
    menu: (base) => ({
      ...base,
      background: 'var(--bg-color)',
      border: '1px solid var(--border-color)',
      zIndex: 50
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
      color: 'var(--text-main)',
      cursor: 'pointer'
    })
  };

  // Modal logic mapping
  const [settlementModal, setSettlementModal] = useState({ isOpen: false, data: null });
  const [settlementAmount, setSettlementAmount] = useState('');

  // Custom Payment State
  const [customPaymentModal, setCustomPaymentModal] = useState(false);
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  const [customAmount, setCustomAmount] = useState('');

  const [players, setPlayers] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');

  const loadData = async () => {
    const [fetchedSessions, fetchedPayments, fetchedLogs, fetchedPlayers] = await Promise.all([
      api.getSessions(),
      api.getPayments(),
      api.getLogs(),
      api.getPlayers()
    ]);
    setSessions(fetchedSessions);
    setPayments(fetchedPayments);
    setLogs(fetchedLogs);
    setPlayers(fetchedPlayers);
    setLoading(false);
  };


  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    await api.addPlayer(newPlayerName.trim());
    setNewPlayerName('');
    await loadData();
  };

  useEffect(() => {
    loadData();
  }, []);

  // Derived state: Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (filterStartDate && session.date < filterStartDate) return false;
      if (filterEndDate && session.date > filterEndDate) return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sessions, filterStartDate, filterEndDate]);

  // Derived state: Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      if (filterStartDate && payment.date < filterStartDate) return false;
      if (filterEndDate && payment.date > filterEndDate) return false;
      return true;
    });
  }, [payments, filterStartDate, filterEndDate]);

  // Derived state: Leaderboard
  const leaderboardTotals = useMemo(() => {
    const PnLMap = {};

    filteredSessions.forEach(session => {
      session.players.forEach(p => {
        if (!PnLMap[p.name]) {
          PnLMap[p.name] = { net: 0, wins: 0, played: 0 };
        }
        PnLMap[p.name].net += p.net;
        PnLMap[p.name].played += 1;
        if (p.net > 0) {
          PnLMap[p.name].wins += 1;
        }
      });
    });

    const calculatedTotals = Object.entries(PnLMap).map(([name, stats]) => {
      const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
      return { 
        name, 
        net: stats.net, 
        wins: stats.wins,
        played: stats.played,
        winRate
      };
    });
    calculatedTotals.sort((a, b) => b.net - a.net);
    return calculatedTotals;
  }, [filteredSessions]);

  // Derived state: Settlements
  const settlements = useMemo(() => {
    const balanceMap = {};

    filteredSessions.forEach(session => {
      session.players.forEach(p => {
        if (!balanceMap[p.name]) balanceMap[p.name] = 0;
        balanceMap[p.name] += p.net;
      });
    });

    filteredPayments.forEach(payment => {
      if (balanceMap[payment.from] !== undefined) balanceMap[payment.from] += payment.amount;
      if (balanceMap[payment.to] !== undefined) balanceMap[payment.to] -= payment.amount;
    });

    const calculatedTotals = Object.entries(balanceMap).map(([name, net]) => ({ name, net }));

    let debtors = calculatedTotals.filter(t => t.net < -0.01).map(t => ({ ...t, remaining: Math.abs(t.net) }));
    let creditors = calculatedTotals.filter(t => t.net > 0.01).map(t => ({ ...t, remaining: t.net }));

    const calculatedSettlements = [];

    // PASS 1: Exact matches (1-to-1) to drastically reduce transaction count and spread load
    for (let i = 0; i < debtors.length; i++) {
      for (let j = 0; j < creditors.length; j++) {
        if (debtors[i].remaining > 0.001 && creditors[j].remaining > 0.001) {
          if (Math.abs(debtors[i].remaining - creditors[j].remaining) < 0.001) {
            calculatedSettlements.push({
              from: debtors[i].name,
              to: creditors[j].name,
              amount: Number(debtors[i].remaining.toFixed(2))
            });
            debtors[i].remaining = 0;
            creditors[j].remaining = 0;
          }
        }
      }
    }

    // Filter out settled
    debtors = debtors.filter(d => d.remaining > 0.001);
    creditors = creditors.filter(c => c.remaining > 0.001);

    // PASS 2: Greedy matching for the rest (Largest Debtor pays Largest Creditor)
    debtors.sort((a, b) => b.remaining - a.remaining);
    creditors.sort((a, b) => b.remaining - a.remaining);

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const amount = Math.min(debtor.remaining, creditor.remaining);

      if (amount > 0.001) {
        calculatedSettlements.push({
          from: debtor.name,
          to: creditor.name,
          amount: Number(amount.toFixed(2))
        });
      }

      debtor.remaining -= amount;
      creditor.remaining -= amount;

      if (debtor.remaining < 0.001) dIdx++;
      if (creditor.remaining < 0.001) cIdx++;
    }

    return calculatedSettlements;
  }, [filteredSessions, filteredPayments]);

  const handleAddPlayerFields = () => {
    setCurrentPlayers([...currentPlayers, { name: '', net: '' }]);
  };

  const handlePlayerChange = (index, field, value) => {
    const newPlayers = [...currentPlayers];
    newPlayers[index][field] = value;
    setCurrentPlayers(newPlayers);
  };

  const handleRemovePlayer = (index) => {
    if (currentPlayers.length <= 2) return;
    const newPlayers = currentPlayers.filter((_, i) => i !== index);
    setCurrentPlayers(newPlayers);
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();

    const validPlayers = currentPlayers
      .filter(p => p.name.trim() !== '')
      .map(p => ({ ...p, net: Number(p.net) || 0 }));
      
    if (validPlayers.length < 2) {
      alert("At least 2 players are required.");
      return;
    }

    const invalidPlayers = validPlayers.filter(p => !players.includes(p.name));
    if (invalidPlayers.length > 0) {
      alert(`The following players are not in the roster: ${invalidPlayers.map(p => p.name).join(', ')}. Please add them first.`);
      return;
    }

    const totalNet = validPlayers.reduce((sum, p) => sum + p.net, 0);
    if (Math.abs(totalNet) > 0.01) {
      alert(`The total net amount must be zero. Current total is: $${totalNet}`);
      return;
    }

    const newSession = {
      id: Math.random().toString(36).substring(2, 9),
      date: sessionDate,
      comment: sessionComment,
      players: validPlayers
    };

    await api.addSession(newSession);
    await loadData();
    setCurrentPlayers([{ name: '', net: '' }, { name: '', net: '' }]);
    setSessionComment('');
  };

  const openSettleModal = (debt) => {
    setSettlementModal({ isOpen: true, data: debt });
    setSettlementAmount(debt.amount); // Default to full amount
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    const amountNum = Number(settlementAmount);

    if (amountNum <= 0 || amountNum > settlementModal.data.amount) {
      alert("Invalid settlement amount.");
      return;
    }

    const { from, to } = settlementModal.data;

    const payment = {
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString().split('T')[0],
      from,
      to,
      amount: amountNum
    };

    await api.addPayment(payment);
    await loadData();
    setSettlementModal({ isOpen: false, data: null });
  };

  const handleCustomSettleSubmit = async (e) => {
    e.preventDefault();
    const amountNum = Number(customAmount);

    if (amountNum <= 0 || !customFrom || !customTo || customFrom.value === customTo.value) {
      alert("Invalid custom payment details.");
      return;
    }

    const payment = {
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString().split('T')[0],
      from: customFrom.value,
      to: customTo.value,
      amount: amountNum
    };

    await api.addPayment(payment);
    await loadData();
    setCustomPaymentModal(false);
    setCustomFrom(null);
    setCustomTo(null);
    setCustomAmount('');
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  if (loading) return <div className="container"><p>Loading data...</p></div>;

  return (
    <div className="container">
      <h1>Poker Tracker</h1>


      {/* MANAGE ROSTER SECTION */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
        <h2>Player Roster</h2>
        <form onSubmit={handleAddPlayer} className="flex gap-4 mt-2">
          <input
            type="text"
            placeholder="New Player Name"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary">Add Player</button>
        </form>
        {players.length > 0 && (
          <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: '1rem' }}>
            {players.map(p => (
              <span key={p} className="badge">{p}</span>
            ))}
          </div>
        )}
      </div>

      {/* ADD NEW SESSION FIRST */}
      <div className="glass-panel">
        <h2>Add New Session</h2>
        <form onSubmit={handleSaveSession} className="mt-4">
          <div className="form-group grid grid-cols-2">
            <div>
              <label>Session Date</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Optional Comment</label>
              <input
                type="text"
                placeholder="e.g. Vegas Trip"
                value={sessionComment}
                onChange={(e) => setSessionComment(e.target.value)}
              />
            </div>
          </div>

          <label>Players & Results (Total must be 0)</label>
          {currentPlayers.map((player, index) => (
            <div key={index} className="player-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Select
                  options={players.map(p => ({ value: p, label: p }))}
                  value={player.name ? { value: player.name, label: player.name } : null}
                  onChange={(selectedOption) => handlePlayerChange(index, 'name', selectedOption ? selectedOption.value : '')}
                  placeholder="Player Name"
                  styles={selectStyles}
                  isClearable
                  required
                />
              </div>
              <input
                type="number"
                step="any"
                placeholder="Win/Loss Amount"
                value={player.net}
                onChange={(e) => handlePlayerChange(index, 'net', e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleRemovePlayer(index)}
                disabled={currentPlayers.length <= 2}
              >
                X
              </button>
            </div>
          ))}

          <div className="flex gap-4 mt-4">
            <button type="button" className="btn btn-outline" onClick={handleAddPlayerFields}>
              Add Player
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Save Session
            </button>
          </div>
        </form>
      </div>

      {/* FILTERS */}
      <div className="filters">
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>Start Date</label>
          <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>End Date</label>
          <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
        </div>
        <button className="btn btn-outline" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}>
          Clear Filters
        </button>
      </div>

      <div className="grid grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="glass-panel" style={{ flex: 1 }}>
            <h2>Leaderboard (P&L)</h2>
            {leaderboardTotals.length === 0 ? (
              <p className="text-muted mt-4">No data available.</p>
            ) : (
              <div className="table-container mt-4">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Net Balance</th>
                      <th style={{ textAlign: 'right' }}>Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardTotals.map(t => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td className={t.net > 0 ? "text-success" : t.net < 0 ? "text-danger" : "text-muted"} style={{ fontWeight: '500' }}>
                          {t.net > 0 ? "+" : ""}{formatCurrency(t.net)}
                        </td>
                        <td className="text-muted" style={{ textAlign: 'right', fontSize: '0.875rem' }}>
                          {t.winRate}% ({t.wins}/{t.played})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="glass-panel" style={{ flex: 1 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              <h2 style={{ marginBottom: 0 }}>Pending Settlements</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setCustomPaymentModal(true)}>
                + Custom Payment
              </button>
            </div>
            <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>Settle entirely or partially based on what is owed.</p>

            {settlements.length === 0 ? (
              <p className="text-muted">All debts are settled!</p>
            ) : (
              <div className="flex flex-col gap-2">
                {settlements.map((s, idx) => (
                  <div key={idx} className="settlement-card">
                    <div className="settlement-info flex-1">
                      <div>
                        <span style={{ fontWeight: '500' }}>{s.from}</span>
                        <span className="text-muted" style={{ margin: '0 0.5rem' }}>owes</span>
                        <span style={{ fontWeight: '500' }}>{s.to}</span>
                      </div>
                      <span className="badge">{formatCurrency(s.amount)}</span>
                    </div>
                    <button className="btn btn-success btn-sm" onClick={() => openSettleModal(s)}>
                      Settle
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 mt-4">
        {/* Session history */}
        <div className="glass-panel">
          <h2>Session History</h2>
          {filteredSessions.length === 0 ? (
            <p className="text-muted mt-4">No sessions found.</p>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              {filteredSessions.map(session => (
                <div key={session.id} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {new Date(session.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    {session.comment && ` - ${session.comment}`}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {session.players.map(p => (
                      <div key={p.name} className="flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                        <span>{p.name}</span>
                        <span className={p.net > 0 ? "text-success" : p.net < 0 ? "text-danger" : "text-muted"}>
                          {p.net > 0 ? "+" : ""}{formatCurrency(p.net)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Logs */}
        <div className="glass-panel">
          <h2>Audit & Change Logs</h2>
          <p className="text-muted text-sm mt-2" style={{ marginBottom: '1rem' }}>Chronological history of all inputs.</p>
          {logs.length === 0 ? (
            <p className="text-muted">No logs recorded yet.</p>
          ) : (
            <div className="flex flex-col">
              {logs.slice(0, 50).map(log => (
                <div key={log.id} className="log-entry flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span style={{ fontWeight: '500' }}>{log.action}</span>
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Settle Modal */}
      {settlementModal.isOpen && (
        <div className="modal-overlay" onClick={() => setSettlementModal({ isOpen: false, data: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Record Payment</h3>
            <p style={{ marginBottom: '1rem' }}>
              <strong>{settlementModal.data.from}</strong> paying <strong>{settlementModal.data.to}</strong>.
              <br />Max required: {formatCurrency(settlementModal.data.amount)}
            </p>

            <form onSubmit={handleSettleSubmit}>
              <div className="form-group">
                <label>Amount to Settle</label>
                <input
                  type="number"
                  step="any"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  max={settlementModal.data.amount}
                  required
                />
              </div>
              <div className="flex gap-4 mt-4">
                <button type="button" className="btn btn-outline" onClick={() => setSettlementModal({ isOpen: false, data: null })}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success" style={{ flex: 1 }}>
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom Payment Modal */}
      {customPaymentModal && (
        <div className="modal-overlay" onClick={() => setCustomPaymentModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Log Custom Payment</h3>
            <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
              Manually log a payment if you already transferred money outside the suggested routes.
            </p>
            <form onSubmit={handleCustomSettleSubmit}>
              <div className="form-group">
                <label>Payer (From)</label>
                <div style={{ minWidth: '100%' }}>
                  <Select
                    options={players.map(p => ({ value: p, label: p }))}
                    value={customFrom}
                    onChange={setCustomFrom}
                    styles={selectStyles}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Payee (To)</label>
                <div style={{ minWidth: '100%' }}>
                  <Select
                    options={players.map(p => ({ value: p, label: p }))}
                    value={customTo}
                    onChange={setCustomTo}
                    styles={selectStyles}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Amount to Settle</label>
                <input
                  type="number"
                  step="any"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" className="btn btn-outline" onClick={() => setCustomPaymentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Log Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
