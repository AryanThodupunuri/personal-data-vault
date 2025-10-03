import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Layout from '../components/Layout';
import { Link2, Music, Activity, Calendar, RefreshCw, Trash2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PROVIDERS = [
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Recently played tracks and listening history',
    icon: Music,
    color: 'from-green-500 to-emerald-500',
    dataset: 'tracks'
  },
  {
    id: 'strava',
    name: 'Strava',
    description: 'Workouts, activities, and fitness data',
    icon: Activity,
    color: 'from-orange-500 to-red-500',
    dataset: 'workouts'
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Calendar events and schedules',
    icon: Calendar,
    color: 'from-blue-500 to-cyan-500',
    dataset: 'events'
  }
];

function ConnectionsPage({ onLogout }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [searchParams] = useSearchParams();

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  useEffect(() => {
    fetchConnections();
    
    // Show success message if redirected from OAuth
    if (searchParams.get('success') === 'true') {
      setTimeout(() => {
        window.history.replaceState({}, '', '/connections');
      }, 2000);
    }
  }, [searchParams]);

  const fetchConnections = async () => {
    try {
      const response = await axios.get(`${API}/connections`, {
        headers: getAuthHeaders()
      });
      setConnections(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch connections:', error);
      setLoading(false);
    }
  };

  const handleConnect = async (providerId) => {
    try {
      const response = await axios.get(`${API}/oauth/${providerId}/authorize`, {
        headers: getAuthHeaders()
      });
      
      if (response.data.auth_url) {
        window.location.href = response.data.auth_url;
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to initiate connection';
      alert(errorMsg);
      console.error('Connection error:', error);
    }
  };

  const handleSync = async (providerId) => {
    setSyncing({ ...syncing, [providerId]: true });
    
    try {
      await axios.post(`${API}/sync/${providerId}`, {}, {
        headers: getAuthHeaders()
      });
      
      // Refresh connections after a short delay
      setTimeout(() => {
        fetchConnections();
        setSyncing({ ...syncing, [providerId]: false });
      }, 2000);
    } catch (error) {
      console.error('Sync error:', error);
      setSyncing({ ...syncing, [providerId]: false });
      alert('Failed to sync data. Please try again.');
    }
  };

  const handleDisconnect = async (providerId) => {
    if (!window.confirm(`Are you sure you want to disconnect ${providerId}? This will delete all synced data from this provider.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/providers/${providerId}`, {
        headers: getAuthHeaders()
      });
      fetchConnections();
    } catch (error) {
      console.error('Disconnect error:', error);
      alert('Failed to disconnect provider');
    }
  };

  const getConnection = (providerId) => {
    return connections.find(c => c.provider === providerId && c.is_active);
  };

  const formatLastSync = (lastSyncAt) => {
    if (!lastSyncAt) return 'Never';
    
    const date = new Date(lastSyncAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getSyncStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-md">
            <CheckCircle className="w-3 h-3" />
            Synced
          </span>
        );
      case 'syncing':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-md">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Syncing
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-md">
            <XCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-slate-500/20 text-slate-400 text-xs font-medium rounded-md">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  if (loading) {
    return (
      <Layout onLogout={onLogout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-white text-xl">Loading connections...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onLogout={onLogout}>
      <div className="space-y-6" data-testid="connections-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Connections</h1>
            <p className="text-slate-400">Connect your accounts to aggregate data</p>
          </div>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-lg">
            <Link2 className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold">{connections.filter(c => c.is_active).length}</span>
            <span className="text-slate-400 text-sm">Active</span>
          </div>
        </div>

        {/* Success Message */}
        {searchParams.get('success') === 'true' && (
          <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-xl p-4 flex items-center gap-3" data-testid="success-message">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <p className="text-emerald-400 font-medium">Connection successful! You can now sync your data.</p>
          </div>
        )}

        {/* Provider Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PROVIDERS.map((provider) => {
            const Icon = provider.icon;
            const connection = getConnection(provider.id);
            const isConnected = !!connection;
            const isSyncing = syncing[provider.id] || connection?.sync_status === 'syncing';

            return (
              <div
                key={provider.id}
                className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all"
                data-testid={`provider-card-${provider.id}`}
              >
                {/* Provider Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-slate-700 rounded-xl flex items-center justify-center">
                    <Icon className="w-7 h-7 text-slate-300" />
                  </div>
                  {isConnected && getSyncStatusBadge(connection.sync_status)}
                </div>

                {/* Provider Info */}
                <h3 className="text-xl font-bold text-white mb-2">{provider.name}</h3>
                <p className="text-sm text-slate-400 mb-4">{provider.description}</p>

                {/* Connection Details */}
                {isConnected && (
                  <div className="space-y-2 mb-4 p-3 bg-slate-700/30 rounded-lg border border-slate-600/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Last Sync</span>
                      <span className="text-slate-300 font-medium">{formatLastSync(connection.last_sync_at)}</span>
                    </div>
                    {connection.sync_error && (
                      <div className="flex items-start gap-2 text-xs">
                        <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                        <span className="text-red-400">{connection.sync_error}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {!isConnected ? (
                    <button
                      onClick={() => handleConnect(provider.id)}
                      className="flex-1 py-2.5 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-all"
                      data-testid={`connect-${provider.id}-button`}
                    >
                      Connect
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSync(provider.id)}
                        disabled={isSyncing}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        data-testid={`sync-${provider.id}-button`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync'}
                      </button>
                      <button
                        onClick={() => handleDisconnect(provider.id)}
                        className="p-2.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg transition-all"
                        title="Disconnect"
                        data-testid={`disconnect-${provider.id}-button`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Setup Instructions */}
        {connections.length === 0 && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6 mt-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Getting Started</h3>
                <p className="text-slate-300 mb-4">
                  Before connecting providers, you need to configure OAuth credentials in your <code className="px-2 py-1 bg-slate-700 rounded text-emerald-400">.env</code> file:
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li>• <strong className="text-slate-300">Spotify:</strong> Get credentials from <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Spotify Developer Dashboard</a></li>
                  <li>• <strong className="text-slate-300">Strava:</strong> Get credentials from <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Strava API Settings</a></li>
                  <li>• <strong className="text-slate-300">Google Calendar:</strong> Get credentials from <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google Cloud Console</a></li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default ConnectionsPage;
