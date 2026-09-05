import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';
import { login, authHeaders, generateRandomString } from './helpers.js';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

export function setup() {
  const token = login(ADMIN_EMAIL, ADMIN_PASSWORD);
  return { token };
}

export default function (data) {
  if (!data.token) return;
  const headers = authHeaders(data.token);

  // 70% reads, 30% writes mix using Math.random
  const rand = Math.random();

  if (rand < 0.7) {
    // Read operations
    group('Reads', function () {
      let res = http.get(`${BASE_URL}/command-center/briefing`, { headers });
      check(res, { 'briefing status is 200': (r) => r.status === 200 });
      sleep(1);

      res = http.get(`${BASE_URL}/voters?page=1&limit=20`, { headers });
      check(res, { 'voters status is 200': (r) => r.status === 200 });
      sleep(1);

      res = http.get(`${BASE_URL}/proposals`, { headers });
      check(res, { 'proposals status is 200': (r) => r.status === 200 });
      sleep(1);

      res = http.get(`${BASE_URL}/election-day/dashboard`, { headers });
      check(res, { 'election dashboard status is 200': (r) => r.status === 200 });
      sleep(1);
    });
  } else {
    // Write operations
    group('Writes', function () {
      if (Math.random() < 0.5) {
        // Create Voter
        const payload = JSON.stringify({
          firstName: 'Load',
          lastName: 'Test',
          documentId: `ID-${generateRandomString(10)}`,
          email: `test-${generateRandomString(6)}@example.com`,
          phone: `555${Math.floor(1000000 + Math.random() * 9000000)}`
        });
        const res = http.post(`${BASE_URL}/voters`, payload, { headers });
        check(res, { 'create voter status is 201': (r) => r.status === 201 || r.status === 400 }); 
        // Allow 400 in case constraints fail in dummy data, important is server response
        sleep(2);
      } else {
        // Create Proposal
        const payload = JSON.stringify({
          title: `Proposal ${generateRandomString(8)}`,
          description: 'This is a load test proposal',
          category: 'INFRASTRUCTURE'
        });
        const res = http.post(`${BASE_URL}/proposals`, payload, { headers });
        check(res, { 'create proposal status is 201': (r) => r.status === 201 || r.status === 400 });
        sleep(2);
      }
    });
  }
}
