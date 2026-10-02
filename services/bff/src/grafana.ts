import axios from 'axios';

const BASE_URL = process.env.GRAFANA_BASE_URL || 'http://grafana:3000';
// Using Service Account Token or Basic Auth if provided
const TOKEN = process.env.GRAFANA_TOKEN;

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    maxRedirects: 0,
    headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

export const searchDashboards = async (query: string = '', folderIds?: string) => {
    const params: Record<string, string> = {
        query,
        type: 'dash-db'
    };
    if (folderIds) {
        params.folderIds = folderIds;
    }
    const res = await client.get('/api/search', { params });
    return res.data;
};

export const getDashboard = async (uid: string) => {
    const res = await client.get(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
    return res.data;
};

export const queryDataSource = async (body: any) => {
    const res = await client.post('/api/ds/query', body);
    return res.data;
};
