import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';
import { login, authHeaders } from './helpers.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const token = login(ADMIN_EMAIL, ADMIN_PASSWORD);
  return { token };
}

export default function (data) {
  if (!data.token) {
    console.error('No token available');
    return;
  }

  const headers = authHeaders(data.token);

  group('Command Center', function () {
    const res = http.get(`${BASE_URL}/command-center/briefing`, { headers });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Voters', function () {
    const res = http.get(`${BASE_URL}/voters?page=1&limit=10`, { headers });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Proposals', function () {
    const res = http.get(`${BASE_URL}/proposals`, { headers });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Election Day', function () {
    const res = http.get(`${BASE_URL}/election-day/dashboard`, { headers });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
  });
}
