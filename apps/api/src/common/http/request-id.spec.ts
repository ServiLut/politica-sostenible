import type { NextFunction, Request, Response } from 'express';
import {
  getRequestId,
  requestIdMiddleware,
  resolveRequestId,
} from './request-id';

describe('request correlation id', () => {
  it('preserves a bounded safe upstream identifier', () => {
    expect(resolveRequestId('edge_01HZZ0W7E9Y4G3R2')).toBe(
      'edge_01HZZ0W7E9Y4G3R2',
    );
  });

  it.each([
    '',
    'short',
    'contains spaces and private data',
    'line-break\nforged',
    'x'.repeat(65),
  ])('replaces an unsafe identifier: %s', (candidate) => {
    expect(resolveRequestId(candidate)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('sets the same identifier on the request and response', () => {
    const request = {
      header: jest.fn().mockReturnValue('proxy-request_123'),
    } as unknown as Request;
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(request, response, next);

    expect(getRequestId(request)).toBe('proxy-request_123');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'proxy-request_123');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
