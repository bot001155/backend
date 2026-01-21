let selectedPlatform = "";
let redirectOrderId = "";

const BACKEND_URL = "https://delta-backend.onrender.com";

function sendOrder(platform) {
  const nameEl = document.getElementById("name");
  const productEl = document.getElementById("product");
  const emailEl = document.getElementById("email");
  const paymentEl = document.getElementById("payment");
  const loadingEl = document.getElementById("loading");

  if (!nameEl || !productEl || !emailEl || !paymentEl || !loadingEl) {
    alert("Internal error: missing element");
    return;
  }

  const name = nameEl.value.trim();
  const product = productEl.value.trim();
  const email = emailEl.value.trim();
  const payment = paymentEl.value;

  if (!name || !product || !email) {
    alert("Please fill all fields");
    return;
  }

  selectedPlatform = platform;
  redirectOrderId =
    "DMS-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  loadingEl.style.display = "flex";

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 8000);

  fetch(`${BACKEND_URL}/send-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      orderId: redirectOrderId,
      name,
      product,
      plan: "Standard",
      price: "N/A",
      payment,
      platform,
      email
    })
  })
    .then(res => res.json())
    .then(data => {
      loadingEl.style.display = "none";

      if (!data || !data.success) {
        alert("Order failed");
        return;
      }

      document.getElementById("popupOrderId").innerText =
        "Order ID: " + redirectOrderId;
      document.getElementById("popup").style.display = "flex";
    })
    .catch(() => {
      loadingEl.style.display = "none";
      alert("Server timeout. Try again.");
    });
}

function confirmRedirect() {
  if (selectedPlatform === "telegram") {
    window.location.href =
      "https://t.me/Delta_Market_Owner?text=" +
      encodeURIComponent("Order ID: " + redirectOrderId);
  }

  if (selectedPlatform === "instagram") {
    window.location.href = "https://ig.me/m/deltamarket015";
  }
}
