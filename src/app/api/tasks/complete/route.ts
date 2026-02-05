import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { taskId, evidenceText, evidenceUrl } = await req.json();

    if (!taskId) {
        return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // 1. Validar existencia y permisos
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const canEdit = 
        user.role === 'ADMIN' || 
        user.role === 'COORDINATOR' || 
        (user.role === 'LEADER' && task.assignedToId === user.id);

    if (!canEdit) {
        return NextResponse.json({ error: 'No tienes permiso para completar esta misión' }, { status: 403 });
    }

    // 2. Actualizar Estado
    const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: { 
            status: 'IN_REVIEW', // Cambiado de DONE a IN_REVIEW
            evidenceText: evidenceText || null,
            completionReport: evidenceText || null, // Redundancia solicitada
            evidenceUrl: evidenceUrl || null,
            // adminFeedback: null // Kept for history until approval
        }
    });

    // 3. Auditoría (Ref: Paso 8.5)
    await createAuditLog(
        user.id, 
        'COMPLETE_TASK', 
        'Task', 
        task.id, 
        { msg: `Líder ${user.fullName} envió evidencia para misión ${task.id}`, evidence: evidenceText }
    );

    return NextResponse.json({ success: true, task: updatedTask });

  } catch (error) {
    console.error('Complete Task Error:', error);
    return NextResponse.json({ error: 'Error completing task' }, { status: 500 });
  }
}

