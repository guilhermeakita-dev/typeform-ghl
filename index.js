const express = require("express");
const app = express();
app.use(express.json());

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_BASE = "https://services.leadconnectorhq.com";

// ─── Mapeamento de respostas → tags ───────────────────────────────────────────
// Edite aqui para adicionar/remover tags conforme suas perguntas
const TAG_RULES = [
  // Exemplo: se a resposta CONTÉM o texto, aplica a tag
  { contains: "Menos de 1 ano",     tag: "tempo-mercado-menos-1-ano" },
  { contains: "1 a 3 anos",         tag: "tempo-mercado-1-3-anos" },
  { contains: "3 a 5 anos",         tag: "tempo-mercado-3-5-anos" },
  { contains: "Mais de 5 anos",     tag: "tempo-mercado-mais-5-anos" },
  // Adicione mais regras aqui conforme as respostas do seu Typeform
];
// ─────────────────────────────────────────────────────────────────────────────

function extractAnswers(answers = []) {
  const result = { email: null, name: null, phone: null, allText: [] };

  for (const ans of answers) {
    const type = ans.type;
    const field = ans.field?.title || "";

    let value = null;
    if (type === "email")        value = ans.email;
    else if (type === "text")    value = ans.text;
    else if (type === "phone_number") value = ans.phone_number;
    else if (type === "choice")  value = ans.choice?.label;
    else if (type === "choices") value = ans.choices?.labels?.join(", ");
    else if (type === "short_text" || type === "long_text") value = ans.text;

    if (!value) continue;
    result.allText.push(value);

    const f = field.toLowerCase();
    if (!result.email && (f.includes("email") || type === "email"))
      result.email = value;
    if (!result.name && (f.includes("nome") || f.includes("name")))
      result.name = value;
    if (!result.phone && (f.includes("tel") || f.includes("phone") || f.includes("whats")))
      result.phone = value;
  }

  return result;
}

function getTagsFromAnswers(allText) {
  const fullText = allText.join(" | ").toLowerCase();
  return TAG_RULES
    .filter(r => fullText.includes(r.contains.toLowerCase()))
    .map(r => r.tag);
}

async function createOrUpdateContact({ email, name, phone }) {
  const body = { locationId: GHL_LOCATION_ID };
  if (email) body.email = email;
  if (name)  body.firstName = name.split(" ")[0], body.lastName = name.split(" ").slice(1).join(" ");
  if (phone) body.phone = phone;

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

// ─── Endpoint principal ───────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const answers = payload?.form_response?.answers || [];

    const { email, name, phone, allText } = extractAnswers(answers);
    const tags = getTagsFromAnswers(allText);

    console.log("📩 Nova resposta recebida");
    console.log("   Email:", email);
    console.log("   Nome:", name);
    console.log("   Tags:", tags);

    if (!email) {
      console.warn("⚠️  Nenhum email encontrado, contato não criado.");
      return res.status(200).json({ ok: false, reason: "no email" });
    }

    const contactId = await createOrUpdateContact({ email, name, phone });
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
