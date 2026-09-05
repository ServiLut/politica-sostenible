import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';
import { login, authHeaders } from './helpers.js';

export const options = {
  stages: [
    { duration: '10s', target: 10 },  // Normal load
    { duration: '30s', target: 500 }, // Spike to 500 VUs
    { duration: '30s', target: 500 }, // Hold spike for a bit
    { duration: '10s', target: 10 },  // Scale down
    { duration: '1m', target: 10 },   // Recovery phase
    { duration: '10s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<6000'],
  },
};

export function setup() {
  const token = login(ADMIN_EMAIL, ADMIN_PASSWORD);
  return { token };
}

export default function (data) {
  if (!data.token) return;
  const headers = authHeaders(data.token);

  group('Election Day Reads', function () {
    let res = http.get(`${BASE_URL}/election-day/dashboard`, { headers });
    check(res, { 'election dashboard status is 200': (r) => r.status === 200 });
    sleep(1);

    res = http.get(`${BASE_URL}/command-center/briefing`, { headers });
    check(res, { 'briefing status is 200': (r) => r.status === 200 });
    sleep(1);
    
    res = http.get(`${BASE_URL}/voters?page=1&limit=50`, { headers });
    check(res, { 'voters status is 200': (r) => r.status === 200 });
    sleep(1);
  });
}
