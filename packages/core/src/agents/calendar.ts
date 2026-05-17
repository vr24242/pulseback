import type { Redis } from "ioredis"

// Priority order: higher = wins
const PRIORITY: Record<string, number> = {
  support: 100,
  operations: 80,
  logistics: 60,
  finance: 40,
  marketing: 20,
  abandoned_cart: 25,
  ndr: 65,
  retention: 22,
  winback: 21,
  cod_confirmation: 90,
  order_confirmed: 85,
}

const TTL_SECONDS = 3 * 24 * 60 * 60 // 3 days

function calendarKey(customerId: string): string {
  return `comm_calendar:${customerId}`
}

function holdKey(customerId: string): string {
  return `comm_hold:${customerId}`
}

export interface CalendarCheckResult {
  allowed: boolean
  reason?: string
  retryAfter?: Date // when to retry if not allowed
}

export class CalendarAgent {
  constructor(private redis: Redis) {}

  /**
   * Check if we can send a communication to this customer right now.
   * Returns allowed=true if: no hold, no same-day comm of higher priority.
   */
  async canSend(
    customerId: string,
    commType: string,
  ): Promise<CalendarCheckResult> {
    const [holdData, lastComm] = await Promise.all([
      this.redis.get(holdKey(customerId)),
      this.redis.get(calendarKey(customerId)),
    ])

    // Check hold
    if (holdData) {
      const hold = JSON.parse(holdData) as { until: number; reason: string }
      if (Date.now() < hold.until) {
        return {
          allowed: false,
          reason: hold.reason,
          retryAfter: new Date(hold.until),
        }
      }
    }

    // Check quiet hours: 22:00–08:00 IST
    const istHour = (new Date().getUTCHours() + 5) % 24
    const isQuietHour = istHour >= 22 || istHour < 8
    if (isQuietHour) {
      const tomorrow8am = new Date()
      tomorrow8am.setUTCHours(2, 30, 0, 0) // 08:00 IST = 02:30 UTC
      if (tomorrow8am < new Date()) tomorrow8am.setDate(tomorrow8am.getDate() + 1)
      return {
        allowed: false,
        reason: "quiet_hours",
        retryAfter: tomorrow8am,
      }
    }

    // Check same-day higher-priority comm
    if (lastComm) {
      const last = JSON.parse(lastComm) as { type: string; sentAt: number }
      const sentToday = Date.now() - last.sentAt < 24 * 60 * 60 * 1000
      if (sentToday) {
        const lastPriority = PRIORITY[last.type] ?? 0
        const thisPriority = PRIORITY[commType] ?? 0
        if (lastPriority >= thisPriority) {
          return {
            allowed: false,
            reason: `already_sent_${last.type}_today`,
            retryAfter: new Date(last.sentAt + 48 * 60 * 60 * 1000),
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Record that a communication was sent. Call immediately after sending.
   */
  async recordSent(customerId: string, commType: string): Promise<void> {
    await this.redis.setex(
      calendarKey(customerId),
      TTL_SECONDS,
      JSON.stringify({ type: commType, sentAt: Date.now() }),
    )
  }

  /**
   * Place a hold on all communications for this customer.
   * Used by logistics (open NDR), finance (pending refund), support (complaint).
   */
  async hold(
    customerId: string,
    durationMs: number,
    reason: string,
  ): Promise<void> {
    await this.redis.setex(
      holdKey(customerId),
      Math.ceil(durationMs / 1000),
      JSON.stringify({ until: Date.now() + durationMs, reason }),
    )
  }

  /**
   * Lift a hold explicitly (e.g. NDR resolved, refund processed).
   */
  async liftHold(customerId: string): Promise<void> {
    await this.redis.del(holdKey(customerId))
  }
}
