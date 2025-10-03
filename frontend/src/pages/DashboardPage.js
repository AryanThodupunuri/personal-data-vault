import { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Music, Activity, Calendar, TrendingUp, Sparkles, BarChart3, Clock } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function DashboardPage({ onLogout }) {
  const [insights, setInsights] = useState(null);
  const [records, setRecords] = useState({ tracks: [], workouts: [], events: [] });
  const [rangeDays, setRangeDays] = useState(30);
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  useEffect(() => {
    fetchInsights();
    fetchRecords();
  }, [rangeDays, useAI]);

  const fetchInsights = async () => {
    try {
      const response = await axios.get(`${API}/insights/summary`, {
        headers: getAuthHeaders(),
        params: { range_days: rangeDays, use_ai: useAI }
      });
      setInsights(response.data);
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    }
  };

  const fetchRecords = async () => {
    try {
      const [tracksRes, workoutsRes, eventsRes] = await Promise.all([
        axios.get(`${API}/records?dataset=tracks&limit=10`, { headers: getAuthHeaders() }),
        axios.get(`${API}/records?dataset=workouts&limit=10`, { headers: getAuthHeaders() }),
        axios.get(`${API}/records?dataset=events&limit=10`, { headers: getAuthHeaders() })
      ]);

      setRecords({
        tracks: tracksRes.data.records || [],
        workouts: workoutsRes.data.records || [],
        events: eventsRes.data.records || []
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch records:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout onLogout={onLogout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-white text-xl">Loading dashboard...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onLogout={onLogout}>
      <div className="space-y-6" data-testid="dashboard-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-slate-400">Overview of your aggregated data</p>
          </div>

          {/* Range Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-lg p-1">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setRangeDays(days)}
                  className={`px-4 py-2 rounded-md font-medium transition-all ${
                    rangeDays === days
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-700/50'
                  }`}
                  data-testid={`range-${days}d-button`}
                >
                  {days}d
                </button>
              ))}
            </div>

            {/* AI Toggle */}
            <button
              onClick={() => setUseAI(!useAI)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                useAI
                  ? 'bg-slate-700 text-white border border-slate-600'
                  : 'bg-slate-800/50 text-slate-300 border border-slate-700/50 hover:bg-slate-700/50'
              }`}
              data-testid="ai-toggle-button"
            >
              <BarChart3 className="w-4 h-4" />
              Analysis
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {insights && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tracks */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all" data-testid="tracks-stat-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center">
                  <Music className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">{insights.tracks_count}</div>
                  <div className="text-sm text-slate-400">Tracks Played</div>
                </div>
              </div>
              {insights.top_artists && insights.top_artists.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-slate-700">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Top Artists</div>
                  {insights.top_artists.slice(0, 3).map((artist, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{artist.artist || 'Unknown'}</span>
                      <span className="text-xs text-slate-500">{artist.count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Workouts */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all" data-testid="workouts-stat-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center">
                  <Activity className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">{insights.workouts_count}</div>
                  <div className="text-sm text-slate-400">Workouts</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-700">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Distance</div>
                  <div className="text-lg font-semibold text-white">{insights.total_workout_distance_km} km</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Time</div>
                  <div className="text-lg font-semibold text-white">{insights.total_workout_hours} hrs</div>
                </div>
              </div>
            </div>

            {/* Events */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all" data-testid="events-stat-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">{insights.events_count}</div>
                  <div className="text-sm text-slate-400">Calendar Events</div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-700">
                <div className="text-xs text-slate-400 mb-2">Activity Level</div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-500 rounded-full" 
                    style={{ width: `${Math.min((insights.events_count / 50) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Narrative */}
        {insights?.ai_narrative && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl" data-testid="ai-narrative-card">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-slate-300" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Analysis Summary</h3>
                <p className="text-slate-300 leading-relaxed">{insights.ai_narrative}</p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Tracks */}
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl" data-testid="recent-tracks-list">
            <div className="flex items-center gap-3 mb-4">
              <Music className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-white">Recent Tracks</h3>
            </div>
            <div className="space-y-3">
              {records.tracks.slice(0, 5).map((record) => (
                <div key={record.id} className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{record.body.title}</div>
                    <div className="text-xs text-slate-400 truncate">{record.body.artist}</div>
                  </div>
                  <Clock className="w-4 h-4 text-slate-500" />
                </div>
              ))}
              {records.tracks.length === 0 && (
                <div className="text-center text-slate-400 py-6">No tracks available. Connect Spotify to sync data.</div>
              )}
            </div>
          </div>

          {/* Recent Workouts */}
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl" data-testid="recent-workouts-list">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-white">Recent Workouts</h3>
            </div>
            <div className="space-y-3">
              {records.workouts.slice(0, 5).map((record) => (
                <div key={record.id} className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{record.body.name}</div>
                    <div className="text-xs text-slate-400">{record.body.distance_km?.toFixed(2)} km</div>
                  </div>
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                </div>
              ))}
              {records.workouts.length === 0 && (
                <div className="text-center text-slate-400 py-6">No workouts available. Connect Strava to sync data.</div>
              )}
            </div>
          </div>

          {/* Recent Events */}
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl" data-testid="recent-events-list">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-white">Recent Events</h3>
            </div>
            <div className="space-y-3">
              {records.events.slice(0, 5).map((record) => (
                <div key={record.id} className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{record.body.summary || 'Untitled Event'}</div>
                    <div className="text-xs text-slate-400 truncate">{new Date(record.body.start_time).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
              {records.events.length === 0 && (
                <div className="text-center text-slate-400 py-6">No events available. Connect Google Calendar to sync data.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default DashboardPage;
