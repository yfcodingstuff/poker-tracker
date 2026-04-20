// This file mimics an asynchronous database structure (like Supabase or Firebase).
// Replacing these functions with real fetch/SDK calls is all you need to do
// to migrate to cloud hosting. Data is currently persisted locally.

const KEYS = {
  SESSIONS: 'jl_poker_sessions',
  PAYMENTS: 'jl_poker_payments',
  LOGS: 'jl_poker_logs',
  PLAYERS: 'jl_poker_players'
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const readData = (key) => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

const writeData = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const api = {
  async getPlayers() {
    await delay(100);
    return readData(KEYS.PLAYERS);
  },

  async addPlayer(playerName) {
    await delay(100);
    const players = readData(KEYS.PLAYERS);
    if (!players.includes(playerName)) {
      players.push(playerName);
      writeData(KEYS.PLAYERS, players);
      await this.addLog(`Added player ${playerName}`, 'PLAYER');
    }
    return players;
  },

  async getSessions() {
    await delay(100);
    return readData(KEYS.SESSIONS);
  },

  async addSession(session) {
    await delay(100);
    const sessions = readData(KEYS.SESSIONS);
    sessions.push(session);
    writeData(KEYS.SESSIONS, sessions);

    await this.addLog(`Added a new session for ${session.date}`, 'SESSION');
    return session;
  },

  async getPayments() {
    await delay(100);
    return readData(KEYS.PAYMENTS);
  },

  async addPayment(payment) {
    await delay(100);
    const payments = readData(KEYS.PAYMENTS);
    payments.push(payment);
    writeData(KEYS.PAYMENTS, payments);

    await this.addLog(`${payment.from} -> ${payment.to} ($${payment.amount} paid)`, 'PAYMENT');
    return payment;
  },

  async getLogs() {
    await delay(100);
    return readData(KEYS.LOGS).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addLog(action, type) {
    const logs = readData(KEYS.LOGS);
    logs.push({
      id: Math.random().toString(36).substring(2, 9),
      action,
      type,
      createdAt: new Date().toISOString()
    });
    writeData(KEYS.LOGS, logs);
  }
};
