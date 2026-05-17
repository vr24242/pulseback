/**
 * Pulseback Checkout Interceptor
 * Intercepts Shopify's native checkout button and redirects to the Pulseback hosted checkout.
 * Injected via Theme App Extension — add {% render 'pulseback-checkout' %} to theme.liquid.
 */
(function () {
  "use strict";

  const CHECKOUT_URL = "https://pulseback.fly.dev/checkout/";
  const SHOP_DOMAIN = window.Shopify && window.Shopify.shop;

  if (!SHOP_DOMAIN) return;

  function interceptCheckout(e) {
    const btn = e.target.closest(
      '[name="checkout"], [href*="/checkouts"], .cart__checkout-button, #checkout, .checkout-button, [data-checkout-btn]'
    );
    if (!btn) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // Read UTM params to pass attribution through
    const params = new URLSearchParams(window.location.search);
    const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_content"]
      .filter((k) => params.has(k))
      .map((k) => `${k}=${encodeURIComponent(params.get(k))}`)
      .join("&");

    const dest =
      CHECKOUT_URL +
      encodeURIComponent(SHOP_DOMAIN) +
      "?return_url=" +
      encodeURIComponent(window.location.origin) +
      (utm ? "&" + utm : "");

    window.location.href = dest;
  }

  // Attach once DOM is ready
  function attach() {
    document.addEventListener("click", interceptCheckout, { capture: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})();
