# Panergos Agent

**Panergos** (`pan-ER-gos`، *pan* + یونانی *ergon* یعنی ”تمام کام“) ایک اوپن، ماڈل سے آزاد ایجنٹ ڈسٹری بیوشن ہے جو طویل اور متعدد سیشنز پر مشتمل کام کے لیے بنایا گیا ہے۔

یہ ریپوزٹری مکمل Panergos ڈسٹری بیوشن پر مشتمل ہے اور Durable Missions شامل کرتی ہے: مستقل مشنز، Kanban پر مبنی task graphs، versioned shared state، مخاطب پیغامات، اور دوبارہ چلائی جا سکنے والی event stream۔

[English](README.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md)

## موجودہ حالت

| حصہ | حالت |
|---|---|
| Panergos CLI/TUI/desktop runtime، API، gateways، providers، tools، memory، skills، plugins، MCP، cron اور delegation | دستیاب |
| Panergos Durable Missions | تجرباتی؛ نافذ اور مقامی طور پر آزمودہ |
| Capability Forge، Policy Ledger اور Evidence Gates | منصوبہ بند |

Panergos صرف وہی کارکردگی دعوے شائع کرتا ہے جن کے نتائج دوبارہ پیدا کیے جا سکیں۔

## انسٹالیشن

درج ذیل installers اسی ریپوزٹری سے حاصل ہوتے ہیں اور `main` branch کو استعمال کرتے ہیں۔

### Linux، macOS، WSL2 یا Termux

```bash
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
panergos setup
```

### Windows PowerShell

```powershell
iex (irm https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.ps1)
panergos setup
```

### سورس سے چلائیں

```bash
git clone --branch main --single-branch https://github.com/khajaaijaz26/panergos-agent.git
cd panergos-agent
uvx --from uv==0.9.28 uv sync --locked --python 3.11
uv run --frozen panergos setup
uv run --frozen panergos plugins enable panergos_missions
uv run --frozen panergos
```

عوامی اور معیاری کمانڈ `panergos` ہے۔

## ”کوئی حد نہیں“ کا مطلب

Panergos کسی مقررہ task taxonomy یا لازمی model provider تک محدود نہیں۔ یہ operating-system permissions، provider quotas، context windows، budgets، قوانین، safety controls یا واضح approval gates کو bypass نہیں کرتا۔

## دستاویزات اور معاونت

- [پروجیکٹ گائیڈ](PANERGOS.md)
- [انسٹالیشن گائیڈ](website/docs/getting-started/installation.md)
- [مسائل](https://github.com/khajaaijaz26/panergos-agent/issues)
- [سیکیورٹی رپورٹنگ](SECURITY.md)

## لائسنس

Panergos کے اصل بنیادی حصے اور اس کی اپنی تبدیلیاں MIT لائسنس کے تحت ہیں۔ [LICENSE](LICENSE)، [NOTICE](NOTICE) اور شامل تیسرے فریق کے نوٹس دیکھیں؛ تیسرے فریق کے اجزا اپنے لائسنس برقرار رکھتے ہیں۔
