const express = require("express");
const app = express();
app.use(express.json());

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_BASE = "https://services.leadconnectorhq.com";

// ─── Mapeamento de respostas → tags ───────────────────────────────────────────
const TAG_RULES = [
  // Pergunta 5: Há quanto tempo sua marca está no mercado?
  { contains: "Menos de 1 ano",  tag: "tempo-mercado-menos-1-ano" },
  { contains: "1 a 3 anos",      tag: "tempo-mercado-1-3-anos" },
  { contains: "3 a 5 anos",      tag: "tempo-mercado-3-5-anos" },
  { contains: "Mais de 5 anos",  tag: "tempo-mercado-mais-5-anos" },

  // Pergunta 6: Faturamento
  { contains: "Ainda não faturo",             tag: "Ainda não faturo" },
  { contains: "Até R$2.000 a R$10.000",       tag: "menos de 10k" },
  { contains: "De R$10.000 a R$30.000",       tag: "entre 10k a 30k" },
  { contains: "Mais de R$30.000",             tag: "acima de 30k" },

  // Pergunta 8: Já investiu em mentorias?
  { contains: "Sim",             tag: "ja-investiu-mentoria" },
  { contains: "Não",             tag: "nunca-investiu-mentoria" },

  // Pergunta 9: Possui loja online?
  { contains: "Sim",             tag: "tem-loja-online" },
  { contains: "Não",             tag: "sem-loja-online" },
];
// ─────────────────────────────────────────────────────────────────────────────

function extractAnswers(answers = []) {
  const result = { email: null, name: null, phone: null, instagram: null, allText: [] };

  for (const ans of answers) {
    const type = ans.type;
    const field = (ans.field?.title || "").toLowerCase();

    let value = null;
    if (type === "email")             value = ans.email;
    else if (type === "phone_number") value = ans.phone_number;
    else if (type === "choice")       value = ans.choice?.label;
    else if (type === "choices")      value = ans.choices?.labels?.join(", ");
    else if (type === "number")       value = String(ans.number);
    else if (ans.text)                value = ans.text;

    if (!value) continue;

    result.allText.push(value);

    if (!result.email && (field.includes("email") || type === "email"))
      result.email = value;

    if (!result.name && (field.includes("nome") || field.includes("name")))
      result.name = value;

    if (!result.phone && (field.includes("número") || field.includes("numero") || field.includes("whats") || field.includes("telefone") || type === "phone_number"))
      result.phone = value;

    if (!result.instagram && (field.includes("instagram") || field.includes("@ da") || field.includes("marca")))
      result.instagram = value;
  }

  return result;
}

function getTagsFromAnswers(allText) {
  const fullText = allText.join(" | ").toLowerCase();
  return TAG_RULES
    .filter(r => fullText.includes(r.contains.toLowerCase()))
    .map(r => r.tag);
}

async function createOrUpdateContact({ email, name, phone, instagram }) {
  const body = { locationId: GHL_LOCATION_ID };
  if (email) body.email = email;
  if (phone) body.phone = phone;
  if (name) {
    const parts = name.trim().split(" ");
    body.firstName = parts[0];
    body.lastName = parts.slice(1).join(" ") || "";
  }
  if (instagram) {
    body.customFields = [{ key: "instagram", field_value: instagram }];
  }

  const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GHL_API_KEY}`,
      "Version": "2021-07-28"
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.contact?.id;
}

async function addTags(contactId, tags) {
  if (!tags.length) return;
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GHL_API_KEY}`,
      "Version": "2021-07-28"
    },
    body: JSON.stringify({ tags })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const answers = payload?.form_response?.answers || [];

    const { email, name, phone, instagram, allText } = extractAnswers(answers);
    const tags = getTagsFromAnswers(allText);

    console.log("📩 Nova resposta recebida");
    console.log("   Nome:", name);
    console.log("   Email:", email);
    console.log("   Telefone:", phone);
    console.log("   Instagram:", instagram);
    console.log("   Tags:", tags);

    if (!email) {
      console.warn("⚠️  Nenhum email encontrado, contato não criado.");
      return res.status(200).json({ ok: false, reason: "no email" });
    }

    const contactId = await createOrUpdateContact({ email, name, phone, instagram });
    console.log("✅ Contato criado/atualizado:", contactId);

    if (tags.length) {
      await addTags(contactId, tags);
      console.log("🏷️  Tags aplicadas:", tags);
    }

    res.status(200).json({ ok: true, contactId, tags });
  } catch (err) {
    console.error("❌ Erro:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/", (req, res) => res.send("✅ Servidor Typeform → GHL rodando!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
