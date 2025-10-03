import { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Download, FileArchive, Clock, Calendar, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ExportsPage({ onLogout }) {
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  useEffect(() => {
    fetchExports();
  }, []);

  const fetchExports = async () => {
    try {
      const response = await axios.get(`${API}/exports`, {
        headers: getAuthHeaders()
      });
      setExports(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch exports:', error);
      setLoading(false);
    }
  };

  const handleGenerateExport = async () => {
    setGenerating(true);
    
    try {
      const response = await axios.post(`${API}/export`, {}, {
        headers: getAuthHeaders()
      });
      
      alert('Export created successfully!');
      fetchExports();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to generate export';
      alert(errorMsg);
      console.error('Export error:', error);
    } finally {
      setGenerating(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const isExpired = (expiresAt) => {
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <Layout onLogout={onLogout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-white text-xl">Loading exports...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onLogout={onLogout}>
      <div className="space-y-6" data-testid="exports-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Data Exports</h1>
            <p className="text-slate-400">Download your data in JSON and CSV formats</p>
          </div>

          <button
            onClick={handleGenerateExport}
            disabled={generating}
            className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            data-testid="generate-export-button"
          >
            <FileArchive className={`w-5 h-5 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Generating...' : 'Generate Export'}
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-300">
            <strong className="text-white">Privacy First:</strong> Your exports include all your data in JSON and CSV formats, zipped for convenience. Download links expire after 24 hours for security.
          </div>
        </div>

        {/* Exports List */}
        {exports.length === 0 ? (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-12 text-center">
            <FileArchive className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Exports Yet</h3>
            <p className="text-slate-400 mb-6">Generate your first export to download your data</p>
            <button
              onClick={handleGenerateExport}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-all"
            >
              <FileArchive className="w-5 h-5" />
              {generating ? 'Generating...' : 'Generate Export'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {exports.map((exportItem) => {
              const expired = isExpired(exportItem.expires_at);
              
              return (
                <div
                  key={exportItem.id}
                  className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 shadow-xl hover:shadow-2xl transition-all"
                  data-testid="export-item"
                >
                  <div className="flex items-start justify-between">
                    {/* Export Info */}
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                        <FileArchive className="w-6 h-6 text-white" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white mb-1 truncate">
                          {exportItem.file_name}
                        </h3>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                          <div className="flex items-center gap-1">
                            <Download className="w-4 h-4" />
                            {formatFileSize(exportItem.file_size)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(exportItem.created_at)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {expired ? (
                              <span className="text-red-400 font-medium">Expired</span>
                            ) : (
                              <span className="text-emerald-400 font-medium">Valid for {Math.ceil((new Date(exportItem.expires_at) - new Date()) / (1000 * 60 * 60))}h</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Download Button */}
                    {!expired ? (
                      <a
                        href={`${API}/export/download/${exportItem.download_token}`}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-all shrink-0"
                        data-testid="download-export-button"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </a>
                    ) : (
                      <div className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-medium shrink-0">
                        Expired
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Export Format Info */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Export Format</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-700/30 rounded-lg">
              <div className="text-emerald-400 font-semibold mb-2">JSON Files</div>
              <p className="text-sm text-slate-400">Structured data for each dataset (tracks, workouts, events)</p>
            </div>
            <div className="p-4 bg-slate-700/30 rounded-lg">
              <div className="text-emerald-400 font-semibold mb-2">CSV Files</div>
              <p className="text-sm text-slate-400">Spreadsheet-friendly format for data analysis</p>
            </div>
            <div className="p-4 bg-slate-700/30 rounded-lg">
              <div className="text-emerald-400 font-semibold mb-2">Schema Info</div>
              <p className="text-sm text-slate-400">Metadata about your export and dataset structure</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default ExportsPage;
