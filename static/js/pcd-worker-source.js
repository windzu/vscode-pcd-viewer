import { preparePreview } from './preview-data.js';

self.onmessage = ({ data }) => {
    try {
        self.postMessage({ type: 'progress', value: 0 });
        const cloud = preparePreview(data.buffer, data.maxPoints, value => {
            self.postMessage({ type: 'progress', value });
        });
        const transfers = [cloud.positions.buffer, ...Object.values(cloud.fieldData).map(field => field.buffer)];
        self.postMessage({ type: 'complete', cloud }, transfers);
    } catch (error) {
        self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
