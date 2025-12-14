import React, { useState, useEffect } from 'react';
import { X, Key, LogIn, CheckCircle, AlertCircle, Sliders, Database } from 'lucide-react';
import { initiateLogin } from '../utils/auth';

const SettingsModal = ({
    isOpen,
    onClose,
    onSaveKey,
    currentKey,
    keyType,
    contextSettings,
    onUpdateContextSettings,
    models = []
}) => {
    const [manualKey, setManualKey] = useState('');
    const [activeTab, setActiveTab] = useState('api');

    // Local state for context settings
    const [localSettings, setLocalSettings] = useState({});

    useEffect(() => {
        // Pre-fill manual key if it's the current one and not OAuth
        if (keyType === 'manual' && currentKey) {
            setManualKey(currentKey);
        }
    }, [currentKey, keyType, isOpen]);

    useEffect(() => {
        if (contextSettings) {
            setLocalSettings(contextSettings);
        }
    }, [contextSettings, isOpen]);

    if (!isOpen) return null;

    const handleManualSave = () => {
        if (manualKey.trim().startsWith('sk-or-')) {
            onSaveKey(manualKey.trim(), 'manual');
        } else {
            alert("Invalid Key format. Should start with 'sk-or-'");
        }
    };

    const handleClearKey = () => {
        onSaveKey(null, null);
        setManualKey('');
    };

    const handleContextSettingChange = (key, value) => {
        const updated = { ...localSettings, [key]: value };
        setLocalSettings(updated);
        if (onUpdateContextSettings) {
            onUpdateContextSettings(updated);
        }
    };

    return (
        <div className="settings-modal-overlay">
            <div className="settings-modal">
                {/* Header */}
                <div className="settings-header">
                    <h2 className="flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-purple-400" />
                        Settings
                    </h2>
                    <button onClick={onClose} className="close-btn">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="settings-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'api' ? 'active' : ''}`}
                        onClick={() => setActiveTab('api')}
                    >
                        <Key size={14} /> API
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'context' ? 'active' : ''}`}
                        onClick={() => setActiveTab('context')}
                    >
                        <Database size={14} /> Memory
                    </button>
                </div>

                {/* Content */}
                <div className="settings-content">
                    {activeTab === 'api' && (
                        <>
                            {/* Status Banner */}
                            <div className={`status-banner ${currentKey ? 'connected' : 'warning'}`}>
                                <div className="flex items-start gap-3">
                                    {currentKey ? <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />}
                                    <div>
                                        <h3 className={currentKey ? 'text-green-400' : 'text-yellow-400'}>
                                            {currentKey ? 'API Connected' : 'Using Free Tier (Rate Limited)'}
                                        </h3>
                                        <p className="status-desc">
                                            {currentKey
                                                ? `Using ${keyType === 'oauth' ? 'OpenRouter Account' : 'Manual API Key'}`
                                                : 'Connect your own key to bypass rate limits.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* OAuth Section */}
                            <div className="form-group">
                                <label>Option 1: Connect Account (Recommended)</label>
                                <button
                                    onClick={initiateLogin}
                                    className="oauth-btn"
                                >
                                    <LogIn className="w-4 h-4" />
                                    Connect OpenRouter
                                </button>
                                <p className="helper-text">
                                    Securely login via OAuth. We never see your password.
                                </p>
                            </div>

                            <div className="divider">
                                <span>Or manually enter key</span>
                            </div>

                            {/* Manual Key Section */}
                            <div className="form-group">
                                <label>Option 2: Paste API Key</label>
                                <div className="input-group">
                                    <input
                                        type="password"
                                        value={manualKey}
                                        onChange={(e) => setManualKey(e.target.value)}
                                        placeholder="sk-or-..."
                                        className="key-input"
                                    />
                                    <button
                                        onClick={handleManualSave}
                                        disabled={!manualKey}
                                        className="save-btn"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>

                            {/* Clear Key */}
                            {currentKey && (
                                <div className="footer-actions">
                                    <button
                                        onClick={handleClearKey}
                                        className="disconnect-btn"
                                    >
                                        Disconnect / Clear Key
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'context' && (
                        <>
                            <div className="settings-section">
                                <h3>Conversation Memory</h3>

                                <div className="form-group">
                                    <label>Tier 1: Full Text Turns</label>
                                    <div className="slider-group">
                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={localSettings.tier1_full_text_turns || 3}
                                            onChange={(e) => handleContextSettingChange('tier1_full_text_turns', parseInt(e.target.value))}
                                        />
                                        <span className="slider-value">{localSettings.tier1_full_text_turns || 3}</span>
                                    </div>
                                    <p className="helper-text">Recent turns kept as full text</p>
                                </div>

                                <div className="form-group">
                                    <label>Tier 2: Summary Turns</label>
                                    <div className="slider-group">
                                        <input
                                            type="range"
                                            min="0"
                                            max="30"
                                            value={localSettings.tier2_summary_turns || 12}
                                            onChange={(e) => handleContextSettingChange('tier2_summary_turns', parseInt(e.target.value))}
                                        />
                                        <span className="slider-value">{localSettings.tier2_summary_turns || 12}</span>
                                    </div>
                                    <p className="helper-text">Older turns kept as summaries</p>
                                </div>
                            </div>

                            <div className="settings-section">
                                <h3>Token Budget</h3>

                                <div className="form-group">
                                    <label>Context Budget (%)</label>
                                    <div className="slider-group">
                                        <input
                                            type="range"
                                            min="10"
                                            max="80"
                                            value={localSettings.context_budget_percent || 50}
                                            onChange={(e) => handleContextSettingChange('context_budget_percent', parseInt(e.target.value))}
                                        />
                                        <span className="slider-value">{localSettings.context_budget_percent || 50}%</span>
                                    </div>
                                    <p className="helper-text">% of model context for history</p>
                                </div>

                                <div className="form-group">
                                    <label>Max Tokens</label>
                                    <div className="slider-group">
                                        <input
                                            type="range"
                                            min="10000"
                                            max="200000"
                                            step="10000"
                                            value={localSettings.context_budget_max_tokens || 100000}
                                            onChange={(e) => handleContextSettingChange('context_budget_max_tokens', parseInt(e.target.value))}
                                        />
                                        <span className="slider-value">{((localSettings.context_budget_max_tokens || 100000) / 1000).toFixed(0)}k</span>
                                    </div>
                                </div>
                            </div>

                            <div className="settings-section">
                                <h3>Compression</h3>

                                <div className="form-group">
                                    <label>Compression Model</label>
                                    <select
                                        value={localSettings.compression_model || ''}
                                        onChange={(e) => handleContextSettingChange('compression_model', e.target.value || null)}
                                        className="model-select"
                                    >
                                        <option value="">Use Selected Model</option>
                                        {models.slice(0, 50).map(m => (
                                            <option key={m.id} value={m.id}>{m.name || m.id}</option>
                                        ))}
                                    </select>
                                    <p className="helper-text">Model for context compression</p>
                                </div>

                                <div className="form-group toggle-group">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={localSettings.auto_summarize !== false}
                                            onChange={(e) => handleContextSettingChange('auto_summarize', e.target.checked)}
                                        />
                                        Auto-summarize old turns
                                    </label>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
