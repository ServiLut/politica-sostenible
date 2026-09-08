import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost() {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', path: '/missing' }),
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
});
