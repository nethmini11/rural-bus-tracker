import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Bus, CheckCircle2, RefreshCw, XCircle, Clock } from 'lucide-react';

export default function App() {
  const [urlParams] = useState(new URLSearchParams(window.location.search));
  const conductorToken = urlParams.get('token');

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 max-w-md mx-auto">
      {conductorToken ? (
        <ConductorPanel token={conductorToken} />
      ) : (
        <PassengerDashboard />
      )}
    </main>
  );
}

// ----------------------------------------
// 1. CONDUCTOR VIEW (QR Code Token Landing)
// ----------------------------------------
function ConductorPanel({ token }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastAction, setLastAction] = useState('');

  useEffect(() => {
    async function loadSchedule() {
      const { data } = await supabase
        .from('schedules')
        .select('id, departure_time, routes (route_number, origin, destination)')
        .eq('conductor_token', token)
        .single();

      if (data) setSchedule(data);
      setLoading(false);
    }
    loadSchedule();
  }, [token]);

  const updateStatus = async (status, note = '') => {
    if (!schedule) return;
    setSubmitting(true);
    const { error } = await supabase.from('status_logs').insert([
      {
        schedule_id: schedule.id,
        status: status,
        notes: note,
      },
    ]);

    setSubmitting(false);
    if (!error) {
      setLastAction(`Updated: ${status.replace('_', ' ').toUpperCase()}`);
    } else {
      alert('Failed to update. Please check network.');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Verifying Bus Token...</div>;
  if (!schedule) return <div className="p-8 text-center text-rose-600 font-medium">Invalid QR Token.</div>;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <header className="bg-blue-600 text-white p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 text-blue-200 text-xs font-bold uppercase tracking-wider">
          <Bus size={16} /> Conductor Portal
        </div>
        <h1 className="text-2xl font-bold mt-1">Route {schedule.routes?.route_number}</h1>
        <p className="text-sm text-blue-100 mt-1">
          {schedule.routes?.origin} → {schedule.routes?.destination}
        </p>
        <div className="mt-3 inline-block bg-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
          Slot: {schedule.departure_time}
        </div>
      </header>

      {lastAction && (
        <div className="bg-emerald-100 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-center text-sm font-semibold">
          ✓ {lastAction}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <button
          disabled={submitting}
          onClick={() => updateStatus('en_route')}
          className="h-20 bg-emerald-600 active:bg-emerald-700 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-sm hover:brightness-105 transition active:scale-98 disabled:opacity-50"
        >
          <CheckCircle2 size={24} />
          START ROUTE (ON TIME)
        </button>

        <button
          disabled={submitting}
          onClick={() => updateStatus('replaced', 'Backup Bus Assigned')}
          className="h-20 bg-amber-500 active:bg-amber-600 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-sm hover:brightness-105 transition active:scale-98 disabled:opacity-50"
        >
          <RefreshCw size={24} />
          BUS REPLACED
        </button>

        <button
          disabled={submitting}
          onClick={() => updateStatus('cancelled', 'No Bus Today')}
          className="h-20 bg-rose-600 active:bg-rose-700 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-sm hover:brightness-105 transition active:scale-98 disabled:opacity-50"
        >
          <XCircle size={24} />
          NO BUS TODAY
        </button>
      </section>
    </div>
  );
}

// ----------------------------------------
// 2. PASSENGER VIEW (Real-Time Auto Updating)
// ----------------------------------------
function PassengerDashboard() {
  const [routesData, setRoutesData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLiveStatus = async () => {
    const { data, error } = await supabase
      .from('schedules')
      .select(`
        id,
        departure_time,
        routes (route_number, origin, destination),
        status_logs (status, notes, created_at)
      `)
      .order('departure_time', { ascending: true });

    if (error) {
      console.error('Error fetching schedules:', error);
      return;
    }

    if (data) {
      // Sort status_logs locally so the newest status is always first
      const formatted = data.map((schedule) => ({
        ...schedule,
        status_logs: (schedule.status_logs || []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        ),
      }));
      setRoutesData(formatted);
    }
    setLoading(false);
  };
  useEffect(() => {
    fetchLiveStatus();

    // Listen for live database updates from Supabase
    const channel = supabase
      .channel('realtime-status-logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'status_logs' },
        () => {
          fetchLiveStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (logs) => {
    const latest = logs && logs[0];
    if (!latest) {
      return (
        <span className="bg-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-full font-semibold">
          Scheduled
        </span>
      );
    }
    switch (latest.status) {
      case 'en_route':
        return (
          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-semibold">
            🟢 En Route
          </span>
        );
      case 'replaced':
        return (
          <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full font-semibold">
            🔀 Bus Replaced
          </span>
        );
      case 'cancelled':
        return (
          <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-1 rounded-full font-semibold">
            🔴 Cancelled Today
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5 pt-2">
      <header className="flex justify-between items-center pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Rural Transit Live</h1>
          <p className="text-xs text-slate-500">Live community bus status updates</p>
        </div>
        <button
          onClick={fetchLiveStatus}
          className="p-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition"
          title="Refresh Data"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <section className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Fetching latest bus schedules...</p>
        ) : routesData.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No bus routes scheduled.</p>
        ) : (
          routesData.map((item) => {
            const latestLog = item.status_logs && item.status_logs[0];
            return (
              <article
                key={item.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold text-blue-600 tracking-wide uppercase">
                      Route {item.routes?.route_number}
                    </span>
                    <h2 className="text-base font-bold text-slate-800 mt-0.5">
                      {item.routes?.origin} → {item.routes?.destination}
                    </h2>
                  </div>
                  {getStatusBadge(item.status_logs)}
                </div>

                <footer className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> Scheduled: {item.departure_time}
                  </span>
                  {latestLog && (
                    <span>
                      {latestLog.notes ? `${latestLog.notes} • ` : ''}
                      {new Date(latestLog.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </footer>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}