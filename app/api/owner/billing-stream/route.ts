import { NextRequest, NextResponse } from 'next/server';
import { getOwnerBillingMonitoringAction } from '@/app/actions/billing-sessions';

/**
 * Owner Billing Monitoring BFF & Server-Sent Events (SSE) Endpoint.
 * - Strictly authenticated for Owner role via getOwnerBillingMonitoringAction().
 * - Supports ?mode=snapshot (JSON) for polling fallback and text/event-stream for live SSE.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  const storeId = searchParams.get('storeId');
  const acceptHeader = request.headers.get('accept') || '';

  const initialResult = await getOwnerBillingMonitoringAction({
    storeId: storeId || null,
  });

  if (!initialResult.success) {
    const status = /authentication required/i.test(initialResult.error || '')
      ? 401
      : /forbidden/i.test(initialResult.error || '')
        ? 403
        : 400;
    return NextResponse.json(
      { success: false, error: initialResult.error },
      { status }
    );
  }

  if (mode === 'snapshot' || !acceptHeader.includes('text/event-stream')) {
    return NextResponse.json({
      success: true,
      data: initialResult.data,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const sendEvent = (eventName: string, payload: unknown) => {
        if (closed) return;
        try {
          const chunk = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Push initial authoritative snapshot immediately
      sendEvent('monitoring_update', initialResult.data);

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const latest = await getOwnerBillingMonitoringAction({
            storeId: storeId || null,
          });
          if (latest.success && latest.data) {
            sendEvent('monitoring_update', latest.data);
          }
        } catch {
          // keep stream alive
        }
      }, 5000);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
