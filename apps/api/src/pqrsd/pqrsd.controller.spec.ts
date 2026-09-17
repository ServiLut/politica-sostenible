import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type {
  CreatePqrsdDossierDto,
  PqrsdDetailQueryDto,
  ReviewPqrsdRulePackageDto,
} from './dto/pqrsd.dto';
import { PqrsdController } from './pqrsd.controller';
import { PqrsdService } from './pqrsd.service';

describe('PqrsdController', () => {
  const user = {
    tenantId: 'tenant-public',
    userId: 'user-a',
    role: 'ADMIN',
  } as AuthenticatedUser;
  const service = {
    overview: jest.fn(),
    detail: jest.fn(),
    createDossier: jest.fn(),
    reviewRulePackage: jest.fn(),
  };
  const controller = new PqrsdController(service as unknown as PqrsdService);

  beforeEach(() => jest.clearAllMocks());

  it('takes tenant identity only from the authenticated principal for masked lists', async () => {
    service.overview.mockResolvedValue({ dossiers: [] });
    await controller.overview(user, { limit: 20 });
    expect(service.overview).toHaveBeenCalledWith(user, { limit: 20 });
  });

  it('requires an explicit purpose when opening sensitive detail', async () => {
    const query = {
      purpose: 'Gestionar la solicitud asignada',
    } as PqrsdDetailQueryDto;
    await controller.detail(user, { id: 'dossier-a' }, query);
    expect(service.detail).toHaveBeenCalledWith(
      user,
      'dossier-a',
      query.purpose,
    );
  });

  it('binds route identifiers server-side for four-eyes package review', async () => {
    const dto = { expectedRevision: 1 } as ReviewPqrsdRulePackageDto;
    await controller.reviewRulePackage(user, { id: 'package-a' }, dto);
    expect(service.reviewRulePackage).toHaveBeenCalledWith(
      user,
      'package-a',
      dto,
    );
  });

  it('does not accept a tenant route/body argument for intake', async () => {
    const dto = { subject: 'Solicitud' } as CreatePqrsdDossierDto;
    await controller.createDossier(user, dto);
    expect(service.createDossier).toHaveBeenCalledWith(user, dto);
  });
});
