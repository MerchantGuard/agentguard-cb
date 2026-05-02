# AgentGuard CB

> Idioma: **Português (Brasil)** · [English](README.md) · [Español (LATAM)](README.es.md)

Uma biblioteca tipada e determinística para montar payloads de evidência de chargeback no formato que a API de Disputes do Stripe espera, e deixá-los em estado `submit:false` para revisão humana do lojista antes do envio final. Open source pela [MerchantGuard](https://merchantguard.ai). Faz parte da família AgentGuard.

Seu agente de IA lança features. Os clientes contestam cobranças. Esta biblioteca compila evidência estruturada a partir dos seus próprios dados de produção, expõe os status de elegibilidade que o Stripe reporta (`qualified`, `requires_action`, `not_qualified`) e escreve um log de auditoria encadeado por hash. **Ela não envia disputas para a Visa, não é um Visa Third Party Agent, não está registrada no Visa TPA Registration Program, e não tem relação contratual ou técnica com a Visa Inc., Stripe, Inc. ou qualquer adquirente.** As referências a essas marcas são uso nominativo sob a Lanham Act e a doutrina articulada em *New Kids on the Block v. News America Publ'g, Inc.*, 971 F.2d 302 (9th Cir. 1992), para identificar as regras e APIs com as quais esta biblioteca foi projetada para interoperar.

```
npm install
cp .env.example .env.local           # preencha as chaves do Stripe, URL do banco, signing key
npm run db:migrate
npm run dev
# Configure seu webhook do Stripe para fazer POST em /api/webhooks/stripe
```

---

## Uso como biblioteca (npm)

```bash
npm install @merchantguard/agentguard-cb
```

```ts
import {
  evaluateVisaCe3Eligibility,
  buildStripeVisaCe3EnhancedEvidence,
  customerEvidenceBundleSchema,
} from '@merchantguard/agentguard-cb';

const bundle = customerEvidenceBundleSchema.parse(yourBundle);
const eligibility = evaluateVisaCe3Eligibility(bundle);
if (eligibility.qualified) {
  const payload = buildStripeVisaCe3EnhancedEvidence(bundle, eligibility.selectedPriors);
  // passe o payload para sua própria chamada do SDK do Stripe a dispute.update com submit:false
}
```

Imports por subpath também disponíveis para uso amigável com tree-shaking:

- `@merchantguard/agentguard-cb/evidence` — schemas + elegibilidade CE 3.0 + montagem de payload
- `@merchantguard/agentguard-cb/audit` — primitivas de auditoria encadeada com Ed25519
- `@merchantguard/agentguard-cb/pdf` — geração de PDF + verificação de manifest assinado
- `@merchantguard/agentguard-cb/adapters` — interface `EvidenceAdapter` + adapter de referência
- `@merchantguard/agentguard-cb/event-log` — log de eventos legível por humanos (v1.1)

---

## Log de eventos legível por humanos (v1.1)

Revisores de finanças e jurídico não leem cadeias criptográficas. Eles leem extratos. v1.1 adiciona uma camada de log de eventos legível: cada passo de um workflow de disputa gera um `Event` tipado, a cadeia é encadeada com SHA-256 e opcionalmente assinada com Ed25519, e a mesma cadeia é renderizada como texto plano, CSV ou JSON dependendo de quem está olhando.

```ts
import {
  InMemoryEventLogStore,
  renderEventLogText,
  verifyChain,
} from '@merchantguard/agentguard-cb/event-log';

const store = new InMemoryEventLogStore();
await store.append({
  payload: { type: 'webhook_received', data: { webhookEvent: 'charge.dispute.created' } },
  actor: 'system:agentguard-cb',
  disputeId: 'dp_001',
});
await store.append({
  payload: {
    type: 'ce3_eligibility_evaluated',
    data: {
      qualified: true,
      reasons: ['2 priors matched on IP and shipping_address'],
      selectedPriorChargeIds: ['ch_a', 'ch_b'],
      windowDaysMin: 120,
      windowDaysMax: 365,
    },
  },
  actor: 'system:agentguard-cb',
  disputeId: 'dp_001',
});

const events = await store.list('dp_001');
console.log(renderEventLogText(events));
// [2026-05-02T18:00:00Z] system:agentguard-cb  Stripe webhook received: charge.dispute.created
// [2026-05-02T18:00:01Z] system:agentguard-cb  Visa CE 3.0 eligibility evaluated: QUALIFIED
//                              Priors selected: ch_a + ch_b (window 120-365 days)
// (a saída do renderer é atualmente só em inglês. localização para português planejada para v1.2)

const verification = await verifyChain('dp_001', events);
// { eventsChecked: 2, hashChainValid: true, signaturesChecked: 0, signaturesValid: 0, errors: [] }
```

Mesmos dados, dois públicos. A versão chata ganha confiança antes da criptográfica.

---

## Uso a partir de um agente de IA (servidor MCP)

AgentGuard CB inclui um servidor stdio do Model Context Protocol para que agentes de IA (Claude Desktop, Cursor, Cline, Continue, etc.) possam chamar suas primitivas durante fluxos de codificação e operações. O servidor MCP é **read-only e puramente funcional**: nunca chama a API do Stripe, nunca escreve em um banco de dados e nunca envia uma disputa. O envio e a persistência continuam sendo responsabilidade do lojista, o que está alinhado com a postura do [LEGAL.pt-BR.md](./LEGAL.pt-BR.md).

**Tools expostas:**

- `evaluate_ce3_eligibility` — avalia um `CustomerEvidenceBundle` para Visa Compelling Evidence 3.0
- `build_ce3_evidence` — monta o payload `enhanced_evidence` no formato Stripe (retorna apenas o objeto tipado; você envia)
- `canonical_json_hash` — serialização JSON canônica + SHA-256 hex (primitiva de cadeia de auditoria)
- `verify_manifest_signature` — verifica uma assinatura Ed25519 sobre um `ManifestPayload` previamente gerado
- `append_event` (v1.1) — adiciona um evento tipado ao log legível por humanos
- `render_event_log` (v1.1) — renderiza a cadeia em `text` (texto plano), `csv` ou `json`
- `verify_chain` (v1.1) — percorre a cadeia e reporta evidência de adulteração
- `describe_agentguard_cb` — capacidades de alto nível, postura de segurança e status de patentes / licença

**Instalação no Claude Desktop:** adicione isto em `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentguard-cb": {
      "command": "npx",
      "args": ["-y", "@merchantguard/agentguard-cb", "mcp"]
    }
  }
}
```

**Instalação no Cursor:** adicione isto em `~/.cursor/mcp.json` com o mesmo formato. A mesma config também funciona para Cline, Continue, Windsurf e qualquer outro cliente que fale stdio MCP.

**Teste de um comando só pelo terminal:**

```bash
npx -y @merchantguard/agentguard-cb mcp
```

Vai iniciar um servidor stdio. Mande `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}` pelo stdin para ver o catálogo de tools.

---

## O que esta ferramenta NÃO faz

- **NÃO gera, fabrica, embeleza ou modifica evidência.** Apenas templates estáticos. Bloqueado em nível de PR no CI (greps por `openai`, `anthropic`, `gemini`, `groq`, `mistral`, `llama`, `cohere`, `gpt-`, `claude-`, `prompt:`, `narrative`, `freeform_text`, `uncategorized_text`).
- **NÃO usa LLMs para escrever narrativas de disputa.** Sem dependências em runtime de `openai`, `anthropic`, `langchain`, `gemini` ou `ai`. Os imports estão bloqueados no CI.
- **NÃO faz afirmações legais em nome do lojista.** Isto é um compilador de dados, não uma autoridade legal.
- **NÃO garante ganhar disputas, qualificar para CE 3.0, nem qualquer resultado específico de issuer ou adquirente.** A qualificação CE 3.0 é determinada pelo Visa Resolve Online (VROL) e pelo banco emissor sob as Visa Core Rules; os resultados estão fora do controle desta biblioteca. Veja o documento da Visa [Compelling Evidence 3.0 Merchant Readiness](https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf) (março 2023) e as Visa Core Rules para os critérios autoritativos.
- **NÃO é endossado, certificado, auditado nem "aprovado" pela Visa Inc., Mastercard Inc., Stripe Inc. nem qualquer adquirente.**
- **NÃO substitui as obrigações próprias do lojista em matéria legal, de compliance ou com seu adquirente.**

Se você quer narrativas de disputa assistidas por LLM, esta é a ferramenta errada. AgentGuard CB é a contracorrente deliberada: estruturada, determinística, auditável.

---

## Como funciona

```
Webhook do Stripe (charge.dispute.created)
   ↓
Insert event ID com unique constraint  (idempotente. replays retornam 200)
   ↓
Upsert dispute row no banco da tool
   ↓
Enfileirar job collect_evidence
   ↓ (processador em background)
Adapter extrai evidência do seu banco de produção → CustomerEvidenceBundle validado por zod
   ↓
SHA-256 do bundle JSON canônico → audit_log
   ↓
PDF gerado a partir de templates estáticos (sem narrativa)
   ↓
SHA-256 dos bytes do PDF → audit_log
   ↓
Manifest assinado com Ed25519 incorporado como anexo manifest.signed.json
   ↓
Stage no Stripe (submit: false) → registra status de elegibilidade CE 3.0
   ↓ (PORTÃO DE REVISÃO HUMANA. o admin aprova no dashboard)
Envio final (submit: true)
```

---

## Implementação Stripe Visa CE 3.0

Esta tool implementa o caminho de evidência aprimorada do Visa Compelling Evidence 3.0 do Stripe. **A referência canônica da nossa implementação CE 3.0 é `docs/verified-facts-stripe-visa-ce3.md`.** Esse arquivo é um apêndice de fatos verificados com fontes primárias (Stripe API ref + PDF Visa Merchant Readiness) e as discrepâncias entre eles marcadas inline.

Fatos-chave codificados no código:

- **CE 3.0 vive em** `evidence.enhanced_evidence.visa_compelling_evidence_3` na API Dispute Update.
- **Exatamente 2 transações anteriores não-disputadas** são necessárias. Cada anterior precisa incluir `charge`. A transação disputada NÃO inclui `charge`.
- **Janela**: o Stripe documenta `120-364 dias` (o validador que seguimos); a Visa publicou `120-365 dias`. Usamos o limite mais estrito do Stripe. a API rejeita qualquer coisa que o validador do Stripe rejeite, independentemente do que o PDF da Visa diga.
- **Elementos de correspondência**: pelo menos 2 de (IP, device fingerprint, device ID, email, account ID, endereço de entrega) precisam coincidir nas 3 transações, e um deve ser IP ou device. Device fingerprint + device ID sozinhos são INVÁLIDOS segundo o Stripe.
- **Portão de elegibilidade**: marca Visa + network reason code `10.4` + `enhanced_eligibility_types` inclui `visa_compelling_evidence_3`. Qualquer outra coisa vai para evidência padrão.
- **`submit: false` primeiro, sempre.** O Stripe por padrão envia imediatamente; staging permite inspecionar `evidence_details.enhanced_eligibility.visa_compelling_evidence_3.status` antes de finalizar.
- **Sem paralelo Mastercard.** Em abril de 2026, a API do Stripe não tem namespace `enhanced_evidence.mastercard_first_party_trust`. Disputas de friendly-fraud Mastercard usam os campos de evidência padrão.

---

## Versão do SDK Stripe

Não fixamos um `apiVersion` no cliente Stripe. Rode:

```bash
npm run stripe:version
```

Isto imprime a versão instalada do pacote `stripe` + `Stripe.API_VERSION` (o default fixado do SDK). CE 3.0 requer `>= 2024-10-28.acacia`. O script sai com código 1 se o SDK instalado for mais antigo.

---

## Adapters

Adapters extraem evidência do lojista de onde quer que o lojista a guarde. A interface está em `lib/evidence/adapter.ts`. Enviamos um adapter de referência Stripe-only (`lib/evidence/adapter.ts → stripeOnlyAdapter`) que usa apenas dados da API do Stripe. Não consegue fornecer IPs de cliente, device fingerprints nem eventos de uso de produto porque o Stripe não os armazena. o gerador de PDF inclui avisos de "dados não disponíveis" no lugar.

Para lojistas que determinam de forma independente que uma disputa pode ser elegível para Visa CE 3.0, você pode precisar de um adapter que consiga popular os campos que a API do Stripe exige a partir dos seus próprios sistemas. Veja `docs/adapters.md`.

---

## Setup do webhook

```
Stripe Dashboard → Developers → Webhooks → Add endpoint
  URL: https://your-domain.com/api/webhooks/stripe
  Events:
    charge.dispute.created
    charge.dispute.updated
    charge.dispute.closed
```

O handler do webhook roda em runtime Node (NÃO Edge) por causa do requisito de raw-body da assinatura do Stripe. Veja `app/api/webhooks/stripe/route.ts`.

---

## Modo teste

O Stripe fornece fixtures de teste CE 3.0 para ambientes sandbox. O modo teste do Stripe valida os requisitos de elementos de correspondência conforme as regras CE 3.0, mas não valida a elegibilidade de prior charges (marca Visa, reason code, janela de dias).

A mecânica interna do modo teste, incluindo as strings de simulação de outcome do Stripe, está documentada em `docs/stripe-test-mode-ce3.md` (referência para developers apenas. não para uso em produção).

---

## Deployment

Referência: Vercel + Supabase. Veja `docs/vercel-supabase-deployment.md`.

Processador de jobs: configure Vercel Cron para fazer POST em `/api/jobs/process` a cada 30 segundos com `Authorization: Bearer ${JOB_PROCESSOR_SECRET}`.

---

## Testes

```bash
npm test
```

Cobertura:

- Elegibilidade CE 3.0 (janela, elementos de correspondência, fronteiras de dia 119/120/364/365)
- Formato exato do payload do Stripe
- Staging `submit: false` obrigatório
- Idempotência do webhook
- Cadeia de hash do log de auditoria
- Assinatura do manifest do PDF

CI roda typecheck, lint, test, build e grep guards para padrões proibidos (`uncategorized_text`, `openai|anthropic|langchain`, campos `narrative/freeform`).

---

## Regras de Disputas Visa

As Visa Core Rules e as Visa Product and Service Rules governam os requisitos de evidência para disputas. Enviar evidência falsificada ou conscientemente imprecisa viola essas regras e pode também violar estatutos UDAP estaduais (CA Bus. & Prof. Code § 17200, NY Gen. Bus. Law § 349, FL Stat. § 501.204) ou 18 U.S.C. § 1343 (wire fraud) onde os elementos do estatuto se cumpram.

Guia para lojistas: https://usa.visa.com/support/small-business/regulations-fees.html

PDF do CE 3.0 Merchant Readiness (março 2023): https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf

---

## Stripe Services Agreement

A Seção 8 (Disputes) governa como os lojistas respondem. https://stripe.com/legal/ssa

---

## Resumo legal

- **AS IS, SEM GARANTIA.** Veja `LICENSE` (MIT limpa).
- O lojista é o único responsável pela exatidão de toda a evidência e pela conformidade com a lei aplicável.
- Sem garantia de resultado. A qualificação CE 3.0 é determinada pelo Stripe, pelo banco emissor e pelo Visa Resolve Online. não por esta tool.
- Enviar evidência conscientemente falsa pode dar origem a responsabilidade civil ou criminal. Consulte um advogado.
- Não é assessoria legal.

Detalhe em [LEGAL.md](./LEGAL.md) (inglês. tradução para português em breve). Diretrizes de uso não-vinculantes em [DISCLAIMER.md](./DISCLAIMER.md). Aviso de patentes em [PATENTS.md](./PATENTS.md). Postura de controle de exportações em [EXPORT.md](./EXPORT.md). Sign-off de contribuidores em [DCO.md](./DCO.md). Privacidade e tratamento de dados para canais de suporte em LEGAL.md § "Privacy and data protection".

---

Powered by **MerchantGuard**. a camada de compliance para a economia de agentes de IA.
