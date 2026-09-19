"""Contracts for the bundled organization-workflows skill."""

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
SKILL_DIR = REPO / "skills" / "productivity" / "organization-workflows"
SKILL_PATH = SKILL_DIR / "SKILL.md"


def _frontmatter_and_body():
    content = SKILL_PATH.read_text(encoding="utf-8")
    assert content.startswith("---")
    match = re.search(r"\n---\s*\n", content[3:])
    assert match, "frontmatter must close with ---"
    return yaml.safe_load(content[3 : match.start() + 3]), content[match.end() + 3 :]


def test_skill_contract_and_routes():
    frontmatter, body = _frontmatter_and_body()
    assert frontmatter["name"] == SKILL_DIR.name
    assert len(frontmatter["description"]) <= 60
    assert frontmatter["description"].endswith(".")
    assert not frontmatter["author"].startswith(("Panergos Agent", "Panergos Agent"))
    assert set(frontmatter["platforms"]) == {"linux", "macos", "windows"}

    for name in frontmatter["metadata"]["panergos"]["related_skills"]:
        assert list(REPO.glob(f"skills/*/{name}/SKILL.md")) or list(
            REPO.glob(f"optional-skills/*/{name}/SKILL.md")
        ), f"related skill does not exist: {name}"

    routed = set(
        re.findall(r"\]\(((?:references|templates)/[^)]+\.md)\)", body)
    )
    support_files = {
        path.relative_to(SKILL_DIR).as_posix()
        for folder in ("references", "templates")
        for path in (SKILL_DIR / folder).glob("*.md")
    }
    assert support_files == routed, "every supporting file must be routed"
    assert all((SKILL_DIR / route).is_file() for route in routed)


def test_governance_scope_and_department_coverage():
    _, body = _frontmatter_and_body()
    role_pack = (SKILL_DIR / "references" / "roles-and-departments.md").read_text(
        encoding="utf-8"
    )
    template = (SKILL_DIR / "templates" / "work-package.md").read_text(
        encoding="utf-8"
    )

    for scope in ("Individual", "Manager", "Department", "Executive"):
        assert f"| {scope} |" in body

    departments = (
        "Finance",
        "Human resources (HR)",
        "Sales",
        "Marketing",
        "Customer support",
        "Operations",
        "Procurement",
        "Legal and compliance",
        "Engineering, IT, and security",
        "Product",
        "Analytics",
        "Executive",
    )
    for department in departments:
        assert f"### {department}" in role_pack

    stages = [template.index(f"## {number}. {stage}") for number, stage in enumerate(
        ("Draft", "Review", "Execute", "Evidence"), start=1
    )]
    assert stages == sorted(stages)

    for gate in ("money", "contracts", "employment decisions", "access changes", "external publishing"):
        assert gate in body.lower()


def test_resume_and_real_world_limits_are_explicit():
    _, body = _frontmatter_and_body()
    normalized = body.lower()
    for contract in (
        "configured and visible",
        "qualified human review",
        "panergos_mission",
        "expected_version",
        "idempotent",
        "project_memory",
        "do not invent a connector",
        "do not imply that the external action occurred",
    ):
        assert contract in normalized

    handoff = (SKILL_DIR / "templates" / "work-package.md").read_text(
        encoding="utf-8"
    ).lower()
    for field in ("completed and evidenced", "blocked and why", "next safe action", "operations that must not be replayed"):
        assert field in handoff
