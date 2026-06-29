# Azure OpenAI

Azure OpenAI hosts the OpenAI models inside your own Azure tenant, with
the data-residency, compliance, and private-network controls that come
with an Azure subscription. Useful for organizations that need a
provider-side data processing agreement or that already pay for Azure.

## Required env vars

```env
AI_PROVIDER=azure
AZURE_ENDPOINT=https://<resource>.openai.azure.com
AZURE_API_KEY=<api-key>
AZURE_DEPLOYMENT_NAME=<deployment-name>
AZURE_API_VERSION=2024-08-01-preview
```

`AZURE_ENDPOINT` is the resource endpoint shown on the Azure OpenAI
resource overview page, **without** a trailing slash and **without**
`/openai/deployments/...`. The deployment name is the model deployment
you created in the Azure portal (it does not have to match the underlying
model id).

`AZURE_API_VERSION` defaults to a recent preview if unset. Pin it
explicitly if your tenant's policy requires a stable API surface.

## Privacy and cost

Requests are processed inside the Azure tenant you deploy to, so
data-residency is governed by the region of the Azure OpenAI resource
and by your enterprise agreement with Microsoft. Prompts and responses
are not used to train foundation models. Cost is per token and matches
the underlying OpenAI pricing for the model you deployed; Azure bills
it under your existing subscription, not as a separate card charge.
Larger archives benefit from provisioned throughput units (PTUs) for
predictable latency.

## Troubleshooting

- **`404 Resource not found`** — `AZURE_ENDPOINT` is wrong, or the
  resource lives in a different subscription than the API key. Open
  the Azure portal, copy the endpoint from the resource overview, and
  confirm the key belongs to the same resource.
- **`DeploymentNotFound`** — `AZURE_DEPLOYMENT_NAME` does not match
  any deployed model. The Azure portal's Model deployments page lists
  the exact names; copy one and paste it into the env var.
- **`401 Unauthorized` / `403 Forbidden`** — the API key has been
  rotated, expired, or is restricted to specific deployments. In the
  Azure portal, open Keys and Endpoint, regenerate the key, and update
  `AZURE_API_KEY`.
