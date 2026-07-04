# OpenAI-compatible providers

Tagvico supports local or hosted servers implementing the OpenAI chat-completions API, including LM Studio, vLLM and llama.cpp.

1. Start the provider and load a model.
2. Choose **OpenAI compatible** in **Settings → AI provider**.
3. Enter the API base URL including `/v1`, for example `http://host.docker.internal:1234/v1` for LM Studio.
4. Enter the exact model identifier exposed by the server and an API key only when required.
5. Save and check `/api/health` to verify reachability.

For vLLM use `http://vllm:8000/v1` on a shared Docker network. For llama.cpp the default is commonly `http://host.docker.internal:8080/v1`. Linux Docker users may need an `extra_hosts` mapping or the host LAN address.

Local endpoints keep document text on infrastructure you control, but model downloads, telemetry and reverse proxies still define the privacy boundary. Use authentication and TLS outside a trusted Docker network.
