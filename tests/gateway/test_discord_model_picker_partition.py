"""Regression test: Discord /model picker must surface ALL models for a
provider whose list exceeds 25 entries (e.g. example curated + Portal free
recommendations), not silently truncate the tail at 25 options.

Discord caps a single Select at 25 options and a View at 5 action rows. The
picker keeps 2 rows for Back/Cancel, so it must partition the model list
across up to 3 select menus. This is what makes free-tier ``:free`` Portal
picks (appended after the curated list) appear on Discord — they previously
fell off the 25-option cliff.
"""

from types import SimpleNamespace

from gateway.platforms.base import utf16_len
from plugins.platforms.discord.adapter import ModelPickerView


def _all_options(view: "ModelPickerView"):
    """Flatten every model select menu's options into (label, value).

    Detect selects by their ``model_model_select*`` custom_id (and presence of
    ``.options``) rather than class name — the discord mock in conftest uses a
    ``_FakeSelect`` class, while the real library uses ``discord.ui.Select``.
    """
    out = []
    for child in view.children:
        custom_id = getattr(child, "custom_id", "")
        if isinstance(custom_id, str) and custom_id.startswith("model_model_select"):
            out.extend((opt.label, opt.value) for opt in getattr(child, "options", []))
    return out




def test_small_provider_single_select_unchanged():
    """A <25-model provider still renders as a single select menu."""
    models = [f"m/{i}" for i in range(10)]
    view = ModelPickerView(
        providers=[
            {
                "slug": "emoji",
                "name": "Emoji",
                "models": models,
                "total_models": len(models),
                "is_current": False,
            }
        ],
        current_model="m/0",
        current_provider="emoji",
        session_key="session-1",
        on_model_selected=lambda *a, **k: None,
        allowed_user_ids={"123"},
    )
    view._selected_provider = "emoji"
    view._build_model_select("emoji")

    select_rows = [
        c for c in view.children
        if isinstance(getattr(c, "custom_id", ""), str)
        and c.custom_id.startswith("model_model_select")
    ]
    assert len(select_rows) == 1
    assert len(select_rows[0].options) == 10
