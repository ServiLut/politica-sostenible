import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import {
  PersonImportController,
  waitForCsvDrain,
} from './person-import.controller';
import type { PersonImportService } from './person-import.service';
import { Role } from '../../prisma/generated/prisma';

describe('Private CSV download cancellation', () => {
  function response() {
    return Object.assign(new EventEmitter(), {
      destroyed: false,
      setHeader: jest.fn(),
      write: jest.fn().mockReturnValue(false),
      end: jest.fn(),
    });
  }
  it.each(['drain', 'close', 'error'])(
    'settles on %s and removes all listeners',
    async (event) => {
      const res = response();
      const waiting = waitForCsvDrain(res as unknown as Response);
      if (event === 'error') {
        const rejected = expect(waiting).rejects.toThrow('disconnected');
        res.emit(event, new Error('disconnected'));
        await rejected;
      } else {
        res.emit(event);
        expect(await waiting).toBe(event === 'drain');
      }
      for (const name of ['drain', 'close', 'error'])
        expect(res.listenerCount(name)).toBe(0);
    },
  );
  it('closes the row generator when the client disconnects during header backpressure', async () => {
    const res = response();
    let finalized = false;
    let privateRowFetched = false;
    async function* chunks() {
      try {
        yield await Promise.resolve('Fila,Motivo\r\n');
        privateRowFetched = true;
        yield '2,PRUEBA\r\n';
      } finally {
        finalized = true;
      }
    }
    const controller = new PersonImportController({
      errorCsv: () => chunks(),
    } as unknown as PersonImportService);
    const pending = controller.errorCsv(
      { tenantId: 'tenant', userId: 'user', role: Role.ADMIN },
      { id: 'c123456789012345678901234' },
      res as unknown as Response,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(res.write).toHaveBeenCalledTimes(1);
    res.destroyed = true;
    res.emit('close');
    await pending;
    expect(finalized).toBe(true);
    expect(privateRowFetched).toBe(false);
    expect(res.end).not.toHaveBeenCalled();
  });
});
