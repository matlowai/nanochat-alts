import React from 'react';
import VIZ_REGISTRY from '../viz/registry';

const VizContainer = ({ vizId }) => {
    const VizComponent = VIZ_REGISTRY[vizId];

    if (!VizComponent) {
        return (
            <div className="viz-container error">
                <p>Visualization <code>{vizId}</code> not found in registry.</p>
            </div>
        );
    }

    return (
        <div className="viz-container">
            <div className="viz-header">
                <h4>Interactive Visualization</h4>
            </div>
            <div className="viz-content">
                <VizComponent />
            </div>
        </div>
    );
};

export default VizContainer;
