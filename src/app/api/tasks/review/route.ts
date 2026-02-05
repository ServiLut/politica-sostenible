import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Validate Admin/Coordinator
    if (user.role !== 'ADMIN' && user.role !== 'COORDINATOR') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { taskId, action, feedback } = await req.json();

    if (!taskId || !action) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    let newStatus = task.status;
    if (action === 'APPROVE') newStatus = 'DONE';
    else if (action === 'REJECT') newStatus = 'PENDING'; // Return to leader
    else return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: { 
            status: newStatus,
            adminFeedback: action === 'REJECT' ? feedback : null
        }
    });

    // Audit Log
    await createAuditLog(
        user.id, 
        `REVIEW_TASK_${action}`, 
        'Task', 
        task.id, 
        { 
            msg: `Auditor ${user.fullName} ${action === 'APPROVE' ? 'APROBÓ' : 'RECHAZÓ'} la misión ${task.id}`,
            feedback: feedback || 'Sin comentarios'
        }
    );

    revalidatePath('/dashboard/tasks');
    return NextResponse.json({ success: true, task: updatedTask });

  } catch (error) {
    console.error('Review Task Error:', error);
    return NextResponse.json({ error: 'Error reviewing task' }, { status: 500 });
  }
}

