import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ProgressiveCapture from '@/components/ProgressiveCapture'; // Reusing the component logic
import { isAfter, addHours } from 'date-fns';



interface RsvpPageProps {
  params: {
    eventId: string;
  };
  searchParams: {
    ref?: string; // Leader Name
  };
}

// ----------------------------------------------------------------------------
// SERVER SIDE LOGIC (Verification)
// ----------------------------------------------------------------------------

async function getEvent(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { territory: true }
  });

  if (!event) return null;

  // Rule: Link expires 2 hours after event start
  const expirationTime = addHours(event.eventDate, 2);
  const isExpired = isAfter(new Date(), expirationTime);

  return { ...event, isExpired };
}

// ----------------------------------------------------------------------------
// CLIENT COMPONENT WRAPPER (The RSVP Landing)
// ----------------------------------------------------------------------------

export default async function RsvpPage({ params, searchParams }: RsvpPageProps) {
  const event = await getEvent(params.eventId);

  if (!event) return notFound();

  // Expired State
  if (event.isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-gray-800">Evento Finalizado</h1>
          <p className="text-gray-600 mt-2">
            El tiempo para confirmar asistencia a <strong>&quot;{event.name}&quot;</strong> ha terminado.
          </p>
          <p className="text-sm text-gray-400 mt-4">Contacta a tu líder si crees que es un error.</p>
        </div>
      </div>
    );
  }

  // Active State
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Ultra-light Header */}
      <div className="bg-white border-b p-4 shadow-sm text-center">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
          INVITACIÓN DE {searchParams.ref || 'TU LÍDER'}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">
          {event.name}
        </h1>
        <div className="flex justify-center gap-4 mt-3 text-sm text-slate-600">
          <span className="flex items-center gap-1">
            📅 {event.eventDate.toLocaleDateString()}
          </span>
          <span className="flex items-center gap-1">
            📍 {event.territory.name}
          </span>
        </div>
      </div>

      {/* The "Conversion Engine" */}
      <div className="flex-1 p-4 flex items-center justify-center">
        {/* We inject context into the generic capture component */}
        <div className="w-full max-w-md">
            {/* 
               NOTA: En una implementación real, pasaríamos props adicionales a ProgressiveCapture
               para que sepa que es contexto RSVP (eventId) y modifique el texto del botón final
               a "CONFIRMAR ASISTENCIA".
               
               <ProgressiveCapture 
                  context="RSVP" 
                  eventId={event.id} 
                  successMessage="¡Cupo reservado! Te esperamos."
               />
            */}
            
            {/* Placeholder del componente visual diseñado en el paso anterior */}
            <div className="border-2 border-dashed border-blue-200 rounded-xl p-4 bg-blue-50 text-center text-blue-800">
               [Aquí carga el componente ProgressiveCapture]
               <br/>
               <span className="text-sm font-bold">Capa 1 activa: Nombre + Celular</span>
            </div>
        </div>
      </div>

      <footer className="p-4 text-center text-xs text-gray-400">
        Política de Privacidad y Habeas Data activos.
      </footer>
    </div>
  );
}
