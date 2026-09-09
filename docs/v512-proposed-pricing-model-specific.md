# v512 — Proposed AI Video pricing (model-specific margins) — PROPOSAL ONLY, nothing applied

## Method

Net revenue = gross ÷ VAT-factor × 0.90 (payment fees). Founder = gross × 0.90.
Multiplier = net revenue ÷ provider cost. Hard cap 1.80× (re-validated after rounding).
Targets: Seedance 2.5 1.38×, standard models ~1.50-1.58×, premium (Veo/Sora/HappyHorse) ~1.66-1.70×.

## Scenario A — VAT EXCLUSIVE (Stripe tax rate added on top; current config per docs/v511)

### Seedance 2.5

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 2.5 (ModelArk) | 0.2170 | 0.3333 | 1.38× | **0.3300** | 1.37× | 1.23× | 27% | 19% |
| Seedance 2.5 480p (ModelArk) | 0.1085 | 0.1932 | 1.60× | **0.1650** | 1.37× | 1.23× | 27% | 19% |

### Seedance 1/2

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 1 Lite (Draft) | 0.0200 | 0.0450 | 2.02× | **0.0350** | 1.58× | 1.42× | 37% | 29% |
| Seedance 1 Lite 1080p | 0.0450 | 0.1000 | 2.00× | **0.0750** | 1.50× | 1.35× | 33% | 26% |
| Seedance 2.0 Fast 720p | 0.1500 | 0.3200 | 1.92× | **0.2600** | 1.56× | 1.40× | 36% | 29% |
| Seedance 2.0 720p | 0.1800 | 0.3850 | 1.93× | **0.3100** | 1.55× | 1.40× | 35% | 28% |

### Kling

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kling 3.0 1080p | 0.0600 | 0.1350 | 2.03× | **0.1050** | 1.58× | 1.42× | 37% | 29% |
| Kling 2.5 Turbo Pro | 0.0300 | 0.0700 | 2.10× | **0.0500** | 1.50× | 1.35× | 33% | 26% |
| Kling 2.6 | 0.0400 | 0.0900 | 2.02× | **0.0700** | 1.58× | 1.42× | 37% | 29% |
| Kling 3.0 Omni | 0.2000 | 0.4300 | 1.94× | **0.3400** | 1.53× | 1.38× | 35% | 27% |

### Veo

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Veo 3.1 Lite 720p | 0.1500 | 0.3200 | 1.92× | **0.2800** | 1.68× | 1.51× | 40% | 34% |
| Veo 3.1 Lite 1080p | 0.2200 | 0.4750 | 1.94× | **0.4200** | 1.72× | 1.55× | 42% | 35% |
| Veo 3.1 Fast 1080p | 0.4000 | 0.8600 | 1.94× | **0.7600** | 1.71× | 1.54× | 42% | 35% |
| Veo 3.1 Pro 1080p | 1.1000 | 2.3650 | 1.94× | **2.1000** | 1.72× | 1.55× | 42% | 35% |

### Hailuo

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hailuo 2.3 Std 768p | 0.0450 | 0.1000 | 2.00× | **0.0750** | 1.50× | 1.35× | 33% | 26% |
| Hailuo 2.3 Pro 1080p | 0.0750 | 0.1650 | 1.98× | **0.1300** | 1.56× | 1.40× | 36% | 29% |

### Wan

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wan 2.5 Std | 0.0400 | 0.0900 | 2.02× | **0.0700** | 1.58× | 1.42× | 37% | 29% |
| Wan 2.5 Pro | 0.0700 | 0.1550 | 1.99× | **0.1200** | 1.54× | 1.39× | 35% | 28% |
| Wan 2.6 Std | 0.0400 | 0.0900 | 2.02× | **0.0700** | 1.58× | 1.42× | 37% | 29% |
| Wan 2.6 Pro | 0.0700 | 0.1550 | 1.99× | **0.1200** | 1.54× | 1.39× | 35% | 28% |
| Wan 2.7 720p | 0.1000 | 0.2200 | 1.98× | **0.1700** | 1.53× | 1.38× | 35% | 27% |
| Wan 2.7 Pro 1080p | 0.1500 | 0.3200 | 1.92× | **0.2600** | 1.56× | 1.40× | 36% | 29% |

### LTX

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LTX 2.3 Fast | 0.0600 | 0.1350 | 2.03× | **0.1000** | 1.50× | 1.35× | 33% | 26% |
| LTX 2.3 Pro | 0.0800 | 0.1800 | 2.02× | **0.1350** | 1.52× | 1.37× | 34% | 27% |

### Vidu

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vidu Q3 Pro (Start+End) | 0.1250 | 0.2650 | 1.91× | **0.2100** | 1.51× | 1.36× | 34% | 27% |
| Vidu Q3 Pro I2V | 0.1250 | 0.2650 | 1.91× | **0.2100** | 1.51× | 1.36× | 34% | 27% |
| Vidu Q3 Turbo T2V | 0.0650 | 0.1450 | 2.01× | **0.1100** | 1.52× | 1.37× | 34% | 27% |

### Grok

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grok Imagine | 0.0500 | 0.1100 | 1.98× | **0.0850** | 1.53× | 1.38× | 35% | 27% |

### Runway

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Runway Gen-4 Aleph | 0.0800 | 0.1800 | 2.02× | **0.1400** | 1.58× | 1.42× | 37% | 29% |

### Luma

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luma Ray 2 Std | 0.0700 | 0.1550 | 1.99× | **0.1200** | 1.54× | 1.39× | 35% | 28% |
| Luma Ray 2 Pro | 0.1200 | 0.2550 | 1.91× | **0.2100** | 1.58× | 1.42× | 37% | 29% |
| Luma Ray 3.2 (5s) | 0.0600 | 0.1350 | 2.03× | **0.1050** | 1.58× | 1.42× | 37% | 29% |
| Luma Ray 3.2 (10s) | 0.0900 | 0.2000 | 2.00× | **0.1550** | 1.55× | 1.40× | 35% | 28% |

### Sora

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sora 2 Standard (EOL 24.09.2026) | 0.1000 | 0.2200 | 1.98× | **0.1900** | 1.71× | 1.54× | 42% | 35% |
| Sora 2 Pro (EOL 24.09.2026) | 0.5000 | 1.0800 | 1.94× | **0.9400** | 1.69× | 1.52× | 41% | 34% |

### Pika

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pika 2.2 Std | 0.0400 | 0.0900 | 2.02× | **0.0700** | 1.58× | 1.42× | 37% | 29% |
| Pika 2.2 Pro | 0.0900 | 0.2000 | 2.00× | **0.1550** | 1.55× | 1.40× | 35% | 28% |

### HappyHorse

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HappyHorse 720p | 0.1400 | 0.3000 | 1.93× | **0.2600** | 1.67× | 1.50× | 40% | 34% |
| HappyHorse Pro 1080p | 0.2800 | 0.6050 | 1.94× | **0.5300** | 1.70× | 1.53× | 41% | 35% |

### Currently above 1.80× (net, standard customer)

- Hailuo 2.3 Std 768p: 2.00× → propose 0.0750 €/s (1.50×)
- Hailuo 2.3 Pro 1080p: 1.98× → propose 0.1300 €/s (1.56×)
- HappyHorse 720p: 1.93× → propose 0.2600 €/s (1.67×)
- HappyHorse Pro 1080p: 1.94× → propose 0.5300 €/s (1.70×)
- Seedance 1 Lite (Draft): 2.02× → propose 0.0350 €/s (1.58×)
- Seedance 1 Lite 1080p: 2.00× → propose 0.0750 €/s (1.50×)
- Seedance 2.0 Fast 720p: 1.92× → propose 0.2600 €/s (1.56×)
- Seedance 2.0 720p: 1.93× → propose 0.3100 €/s (1.55×)
- Kling 3.0 1080p: 2.03× → propose 0.1050 €/s (1.58×)
- Kling 2.5 Turbo Pro: 2.10× → propose 0.0500 €/s (1.50×)
- Kling 2.6: 2.02× → propose 0.0700 €/s (1.58×)
- Kling 3.0 Omni: 1.94× → propose 0.3400 €/s (1.53×)
- Wan 2.5 Std: 2.02× → propose 0.0700 €/s (1.58×)
- Wan 2.5 Pro: 1.99× → propose 0.1200 €/s (1.54×)
- Wan 2.6 Std: 2.02× → propose 0.0700 €/s (1.58×)
- Wan 2.6 Pro: 1.99× → propose 0.1200 €/s (1.54×)
- Wan 2.7 720p: 1.98× → propose 0.1700 €/s (1.53×)
- Wan 2.7 Pro 1080p: 1.92× → propose 0.2600 €/s (1.56×)
- Luma Ray 2 Std: 1.99× → propose 0.1200 €/s (1.54×)
- Luma Ray 2 Pro: 1.91× → propose 0.2100 €/s (1.58×)
- Luma Ray 3.2 (5s): 2.03× → propose 0.1050 €/s (1.58×)
- Luma Ray 3.2 (10s): 2.00× → propose 0.1550 €/s (1.55×)
- LTX 2.3 Fast: 2.03× → propose 0.1000 €/s (1.50×)
- LTX 2.3 Pro: 2.02× → propose 0.1350 €/s (1.52×)
- Vidu Q3 Pro (Start+End): 1.91× → propose 0.2100 €/s (1.51×)
- Vidu Q3 Pro I2V: 1.91× → propose 0.2100 €/s (1.51×)
- Vidu Q3 Turbo T2V: 2.01× → propose 0.1100 €/s (1.52×)
- Pika 2.2 Std: 2.02× → propose 0.0700 €/s (1.58×)
- Pika 2.2 Pro: 2.00× → propose 0.1550 €/s (1.55×)
- Runway Gen-4 Aleph: 2.02× → propose 0.1400 €/s (1.58×)
- Veo 3.1 Lite 720p: 1.92× → propose 0.2800 €/s (1.68×)
- Veo 3.1 Lite 1080p: 1.94× → propose 0.4200 €/s (1.72×)
- Veo 3.1 Fast 1080p: 1.94× → propose 0.7600 €/s (1.71×)
- Veo 3.1 Pro 1080p: 1.94× → propose 2.1000 €/s (1.72×)
- Sora 2 Standard (EOL 24.09.2026): 1.98× → propose 0.1900 €/s (1.71×)
- Sora 2 Pro (EOL 24.09.2026): 1.94× → propose 0.9400 €/s (1.69×)
- Grok Imagine: 1.98× → propose 0.0850 €/s (1.53×)

### Founder margin below 1.20× after discount

- none


## Scenario B — VAT INCLUSIVE (19% contained in the shown price; conservative)

### Seedance 2.5

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 2.5 (ModelArk) | 0.2170 | 0.3333 | 1.16× | **0.4000** | 1.39× | 1.25× | 28% | 20% |
| Seedance 2.5 480p (ModelArk) | 0.1085 | 0.1932 | 1.35× | **0.2000** | 1.39× | 1.25× | 28% | 20% |

### Seedance 1/2

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 1 Lite (Draft) | 0.0200 | 0.0450 | 1.70× | **0.0400** | 1.51× | 1.36× | 34% | 27% |
| Seedance 1 Lite 1080p | 0.0450 | 0.1000 | 1.68× | **0.0900** | 1.51× | 1.36× | 34% | 27% |
| Seedance 2.0 Fast 720p | 0.1500 | 0.3200 | 1.61× | **0.3100** | 1.56× | 1.41× | 36% | 29% |
| Seedance 2.0 720p | 0.1800 | 0.3850 | 1.62× | **0.3700** | 1.55× | 1.40× | 36% | 29% |

### Kling

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kling 3.0 1080p | 0.0600 | 0.1350 | 1.70× | **0.1250** | 1.58× | 1.42× | 37% | 29% |
| Kling 2.5 Turbo Pro | 0.0300 | 0.0700 | 1.76× | **0.0600** | 1.51× | 1.36× | 34% | 27% |
| Kling 2.6 | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Kling 3.0 Omni | 0.2000 | 0.4300 | 1.63× | **0.4100** | 1.55× | 1.40× | 36% | 28% |

### Veo

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Veo 3.1 Lite 720p | 0.1500 | 0.3200 | 1.61× | **0.3400** | 1.71× | 1.54× | 42% | 35% |
| Veo 3.1 Lite 1080p | 0.2200 | 0.4750 | 1.63× | **0.4900** | 1.68× | 1.52× | 41% | 34% |
| Veo 3.1 Fast 1080p | 0.4000 | 0.8600 | 1.63× | **0.9000** | 1.70× | 1.53× | 41% | 35% |
| Veo 3.1 Pro 1080p | 1.1000 | 2.3650 | 1.63× | **2.4500** | 1.68× | 1.52× | 41% | 34% |

### Hailuo

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hailuo 2.3 Std 768p | 0.0450 | 0.1000 | 1.68× | **0.0900** | 1.51× | 1.36× | 34% | 27% |
| Hailuo 2.3 Pro 1080p | 0.0750 | 0.1650 | 1.66× | **0.1550** | 1.56× | 1.41× | 36% | 29% |

### Wan

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wan 2.5 Std | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Wan 2.5 Pro | 0.0700 | 0.1550 | 1.67× | **0.1450** | 1.57× | 1.41× | 36% | 29% |
| Wan 2.6 Std | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Wan 2.6 Pro | 0.0700 | 0.1550 | 1.67× | **0.1450** | 1.57× | 1.41× | 36% | 29% |
| Wan 2.7 720p | 0.1000 | 0.2200 | 1.66× | **0.2000** | 1.51× | 1.36× | 34% | 27% |
| Wan 2.7 Pro 1080p | 0.1500 | 0.3200 | 1.61× | **0.3100** | 1.56× | 1.41× | 36% | 29% |

### LTX

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LTX 2.3 Fast | 0.0600 | 0.1350 | 1.70× | **0.1200** | 1.51× | 1.36× | 34% | 27% |
| LTX 2.3 Pro | 0.0800 | 0.1800 | 1.70× | **0.1600** | 1.51× | 1.36× | 34% | 27% |

### Vidu

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vidu Q3 Pro (Start+End) | 0.1250 | 0.2650 | 1.60× | **0.2500** | 1.51× | 1.36× | 34% | 27% |
| Vidu Q3 Pro I2V | 0.1250 | 0.2650 | 1.60× | **0.2500** | 1.51× | 1.36× | 34% | 27% |
| Vidu Q3 Turbo T2V | 0.0650 | 0.1450 | 1.69× | **0.1300** | 1.51× | 1.36× | 34% | 27% |

### Grok

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grok Imagine | 0.0500 | 0.1100 | 1.66× | **0.1000** | 1.51× | 1.36× | 34% | 27% |

### Runway

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Runway Gen-4 Aleph | 0.0800 | 0.1800 | 1.70× | **0.1650** | 1.56× | 1.40× | 36% | 29% |

### Luma

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luma Ray 2 Std | 0.0700 | 0.1550 | 1.67× | **0.1450** | 1.57× | 1.41× | 36% | 29% |
| Luma Ray 2 Pro | 0.1200 | 0.2550 | 1.61× | **0.2500** | 1.58× | 1.42× | 37% | 29% |
| Luma Ray 3.2 (5s) | 0.0600 | 0.1350 | 1.70× | **0.1250** | 1.58× | 1.42× | 37% | 29% |
| Luma Ray 3.2 (10s) | 0.0900 | 0.2000 | 1.68× | **0.1850** | 1.55× | 1.40× | 36% | 29% |

### Sora

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sora 2 Standard (EOL 24.09.2026) | 0.1000 | 0.2200 | 1.66× | **0.2200** | 1.66× | 1.50× | 40% | 33% |
| Sora 2 Pro (EOL 24.09.2026) | 0.5000 | 1.0800 | 1.63× | **1.1000** | 1.66× | 1.50× | 40% | 33% |

### Pika

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pika 2.2 Std | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Pika 2.2 Pro | 0.0900 | 0.2000 | 1.68× | **0.1850** | 1.55× | 1.40× | 36% | 29% |

### HappyHorse

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HappyHorse 720p | 0.1400 | 0.3000 | 1.62× | **0.3100** | 1.67× | 1.51× | 40% | 34% |
| HappyHorse Pro 1080p | 0.2800 | 0.6050 | 1.63× | **0.6300** | 1.70× | 1.53× | 41% | 35% |

### Currently above 1.80× (net, standard customer)

- none

### Founder margin below 1.20× after discount

- none

