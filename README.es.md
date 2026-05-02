# AgentGuard CB

> Idioma: **Español (LATAM)** · [English](README.md) · [Português (Brasil)](README.pt-BR.md)

Una librería tipada y determinística para ensamblar payloads de evidencia de chargeback en el formato que la API de Disputas de Stripe espera, y dejarlos en estado `submit:false` para revisión humana del comerciante antes del envío final. Código abierto por [MerchantGuard](https://merchantguard.ai). Parte de la familia AgentGuard.

Tu agente de IA lanza funcionalidades. Los clientes disputan cargos. Esta librería compila evidencia estructurada desde tu propia data de producción, expone los estados de elegibilidad que reporta Stripe (`qualified`, `requires_action`, `not_qualified`) y escribe un registro de auditoría encadenado por hash. **No envía disputas a Visa, no es un Visa Third Party Agent, no está registrado en el Visa TPA Registration Program, y no tiene relación contractual ni técnica con Visa Inc., Stripe, Inc. ni ningún acquirer.** Las referencias a esas marcas son uso nominativo bajo la Lanham Act y la doctrina articulada en *New Kids on the Block v. News America Publ'g, Inc.*, 971 F.2d 302 (9th Cir. 1992), para identificar las reglas y APIs con las que esta librería está diseñada para interoperar.

```
npm install
cp .env.example .env.local           # llena las llaves de Stripe, URL de DB, signing key
npm run db:migrate
npm run dev
# Configura tu webhook de Stripe para hacer POST a /api/webhooks/stripe
```

---

## Uso como librería (npm)

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
  // pasa el payload a tu propia llamada del SDK de Stripe a dispute.update con submit:false
}
```

Imports por subpath también disponibles para uso amigable con tree-shaking:

- `@merchantguard/agentguard-cb/evidence` — schemas + elegibilidad CE 3.0 + ensamblado de payload
- `@merchantguard/agentguard-cb/audit` — primitivas de auditoría encadenada con Ed25519
- `@merchantguard/agentguard-cb/pdf` — generación de PDF + verificación de manifest firmado
- `@merchantguard/agentguard-cb/adapters` — interfaz `EvidenceAdapter` + adapter de referencia
- `@merchantguard/agentguard-cb/event-log` — log de eventos legible por humanos (v1.1)

---

## Log de eventos legible por humanos (v1.1)

Los revisores de finanzas y legal no leen cadenas criptográficas. Leen estados de cuenta. v1.1 agrega una capa de log de eventos legible: cada paso de un workflow de disputa genera un `Event` tipado, la cadena está encadenada con SHA-256 y opcionalmente firmada con Ed25519, y la misma cadena se renderiza como texto plano, CSV o JSON dependiendo de quién esté mirando.

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
// (output del renderer es actualmente solo en inglés. localización al español planificada para v1.2)

const verification = await verifyChain('dp_001', events);
// { eventsChecked: 2, hashChainValid: true, signaturesChecked: 0, signaturesValid: 0, errors: [] }
```

Misma data, dos audiencias. La versión aburrida gana confianza antes que la criptográfica.

---

## Uso desde un agente de IA (servidor MCP)

AgentGuard CB incluye un servidor stdio del Model Context Protocol para que agentes de IA (Claude Desktop, Cursor, Cline, Continue, etc.) puedan invocar sus primitivas durante flujos de codificación y operaciones. El servidor MCP es **read-only y puramente funcional**: nunca llama a la API de Stripe, nunca escribe a una base de datos y nunca envía una disputa. El envío y la persistencia siguen siendo responsabilidad del comerciante, lo cual concuerda con la postura de [LEGAL.es.md](./LEGAL.es.md).

**Tools expuestas:**

- `evaluate_ce3_eligibility` — evalúa un `CustomerEvidenceBundle` para Visa Compelling Evidence 3.0
- `build_ce3_evidence` — ensambla el payload `enhanced_evidence` en formato Stripe (devuelve solo el objeto tipado; tú lo envías)
- `canonical_json_hash` — serialización JSON canónica + SHA-256 hex (primitiva de cadena de auditoría)
- `verify_manifest_signature` — verifica una firma Ed25519 sobre un `ManifestPayload` previamente generado
- `append_event` (v1.1) — agrega un evento tipado al log legible por humanos
- `render_event_log` (v1.1) — renderiza la cadena en `text` (texto plano), `csv` o `json`
- `verify_chain` (v1.1) — recorre la cadena y reporta evidencia de manipulación
- `describe_agentguard_cb` — capacidades de alto nivel, postura de seguridad y estado de patentes / licencia

**Instalación en Claude Desktop:** agrega esto a `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

**Instalación en Cursor:** agrega esto a `~/.cursor/mcp.json` con la misma forma. La misma config también funciona para Cline, Continue, Windsurf y cualquier otro cliente que hable stdio MCP.

**Test de un solo comando desde terminal:**

```bash
npx -y @merchantguard/agentguard-cb mcp
```

Iniciará un servidor stdio. Manda `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}` por stdin para ver el catálogo de tools.

---

## Lo que esta herramienta NO hace

- **NO genera, fabrica, embellece ni modifica evidencia.** Solo plantillas estáticas. Bloqueado a nivel de PR en CI (greps por `openai`, `anthropic`, `gemini`, `groq`, `mistral`, `llama`, `cohere`, `gpt-`, `claude-`, `prompt:`, `narrative`, `freeform_text`, `uncategorized_text`).
- **NO usa LLMs para escribir narrativas de disputa.** Sin dependencias en runtime de `openai`, `anthropic`, `langchain`, `gemini` o `ai`. Los imports están bloqueados en CI.
- **NO hace afirmaciones legales en nombre del comerciante.** Esto es un compilador de datos, no una autoridad legal.
- **NO garantiza ganar disputas, calificar para CE 3.0, ni ningún resultado específico de issuer o acquirer.** La calificación CE 3.0 la determina Visa Resolve Online (VROL) y el banco emisor bajo las Visa Core Rules; los resultados están fuera del control de esta librería. Ver el documento de Visa [Compelling Evidence 3.0 Merchant Readiness](https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf) (marzo 2023) y las Visa Core Rules para los criterios autoritativos.
- **NO está endosado, certificado, auditado ni "aprobado" por Visa Inc., Mastercard Inc., Stripe Inc. ni ningún acquirer.**
- **NO sustituye las obligaciones propias del comerciante en materia legal, de cumplimiento ni con su acquirer.**

Si quieres narrativas de disputa asistidas por LLM, esta es la herramienta equivocada. AgentGuard CB es la contracorriente deliberada: estructurada, determinística, auditable.

---

## Cómo funciona

```
Webhook de Stripe (charge.dispute.created)
   ↓
Insert event ID con unique constraint  (idempotente. los replays devuelven 200)
   ↓
Upsert dispute row en la DB de la tool
   ↓
Encolar job collect_evidence
   ↓ (procesador en background)
Adapter extrae evidencia de tu DB de producción → CustomerEvidenceBundle validado por zod
   ↓
SHA-256 del bundle JSON canónico → audit_log
   ↓
PDF generado desde plantillas estáticas (sin narrativa)
   ↓
SHA-256 de los bytes del PDF → audit_log
   ↓
Manifest firmado con Ed25519 incrustado como adjunto manifest.signed.json
   ↓
Stage en Stripe (submit: false) → registra estado de elegibilidad CE 3.0
   ↓ (PUERTA DE REVISIÓN HUMANA. el admin aprueba en el dashboard)
Envío final (submit: true)
```

---

## Implementación de Stripe Visa CE 3.0

Esta tool implementa el path de evidencia mejorada de Visa Compelling Evidence 3.0 de Stripe. **La referencia canónica de nuestra implementación CE 3.0 es `docs/verified-facts-stripe-visa-ce3.md`.** Ese archivo es un apéndice de hechos verificados con fuentes primarias (Stripe API ref + Visa Merchant Readiness PDF) y las discrepancias entre ellos marcadas inline.

Hechos clave codificados en el código:

- **CE 3.0 vive en** `evidence.enhanced_evidence.visa_compelling_evidence_3` en la API Dispute Update.
- **Exactamente 2 transacciones previas no disputadas** son requeridas. Cada previa debe incluir `charge`. La transacción disputada NO incluye `charge`.
- **Ventana**: Stripe documenta `120-364 días` (el validador que seguimos); Visa publicó `120-365 días`. Usamos el límite más estricto de Stripe. la API rechaza cualquier cosa que el validador de Stripe rechace, sin importar lo que diga el PDF de Visa.
- **Elementos de coincidencia**: al menos 2 de (IP, device fingerprint, device ID, email, account ID, dirección de envío) deben coincidir entre las 3 transacciones, y uno debe ser IP o device. Device fingerprint + device ID solos son INVÁLIDOS según Stripe.
- **Puerta de elegibilidad**: marca Visa + network reason code `10.4` + `enhanced_eligibility_types` incluye `visa_compelling_evidence_3`. Cualquier otra cosa va a evidencia estándar.
- **`submit: false` primero, siempre.** Stripe por defecto envía inmediatamente; usar staging permite inspeccionar `evidence_details.enhanced_eligibility.visa_compelling_evidence_3.status` antes de finalizar.
- **Sin paralelo en Mastercard.** A abril de 2026, la API de Stripe no tiene namespace `enhanced_evidence.mastercard_first_party_trust`. Las disputas de friendly-fraud de Mastercard usan los campos de evidencia estándar.

---

## Versión del SDK de Stripe

No hardcodeamos un `apiVersion` en el cliente Stripe. Corre:

```bash
npm run stripe:version
```

Esto imprime la versión instalada del paquete `stripe` + `Stripe.API_VERSION` (el default fijado del SDK). CE 3.0 requiere `>= 2024-10-28.acacia`. El script sale con código 1 si el SDK instalado es más viejo.

---

## Adapters

Los adapters extraen evidencia del comerciante desde donde sea que el comerciante la guarde. La interfaz está en `lib/evidence/adapter.ts`. Enviamos un adapter de referencia Stripe-only (`lib/evidence/adapter.ts → stripeOnlyAdapter`) que usa solo data de la API de Stripe. No puede proveer IPs de cliente, device fingerprints ni eventos de uso de producto porque Stripe no los almacena. el generador de PDF incluye warnings de "data no disponible" en su lugar.

Para comerciantes que determinan independientemente que una disputa puede ser elegible para Visa CE 3.0, puedes necesitar un adapter que pueda poblar los campos que la API de Stripe requiere desde tus propios sistemas. Ver `docs/adapters.md`.

---

## Setup del webhook

```
Stripe Dashboard → Developers → Webhooks → Add endpoint
  URL: https://your-domain.com/api/webhooks/stripe
  Events:
    charge.dispute.created
    charge.dispute.updated
    charge.dispute.closed
```

El handler del webhook corre en runtime Node (NO Edge) por el requerimiento de raw-body de la firma de Stripe. Ver `app/api/webhooks/stripe/route.ts`.

---

## Modo test

Stripe provee fixtures de test CE 3.0 para entornos sandbox. El modo test de Stripe valida los requerimientos de elementos de coincidencia según las reglas CE 3.0 pero no valida la elegibilidad de prior charges (marca Visa, reason code, ventana de días).

La mecánica interna del modo test, incluyendo los strings de simulación de outcome de Stripe, está documentada en `docs/stripe-test-mode-ce3.md` (referencia para developers solamente. no para uso en producción).

---

## Deployment

Referencia: Vercel + Supabase. Ver `docs/vercel-supabase-deployment.md`.

Procesador de jobs: configura Vercel Cron para hacer POST a `/api/jobs/process` cada 30 segundos con `Authorization: Bearer ${JOB_PROCESSOR_SECRET}`.

---

## Tests

```bash
npm test
```

Cobertura:

- Elegibilidad CE 3.0 (ventana, elementos de coincidencia, fronteras de día 119/120/364/365)
- Forma exacta del payload de Stripe
- Staging `submit: false` requerido
- Idempotencia del webhook
- Cadena de hash del log de auditoría
- Firma del manifest del PDF

CI corre typecheck, lint, test, build y grep guards para patrones prohibidos (`uncategorized_text`, `openai|anthropic|langchain`, campos `narrative/freeform`).

---

## Reglas de Disputas Visa

Las Visa Core Rules y las Visa Product and Service Rules gobiernan los requerimientos de evidencia para disputas. Enviar evidencia falsificada o conscientemente inexacta viola estas reglas y puede también violar estatutos UDAP estatales (CA Bus. & Prof. Code § 17200, NY Gen. Bus. Law § 349, FL Stat. § 501.204) o 18 U.S.C. § 1343 (wire fraud) cuando se cumplen los elementos del estatuto.

Guía para comerciantes: https://usa.visa.com/support/small-business/regulations-fees.html

PDF de CE 3.0 Merchant Readiness (marzo 2023): https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf

---

## Stripe Services Agreement

La Sección 8 (Disputes) gobierna cómo los comerciantes responden. https://stripe.com/legal/ssa

---

## Resumen legal

- **AS IS, SIN GARANTÍA.** Ver `LICENSE` (MIT limpia).
- El comerciante es el único responsable de la exactitud de toda la evidencia y del cumplimiento con la ley aplicable.
- Sin garantía de resultado. La calificación CE 3.0 la determina Stripe, el banco emisor y Visa Resolve Online. no esta tool.
- Enviar evidencia conscientemente falsa puede dar lugar a responsabilidad civil o penal. Consulta a un abogado.
- No es asesoría legal.

Detalle en [LEGAL.md](./LEGAL.md) (inglés. traducción al español próximamente). Guías de uso no vinculantes en [DISCLAIMER.md](./DISCLAIMER.md). Aviso de patentes en [PATENTS.md](./PATENTS.md). Postura de control de exportaciones en [EXPORT.md](./EXPORT.md). Sign-off de contribuyentes en [DCO.md](./DCO.md). Privacidad y manejo de datos para canales de soporte en LEGAL.md § "Privacy and data protection".

---

Powered by **MerchantGuard**. la capa de cumplimiento para la economía de agentes de IA.
