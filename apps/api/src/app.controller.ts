import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('favicon.ico')
  @HttpCode(HttpStatus.NO_CONTENT)
  getFavicon() {
    return;
  }

  @Get('debug-sentry')
  getError() {
    throw new Error('My first Sentry error!');
  }
}
