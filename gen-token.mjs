import * as jose from 'jose';

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);

const shopId = process.argv[2];
if (!shopId) {
  console.log("Usage: node gen-token.mjs <shopId>");
  process.exit(1);
}

const payload = {
  shopId,
  shopDomain: "test-shop.myshopify.com",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
};

const token = await new jose.SignJWT(payload)
  .setProtectedHeader({ alg: "HS256" })
  .sign(secret);

console.log("\n✅ JWT Token Generated:\n");
console.log(token);
console.log("\n✅ Expires in: 24 hours");
console.log("✅ Shop ID:", shopId);
