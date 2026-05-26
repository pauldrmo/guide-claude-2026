import Stripe from "stripe";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function emailTemplate({ customerName, downloadUrl, productName }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Helvetica Neue', sans-serif; background: #0a0f1e; color: #e8eaf6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #111827; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0d1b4b 0%, #0050ff 100%); padding: 40px 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 28px; margin: 0; }
    .header p { color: rgba(255,255,255,0.75); margin: 8px 0 0; font-size: 14px; }
    .body { padding: 36px 32px; }
    .body h2 { color: #60a5fa; font-size: 20px; margin-top: 0; }
    .body p { line-height: 1.7; color: #cbd5e1; font-size: 15px; }
    .btn { display: inline-block; margin: 24px 0; padding: 14px 32px; background: #0050ff; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .footer { padding: 24px 32px; border-top: 1px solid #1e293b; text-align: center; color: #475569; font-size: 12px; }
    .highlight { background: #1e293b; border-left: 3px solid #0050ff; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Pelagosia</h1>
      <p>Formation Intelligence Artificielle</p>
    </div>
    <div class="body">
      <h2>Bonjour ${customerName} 👋</h2>
      <p>Merci pour ton achat ! Ta commande de <strong>${productName}</strong> a bien été confirmée.</p>
      <p>Tu peux télécharger ton accès immédiatement :</p>
      <div style="text-align:center;">
        <a class="btn" href="${downloadUrl}">📥 Accéder à ma formation</a>
      </div>
      <div class="highlight">
        <p style="margin:0; font-size:13px; color:#94a3b8;">🔒 Un problème ? Réponds directement à cet email.</p>
      </div>
      <p>À très vite,<br/><strong>L'équipe Pelagosia</strong></p>
    </div>
    <div class="footer">Pelagosia — Formation IA &nbsp;|&nbsp; contact@pelagosia.fr</div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Lecture raw body via buffer — méthode la plus fiable sur Vercel statique
  const rawBody = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Erreur signature:", err.message);
    return res.status(400).json({ error: err.message });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name?.split(" ")[0] || "là";
    const productName = session.metadata?.product_name || "Formation Pelagosia";
    const downloadUrl = session.metadata?.download_url || process.env.DEFAULT_DOWNLOAD_URL;

    console.log(`Paiement reçu: ${customerEmail}`);

    if (customerEmail) {
      try {
        await resend.emails.send({
          from: "Pelagosia Formation <contact@pelagosia.fr>",
          to: customerEmail,
          subject: `✅ Ton accès "${productName}" est prêt !`,
          html: emailTemplate({ customerName, downloadUrl, productName }),
        });
        console.log(`✅ Email envoyé à ${customerEmail}`);
      } catch (err) {
        console.error("Erreur Resend:", err.message);
      }
    }
  }

  return res.status(200).json({ received: true });
}
