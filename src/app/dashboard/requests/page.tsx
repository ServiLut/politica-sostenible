import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getPendingUsers } from '@/app/actions/admin-requests';
import RequestTable from './RequestTable';
import { Users, ShieldAlert } from 'lucide-react';

export default async function AdminRequestsPage() {
  const user = await getCurrentUser();

  // Restricción: SOLO para rol 'ADMIN'
  if (!user || user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const pendingUsers = await getPendingUsers();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight">
            Solicitudes de Acceso Pendientes
          </h1>
          <p className="text-brand-gray-500 font-medium">
            Gestiona los nuevos registros que esperan aprobación para ingresar al sistema.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-4 py-2 rounded-2xl text-amber-700">
          <ShieldAlert className="w-5 h-5" />
          <span className="font-bold text-sm">{pendingUsers.length} Pendientes</span>
        </div>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-brand-gray-100 rounded-3xl">
          <div className="p-6 bg-brand-gray-50 rounded-full mb-4">
            <Users className="w-12 h-12 text-brand-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-brand-black">No hay solicitudes pendientes</h3>
          <p className="text-brand-gray-500 max-w-xs text-center mt-2 font-medium">
            Todos los registros han sido procesados. ¡Buen trabajo manteniendo el control!
          </p>
        </div>
      ) : (
        <div className="card-friendly overflow-hidden">
          <RequestTable users={pendingUsers} />
        </div>
      )}
    </div>
  );
}
