import React, { useState, useEffect } from 'react';
import { X, Key, LogIn, CheckCircle, AlertCircle } from 'lucide-react';
import { initiateLogin } from '../utils/auth';

const SettingsModal = ({ isOpen, onClose, onSaveKey, currentKey, keyType }) => {
    const [manualKey, setManualKey] = useState('');
    const [activeTab, setActiveTab] = useState('api');

    useEffect(() => {
        // Pre-fill manual key if it's the current one and not OAuth
        if (keyType === 'manual' && currentKey) {
            setManualKey(currentKey);
        }
    }, [currentKey, keyType, isOpen]);

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

    return (
        <div className="settings-modal-overlay">
            <div className="settings-modal">
                {/* Header */}
                <div className="settings-header">
                    <h2 className="flex items-center gap-2">
                        <Key className="w-5 h-5 text-purple-400" />
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
                        API Configuration
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
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
