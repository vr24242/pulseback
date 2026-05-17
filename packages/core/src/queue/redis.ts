import { Redis } from "ioredis"

let client: Redis | null = null

export function getRedis(): Redis {
  if (client) return client

  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error("REDIS_URL is not set. Add it to your environment variables.")
  }

  client = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  })

  client.on("error", (err) => {
    console.error("[Redis] connection error:", err.message)
  })

  return client
}

// Separate connection for BullMQ subscribers (pub/sub requires dedicated connection)
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL is not set.")
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  })
}
