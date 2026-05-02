---
name: Search & Scraping
description: Monitoramento e extração de anúncios de veículos seminovos em plataformas brasileiras
slug: search-scraping
schema: agentcompanies/v1
version: 1.0.0
tags:
  - scraping
  - data-extraction
  - scraper-agent
---

# Search & Scraping

Skill do agente Scraper para monitorar e extrair anúncios de veículos seminovos premium nas principais plataformas brasileiras.

## Plataformas Monitoradas

### OLX Autos (olx.com.br)
- **Método**: API REST não-oficial + fallback HTML parsing
- **Rate limit**: Máx 60 requests/minuto com backoff exponencial
- **Filtros**: Categoria veículos, preço min/max, ano min, km max, cidade/estado
- **Campos extraídos**: título, preço, ano, km, câmbio, combustível, cor, placa parcial, fotos, vendedor (PF/PJ), telefone, localização, data publicação

### WebMotors (webmotors.com.br)
- **Método**: API pública de busca + parsing de página de detalhe
- **Rate limit**: Máx 30 requests/minuto
- **Filtros**: Marca, modelo, versão, ano, preço, km, cidade
- **Campos extras**: Código FIPE do anúncio, opcionais do veículo, financiamento disponível

### iCarros (icarros.com.br)
- **Método**: HTML parsing com headless browser (Playwright)
- **Rate limit**: Máx 20 requests/minuto (mais agressivo contra bots)
- **Campos extras**: Avaliação do vendedor, histórico de preço (quando disponível)

### Mercado Livre (mercadolivre.com.br)
- **Método**: API oficial ML (requer app_id) + scraping complementar
- **Rate limit**: Conforme quota da API (geralmente 10k calls/dia)
- **Campos extras**: Reputação do vendedor, quantidade vendida, perguntas/respostas

## Schema de Anúncio Extraído

```json
{
  "source": "olx | webmotors | icarros | mercadolivre",
  "source_id": "string",
  "source_url": "string",
  "title": "string",
  "brand": "string",
  "model": "string",
  "version": "string",
  "year_manufacture": 2024,
  "year_model": 2025,
  "mileage_km": 15000,
  "price_brl": 250000,
  "transmission": "automatic | manual",
  "fuel": "flex | gasoline | diesel | electric | hybrid",
  "color": "string",
  "plate_partial": "ABC*D**",
  "city": "string",
  "state": "SP",
  "seller_type": "pj | pf",
  "seller_name": "string",
  "seller_phone": "string",
  "photos": ["url1", "url2"],
  "optionals": ["string"],
  "published_at": "ISO 8601",
  "scraped_at": "ISO 8601",
  "fipe_code": "string | null"
}
```

## Critérios de Filtragem (Pré-análise)

O Scraper aplica filtros antes de enviar ao Analista:

### Critérios Obrigatórios
- Ano modelo >= ano atual - 3 (ex: 2023+ em 2026)
- KM <= 60.000
- Preço entre R$ 80.000 e R$ 400.000
- Câmbio automático (ou CVT)
- Vendedor PJ (lojista) — preferencial

### Marcas/Modelos Target (configurável)
- **Premium**: Audi (A3, A4, Q3, Q5), BMW (320i, X1, X3), Mercedes (A200, C180, GLA)
- **Nacional Premium**: Toyota Corolla Cross, VW Taos, Jeep Compass
- **Volume**: Honda Civic, Toyota Corolla, VW Jetta

### Red Flags (descarta automaticamente)
- Anúncio sem fotos
- Preço 40%+ abaixo da FIPE (possível fraude/sinistro)
- Texto menciona "batido", "sinistrado", "leilão", "recuperado"
- Vendedor PF com múltiplos anúncios simultâneos (possível cambista)

## Deduplicação

- Hash por: marca + modelo + ano + km_range(±500) + cidade + preço_range(±5%)
- Se mesmo veículo aparece em múltiplas plataformas, manter o com menor preço como principal e os outros como `alternatives`
- TTL de deduplicação: 30 dias

## Rotina de Execução

- **Frequência**: A cada 4 horas (0 */4 * * *)
- **Ordem**: OLX → WebMotors → iCarros → ML (por volume decrescente)
- **Timeout**: 15 minutos por plataforma, 45 minutos total
- **Em caso de falha**: Retry 2x com backoff, depois notifica CTO
- **Output**: Novos anúncios salvos em `deals` (status: `discovered`) + notificação ao CTO

## Anti-Bot / Resiliência

- Rotação de User-Agent a cada request
- Proxy rotation quando disponível (PROXY_URL env)
- Delays aleatórios entre 2-5s entre requests
- CAPTCHA detection → pausa + alerta ao CTO
- Respeitar robots.txt quando aplicável
- Backoff exponencial em caso de 429/503

## Métricas

- `scraper_runs_total` — total de execuções
- `scraper_listings_found` — anúncios encontrados por plataforma
- `scraper_listings_new` — anúncios novos (não duplicados)
- `scraper_errors` — erros por plataforma
- `scraper_latency_seconds` — tempo de execução por plataforma
