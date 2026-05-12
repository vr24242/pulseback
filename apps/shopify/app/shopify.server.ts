import "@shopify/shopify-app-remix/adapters/node"
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server"
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma"
import { db } from "@d2c/database"

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October24,
  scopes: process.env.SCOPES!.split(","),
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  future: {},
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session })

      // Upsert shop record on install
      await db.shop.upsert({
        where: { domain: session.shop },
        create: {
          domain: session.shop,
          accessToken: session.accessToken!,
        },
        update: {
          accessToken: session.accessToken!,
          isActive: true,
        },
      })
    },
  },
  webhooks: {
    ORDERS_CREATE: { deliveryMethod: "http", callbackUrl: "/webhooks/orders/create" },
    ORDERS_UPDATED: { deliveryMethod: "http", callbackUrl: "/webhooks/orders/updated" },
    CUSTOMERS_CREATE: { deliveryMethod: "http", callbackUrl: "/webhooks/customers/create" },
    CUSTOMERS_UPDATE: { deliveryMethod: "http", callbackUrl: "/webhooks/customers/update" },
    CHECKOUTS_CREATE: { deliveryMethod: "http", callbackUrl: "/webhooks/checkouts/create" },
    CHECKOUTS_UPDATE: { deliveryMethod: "http", callbackUrl: "/webhooks/checkouts/update" },
    APP_UNINSTALLED: { deliveryMethod: "http", callbackUrl: "/webhooks/app/uninstalled" },
  },
})

export default shopify
export const apiVersion = ApiVersion.October24
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders
export const authenticate = shopify.authenticate
export const unauthenticated = shopify.unauthenticated
export const login = shopify.login
export const registerWebhooks = shopify.registerWebhooks
export const sessionStorage = shopify.sessionStorage
