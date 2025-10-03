import { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { User, Mail, Calendar, Trash2, AlertTriangle, Shield, Activity, FileText } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AccountPage({ onLogout }) {
  const [user, setUser] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  useEffect(() => {
    fetchUserData();
    fetchAuditLogs();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: getAuthHeaders()
      });
      setUser(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await axios.get(`${API}/audit-logs`, {
        headers: getAuthHeaders(),
        params: { limit: 20 }
      });
      setAuditLogs(response.data);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm');
      return;
    }

    try {
      await axios.delete(`${API}/account`, {
        headers: getAuthHeaders()
      });
      alert('Account deleted successfully');
      onLogout();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account. Please try again.');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'connect':
      case 'disconnect':
        return <Shield className="w-4 h-4" />;
      case 'sync':
        return <Activity className="w-4 h-4" />;
      case 'export':
        return <FileText className="w-4 h-4" />;
      case 'delete_account':
        return <Trash2 className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'connect':
        return 'text-emerald-400';
      case 'disconnect':
      case 'delete_account':
        return 'text-red-400';
      case 'sync':
        return 'text-blue-400';
      case 'export':
        return 'text-purple-400';
      default:
        return 'text-slate-400';
    }
  };

  if (loading) {
    return (
      <Layout onLogout={onLogout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-white text-xl">Loading account...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onLogout={onLogout}>
      <div className="space-y-6" data-testid="account-page">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Account Settings</h1>
          <p className="text-slate-400">Manage your account and view activity</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Info */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl" data-testid="user-info-card">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-10 h-10 text-slate-300" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">{user?.name}</h2>
                <p className="text-slate-400 text-sm">{user?.email}</p>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </span>
                  <span className="text-sm text-white font-medium">{user?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Joined
                  </span>
                  <span className="text-sm text-white font-medium">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 shadow-xl mt-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h3 className="text-lg font-semibold text-white">Danger Zone</h3>
              </div>
              <p className="text-sm text-slate-300 mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-all"
                data-testid="delete-account-button"
              >
                Delete Account
              </button>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Activity Log
              </h3>
              
              <div className="space-y-3 max-h-[600px] overflow-y-auto" data-testid="audit-logs-list">
                {auditLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">No activity yet</p>
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-all"
                      data-testid="audit-log-item"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getActionColor(log.action).replace('text-', 'bg-')}/20`}>
                        <span className={getActionColor(log.action)}>
                          {getActionIcon(log.action)}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-white font-medium capitalize">
                              {log.action.replace('_', ' ')}
                              {log.provider && (
                                <span className="text-emerald-400 ml-2">{log.provider}</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              {formatDate(log.timestamp)}
                            </div>
                          </div>
                        </div>
                        
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-2 text-xs text-slate-400">
                            {JSON.stringify(log.details, null, 2).length < 100 ? (
                              <code className="px-2 py-1 bg-slate-800 rounded">
                                {JSON.stringify(log.details)}
                              </code>
                            ) : (
                              <span>Details available</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="delete-confirm-modal">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Delete Account?</h3>
              <p className="text-slate-400">
                This will permanently delete your account and all data including:
              </p>
              <ul className="mt-3 text-sm text-slate-400 space-y-1">
                <li>• All connected providers</li>
                <li>• Synced data (tracks, workouts, events)</li>
                <li>• Export history</li>
                <li>• Audit logs</li>
              </ul>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Type <span className="text-red-400 font-bold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                  placeholder="DELETE"
                  data-testid="delete-confirm-input"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-all"
                  data-testid="cancel-delete-button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE'}
                  className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  data-testid="confirm-delete-button"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default AccountPage;
