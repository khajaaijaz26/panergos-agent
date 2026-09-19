"""Tests for website/scripts/generate-skill-docs.py.

The generator turns every `skills/**/SKILL.md` into a Docusaurus page before
the `docs-site-checks` CI workflow runs `ascii-guard lint` on the result. If
a SKILL.md contains ASCII diagrams (box-drawing chars in a fenced code block)
without its own `<!-- ascii-guard-ignore -->` markers, the generator must
add them defensively — otherwise every PR touching `website/**` fails lint
on unrelated skill content.

Regression for issue #15305.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATOR = REPO_ROOT / "website" / "scripts" / "generate-skill-docs.py"


@pytest.fixture(scope="module")
def gen_module():
    """Load generate-skill-docs.py as a module (hyphenated filename, not importable via normal import)."""
    spec = importlib.util.spec_from_file_location("generate_skill_docs", GENERATOR)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_code_block_without_box_chars_is_not_wrapped(gen_module):
    """Plain bash/python code blocks should stay uncluttered."""
    body = "Intro.\n\n```bash\npip install foo\nfoo --run\n```\n\nOutro."
    result = gen_module.mdx_escape_body(body)
    assert "ascii-guard-ignore" not in result
    assert "pip install foo" in result


def test_code_block_with_box_chars_gets_wrapped(gen_module):
    """A code fence containing Unicode box-drawing chars must be wrapped in
    ascii-guard-ignore comments so the docs-site-checks lint can't fail on
    a skill's own diagram (issue #15305)."""
    body = (
        "Some text.\n\n"
        "```\n"
        "┌─────────┐\n"
        "│ diagram │\n"
        "└─────────┘\n"
        "```\n\n"
        "More text."
    )
    result = gen_module.mdx_escape_body(body)
    assert "<!-- ascii-guard-ignore -->" in result
    assert "<!-- ascii-guard-ignore-end -->" in result
    # The wrapper must sit OUTSIDE the fence, not inside.
    wrap_open = result.index("<!-- ascii-guard-ignore -->")
    fence_open = result.index("```\n┌")
    assert wrap_open < fence_open


def test_multiple_code_blocks_only_box_ones_wrapped(gen_module):
    """Mixed body: plain code stays plain, box code gets wrapped."""
    body = (
        "```bash\necho hi\n```\n\n"
        "```\n┌──┐\n│  │\n└──┘\n```\n\n"
        "```python\nprint('ok')\n```"
    )
    result = gen_module.mdx_escape_body(body)
    # exactly one wrap pair
    assert result.count("<!-- ascii-guard-ignore -->") == 1
    assert result.count("<!-- ascii-guard-ignore-end -->") == 1
    # plain blocks untouched
    assert "echo hi" in result
    assert "print('ok')" in result


def test_tilde_fenced_box_is_wrapped(gen_module):
    """The generator supports both ``` and ~~~ fences — both must be covered."""
    body = "~~~\n│ box │\n~~~"
    result = gen_module.mdx_escape_body(body)
    assert "<!-- ascii-guard-ignore -->" in result


def test_already_wrapped_source_double_wraps_harmlessly(gen_module):
    """If the SKILL.md already has ascii-guard-ignore markers, the generator's
    extra wrap is harmless (ascii-guard tolerates adjacent duplicate markers).
    The test just verifies we don't crash and the content survives."""
    body = (
        "<!-- ascii-guard-ignore -->\n"
        "```\n┌─┐\n└─┘\n```\n"
        "<!-- ascii-guard-ignore-end -->"
    )
    result = gen_module.mdx_escape_body(body)
    assert "┌─┐" in result
    # At least one marker pair survives
    assert "<!-- ascii-guard-ignore -->" in result
    assert "<!-- ascii-guard-ignore-end -->" in result


def test_box_drawing_detection_covers_common_chars(gen_module):
    """Smoke-test that the char set covers box-drawing ranges actually used
    in skill diagrams."""
    # Sample from real SKILL.md diagrams (segment-anything, research-paper-writing, etc.)
    for ch in "┌┐└┘─│├┤┬┴┼═║╔╗╚╝╭╮╯╰▶◀▲▼":
        assert ch in gen_module._BOX_DRAWING_CHARS, f"missing: {ch!r}"


def test_bundled_catalog_explains_missing_local_skills(gen_module):
    """The bundled catalog should explain how to restore a listed skill that
    was removed from the local profile's skills tree."""
    result = gen_module.build_catalog_md_bundled([])
    assert "respects local deletions and user edits" in result
    assert "panergos skills reset <name> --restore" in result


def test_internal_docs_links_drop_the_deployment_base_path(gen_module):
    meta = {
        "source_kind": "bundled",
        "rel_path": "example/sample",
    }
    body = (
        "[Guide](/docs/user-guide/features/skills) "
        "[Docs root](/docs/) "
        "[API](/api/status)"
    )

    result = gen_module.rewrite_relative_links(body, meta)

    assert "[Guide](/user-guide/features/skills)" in result
    assert "[Docs root](/)" in result
    assert "[API](/api/status)" in result
    assert "](/docs/" not in result


def test_relative_reference_links_use_the_panergos_repository(gen_module):
    meta = {
        "source_kind": "optional",
        "rel_path": "research/sample",
    }

    result = gen_module.rewrite_relative_links(
        "[Details](references/details.md)", meta
    )

    assert result == (
        "[Details](https://github.com/khajaaijaz26/panergos-agent/"
        "blob/main/optional-skills/research/sample/references/details.md)"
    )


def test_derived_source_paths_are_url_safe_on_windows(gen_module, tmp_path):
    source = tmp_path / "skills"
    skill_md = source / "research" / "sample" / "SKILL.md"
    skill_md.parent.mkdir(parents=True)
    skill_md.write_text("", encoding="utf-8")

    meta = gen_module.derive_skill_meta(skill_md, source, "bundled")

    assert meta["rel_path"] == "research/sample"


def test_stale_prune_only_removes_generated_pages(
    gen_module, tmp_path, monkeypatch
):
    pages = tmp_path / "skills"
    keep = pages / "bundled" / "examples" / "keep.md"
    stale = pages / "bundled" / "examples" / "stale.md"
    manual = pages / "bundled" / "examples" / "manual.md"
    keep.parent.mkdir(parents=True)
    keep.write_text(gen_module.GENERATED_NOTICE, encoding="utf-8")
    stale.write_text(gen_module.GENERATED_NOTICE, encoding="utf-8")
    manual.write_text("Hand-written page", encoding="utf-8")
    monkeypatch.setattr(gen_module, "SKILLS_PAGES", pages)

    removed = gen_module.prune_stale_skill_pages({keep})

    assert removed == [stale]
    assert keep.exists()
    assert not stale.exists()
    assert manual.exists()


def test_generated_skill_routes_and_catalog_copy_are_panergos_first(gen_module):
    meta = {
        "source_kind": "bundled",
        "category": "examples",
        "sub": None,
        "slug": "sample",
        "rel_path": "examples/sample",
    }
    related = {**meta, "slug": "peer", "rel_path": "examples/peer"}
    parsed = {
        "frontmatter": {
            "name": "sample",
            "description": "Sample skill.",
            "metadata": {"panergos": {"related_skills": ["peer"]}},
        },
        "body": "# Sample",
    }

    page = gen_module.render_skill_page(
        meta,
        parsed["frontmatter"],
        parsed["body"],
        skill_index={"peer": related},
    )
    catalog = gen_module.build_catalog_md_bundled([(meta, parsed)])

    assert "](/user-guide/skills/bundled/examples/examples-peer)" in page
    assert "/docs/user-guide/" not in page
    assert "complete skill definition that Panergos loads" in page
    assert "](/user-guide/skills/bundled/examples/examples-sample)" in catalog
    assert "`panergos update`" in catalog


def test_self_skill_identifier_has_panergos_public_title(gen_module):
    meta = {
        "source_kind": "bundled",
        "category": "autonomous-ai-agents",
        "sub": None,
        "slug": "panergos-agent",
        "rel_path": "autonomous-ai-agents/panergos-agent",
    }
    fm = {
        "name": "panergos-agent",
        "description": "Operate and extend Panergos Agent.",
    }

    page = gen_module.render_skill_page(meta, fm, "# Panergos Agent")

    assert 'sidebar_label: "Panergos Agent"' in page
    assert "# Panergos Agent" in page


def test_optional_catalog_uses_panergos_commands_and_routes(gen_module):
    meta = {
        "source_kind": "optional",
        "category": "examples",
        "sub": None,
        "slug": "sample",
        "rel_path": "examples/sample",
    }
    parsed = {
        "frontmatter": {"name": "sample", "description": "Sample skill."},
        "body": "# Sample",
    }

    catalog = gen_module.build_catalog_md_optional([(meta, parsed)])

    assert "panergos skills install official/<category>/<skill>" in catalog
    assert "panergos skills uninstall <skill-name>" in catalog
    assert "](/user-guide/skills/optional/examples/examples-sample)" in catalog
    assert "/docs/user-guide/" not in catalog
