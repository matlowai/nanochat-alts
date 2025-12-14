import React from 'react';
import MatrixMultViz from './MatrixMultViz';
import SoftmaxViz from './SoftmaxViz';

// Registry mapping concept IDs (or viz IDs) to Components
const VIZ_REGISTRY = {
    'attention.matrix_heatmap': MatrixMultViz,
    'optimization.softmax': SoftmaxViz,
};

export default VIZ_REGISTRY;
