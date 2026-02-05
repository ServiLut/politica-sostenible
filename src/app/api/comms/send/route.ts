import { NextRequest, NextResponse } from 'next/server';
import { messageRouter } from '@/services/comms/messageRouter.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, content, campaignId, type } = body;

    if (!contactId || !content || !campaignId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fire and Forget (Async processing)
    // We don't await the full cascade to keep the API fast, 
    // unless we need immediate confirmation.
    messageRouter.dispatchMessage({
      contactId,
      content,
      campaignId,
      messageType: type
    }).catch(err => console.error("Background Dispatch Error:", err));

    return NextResponse.json({ 
      success: true, 
      message: 'Message dispatched to router queue' 
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
