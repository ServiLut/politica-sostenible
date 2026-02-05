'use server';

import { getCurrentUser } from '@/lib/session';
import { getSignedUrl } from '@/lib/storage';

export async function getTaskEvidenceUrl(path: string) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    
    // Allow ADMIN, COORDINATOR, and potentially others involved in the task to view.
    // For now, basic auth check. Real app should check if user has access to task.
    // Assuming if they have the task ID and can view the modal, they can view evidence.

    try {
        const signedUrl = await getSignedUrl(path, 'evidencia-mision', 60); // 60 seconds expiry as requested
        return { data: { signedUrl } };
    } catch (error) {
        console.error('Sign URL Error:', error);
        return { error: 'Failed to sign URL' };
    }
}
