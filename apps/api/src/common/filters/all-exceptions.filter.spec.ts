import {
  ArgumentsHost,
  ConflictException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(requestId?: string) {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', path: '/missing', requestId }),
      getResponse: () => ({ status, json }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registra respuestas 4xx como advertencias y no como fallos internos', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, status, json } = createHost();

    new AllExceptionsFilter().catch(new NotFoundException(), host);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP response: 404'),
    );
    expect(error).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        path: '/missing',
      }),
    );
  });

  it('registra respuestas 5xx como errores con la traza y oculta el detalle', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, status, json } = createHost();
    const exception = new Error('secreto interno');

    new AllExceptionsFilter().catch(exception, host);

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('HTTP response: 500'),
      exception.stack,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      }),
    );
  });

  it('conserva solo codigos operativos seguros y descarta detalles arbitrarios', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { host, json } = createHost('edge-request_123');

    new AllExceptionsFilter().catch(
      new ConflictException({
        code: 'ELECTION_DAY_READINESS_BLOCKED',
        message: 'Corrige el alistamiento antes de avanzar',
        currentStage: 'ELECTION_PREPARATION',
        allowedStages: ['SIMULATION', 'ELECTION_DAY'],
        blockers: ['NO_POLLING_PLACES', 'NO_ACTIVE_WITNESS'],
        closureType: null,
        secret: 'documento-privado-123',
        errors: ['fila con dato personal'],
      }),
      host,
    );

    const responseBody = json.mock.calls[0]?.[0];
    expect(responseBody).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: 'ELECTION_DAY_READINESS_BLOCKED',
      currentStage: 'ELECTION_PREPARATION',
      allowedStages: ['SIMULATION', 'ELECTION_DAY'],
      blockers: ['NO_POLLING_PLACES', 'NO_ACTIVE_WITNESS'],
      closureType: null,
      requestId: 'edge-request_123',
    });
    expect(responseBody).not.toHaveProperty('secret');
    expect(responseBody).not.toHaveProperty('errors');
    expect(JSON.stringify(responseBody)).not.toContain('documento-privado');
    expect(JSON.stringify(responseBody)).not.toContain('dato personal');
  });

  it('descarta metadatos que no cumplen el contrato publico', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { host, json } = createHost();

    new AllExceptionsFilter().catch(
      new ConflictException({
        code: 'not-safe',
        message: 'Solicitud rechazada',
        currentStage: 'CAMPAIGN<script>',
        blockers: ['VALID', 'contains private detail'],
      }),
      host,
    );

    expect(json.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: 'Solicitud rechazada' }),
    );
    expect(json.mock.calls[0]?.[0]).not.toHaveProperty('code');
    expect(json.mock.calls[0]?.[0]).not.toHaveProperty('currentStage');
    expect(json.mock.calls[0]?.[0]).not.toHaveProperty('blockers');
  });
});
