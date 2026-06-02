import { Module, Global } from '@nestjs/common';
import { IdentityService } from './services/identity.service';
import { JwtIdentityService } from './services/jwt-identity.service';
import { JwtModule } from '@nestjs/jwt';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret =
          process.env.JWT_SECRET ||
          (process.env.NODE_ENV === 'test' ? 'test-secret' : undefined);

        if (!secret) {
          throw new Error('JWT_SECRET is required');
        }

        return {
          secret,
          signOptions: { expiresIn: '1d' },
        };
      },
    }),
  ],
  providers: [IdentityService, JwtIdentityService, RolesGuard],
  exports: [JwtModule, IdentityService, JwtIdentityService, RolesGuard],
})
export class CommonModule {}
