import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let whereClause: any = { status: { not: 'DONE' } }; // Hide completed by default in list? Prompt says "oculta la tarea de la lista de Pendientes", implying we might fetch them but UI hides, or API filters. Let's filter PENDING/OVERDUE.

    // Role Logic
    if (user.role === 'LEADER' || user.role === 'TESTIGO' || user.role === 'DONANTE') {
       whereClause.assignedToId = user.id;
    } 
    // ADMIN and COORDINATOR see all (or we could filter by organization if implemented)

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        user: { select: { fullName: true } },
        territory: { select: { name: true } }
      },
      orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' }
      ]
    });
    
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('GET Tasks Error:', error);
    return NextResponse.json({ error: 'Error fetching tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Role Security: Only ADMIN and COORDINATOR can assign
    if (user.role !== 'ADMIN' && user.role !== 'COORDINATOR') {
        return NextResponse.json({ error: 'Solo Admin y Coordinadores pueden asignar misiones' }, { status: 403 });
    }

    const data = await req.json();
    
    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: parseInt(data.priority || '3'), // 1: Low, 3: Normal, 5: High
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assignedToId: data.assignedToId || user.id, // Fallback to self if not specified (though UI should enforce)
        territoryId: data.territoryId || null,
        status: 'PENDING'
      }
    });

    // Audit Log for Creation
    await createAuditLog(user.id, 'CREATE_TASK', 'Task', task.id, { title: task.title, assignedTo: data.assignedToId });

    return NextResponse.json(task);
  } catch (error) {
    console.error('POST Task Error:', error);
    return NextResponse.json({ error: 'Error creating task' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id, status } = await req.json();

        // Check if task exists and user has rights
        const task = await prisma.task.findUnique({ where: { id } });
        if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

        const canEdit = 
            user.role === 'ADMIN' || 
            user.role === 'COORDINATOR' || 
            (user.role === 'LEADER' && task.assignedToId === user.id);

        if (!canEdit) {
            return NextResponse.json({ error: 'No tienes permiso para modificar esta misión' }, { status: 403 });
        }

        const updatedTask = await prisma.task.update({
            where: { id },
            data: { status }
        });

        // Audit Log for Completion
        if (status === 'DONE') {
            await createAuditLog(
                user.id, 
                'COMPLETE_TASK', 
                'Task', 
                task.id, 
                { msg: `Líder ${user.fullName} completó la misión ${task.title}` }
            );
        }

        return NextResponse.json(updatedTask);

    } catch (error) {
        console.error('PATCH Task Error:', error);
        return NextResponse.json({ error: 'Error updating task' }, { status: 500 });
    }
}
