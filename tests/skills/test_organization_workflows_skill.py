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
        "Education and academic operations",
        "Sales",
        "Marketing",
        "Customer support",
        "Operations",
        "Procurement",
        "Legal and compliance",
        "Engineering, IT, and security",
        "Data engineering and AI systems",
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


def test_education_engineering_and_cross_industry_routes():
    _, body = _frontmatter_and_body()
    role_pack = (SKILL_DIR / "references" / "roles-and-departments.md").read_text(
        encoding="utf-8"
    )
    template = (SKILL_DIR / "templates" / "work-package.md").read_text(
        encoding="utf-8"
    )

    for role in (
        "Teacher or faculty member",
        "Principal or school leader",
        "University or college leader",
        "Education analyst or data engineer",
    ):
        assert f"| {role} |" in role_pack

    for contract in (
        "configured LMS/SIS route",
        "test-driven-development",
        "Industry-neutral adaptation",
        "qualified human",
        "Minimize learner data",
        "reproducible test/scan result",
        "lineage",
    ):
        assert contract.lower() in (body + role_pack).lower()

    for field in (
        "industry_or_sector",
        "institution_or_business_unit",
        "jurisdiction_and_governing_standards",
    ):
        assert f"`{field}`:" in template


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


def test_industry_delivery_and_release_contract():
    _, body = _frontmatter_and_body()
    playbook = (SKILL_DIR / "references" / "industry-delivery-playbooks.md").read_text(
        encoding="utf-8"
    )
    normalized = (body + playbook).lower()

    for route in (
        "software and product",
        "websites and web apps",
        "mobile and desktop apps",
        "games and interactive work",
        "education and research",
        "film, video and media",
        "digital marketing",
        "freelance and client services",
        "finance and corporate operations",
        "whole-company programs",
    ):
        assert route in normalized

    for release_contract in (
        "connected developer or publisher account",
        "certificates, signing keys",
        "possible fees",
        "store submission",
        "provider read-back evidence",
        "submitted` and `in_review` are not `released",
        "must not self-approve or perform live financial transfers",
        "never bypass identity checks",
    ):
        assert release_contract in normalized
