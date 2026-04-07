const express = require('express');
const app = express();
app.use(express.json());

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

// ─────────────────────────────────────────────
// Utilitário: extrai campos do payload Typeform
// ─────────────────────────────────────────────
function extrairCampos(body) {
  const answers = body.form_response?.answers || [];
  const fields = body.form_response?.definition?.fields || [];

  const mapa = {};
  answers.forEach(answer => {
    const field = fields.find(f => f.id === answer.field.id);
    if (!field) return;
    const titulo = field.title.trim().toLowerCase();
    let valor = null;
    if (answer.type === 'text' || answer.type === 'short_text' || answer.type === 'long_text') {
      valor = answer[answer.type];
    } else if (answer.type === 'email') {
      valor = answer.email;
    } else if (answer.type === 'phone_number') {
      valor = answer.phone_number;
    } else if (answer.type === 'choice') {
      valor = answer.choice?.label;
    } else if (answer.type === 'choices') {
      valor = answer.choices?.labels?.join(', ');
    }
    mapa[titulo] = valor;

    console.log(`   [${answer.type}] "${field.title}" = ${valor}`);
  });

  fields.forEach(field => {
    if (field.properties?.fields) {
      field.properties.fields.forEach(subField => {
        const subAnswer = answers.find(a => a.field.id === subField.id);
        if (!subAnswer) return;
        const titulo = subField.title.trim().toLowerCase();
        let valor = null;
        if (subAnswer.type === 'text' || subAnswer.type === 'short_text') {
          valor = subAnswer[subAnswer.type];
        } else if (subAnswer.type === 'email') {
          valor = subAnswer.email;
        } else if (subAnswer.type === 'phone_number') {
          valor = subAnswer.phone_number;
        }
        mapa[titulo] = valor;
        console.log(`   [sub][${subAnswer.type}] "${subField.title}" = ${valor}`);
      });
    }
  });

  return mapa;
}

// ─────────────────────────────────────────────
// Utilitário: tag de faturamento
// ─────────────────────────────────────────────
function tagFaturamento(valor) {
  if (!valor) return null;
  const v = valor.toLowerCase();
  if (v.includes('ainda não faturo') || v.includes('ainda nao faturo')) return 'Ainda não faturo';
  if (v.includes('10.000') && v.includes('30.000') || v.includes('entre 10k')) return 'entre 10k a 30k';
  if (v.includes('30.000') || v.includes('acima de 30k') || v.includes('mais de 30')) return 'acima de 30k';
  if (v.includes('2.000') || v.includes('10.000') || v.includes('menos de 10k')) return 'menos de 10k';
  return valor;
}

// ─────────────────────────────────────────────
// Utilitário: cria/atualiza contato no GHL
// ─────────────────────────────────────────────
async function upsertContato(dados, tags) {
  const payload = {
    locationId: GHL_LOCATION_ID,
    tags: tags.filter(Boolean),
  };

  if (dados.email) payload.email = dados.email;
  if (dados.nome) {
    const partes = dados.nome.trim().split(' ');
    payload.firstName = partes[0];
    payload.lastName = partes.slice(1).join(' ') || '';
  }
  if (dados.telefone) payload.phone = dados.telefone;

  const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  console.log('GHL response:', JSON.stringify(json, null, 2));
  return json;
}

// ─────────────────────────────────────────────
// WEBHOOK 1 — Form original (Bio Instagram)
// ─────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  console.log('\n📥 [/webhook] Nova submissão recebida');
  res.sendStatus(200);

  try {
    const campos = extrairCampos(req.body);

    const nome     = campos['qual seu nome?'] || campos['nome completo'] || campos['nome'];
    const email    = campos['qual seu melhor email?'] || campos['e-mail'] || campos['email'];
    const telefone = campos['whatsapp (com ddd)'] || campos['telefone'] || campos['phone'];
    const faturamento = campos['qual é o faturamento médio mensal da sua marca?']
                     || campos['faturamento']
                     || Object.entries(campos).find(([k]) => k.includes('faturamento'))?.[1];

    const tags = ['aplicou bio type', 'preencheu forms bio ig raphael'];
    const tagFat = tagFaturamento(faturamento);
    if (tagFat) tags.push(tagFat);

    console.log('📌 Dados:', { nome, email, telefone, faturamento, tags });
    await upsertContato({ nome, email, telefone }, tags);

  } catch (err) {
    console.error('Erro no /webhook:', err.message);
  }
});

// ─────────────────────────────────────────────
// WEBHOOK 2 — Form Aplicação Aula Zoom 07/04
// ─────────────────────────────────────────────
app.post('/webhook2', async (req, res) => {
  console.log('\n📥 [/webhook2] Nova submissão recebida');
  res.sendStatus(200);

  try {
    const campos = extrairCampos(req.body);

    const nome     = campos['nome completo'] || campos['nome'];
    const email    = campos['e-mail'] || campos['email'];
    const telefone = campos['whatsapp (com ddd)'] || campos['telefone'];
    const faturamento = Object.entries(campos).find(([k]) => k.includes('faturamento'))?.[1];

    const tags = ['aplicou org type aula zoom 07/04/2026'];
    const tagFat = tagFaturamento(faturamento);
    if (tagFat) tags.push(tagFat);

    console.log('📌 Dados:', { nome, email, telefone, faturamento, tags });
    await upsertContato({ nome, email, telefone }, tags);

  } catch (err) {
    console.error('Erro no /webhook2:', err.message);
  }
});

// ─────────────────────────────────────────────
// WEBHOOK 3 — Form Aplicação Aula Zoom Pago 07/04
// ─────────────────────────────────────────────
app.post('/webhook3', async (req, res) => {
  console.log('\n📥 [/webhook3] Nova submissão recebida');
  res.sendStatus(200);

  try {
    const campos = extrairCampos(req.body);

    const nome     = campos['nome completo'] || campos['nome'];
    const email    = campos['e-mail'] || campos['email'];
    const telefone = campos['whatsapp (com ddd)'] || campos['telefone'];
    const faturamento = Object.entries(campos).find(([k]) => k.includes('faturamento'))?.[1];

    const tags = ['aplicou pago type aula zoom 07/04/2026'];
    const tagFat = tagFaturamento(faturamento);
    if (tagFat) tags.push(tagFat);

    console.log('📌 Dados:', { nome, email, telefone, faturamento, tags });
    await upsertContato({ nome, email, telefone }, tags);

  } catch (err) {
    console.error('Erro no /webhook3:', err.message);
  }
});

// ─────────────────────────────────────────────
// WEBHOOK 4 — Form Pós Aula Zoom 07/04
// ─────────────────────────────────────────────
app.post('/webhook4', async (req, res) => {
  console.log('\n📥 [/webhook4] Nova submissão recebida');
  res.sendStatus(200);

  try {
    const campos = extrairCampos(req.body);

    const nome     = campos['nome completo'] || campos['nome'];
    const email    = campos['e-mail'] || campos['email'];
    const telefone = campos['whatsapp (com ddd)'] || campos['telefone'];
    const faturamento = Object.entries(campos).find(([k]) => k.includes('faturamento'))?.[1];

    const tags = ['aplicou pós aula zoom 07/04/2026'];
    const tagFat = tagFaturamento(faturamento);
    if (tagFat) tags.push(tagFat);

    console.log('📌 Dados:', { nome, email, telefone, faturamento, tags });
    await upsertContato({ nome, email, telefone }, tags);

  } catch (err) {
    console.error('Erro no /webhook4:', err.message);
  }
});

// ─────────────────────────────────────────────
app.get('/', (req, res) => res.send('Servidor online ✅'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
