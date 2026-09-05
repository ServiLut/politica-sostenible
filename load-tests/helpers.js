import http from 'k6/http';
import { BASE_URL } from './config.js';

export function login(email, password) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (res.status !== 200 && res.status !== 201) {
    console.error(`Login failed: ${res.status} ${res.body}`);
    return null;
  }
  
  const body = JSON.parse(res.body);
  return body.data?.accessToken || body.accessToken;
}

export function authHeaders(token) {
  return { 
    Authorization: `Bearer ${token}`, 
    'Content-Type': 'application/json' 
  };
}

export function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
