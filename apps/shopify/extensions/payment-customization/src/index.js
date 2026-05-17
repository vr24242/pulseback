// @ts-check

/**
 * PulseOS Payment Customization
 * Hides Cash on Delivery when _pulseback_cod_blocked = "true"
 */

/**
 * @typedef {Object} Input
 * @property {Object} cart
 * @property {Object|null} cart.attribute
 * @property {string|null} cart.attribute.value
 * @property {Array<{id: string, name: string}>} paymentMethods
 */

/**
 * @param {Input} input
 * @returns {{ operations: Array<{hide: {paymentMethodId: string}}> }}
 */
export function run(input) {
  // Read _pulseback_cod_blocked from cart attributes array
  const blockedAttr = input.cart?.attributes?.find(
    attr => attr.key === "_pulseback_cod_blocked"
  )
  const codBlocked = blockedAttr?.value === "true"

  if (!codBlocked) {
    return { operations: [] }
  }

  // Hide any payment method whose name contains "Cash" or "COD"
  const toHide = (input.paymentMethods ?? [])
    .filter(pm => {
      const name = pm.name.toLowerCase()
      return (
        name.includes("cash") ||
        name.includes("cod") ||
        name.includes("cash on delivery") ||
        name.includes("pay on delivery")
      )
    })
    .map(pm => ({ hide: { paymentMethodId: pm.id } }))

  return { operations: toHide }
}
