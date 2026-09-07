const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";
const WHATSAPP_PHONE_ID = "1148363601703126";
const WHATSAPP_ACCESS_TOKEN = "EAAfiHbXZB2G4BSKWTaaWZA612aRZAAn2y7cwEPvAuQYMiuOGbOjhuM6VGH2nWJIChwlfDaRAz0fuZAZBdYgsP7ZA8veoTBBHbtuil24wWppFXoa7t15HkCGJqwOrDZAOT5ZBnlNW82dFobQ75H8ZCq6d13X1LYnuWf8zUu6f1AGarJamNzHeYo6yfNh7SZBUOoMp456QZDZD";

async function testSend() {
  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "5493472629600",
    type: "text",
    text: { body: "Prueba de diagnóstico Puffin" }
  };

  console.log("Sending payload to Meta:", payload);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  console.log("Status:", res.status, res.statusText);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

testSend().catch(console.error);
