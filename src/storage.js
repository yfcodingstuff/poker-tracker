import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables! Check your .env file or Vercel settings.");
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

export const api = {
  async getPlayers() {
    const { data, error } = await supabase.from('players').select('name');
    if (error) console.error("Error fetching players:", error);
    return data ? data.map(d => d.name) : [];
  },

  async addPlayer(playerName) {
    const { error } = await supabase.from('players').insert([{ name: playerName }]);
    if (error) {
      console.error("Error adding player:", error);
      alert("Failed to save to database. Check if you enabled RLS correctly.");
      return this.getPlayers();
    }
    await this.addLog(`Added player ${playerName}`, 'PLAYER');
    return this.getPlayers();
  },

  async getSessions() {
    const { data, error } = await supabase.from('sessions').select('*').order('date', { ascending: false });
    if (error) console.error("Error fetching sessions:", error);
    return data || [];
  },

  async addSession(session) {
    const { data, error } = await supabase.from('sessions').insert([{
      date: session.date,
      players: session.players,
      comment: session.comment || null
    }]).select();
    
    if (error) {
      console.error("Error adding session:", error);
      alert("Failed to save to database.");
      return session; // return mock so UI doesn't crash
    }

    const logMessage = session.comment 
      ? `Added a new session for ${session.date} ("${session.comment}")` 
      : `Added a new session for ${session.date}`;

    await this.addLog(logMessage, 'SESSION');
    return data && data.length > 0 ? data[0] : session;
  },

  async getPayments() {
    const { data, error } = await supabase.from('payments').select('*');
    if (error) console.error("Error fetching payments:", error);
    return data || [];
  },

  async addPayment(payment) {
    const { data, error } = await supabase.from('payments').insert([{
      date: payment.date,
      from: payment.from,
      to: payment.to,
      amount: payment.amount
    }]).select();

    if (error) {
      console.error("Error adding payment:", error);
      alert("Failed to save to database.");
      return payment;
    }

    await this.addLog(`${payment.from} -> ${payment.to} ($${payment.amount} paid)`, 'PAYMENT');
    return data && data.length > 0 ? data[0] : payment;
  },

  async getLogs() {
    const { data, error } = await supabase.from('logs').select('*').order('created_at', { ascending: false });
    if (error) console.error("Error fetching logs:", error);
    return data || [];
  },

  async addLog(action, type) {
    const { error } = await supabase.from('logs').insert([{ action, type }]);
    if (error) console.error("Error adding log:", error);
  }
};
