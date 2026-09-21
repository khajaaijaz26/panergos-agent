# Panergos Agent

**Panergos** (`pan-ER-gos`, de *pan* + el griego *ergon*, «todo trabajo») es una distribución de agente abierta e independiente del modelo para trabajos duraderos y de varias sesiones.

Este repositorio contiene la distribución completa de Panergos y añade Durable Missions: misiones persistentes, grafos de tareas respaldados por Kanban, estado compartido con control de versiones, mensajes dirigidos y un registro de eventos reproducible.

[English](README.md) · [简体中文](README.zh-CN.md) · [اردو](README.ur-pk.md)

## Estado

| Superficie | Estado |
|---|---|
| Runtime CLI/TUI/escritorio de Panergos, API, gateways, proveedores, herramientas, memoria, skills, plugins, MCP, cron y delegación | Disponible |
| Panergos Durable Missions | Experimental; implementado y probado localmente |
| Capability Forge, Policy Ledger y Evidence Gates | Planificado |

Panergos solo publica afirmaciones de rendimiento respaldadas por resultados reproducibles.

## Instalación

Estos instaladores se descargan desde este repositorio y siguen la rama `main`.

### Linux, macOS, WSL2 o Termux

```bash
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
panergos setup
```

### Windows PowerShell

```powershell
iex (irm https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.ps1)
panergos setup
```

### Desde el código fuente

```bash
git clone --branch main --single-branch https://github.com/khajaaijaz26/panergos-agent.git
cd panergos-agent
uvx --from uv==0.9.28 uv sync --locked --python 3.11
uv run --frozen panergos setup
uv run --frozen panergos plugins enable panergos_missions
uv run --frozen panergos
```

El comando público y canónico es `panergos`.

## Alcance de «sin límites»

Panergos no impone una taxonomía fija de tareas ni un proveedor de modelos obligatorio. No evita permisos del sistema operativo, cuotas del proveedor, ventanas de contexto, presupuestos, leyes, controles de seguridad ni aprobaciones explícitas.

## Documentación y soporte

- [Guía del proyecto](PANERGOS.md)
- [Guía de instalación](website/docs/getting-started/installation.md)
- [Issues](https://github.com/khajaaijaz26/panergos-agent/issues)
- [Reporte de seguridad](SECURITY.md)

## Licencia

Licencia MIT para el núcleo original y los cambios de Panergos. Consulta [LICENSE](LICENSE), [NOTICE](NOTICE) y los avisos de terceros incluidos; los componentes de terceros conservan sus propias licencias.
